import { ConvexError, v } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { requireMutationPropertyCapability, requirePropertyCapability } from './staff';

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
      registrations: rows,
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
    documentType: v.union(v.literal('cccd'), v.literal('passport'), v.literal('other')),
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
      status: 'declared',
      absenceStatus: args.registrationType === 'tam_vang' ? 'away' : undefined,
      submittedBy: 'guest',
      consentAt: now,
      retentionUntil: now + 180 * 24 * 60 * 60 * 1000,
      createdAt: now,
      updatedAt: now,
    });

    return { registrationId };
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
    if (!row || row.bookingId !== booking._id) {
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

    if (process.env.DEMO_MODE !== 'true') {
      await requirePropertyCapability(ctx, propertyId, 'booking.read');
    }

    const rows = await ctx.db
      .query('residenceRegistrations')
      .withIndex('by_property_createdAt', (q) => q.eq('propertyId', propertyId))
      .order('desc')
      .take(200);

    const units = await ctx.db
      .query('units')
      .withIndex('by_property', (q) => q.eq('propertyId', propertyId))
      .collect();
    const unitNameById = new Map<Id<'units'>, string>(units.map((u) => [u._id, u.name]));

    const result = [];
    for (const row of rows) {
      const booking = await ctx.db.get(row.bookingId);
      result.push({
        ...row,
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

    if (process.env.DEMO_MODE !== 'true') {
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
    if (process.env.DEMO_MODE !== 'true') {
      await requireMutationPropertyCapability(ctx, row.propertyId, 'booking.write', 'residence.absence.update');
    }
    await ctx.db.patch(row._id, {
      absenceStatus: args.absenceStatus,
      notes: sanitizeText(args.notes, 400),
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

