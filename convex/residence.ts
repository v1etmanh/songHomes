import { roleCan } from '../shared/operations';
import { isIsoDate } from '../shared/pricing';
import { ConvexError, v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { requireMutationPropertyCapability, requirePropertyCapability } from './staff';

const RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
const documentTypeArg = v.union(v.literal('cccd'), v.literal('cmnd'), v.literal('passport'), v.literal('other'));
const DOCUMENT_PATTERNS: Record<string, { pattern: RegExp; message: string }> = {
  cccd: { pattern: /^\d{12}$/, message: 'Số định danh cá nhân / CCCD gồm 12 chữ số.' },
  cmnd: { pattern: /^(\d{9}|\d{12})$/, message: 'Số CMND gồm 9 hoặc 12 chữ số.' },
  passport: { pattern: /^[A-Z0-9]{6,12}$/, message: 'Số hộ chiếu gồm 6–12 chữ hoặc số.' },
};

/** Địa chỉ lưu trú: the booked unit's address, else the property's. Never client-supplied. */
export async function stayAddressFor(ctx: QueryCtx | MutationCtx, booking: Doc<'bookings'>): Promise<string> {
  const unitType = await ctx.db.get(booking.unitTypeId);
  const property = await ctx.db.get(booking.propertyId);
  const unitAddress = unitType?.address?.trim();
  const propertyAddress = property?.address?.trim();
  if (unitAddress && property?.name) return `${property.name} — ${unitAddress}`;
  return unitAddress || propertyAddress || '';
}

/** How many adults still lack a tạm trú declaration (0 when the property does not require it). */
export async function residenceProgress(ctx: QueryCtx | MutationCtx, booking: Doc<'bookings'>) {
  const property = await ctx.db.get(booking.propertyId);
  const required = property?.requireResidenceDeclaration ? booking.adults : 0;
  const rows = await ctx.db
    .query('residenceRegistrations')
    .withIndex('by_booking', (q) => q.eq('bookingId', booking._id))
    .collect();
  const declared = rows.filter((row) => row.registrationType === 'tam_tru').length;
  return { required, declared, missing: Math.max(0, required - declared) };
}

/** Check-in gate shared by every mutation that moves a booking to checked_in. */
export async function assertResidenceComplete(ctx: MutationCtx, booking: Doc<'bookings'>) {
  const { missing } = await residenceProgress(ctx, booking);
  if (missing > 0) {
    throw new ConvexError({
      code: 'RESIDENCE_INCOMPLETE',
      message: `Còn thiếu ${missing} tờ khai lưu trú. Khách cần khai báo đủ trước khi nhận phòng.`,
    });
  }
}

async function requireMyBooking(ctx: QueryCtx | MutationCtx, bookingId: Id<'bookings'>): Promise<Doc<'bookings'>> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError({ code: 'UNAUTHENTICATED', message: 'Vui lòng đăng nhập.' });
  const booking = await ctx.db.get(bookingId);
  if (!booking || booking.userId !== userId) {
    throw new ConvexError({ code: 'NOT_FOUND', message: 'Không tìm thấy đơn đặt phòng của bạn.' });
  }
  return booking;
}

async function requireGuestBooking(
  ctx: QueryCtx | MutationCtx,
  confirmationCode: string,
  email: string,
): Promise<{ booking: Doc<'bookings'>; guest: Doc<'guests'> }> {
  const booking = await ctx.db
    .query('bookings')
    .withIndex('by_confirmationCode', (q) =>
      q.eq('confirmationCode', confirmationCode.trim().toUpperCase()),
    )
    .first();
  const guest = booking?.guestId ? await ctx.db.get(booking.guestId) : null;
  if (!booking || !guest || guest.normalizedEmail !== email.trim().toLowerCase()) {
    throw new ConvexError({
      code: 'NOT_FOUND',
      message: 'Không tìm thấy đơn đặt phòng hoặc email không khớp.',
    });
  }
  return { booking, guest };
}

function sanitizeText(raw: string | undefined, maxLength = 300): string | undefined {
  if (raw === undefined) return undefined;
  const cleaned = raw.trim().slice(0, maxLength);
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * Guest query: list all temporary residence / absence registrations (tạm trú / tạm vắng)
 * for a booking when authenticated via confirmationCode + email.
 */
export const listForGuest = query({
  args: {
    confirmationCode: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const { booking, guest } = await requireGuestBooking(ctx, args.confirmationCode, args.email);
    const rows = await ctx.db
      .query('residenceRegistrations')
      .withIndex('by_booking', (q) => q.eq('bookingId', booking._id))
      .collect();
    rows.sort((a, b) => a.createdAt - b.createdAt);
    return {
      bookingId: booking._id,
      confirmationCode: booking.confirmationCode,
      defaultCheckIn: booking.checkIn,
      defaultCheckOut: booking.checkOut,
      defaultFullName: guest.name,
      defaultPhone: guest.phone,
      registrations: rows.map(row => row.submittedBy === 'staff' ? {
        _id: row._id, registrationType: row.registrationType, fullName: row.fullName, nationality: row.nationality,
        documentType: row.documentType, documentNumber: '••••' + row.documentNumber.slice(-4), status: row.status,
        checkInDate: row.checkInDate, checkOutDate: row.checkOutDate, createdAt: row.createdAt, absenceStatus: row.absenceStatus,
      } : row),
    };
  },
});

/**
 * Guest mutation: submit a temporary residence (tạm trú) or temporary absence (tạm vắng)
 * declaration for a guest on the booking.
 */
export const registerForGuest = mutation({
  args: {
    confirmationCode: v.string(),
    email: v.string(),
    fullName: v.string(),
    documentType: v.union(v.literal('cccd'), v.literal('cmnd'), v.literal('passport'), v.literal('other')),
    documentNumber: v.string(),
    nationality: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    gender: v.optional(v.string()),
    documentIssuedDate: v.optional(v.string()),
    phone: v.optional(v.string()),
    permanentAddress: v.optional(v.string()),
    registrationType: v.union(v.literal('tam_tru'), v.literal('tam_vang')),
    checkInDate: v.string(),
    checkOutDate: v.string(),
    reason: v.optional(v.string()),
    consent: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { booking } = await requireGuestBooking(ctx, args.confirmationCode, args.email);
    if (booking.status === 'cancelled') {
      throw new ConvexError({
        code: 'BOOKING_CANCELLED',
        message: 'Đơn đặt phòng đã hủy không thể khai báo tạm trú / tạm vắng.',
      });
    }

    const fullName = args.fullName.trim();
    const documentNumber = args.documentNumber.trim();
    if (!fullName) {
      throw new ConvexError({ code: 'FULL_NAME_REQUIRED', message: 'Vui lòng nhập họ và tên khách lưu trú.' });
    }
    if (!documentNumber) {
      throw new ConvexError({ code: 'DOCUMENT_NUMBER_REQUIRED', message: 'Vui lòng nhập số CCCD / Hộ chiếu.' });
    }
    if (!args.consent) {
      throw new ConvexError({ code: 'CONSENT_REQUIRED', message: 'Bạn cần đồng ý để Sóng Homestay lưu và xử lý thông tin lưu trú.' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.checkInDate) || !/^\d{4}-\d{2}-\d{2}$/.test(args.checkOutDate)) {
      throw new ConvexError({ code: 'INVALID_DATES', message: 'Ngày khai báo không hợp lệ.' });
    }
    if (args.checkOutDate < args.checkInDate) {
      throw new ConvexError({ code: 'INVALID_DATE_RANGE', message: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.' });
    }

    const now = Date.now();
    const registrationId = await ctx.db.insert('residenceRegistrations', {
      propertyId: booking.propertyId,
      bookingId: booking._id,
      fullName,
      documentType: args.documentType,
      documentNumber,
      nationality: sanitizeText(args.nationality, 80) ?? 'Việt Nam',
      dateOfBirth: sanitizeText(args.dateOfBirth, 20),
      gender: sanitizeText(args.gender, 40),
      documentIssuedDate: sanitizeText(args.documentIssuedDate, 20),
      phone: sanitizeText(args.phone, 40),
      permanentAddress: sanitizeText(args.permanentAddress, 300),
      registrationType: args.registrationType,
      checkInDate: args.checkInDate,
      checkOutDate: args.checkOutDate,
      reason: sanitizeText(args.reason, 400),
      stayAddress: (await stayAddressFor(ctx, booking)) || undefined,
      status: 'declared',
      absenceStatus: args.registrationType === 'tam_vang' ? 'away' : undefined,
      submittedBy: 'guest',
      consentAt: now,
      retentionUntil: now + RETENTION_MS,
      createdAt: now,
      updatedAt: now,
    });

    return { registrationId };
  },
});

/**
 * Signed-in guest: a booking of mine with its declarations and what is still
 * missing. Used by the bell page; access is by booking.userId only.
 */
export const listForMyBooking = query({
  args: { bookingId: v.id('bookings') },
  handler: async (ctx, args) => {
    const booking = await requireMyBooking(ctx, args.bookingId);
    const [property, unit, guest] = await Promise.all([
      ctx.db.get(booking.propertyId),
      ctx.db.get(booking.unitId),
      booking.guestId ? ctx.db.get(booking.guestId) : null,
    ]);
    const rows = (await ctx.db
      .query('residenceRegistrations')
      .withIndex('by_booking', (q) => q.eq('bookingId', booking._id))
      .collect())
      .filter((row) => row.registrationType === 'tam_tru')
      .sort((a, b) => a.createdAt - b.createdAt);
    const progress = await residenceProgress(ctx, booking);
    return {
      bookingId: booking._id,
      confirmationCode: booking.confirmationCode,
      status: booking.status,
      propertyName: property?.name ?? '',
      unitName: unit?.name ?? '',
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      adults: booking.adults,
      children: booking.children,
      stayAddress: await stayAddressFor(ctx, booking),
      defaultFullName: guest?.name ?? '',
      progress,
      registrations: rows.map((row) => ({
        _id: row._id,
        fullName: row.fullName,
        documentType: row.documentType,
        documentNumber: row.submittedBy === 'staff' ? '••••' + row.documentNumber.slice(-4) : row.documentNumber,
        reason: row.reason ?? '',
        checkInDate: row.checkInDate,
        checkOutDate: row.checkOutDate,
        stayAddress: row.stayAddress ?? '',
        status: row.status,
        createdAt: row.createdAt,
      })),
    };
  },
});

/** Signed-in guest: thông báo lưu trú for one person on my booking. */
export const registerForMyBooking = mutation({
  args: {
    bookingId: v.id('bookings'),
    fullName: v.string(),
    documentType: documentTypeArg,
    documentNumber: v.string(),
    nationality: v.optional(v.string()),
    reason: v.string(),
    checkInDate: v.string(),
    checkOutDate: v.string(),
    consent: v.boolean(),
  },
  handler: async (ctx, args) => {
    const booking = await requireMyBooking(ctx, args.bookingId);
    if (!['hold', 'pending', 'confirmed', 'checked_in'].includes(booking.status)) {
      throw new ConvexError({ code: 'BOOKING_NOT_ACTIVE', message: 'Đơn đặt phòng này không còn hiệu lực để khai báo.' });
    }
    const fullName = args.fullName.trim().replace(/\s+/g, ' ');
    if (fullName.length < 2 || fullName.length > 100) {
      throw new ConvexError({ code: 'FULL_NAME_REQUIRED', message: 'Vui lòng nhập đầy đủ họ và tên.' });
    }
    const documentNumber = args.documentNumber.trim().replace(/\s+/g, '').toUpperCase();
    const rule = DOCUMENT_PATTERNS[args.documentType];
    if (!documentNumber || (rule && !rule.pattern.test(documentNumber)) || documentNumber.length > 30) {
      throw new ConvexError({ code: 'DOCUMENT_NUMBER_INVALID', message: rule?.message ?? 'Vui lòng nhập số giấy tờ.' });
    }
    const reason = args.reason.trim();
    if (!reason) throw new ConvexError({ code: 'REASON_REQUIRED', message: 'Vui lòng nhập lý do lưu trú.' });
    if (!args.consent) {
      throw new ConvexError({ code: 'CONSENT_REQUIRED', message: 'Bạn cần đồng ý để cơ sở lưu trú lưu và xử lý thông tin.' });
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(args.checkInDate) || !/^\d{4}-\d{2}-\d{2}$/.test(args.checkOutDate)
      || args.checkInDate < booking.checkIn || args.checkOutDate > booking.checkOut || args.checkOutDate <= args.checkInDate
    ) {
      throw new ConvexError({ code: 'INVALID_DATES', message: `Thời gian lưu trú phải nằm trong ${booking.checkIn} → ${booking.checkOut}.` });
    }
    const existing = await ctx.db
      .query('residenceRegistrations')
      .withIndex('by_booking', (q) => q.eq('bookingId', booking._id))
      .collect();
    const declared = existing.filter((row) => row.registrationType === 'tam_tru');
    if (declared.length >= booking.adults + booking.children) {
      throw new ConvexError({ code: 'TOO_MANY_DECLARATIONS', message: 'Đã khai báo đủ số khách của đơn đặt phòng.' });
    }
    if (declared.some((row) => row.documentNumber === documentNumber)) {
      throw new ConvexError({ code: 'DUPLICATE_DOCUMENT', message: 'Giấy tờ này đã được khai báo cho đơn đặt phòng.' });
    }

    const now = Date.now();
    const registrationId = await ctx.db.insert('residenceRegistrations', {
      propertyId: booking.propertyId,
      bookingId: booking._id,
      fullName,
      documentType: args.documentType,
      documentNumber,
      nationality: sanitizeText(args.nationality, 80) ?? 'Việt Nam',
      registrationType: 'tam_tru',
      checkInDate: args.checkInDate,
      checkOutDate: args.checkOutDate,
      reason: reason.slice(0, 400),
      stayAddress: (await stayAddressFor(ctx, booking)) || undefined,
      status: 'declared',
      submittedBy: 'guest',
      consentAt: now,
      retentionUntil: now + RETENTION_MS,
      createdAt: now,
      updatedAt: now,
    });
    return { registrationId };
  },
});

/** Signed-in guest: withdraw one of my declarations before staff have recorded it. */
export const removeForMyBooking = mutation({
  args: { bookingId: v.id('bookings'), registrationId: v.id('residenceRegistrations') },
  handler: async (ctx, args) => {
    const booking = await requireMyBooking(ctx, args.bookingId);
    const row = await ctx.db.get(args.registrationId);
    if (!row || row.bookingId !== booking._id || row.submittedBy === 'staff') {
      throw new ConvexError({ code: 'NOT_FOUND', message: 'Không tìm thấy bản khai báo.' });
    }
    if (row.status !== 'declared') {
      throw new ConvexError({ code: 'ALREADY_VERIFIED', message: 'Bản khai báo đã được cơ sở lưu trú ghi nhận, không thể tự xóa.' });
    }
    await ctx.db.delete(row._id);
    return { removed: true };
  },
});

/**
 * Guest mutation: remove an unverified declaration made by the guest.
 */
export const removeForGuest = mutation({
  args: {
    confirmationCode: v.string(),
    email: v.string(),
    registrationId: v.id('residenceRegistrations'),
  },
  handler: async (ctx, args) => {
    const { booking } = await requireGuestBooking(ctx, args.confirmationCode, args.email);
    const row = await ctx.db.get(args.registrationId);
    if (!row || row.bookingId !== booking._id || row.submittedBy === 'staff') {
      throw new ConvexError({ code: 'NOT_FOUND', message: 'Không tìm thấy bản khai báo.' });
    }
    if (row.status === 'verified') {
      throw new ConvexError({
        code: 'ALREADY_VERIFIED',
        message: 'Bản khai báo đã được xác nhận bởi quản trị viên, không thể tự xóa.',
      });
    }
    await ctx.db.delete(row._id);
    return { removed: true };
  },
});

/**
 * Staff/Admin query: list all temporary residence / absence registrations for a property.
 */
export const listForProperty = query({
  args: {
    propertyId: v.optional(v.id('properties')),
    exportFull: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let propertyId: Id<'properties'> | undefined = args.propertyId;
    if (!propertyId) {
      const song = await ctx.db
        .query('properties')
        .withIndex('by_slug', (q) => q.eq('slug', 'song-homestay'))
        .first();
      const fallback = song ?? (await ctx.db.query('properties').first());
      propertyId = fallback?._id;
    }
    if (!propertyId) return [];

    let access = null;
    if (process.env.DEMO_MODE !== 'true') {
      access = await requirePropertyCapability(ctx, propertyId, 'booking.read');
    } else if (await getAuthUserId(ctx)) {
      try { access = await requirePropertyCapability(ctx, propertyId, 'booking.read'); }
      catch (error) { if (!(error instanceof ConvexError)) throw error; }
    }
    const canReveal = Boolean(access && roleCan(access.role, 'booking.write'));

    if (args.exportFull && !canReveal) throw new ConvexError('CAPABILITY_DENIED');
    const rows = await ctx.db
      .query('residenceRegistrations')
      .withIndex('by_property_createdAt', (q) => q.eq('propertyId', propertyId))
      .order('desc')
      .collect();

    const units = await ctx.db
      .query('units')
      .withIndex('by_property', (q) => q.eq('propertyId', propertyId))
      .collect();
    const unitNameById = new Map<Id<'units'>, string>(units.map((u) => [u._id, u.name]));

    const result = [];
    for (const row of rows) {
      const booking = await ctx.db.get(row.bookingId);
      result.push({
        _id: row._id, bookingId: row.bookingId, fullName: row.fullName, nationality: row.nationality,
        documentType: row.documentType, documentNumber: args.exportFull ? row.documentNumber : '••••' + row.documentNumber.slice(-4),
        dateOfBirth: canReveal ? row.dateOfBirth : undefined, phone: canReveal ? row.phone : undefined,
        permanentAddress: args.exportFull ? row.permanentAddress : undefined,
        canReveal, registrationType: row.registrationType, checkInDate: row.checkInDate, checkOutDate: row.checkOutDate,
        status: row.status, absenceStatus: row.absenceStatus, reason: row.reason, notes: row.notes,
        stayAddress: row.stayAddress, createdAt: row.createdAt, residentId: row.residentId,
        recordCode: row.recordCode ?? (row.registrationType === 'tam_tru' ? 'TT-' : 'TV-') + new Date(row.createdAt).getUTCFullYear() + '-' + row._id,
        confirmationCode: booking?.confirmationCode ?? 'UNKNOWN',
        unitName: booking ? (unitNameById.get(booking.unitId) ?? 'Phòng') : 'Phòng',
        bookingStatus: booking?.status ?? 'unknown',
      });
    }
    return result;
  },
});

/**
 * Staff/Admin mutation: verify or update status of a residence / absence declaration.
 */
export const verifyRegistration = mutation({
  args: {
    registrationId: v.id('residenceRegistrations'),
    status: v.union(v.literal('declared'), v.literal('verified'), v.literal('completed')),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.registrationId);
    if (!row) throw new ConvexError('REGISTRATION_NOT_FOUND');

    if (row.submittedBy === 'staff' || process.env.DEMO_MODE !== 'true') {
      await requireMutationPropertyCapability(
        ctx,
        row.propertyId,
        'booking.write',
        'residence.verify',
      );
    }

    await ctx.db.patch(row._id, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return { updated: true, status: args.status };
  },
});

export const updateAbsenceStatus = mutation({
  args: {
    registrationId: v.id('residenceRegistrations'),
    absenceStatus: v.union(v.literal('away'), v.literal('returned')),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.registrationId);
    if (!row || row.registrationType !== 'tam_vang') throw new ConvexError('ABSENCE_NOT_FOUND');
    if (row.submittedBy === 'staff' || process.env.DEMO_MODE !== 'true') {
      await requireMutationPropertyCapability(ctx, row.propertyId, 'booking.write', 'residence.absence.update');
    }
    await ctx.db.patch(row._id, {
      absenceStatus: args.absenceStatus,
      notes: args.notes === undefined ? row.notes : sanitizeText(args.notes, 400),
      status: args.absenceStatus === 'returned' ? 'completed' : row.status,
      updatedAt: Date.now(),
    });
    return { updated: true };
  },
});

/** Daily privacy retention cleanup. Legacy rows without a retention date are
 * preserved so an operator can review/migrate them explicitly. */
export const purgeExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('residenceRegistrations').collect();
    const now = Date.now();
    let removed = 0;
    for (const row of rows) {
      if (row.retentionUntil !== undefined && row.retentionUntil <= now) {
        await ctx.db.delete(row._id);
        removed += 1;
      }
    }
    return { removed };
  },
});

export const fullDocument = query({
  args: {id: v.id('residenceRegistrations')},
  handler: async (ctx, {id}) => {
    const row = await ctx.db.get(id);
    if (!row) throw new ConvexError('REGISTRATION_NOT_FOUND');
    await requirePropertyCapability(ctx, row.propertyId, 'booking.write');
    return row.documentNumber;
  },
});

export const bookingOptions = query({
  args: {propertyId: v.id('properties')},
  handler: async (ctx, {propertyId}) => {
    if (process.env.DEMO_MODE !== 'true') await requirePropertyCapability(ctx, propertyId, 'booking.read');
    const bookings = await ctx.db.query('bookings').withIndex('by_property_checkIn', q => q.eq('propertyId', propertyId)).order('desc').collect();
    return Promise.all(bookings.filter(b => ['pending','confirmed','checked_in','checked_out','external'].includes(b.status)).map(async b => ({
      id: b._id, code: b.confirmationCode, name: (b.guestId && (await ctx.db.get(b.guestId))?.name) || b.notes[0]?.text || 'Khách OTA',
      adults: b.adults, unit: (await ctx.db.get(b.unitId))?.name, start: b.checkIn, end: b.checkOut,
    })));
  },
});

async function nextCode(ctx: MutationCtx, propertyId: Id<'properties'>, kind: 'TT'|'TV', now: number) {
  const year = new Intl.DateTimeFormat('en', {year:'numeric',timeZone:'Asia/Ho_Chi_Minh'}).format(now);
  const prefix = kind + '-' + year;
  const counter = await ctx.db.query('residenceCounters').withIndex('by_property_prefix', q=>q.eq('propertyId',propertyId).eq('prefix',prefix)).unique();
  const next = (counter?.last ?? 0) + 1;
  if (counter) await ctx.db.patch(counter._id, {last:next});
  else await ctx.db.insert('residenceCounters', {propertyId,prefix,last:next});
  return prefix+'-'+String(next).padStart(3,'0');
}

export const staffRegister = mutation({
  args: {bookingId: v.id('bookings'), nationality: v.string(), documentType: v.union(v.literal('cccd'),v.literal('passport')),
    documentNumber: v.string(), dateOfBirth: v.string(), gender: v.string(), permanentAddress: v.string(), notes: v.optional(v.string())},
  handler: async (ctx,args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || !['pending','confirmed','checked_in','checked_out','external'].includes(booking.status)) throw new ConvexError('BOOKING_UNAVAILABLE');
    await requireMutationPropertyCapability(ctx, booking.propertyId, 'booking.write', 'residence.create');
    const number = args.documentNumber.trim().toUpperCase();
    if (!DOCUMENT_PATTERNS[args.documentType].pattern.test(number)) throw new ConvexError(DOCUMENT_PATTERNS[args.documentType].message);
    if (!isIsoDate(args.dateOfBirth) || args.dateOfBirth > booking.checkOut || !args.nationality.trim() || !args.gender.trim() || !args.permanentAddress.trim()) throw new ConvexError('Thông tin cá nhân chưa hợp lệ.');
    const existing = await ctx.db.query('residenceRegistrations').withIndex('by_booking', q => q.eq('bookingId', args.bookingId)).collect();
    if (existing.some(r => r.registrationType === 'tam_tru' && r.documentNumber.toUpperCase() === number)) throw new ConvexError('Khách đã có bản ghi tạm trú.');
    const guest = booking.guestId && await ctx.db.get(booking.guestId);
    const now = Date.now();
    return ctx.db.insert('residenceRegistrations', {...args, recordCode:await nextCode(ctx,booking.propertyId,'TT',now), documentNumber: number, fullName: guest?.name ?? booking.notes[0]?.text ?? 'Khách OTA',
      propertyId: booking.propertyId, registrationType:'tam_tru', checkInDate:booking.checkIn, checkOutDate:booking.checkOut,
      stayAddress: await stayAddressFor(ctx, booking), status:'declared', submittedBy:'staff', createdAt:now, updatedAt:now, retentionUntil:now+RETENTION_MS});
  },
});

export const saveAbsence = mutation({
  args: {residentId: v.id('residenceRegistrations'), id: v.optional(v.id('residenceRegistrations')),
    start: v.string(), end: v.string(), reason: v.string(), notes: v.string()},
  handler: async (ctx,args) => {
    const resident = await ctx.db.get(args.residentId);
    if (!resident) throw new ConvexError('REGISTRATION_NOT_FOUND');
    await requireMutationPropertyCapability(ctx, resident.propertyId, 'booking.write', 'residence.absence.save');
    const old = args.id ? await ctx.db.get(args.id) : null;
    // Older guest declarations have no linked resident ID. Preserve their original identity when edited.
    const legacy = old && !old.residentId && old._id === resident._id;
    if ((!legacy && resident.registrationType !== 'tam_tru') || (args.id && (!old || old.registrationType !== 'tam_vang' ||
        old.propertyId !== resident.propertyId || (!legacy && old.residentId !== args.residentId)))) throw new ConvexError('ABSENCE_NOT_FOUND');
    const booking = await ctx.db.get(resident.bookingId);
    const validTime = (s: string) => isIsoDate(s.slice(0,10)) && /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(s);
    if (!booking || !validTime(args.start) || !validTime(args.end) || args.start >= args.end ||
        args.start.slice(0,10) < booking.checkIn || args.end.slice(0,10) > booking.checkOut) throw new ConvexError('Thời gian tạm vắng phải nằm trong kỳ lưu trú.');
    const dates = {checkInDate:args.start, checkOutDate:args.end, reason:sanitizeText(args.reason,400), notes:sanitizeText(args.notes,400), updatedAt:Date.now()};
    if (old) return ctx.db.patch(old._id, dates);
    return ctx.db.insert('residenceRegistrations', {...dates, recordCode:await nextCode(ctx,resident.propertyId,'TV',Date.now()), residentId:resident._id, propertyId:resident.propertyId, bookingId:resident.bookingId,
      fullName:resident.fullName, documentType:resident.documentType, documentNumber:resident.documentNumber, nationality:resident.nationality,
      registrationType:'tam_vang', status:'declared', absenceStatus:'away', submittedBy:'staff', createdAt:Date.now(), retentionUntil:resident.retentionUntil ?? Date.now()+RETENTION_MS});
  },
});

