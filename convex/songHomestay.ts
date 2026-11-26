import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { addOnLineCents, computePrice, daysBetween, isIsoDate, enumerateNights, generateConfirmationCode, todayInTimezone } from '../shared/pricing';
import { insertBookingAddOns, priceAddOnLines } from './addOnPricing';
import { markPropertyDirtyInline } from './channel/ari';
import { residenceProgress } from './residence';
import { findConflictPairs } from './icalImport';
import { requireMutationPropertyCapability, requirePropertyCapability } from './staff';

const activeBookingStatuses = new Set(['hold', 'pending', 'confirmed', 'checked_in', 'external', 'blocked']);

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

function assertDateRange(checkIn: string, checkOut: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
    throw new ConvexError({ code: 'INVALID_DATES', message: 'Ngày nhận/trả phòng không hợp lệ.' });
  }
  const nights = enumerateNights(checkIn, checkOut);
  if (nights.length < 1) {
    throw new ConvexError({ code: 'INVALID_DATE_RANGE', message: 'Ngày trả phòng phải sau ngày nhận phòng.' });
  }
  return nights;
}

async function requireRead(ctx: Parameters<typeof requirePropertyCapability>[0], propertyId: Id<'properties'>) {
  if (process.env.DEMO_MODE !== 'true') {
    await requirePropertyCapability(ctx, propertyId, 'booking.read');
  }
}

/**
 * Revenue figures are for the owner only. Outside DEMO_MODE the caller's
 * property role decides; under DEMO_MODE the synthetic demo identity counts
 * as owner unless a real staff assignment says otherwise.
 */
async function viewerIsOwner(ctx: Parameters<typeof requirePropertyCapability>[0], propertyId: Id<'properties'>): Promise<boolean> {
  try {
    const access = await requirePropertyCapability(ctx, propertyId, 'booking.read');
    return access.role === 'owner';
  } catch (error) {
    if (process.env.DEMO_MODE === 'true') return true;
    throw error;
  }
}

async function requireWrite(ctx: MutationCtx, propertyId: Id<'properties'>, action: string) {
  if (process.env.DEMO_MODE !== 'true') {
    await requireMutationPropertyCapability(ctx, propertyId, 'booking.write', action);
  }
}

async function requireConfigure(ctx: MutationCtx, propertyId: Id<'properties'>, action: string) {
  if (process.env.DEMO_MODE !== 'true') {
    await requireMutationPropertyCapability(ctx, propertyId, 'property.configure', action);
  }
}

async function assertUnitAvailable(
  ctx: MutationCtx,
  unitId: Id<'units'>,
  nights: string[],
): Promise<void> {
  for (const date of nights) {
    const occupied = await ctx.db
      .query('unitNights')
      .withIndex('by_unit_date', (q) => q.eq('unitId', unitId).eq('date', date))
      .first();
    if (occupied) {
      throw new ConvexError({
        code: 'DATES_UNAVAILABLE',
        message: `Căn đã có booking vào ngày ${date}. Vui lòng chọn ngày hoặc căn khác.`,
      });
    }
  }
}

export const managementCatalog = query({
  args: { propertyId: v.id('properties') },
  handler: async (ctx, args) => {
    await requireRead(ctx, args.propertyId);
    const [property, units, unitTypes, addOns, plans] = await Promise.all([
      ctx.db.get(args.propertyId),
      ctx.db.query('units').withIndex('by_property', (q) => q.eq('propertyId', args.propertyId)).collect(),
      ctx.db.query('unitTypes').withIndex('by_property', (q) => q.eq('propertyId', args.propertyId)).collect(),
      ctx.db.query('addOns').withIndex('by_property', (q) => q.eq('propertyId', args.propertyId)).collect(),
      ctx.db.query('ratePlans').withIndex('by_property', q => q.eq('propertyId', args.propertyId)).collect(),
    ]);
    if (!property) throw new ConvexError('PROPERTY_NOT_FOUND');
    return {
      property: { propertyId: property._id, name: property.name, slug: property.slug, currency: property.currency },
      unitTypes: unitTypes
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((row) => ({
          unitTypeId: row._id,
          name: row.name,
          slug: row.slug,
          rates: plans.filter(plan => plan.unitTypeId === row._id && plan.active).map(plan => ({id: plan._id, name: plan.name, cents: plan.baseNightlyCents})),
          kind: row.kind,
          description: row.description,
          photoUrls: row.photoUrls,
          maxOccupancy: row.capacityKnown === false ? null : row.maxOccupancy,
          capacityKnown: row.capacityKnown !== false,
          address: row.address,
          accommodationType: row.accommodationType,
          bedrooms: row.bedrooms,
          bathrooms: row.bathrooms,
          areaSqm: row.areaSqm,
          highlights: row.highlights ?? [],
          amenities: row.amenities,
          comingSoon: row.comingSoon,
          longStay: row.longStay === true,
          monthlyPriceCents: row.monthlyPriceCents ?? null,
        })),
      units: units
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((row) => ({
          unitId: row._id,
          unitTypeId: row.unitTypeId,
          name: row.name,
          slug: row.slug,
          status: row.status,
          sortOrder: row.sortOrder,
          icalImports: row.icalImports,
        })),
      addOns: addOns
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((row) => ({
          addOnId: row._id,
          name: row.name,
          priceCents: row.priceCents,
          unitLabel: row.unitLabel,
          taxable: row.taxable,
          active: row.active,
          sortOrder: row.sortOrder,
          freeFirstUnitMinNights: row.freeFirstUnitMinNights ?? null,
        })),
    };
  },
});

export const serviceOverview = query({
  args: {propertyId: v.id('properties'), startDate: v.string(), endDate: v.string()},
  handler: async (ctx, args) => {
    await requireRead(ctx, args.propertyId);
    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new ConvexError('PROPERTY_NOT_FOUND');
    const day = new Intl.DateTimeFormat('en-CA', {timeZone: property.timezone, year:'numeric', month:'2-digit', day:'2-digit'});
    const services = await ctx.db.query('addOns').withIndex('by_property', q => q.eq('propertyId', args.propertyId)).collect();
    let revenue = 0;
    const customers = new Set<string>();
    const rows = [];
    const today = todayInTimezone(property.timezone);
    for (const service of services) {
      const lines = await ctx.db.query('bookingAddOns').withIndex('by_addOn', q => q.eq('addOnId', service._id)).collect();
      for (const line of lines) {
        const booking = await ctx.db.get(line.bookingId);
        if (!booking || booking.propertyId !== args.propertyId || !['confirmed','checked_in','checked_out'].includes(booking.status)) continue;
        const saleDate = day.format(line.soldAt);
        if (saleDate >= args.startDate && saleDate < args.endDate) revenue += addOnLineCents(line);
        // Service schedule (WEBSITE r6): every service of a confirmed or in-house booking whose stay
        // touches the selected period or is still ahead, so the desk can prepare it before arrival.
        if (!['confirmed', 'checked_in'].includes(booking.status)) continue;
        const relevant = (booking.checkIn < args.endDate && booking.checkOut > args.startDate) || booking.checkOut > today;
        if (!relevant) continue;
        const [guest, unit] = await Promise.all([booking.guestId ? ctx.db.get(booking.guestId) : null, ctx.db.get(booking.unitId)]);
        if (booking.status === 'checked_in' && !line.completedAt) customers.add(booking.guestId ?? booking._id);
        const serviceNote = booking.notes.filter((note) => note.by === 'Khách (dịch vụ)').map((note) => note.text).join(' | ');
        rows.push({id: line._id, guest: guest?.name ?? booking.notes[0]?.text ?? 'Khách OTA', phone: guest?.phone ?? '', code: booking.confirmationCode,
          unit: unit?.name ?? 'Chỗ nghỉ', checkIn: booking.checkIn, checkOut: booking.checkOut, bookingStatus: booking.status,
          service: line.nameSnapshot, unitLabel: service.unitLabel, quantity: line.quantity, freeQuantity: line.freeQuantity ?? 0,
          amountCents: addOnLineCents(line), serviceNote, completed: Boolean(line.completedAt)});
      }
    }
    rows.sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.unit.localeCompare(b.unit));
    return {active: services.filter(s => s.active).length, total: services.length, customers: customers.size, revenue, today, rows};
  },
});

/** Mark a booked service prepared/done. Arriving (confirmed) guests count too: the desk prepares before check-in. */
export const finishService = mutation({
  args: {propertyId: v.id('properties'), lineId: v.id('bookingAddOns')},
  handler: async (ctx, args) => {
    await requireWrite(ctx, args.propertyId, 'song.service.complete');
    const line = await ctx.db.get(args.lineId);
    const booking = line && await ctx.db.get(line.bookingId);
    if (!line || booking?.propertyId !== args.propertyId || !['confirmed', 'checked_in'].includes(booking.status)) throw new ConvexError('SERVICE_NOT_ACTIVE');
    if (!line.completedAt) await ctx.db.patch(line._id, {completedAt: Date.now()});
  },
});

/** Add-on services guests arriving on `date` have booked, so the front desk can prepare them before check-in. */
export const shiftServices = query({
  args: { propertyId: v.id('properties'), date: v.string() },
  handler: async (ctx, args) => {
    await requireRead(ctx, args.propertyId);
    if (!isIsoDate(args.date)) throw new ConvexError('INVALID_DATE_RANGE');
    const arrivals = await ctx.db
      .query('bookings')
      .withIndex('by_property_checkIn', (q) => q.eq('propertyId', args.propertyId).eq('checkIn', args.date))
      .collect();
    const rows = [];
    for (const booking of arrivals) {
      if (['cancelled', 'expired', 'blocked'].includes(booking.status)) continue;
      const lines = await ctx.db.query('bookingAddOns').withIndex('by_booking', (q) => q.eq('bookingId', booking._id)).collect();
      for (const line of lines) {
        rows.push({ lineId: line._id, code: booking.confirmationCode, name: line.nameSnapshot, quantity: line.quantity, completed: Boolean(line.completedAt) });
      }
    }
    return rows;
  },
});

export const kpiSummary = query({
  args: { propertyId: v.id('properties'), since: v.string() },
  handler: async (ctx, args) => {
    await requireRead(ctx, args.propertyId);
    const [bookings, units] = await Promise.all([
      ctx.db
        .query('bookings')
        .withIndex('by_property_checkIn', (q) => q.eq('propertyId', args.propertyId).gte('checkIn', args.since))
        .collect(),
      ctx.db.query('units').withIndex('by_property', (q) => q.eq('propertyId', args.propertyId)).collect(),
    ]);
    const live = bookings.filter((booking) => booking.status !== 'cancelled' && booking.status !== 'expired');
    const direct = live.filter((booking) => booking.source === 'online');
    let directWithServices = 0;
    for (const booking of direct) {
      const addOn = await ctx.db
        .query('bookingAddOns')
        .withIndex('by_booking', (q) => q.eq('bookingId', booking._id))
        .first();
      if (addOn) directWithServices += 1;
    }
    const conflictResolutionMinutes: number[] = [];
    for (const booking of bookings) {
      const resolution = booking.notes.find((note) =>
        note.text.includes('Xử lý Double Booking') || note.text.includes('Đã xử lý trên OTA'),
      );
      if (resolution) conflictResolutionMinutes.push(Math.max(0, (resolution.ts - booking.createdAt) / 60_000));
    }
    const feedStates = units.flatMap((unit) => unit.icalImports);
    const lastSyncAt = feedStates.reduce((latest, feed) => Math.max(latest, feed.lastSyncedAt ?? 0), 0);
    return {
      since: args.since,
      totalBookings: live.length,
      directBookings: direct.length,
      manualBookings: live.filter((booking) => booking.source.startsWith('manual:')).length,
      otaBookings: live.filter((booking) => booking.source.startsWith('ical:')).length,
      directSharePercent: live.length > 0 ? Math.round((direct.length / live.length) * 1000) / 10 : 0,
      directWithServices,
      serviceAttachPercent: direct.length > 0 ? Math.round((directWithServices / direct.length) * 1000) / 10 : 0,
      activeConflicts: live.filter((booking) => booking.syncConflict && !booking.syncConflictAcknowledgedAt).length,
      averageResolutionMinutes: conflictResolutionMinutes.length > 0
        ? Math.round(conflictResolutionMinutes.reduce((sum, value) => sum + value, 0) / conflictResolutionMinutes.length)
        : null,
      configuredFeeds: feedStates.length,
      failedFeeds: feedStates.filter((feed) => feed.lastStatus?.startsWith('error:')).length,
      lastSyncAt: lastSyncAt || null,
    };
  },
});

export const createManualBooking = mutation({
  args: {
    propertyId: v.id('properties'),
    unitId: v.id('units'),
    checkIn: v.string(),
    checkOut: v.string(),
    guestName: v.string(),
    guestEmail: v.optional(v.string()),
    guestPhone: v.string(),
    adults: v.number(),
    children: v.number(),
    source: v.union(
      v.literal('zalo'),
      v.literal('facebook'),
      v.literal('phone'),
      v.literal('walk_in'),
      v.literal('other'),
    ),
    note: v.optional(v.string()),
    // Services chosen by staff, exactly like the guest flow (WEBSITE (2).pdf r7).
    // Only ids and quantities: prices always come from the DB.
    addOns: v.optional(v.array(v.object({ addOnId: v.id('addOns'), quantity: v.number() }))),
  },
  handler: async (ctx, args) => {
    await requireWrite(ctx, args.propertyId, 'song.manual_booking.create');
    const unit = await ctx.db.get(args.unitId);
    if (!unit || unit.propertyId !== args.propertyId || unit.status !== 'active') {
      throw new ConvexError({ code: 'UNIT_UNAVAILABLE', message: 'Căn không tồn tại hoặc đang ngừng kinh doanh.' });
    }
    const nights = assertDateRange(args.checkIn, args.checkOut);
    await assertUnitAvailable(ctx, unit._id, nights);
    // Price the stay like a website booking (same rate plan the public page
    // quotes, same add-on validation and perk), so manual bookings carry real
    // revenue instead of 0 đ. No promo / gift certificate on this path.
    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new ConvexError('PROPERTY_NOT_FOUND');
    const ratePlan = await ctx.db
      .query('ratePlans')
      .withIndex('by_unitType', (q) => q.eq('unitTypeId', unit.unitTypeId).eq('active', true))
      .first();
    if (!ratePlan) {
      throw new ConvexError({ code: 'RATE_PLAN_MISSING', message: 'Căn này chưa có giá phòng. Vui lòng đặt giá trong Quản lý chỗ nghỉ.' });
    }
    if (args.addOns && args.addOns.length > 20) {
      throw new ConvexError({ code: 'ADDON_INVALID', message: 'Quá nhiều dịch vụ trong một booking.' });
    }
    const pricedAddOns = await priceAddOnLines(ctx, unit, args.addOns ?? [], args.checkIn, args.checkOut);
    const price = computePrice({
      ratePlan,
      checkIn: args.checkIn,
      checkOut: args.checkOut,
      addOns: pricedAddOns.priceLines,
      taxRateBps: property.taxRateBps,
    });
    const guestName = args.guestName.trim();
    const phone = args.guestPhone.trim();
    if (!guestName || !phone) {
      throw new ConvexError({ code: 'GUEST_REQUIRED', message: 'Vui lòng nhập tên và số điện thoại khách.' });
    }
    if (!Number.isInteger(args.adults) || args.adults < 1 || !Number.isInteger(args.children) || args.children < 0) {
      throw new ConvexError({ code: 'INVALID_OCCUPANCY', message: 'Số lượng khách không hợp lệ.' });
    }

    const normalizedEmail = normalizeEmail(args.guestEmail ?? '');
    const normalizedPhone = normalizePhone(phone);
    let guest = normalizedPhone
      ? await ctx.db
          .query('guests')
          .withIndex('by_phone', (q) => q.eq('propertyId', args.propertyId).eq('normalizedPhone', normalizedPhone))
          .first()
      : null;
    if (!guest && normalizedEmail) {
      guest = await ctx.db
        .query('guests')
        .withIndex('by_email', (q) => q.eq('propertyId', args.propertyId).eq('normalizedEmail', normalizedEmail))
        .first();
    }
    let guestId: Id<'guests'>;
    if (guest) {
      guestId = guest._id;
      await ctx.db.patch(guest._id, {
        name: guestName,
        email: args.guestEmail?.trim() ?? guest.email,
        normalizedEmail: normalizedEmail || guest.normalizedEmail,
        phone,
        normalizedPhone,
      });
    } else {
      guestId = await ctx.db.insert('guests', {
        propertyId: args.propertyId,
        name: guestName,
        email: args.guestEmail?.trim() ?? '',
        phone,
        normalizedEmail,
        normalizedPhone,
        marketingOptIn: false,
        notes: [],
      });
    }

    const now = Date.now();
    const confirmationCode = generateConfirmationCode((max) => Math.floor(Math.random() * max));
    const bookingId = await ctx.db.insert('bookings', {
      propertyId: args.propertyId,
      unitId: unit._id,
      unitTypeId: unit.unitTypeId,
      guestId,
      checkIn: args.checkIn,
      checkOut: args.checkOut,
      nights: nights.length,
      adults: args.adults,
      children: args.children,
      status: 'confirmed',
      source: `manual:${args.source}`,
      confirmationCode,
      ratePlanId: ratePlan._id,
      priceBreakdown: price,
      statusHistory: [{ status: 'confirmed', ts: now }],
      notes: args.note?.trim() ? [{ ts: now, text: args.note.trim(), by: 'Admin Sóng Homestay' }] : [],
      createdAt: now,
      updatedAt: now,
      version: 0,
    });
    for (const date of nights) {
      await ctx.db.insert('unitNights', { unitId: unit._id, date, bookingId, kind: 'stay' });
    }
    await insertBookingAddOns(ctx, bookingId, pricedAddOns, now);
    await markPropertyDirtyInline(ctx, args.propertyId);
    return { bookingId, confirmationCode, totalCents: price.totalCents };
  },
});

export const createUnit = mutation({
  args: {
    propertyId: v.id('properties'),
    unitTypeId: v.id('unitTypes'),
    name: v.string(),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    await requireWrite(ctx, args.propertyId, 'song.unit.create');
    const unitType = await ctx.db.get(args.unitTypeId);
    if (!unitType || unitType.propertyId !== args.propertyId) throw new ConvexError('INVALID_UNIT_TYPE');
    const name = args.name.trim();
    const slug = args.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!name || !slug) throw new ConvexError('UNIT_NAME_SLUG_REQUIRED');
    const duplicate = await ctx.db
      .query('units')
      .withIndex('by_property', (q) => q.eq('propertyId', args.propertyId))
      .collect();
    if (duplicate.some((row) => row.slug === slug)) throw new ConvexError('UNIT_SLUG_EXISTS');
    const unitId = await ctx.db.insert('units', {
      propertyId: args.propertyId,
      unitTypeId: args.unitTypeId,
      name,
      slug,
      status: 'active',
      icalExportToken: crypto.randomUUID().replaceAll('-', ''),
      icalImports: [],
      sortOrder: duplicate.length + 1,
    });
    return { unitId };
  },
});

export const updateUnit = mutation({
  args: {
    propertyId: v.id('properties'),
    unitId: v.id('units'),
    name: v.string(),
    status: v.union(v.literal('active'), v.literal('coming_soon'), v.literal('offline')),
  },
  handler: async (ctx, args) => {
    await requireWrite(ctx, args.propertyId, 'song.unit.update');
    const unit = await ctx.db.get(args.unitId);
    if (!unit || unit.propertyId !== args.propertyId) throw new ConvexError('UNIT_NOT_FOUND');
    if (!args.name.trim()) throw new ConvexError('UNIT_NAME_REQUIRED');
    if (args.status === 'offline') {
      const rows = await ctx.db.query('bookings').withIndex('by_unit_checkIn', (q) => q.eq('unitId', unit._id)).collect();
      if (rows.some((row) => activeBookingStatuses.has(row.status))) {
        throw new ConvexError({ code: 'UNIT_HAS_ACTIVE_BOOKINGS', message: 'Không thể ngừng căn đang có booking hoạt động.' });
      }
    }
    await ctx.db.patch(unit._id, { name: args.name.trim(), status: args.status });
    return { updated: true };
  },
});

/** Stay-length perk threshold: a whole number of nights 1–60, or undefined for none. */
function validPerkNights(value: number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1 || value > 60) {
    throw new ConvexError({ code: 'INVALID_ADDON', message: 'Số đêm để được miễn phí phải từ 1 đến 60.' });
  }
  return value;
}

export const createAddOn = mutation({
  args: {
    propertyId: v.id('properties'),
    name: v.string(),
    priceCents: v.number(),
    unitLabel: v.string(),
    taxable: v.boolean(),
    // "Miễn phí 1 lượt khi ở từ N đêm" (null/omitted = no perk).
    freeFirstUnitMinNights: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    await requireWrite(ctx, args.propertyId, 'song.addon.create');
    if (!args.name.trim() || !args.unitLabel.trim() || !Number.isInteger(args.priceCents) || args.priceCents < 0) {
      throw new ConvexError('INVALID_ADDON');
    }
    const freeFirstUnitMinNights = validPerkNights(args.freeFirstUnitMinNights);
    const existing = await ctx.db
      .query('addOns')
      .withIndex('by_property', (q) => q.eq('propertyId', args.propertyId))
      .collect();
    const addOnId = await ctx.db.insert('addOns', {
      propertyId: args.propertyId,
      name: args.name.trim(),
      priceCents: args.priceCents,
      taxable: args.taxable,
      unitLabel: args.unitLabel.trim(),
      appliesTo: [],
      active: true,
      sortOrder: existing.length + 1,
      ...(freeFirstUnitMinNights ? { freeFirstUnitMinNights } : {}),
    });
    return { addOnId };
  },
});

export const updateAddOn = mutation({
  args: {
    propertyId: v.id('properties'),
    addOnId: v.id('addOns'),
    name: v.string(),
    priceCents: v.number(),
    unitLabel: v.string(),
    taxable: v.boolean(),
    active: v.boolean(),
    // Omitted = keep the current perk; null = remove it.
    freeFirstUnitMinNights: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    await requireWrite(ctx, args.propertyId, 'song.addon.update');
    const addOn = await ctx.db.get(args.addOnId);
    if (!addOn || addOn.propertyId !== args.propertyId) throw new ConvexError('ADDON_NOT_FOUND');
    if (!args.name.trim() || !args.unitLabel.trim() || !Number.isInteger(args.priceCents) || args.priceCents < 0) {
      throw new ConvexError('INVALID_ADDON');
    }
    await ctx.db.patch(addOn._id, {
      name: args.name.trim(),
      priceCents: args.priceCents,
      unitLabel: args.unitLabel.trim(),
      taxable: args.taxable,
      active: args.active,
      ...(args.freeFirstUnitMinNights !== undefined ? { freeFirstUnitMinNights: validPerkNights(args.freeFirstUnitMinNights) } : {}),
    });
    return { updated: true };
  },
});

export const updateAccommodation = mutation({
  args: {
    propertyId: v.id('properties'),
    unitTypeId: v.id('unitTypes'),
    name: v.string(),
    rates: v.optional(v.array(v.object({id: v.id('ratePlans'), cents: v.number()}))),
    address: v.string(),
    accommodationType: v.string(),
    description: v.string(),
    bedrooms: v.number(),
    bathrooms: v.number(),
    areaSqm: v.optional(v.number()),
    maxOccupancy: v.optional(v.number()),
    highlights: v.array(v.string()),
    amenities: v.array(v.string()),
    photoUrls: v.array(v.string()),
    comingSoon: v.boolean(),
    longStay: v.optional(v.boolean()),
    monthlyPriceCents: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireConfigure(ctx, args.propertyId, 'song.accommodation.update');
    const row = await ctx.db.get(args.unitTypeId);
    if (!row || row.propertyId !== args.propertyId) throw new ConvexError('ACCOMMODATION_NOT_FOUND');
    if (!args.name.trim() || !(args.bedrooms >= 0) || !(args.bathrooms >= 0)) {
      throw new ConvexError('INVALID_ACCOMMODATION');
    }
    for (const rate of args.rates ?? []) {
      const plan = await ctx.db.get(rate.id);
      if (!plan || !plan.active || plan.propertyId !== args.propertyId || plan.unitTypeId !== row._id ||
          !Number.isSafeInteger(rate.cents) || rate.cents < 0) throw new ConvexError('INVALID_RATE');
      await ctx.db.patch(plan._id, {baseNightlyCents: rate.cents});
    }
    if (args.rates?.length) await markPropertyDirtyInline(ctx, args.propertyId);
    await ctx.db.patch(row._id, {
      name: args.name.trim(),
      address: args.address.trim() || undefined,
      accommodationType: args.accommodationType.trim(),
      description: args.description.trim(),
      bedrooms: args.bedrooms,
      bathrooms: args.bathrooms,
      areaSqm: args.areaSqm,
      maxOccupancy: args.maxOccupancy ?? 0,
      capacityKnown: args.maxOccupancy !== undefined,
      highlights: args.highlights.map((item) => item.trim()).filter(Boolean),
      amenities: args.amenities.map((item) => item.trim()).filter(Boolean),
      photoUrls: args.photoUrls.map((item) => item.trim()).filter(Boolean),
      comingSoon: args.comingSoon,
      ...(args.longStay !== undefined ? { longStay: args.longStay } : {}),
      ...(args.monthlyPriceCents !== undefined ? { monthlyPriceCents: validMoney(args.monthlyPriceCents) || undefined } : {}),
    });
    // A stay sold as one whole unit carries the same name everywhere (calendar, occupancy, residence lists).
    const units = await ctx.db.query('units').withIndex('by_type', (q) => q.eq('unitTypeId', row._id)).collect();
    if (units.length === 1 && units[0].name !== args.name.trim()) await ctx.db.patch(units[0]._id, { name: args.name.trim() });
    return { updated: true };
  },
});

function validMoney(cents: number) {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new ConvexError('INVALID_RATE');
  return cents;
}

const slugify = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/**
 * Add a new stay: one unit type, its single bookable unit and a standard rate plan.
 * Idempotent per name: a retried request for an existing slug returns that stay instead of a duplicate.
 */
export const createAccommodation = mutation({
  args: {
    propertyId: v.id('properties'),
    name: v.string(),
    accommodationType: v.string(),
    address: v.string(),
    description: v.string(),
    bedrooms: v.number(),
    bathrooms: v.number(),
    maxOccupancy: v.number(),
    areaSqm: v.optional(v.number()),
    nightlyCents: v.number(),
    longStay: v.boolean(),
    monthlyPriceCents: v.optional(v.number()),
    photoUrls: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireConfigure(ctx, args.propertyId, 'song.accommodation.create');
    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new ConvexError('PROPERTY_NOT_FOUND');
    const name = args.name.trim();
    const slug = slugify(name);
    if (!name || !slug || !(args.bedrooms >= 0) || !(args.bathrooms >= 0) || !Number.isInteger(args.maxOccupancy) || args.maxOccupancy < 1) {
      throw new ConvexError('INVALID_ACCOMMODATION');
    }
    const nightlyCents = validMoney(args.nightlyCents);
    const existing = await ctx.db.query('unitTypes').withIndex('by_property_slug', (q) => q.eq('propertyId', args.propertyId).eq('slug', slug)).first();
    if (existing) return { unitTypeId: existing._id, created: false };
    const siblings = await ctx.db.query('unitTypes').withIndex('by_property', (q) => q.eq('propertyId', args.propertyId)).collect();
    const sortOrder = Math.max(0, ...siblings.filter((t) => t.sortOrder < 100).map((t) => t.sortOrder)) + 1;
    const unitTypeId = await ctx.db.insert('unitTypes', {
      propertyId: args.propertyId, name, slug, kind: 'cabin', bookingMode: 'nightly',
      description: args.description.trim(), photoUrls: args.photoUrls.map((u) => u.trim()).filter(Boolean),
      maxOccupancy: args.maxOccupancy, capacityKnown: true, amenities: [], highlights: [],
      address: args.address.trim() || undefined, accommodationType: args.accommodationType.trim() || 'Nhà nguyên căn',
      bedrooms: args.bedrooms, bathrooms: args.bathrooms, areaSqm: args.areaSqm,
      longStay: args.longStay, monthlyPriceCents: args.monthlyPriceCents ? validMoney(args.monthlyPriceCents) : undefined,
      comingSoon: false, sortOrder,
    });
    const unitSiblings = await ctx.db.query('units').withIndex('by_property', (q) => q.eq('propertyId', args.propertyId)).collect();
    await ctx.db.insert('units', {
      propertyId: args.propertyId, unitTypeId, name, slug, status: 'active',
      icalExportToken: crypto.randomUUID().replaceAll('-', ''), icalImports: [],
      sortOrder: Math.max(0, ...unitSiblings.map((u) => u.sortOrder)) + 1,
    });
    await ctx.db.insert('ratePlans', {
      propertyId: args.propertyId, unitTypeId, name: args.longStay ? 'Giá thuê dài hạn' : 'Giá tiêu chuẩn', active: true,
      currency: property.currency, baseNightlyCents: nightlyCents, seasons: [],
      minStayNights: args.longStay ? 30 : 1, maxStayNights: args.longStay ? 365 : 30,
      minLeadTimeHours: 0, maxAdvanceDays: 365, prepBufferNights: 0,
      depositPolicy: { type: 'percent', value: 30 },
      cancellationPolicy: [{ daysBefore: 7, refundPercent: 100 }, { daysBefore: 0, refundPercent: 0 }],
    });
    return { unitTypeId, created: true };
  },
});

/** Short-lived Convex storage upload URL for accommodation photos. */
export const generatePhotoUploadUrl = mutation({
  args: { propertyId: v.id('properties') },
  handler: async (ctx, args) => {
    await requireConfigure(ctx, args.propertyId, 'song.accommodation.photo');
    return await ctx.storage.generateUploadUrl();
  },
});

/** Resolve an uploaded photo to the public URL stored in unitTypes.photoUrls. */
export const photoUrl = mutation({
  args: { propertyId: v.id('properties'), storageId: v.id('_storage') },
  handler: async (ctx, args) => {
    await requireConfigure(ctx, args.propertyId, 'song.accommodation.photo');
    const meta = await ctx.db.system.get(args.storageId);
    if (!meta || !meta.contentType?.startsWith('image/') || meta.size > 10 * 1024 * 1024) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError({ code: 'INVALID_PHOTO', message: 'Chỉ nhận ảnh (JPG, PNG, WebP) tối đa 10 MB.' });
    }
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new ConvexError('PHOTO_NOT_FOUND');
    return url;
  },
});

export const updateBookingStatus = mutation({
  args: {
    propertyId: v.id('properties'),
    bookingId: v.id('bookings'),
    status: v.union(v.literal('confirmed'), v.literal('checked_in'), v.literal('checked_out'), v.literal('cancelled')),
  },
  handler: async (ctx, args) => {
    await requireWrite(ctx, args.propertyId, 'song.booking.status');
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || booking.propertyId !== args.propertyId) throw new ConvexError('BOOKING_NOT_FOUND');
    const allowed: Record<string, string[]> = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['checked_in', 'cancelled'],
      checked_in: ['checked_out'],
    };
    if (!allowed[booking.status]?.includes(args.status)) {
      throw new ConvexError({ code: 'INVALID_STATUS_TRANSITION', message: `Không thể chuyển ${booking.status} sang ${args.status}.` });
    }
    // Missing declarations never block check-in: front desk helps the guest declare (WEBSITE.pdf r5).
    if (args.status === 'cancelled') {
      const nights = await ctx.db.query('unitNights').withIndex('by_booking', (q) => q.eq('bookingId', booking._id)).collect();
      for (const night of nights) await ctx.db.delete(night._id);
      await markPropertyDirtyInline(ctx, booking.propertyId);
    }
    const now = Date.now();
    await ctx.db.patch(booking._id, {
      status: args.status,
      statusHistory: [...booking.statusHistory, { status: args.status, ts: now }],
      notes: [...booking.notes, { ts: now, text: `Cập nhật trạng thái: ${args.status}`, by: 'Admin Sóng Homestay' }],
      updatedAt: now,
    });
    // Staff confirmed a request: email the guest (idempotent per booking+template);
    // the guest bell lights up from guestAccount.pendingDeclarations.
    if (booking.status === 'pending' && args.status === 'confirmed') {
      await ctx.scheduler.runAfter(0, internal.email.sendBookingEmail, { bookingId: booking._id, kind: 'confirmation' });
    }
    return { updated: true };
  },
});

/**
 * Display name for a booking. OTA imports carry no guest: their first note is
 * the iCal SUMMARY ("Reserved", "CLOSED - Not available"), never a name, so
 * they read as "Khách Airbnb" / "Khách Booking.com".
 */
function guestLabel(name: string | undefined, booking: { status: string; source: string; notes: Array<{ text: string }> }): string {
  if (name) return name;
  if (booking.status === 'external' || booking.source.startsWith('ical:')) return `Khách ${booking.source.replace(/^ical:/, '') || 'OTA'}`;
  return booking.notes[0]?.text ?? 'Khách OTA';
}

export const adminSnapshot = query({
  args: { propertyId: v.id('properties'), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, args) => {
    await requireRead(ctx, args.propertyId);
    if (!isIsoDate(args.startDate) || !isIsoDate(args.endDate) || args.endDate<=args.startDate) throw new ConvexError('INVALID_DATE_RANGE');
    const [property, units, unitTypes, bookings] = await Promise.all([
      ctx.db.get(args.propertyId),
      ctx.db.query('units').withIndex('by_property', (q) => q.eq('propertyId', args.propertyId)).collect(),
      ctx.db.query('unitTypes').withIndex('by_property', (q) => q.eq('propertyId', args.propertyId)).collect(),
      ctx.db.query('bookings').withIndex('by_property_checkIn', (q) => q.eq('propertyId', args.propertyId)).collect(),
    ]);
    if (!property) throw new ConvexError('PROPERTY_NOT_FOUND');
    const unitById = new Map(units.map((row) => [String(row._id), row]));
    const typeById = new Map(unitTypes.map((row) => [String(row._id), row]));
    const active = bookings.filter((row) => row.status !== 'cancelled' && row.status !== 'expired');
    const inRange = active.filter((row) => row.checkIn < args.endDate && row.checkOut > args.startDate);
    const dateFormat = new Intl.DateTimeFormat('en-CA', {timeZone: property.timezone, year:'numeric', month:'2-digit', day:'2-digit'});
    const linesFor = async (bookingId: Id<'bookings'>) => ctx.db.query('bookingAddOns').withIndex('by_booking', (q) => q.eq('bookingId', bookingId)).collect();
    const sourceName = (source: string) => source === 'online' ? 'Website' : source.replace(/^ical:/, '').replace(/^manual:/, '');
    // Revenue is visible to the owner only (WEBSITE.pdf r5). Under DEMO_MODE the
    // synthetic demo identity is an owner unless a real staff row says otherwise.
    const canSeeRevenue = await viewerIsOwner(ctx, args.propertyId);

    // "Booking mới" = every booking created in the period, any channel, one per
    // booking (not per night or guest); cancelled/expired requests, unfinished
    // holds and maintenance blocks are left out.
    const created = active.filter((row) => {
      const day = dateFormat.format(row.createdAt);
      return day >= args.startDate && day < args.endDate && row.status !== 'blocked' && row.status !== 'hold';
    });
    const newBookings = [];
    const channelCounts: Record<string, number> = {};
    let directBookings = 0;
    let directWithServices = 0;
    for (const row of created) {
      const [guest, lines] = await Promise.all([row.guestId ? ctx.db.get(row.guestId) : null, linesFor(row._id)]);
      const source = sourceName(row.source);
      channelCounts[source] = (channelCounts[source] ?? 0) + 1;
      if (row.source === 'online') { directBookings += 1; if (lines.length) directWithServices += 1; }
      newBookings.push({
        date: dateFormat.format(row.createdAt), unitId: row.unitId, code: row.confirmationCode, status: row.status,
        bookingId: row._id, guestName: guestLabel(guest?.name, row), unitName: unitById.get(String(row.unitId))?.name ?? 'Chỗ nghỉ',
        checkIn: row.checkIn, checkOut: row.checkOut, source: row.source, hasServices: lines.length > 0,
      });
    }

    const bookingRows = [];
    let roomRevenueCents = 0;
    let serviceRevenueCents = 0;
    const sourceCounts: Record<string, number> = {};
    const dailyRevenue: Record<string, { roomCents: number; serviceCents: number }> = {};
    // Service efficiency: motorbike rental and airport transfer only (tours are advice, not sales).
    const serviceGroups = new Map<string, { name: string; bookings: number; units: number; freeUnits: number; revenueCents: number }>([
      ['bike', { name: 'Thuê xe máy', bookings: 0, units: 0, freeUnits: 0, revenueCents: 0 }],
      ['airport', { name: 'Đưa đón sân bay', bookings: 0, units: 0, freeUnits: 0, revenueCents: 0 }],
    ]);
    const groupOf = (name: string) => name.startsWith('Thuê xe máy') ? 'bike' : /sân bay/i.test(name) ? 'airport' : null;
    // The booking list also shows cancelled bookings under "Đã hủy" (WEBSITE (2).pdf r7),
    // whoever cancelled them. They are listed only: revenue (status-gated below),
    // channel counts, occupancy and KPIs stay on `active`/`inRange`.
    const listed = bookings.filter((row) => row.status !== 'expired' && row.checkIn < args.endDate && row.checkOut > args.startDate);
    for (const booking of listed) {
      const [guest, lines] = await Promise.all([
        booking.guestId ? ctx.db.get(booking.guestId) : null,
        linesFor(booking._id),
      ]);
      const serviceCents = lines.reduce((sum, line) => sum + addOnLineCents(line), 0);
      const totalCents = booking.priceBreakdown?.totalCents ?? 0;
      const roomCents = Math.max(0, totalCents - serviceCents);
      // Confirmed revenue counts at once, in the period holding its check-in day
      // (WEBSITE.pdf r5) — no longer waiting for the stay to start.
      const recognised = booking.checkIn >= args.startDate && booking.checkIn < args.endDate && ['confirmed', 'checked_in', 'checked_out'].includes(booking.status);
      if (recognised) {
        roomRevenueCents += roomCents;
        serviceRevenueCents += serviceCents;
        const day = dailyRevenue[booking.checkIn] ?? { roomCents: 0, serviceCents: 0 };
        day.roomCents += roomCents; day.serviceCents += serviceCents; dailyRevenue[booking.checkIn] = day;
        const touched = new Set<string>();
        for (const line of lines) {
          const key = groupOf(line.nameSnapshot);
          const group = key ? serviceGroups.get(key) : undefined;
          if (!key || !group) continue;
          group.units += line.quantity; group.freeUnits += line.freeQuantity ?? 0; group.revenueCents += addOnLineCents(line);
          if (!touched.has(key)) { group.bookings += 1; touched.add(key); }
        }
      }
      const source = sourceName(booking.source);
      if (booking.status !== 'cancelled') sourceCounts[source] = (sourceCounts[source] ?? 0) + 1;
      bookingRows.push({
        bookingId: booking._id,
        confirmationCode: booking.confirmationCode,
        guestName: guestLabel(guest?.name, booking),
        guestEmail: guest?.email ?? '', guestPhone: guest?.phone ?? '',
        unitId: booking.unitId, unitName: unitById.get(String(booking.unitId))?.name ?? 'Chỗ nghỉ',
        unitTypeName: typeById.get(String(booking.unitTypeId))?.name ?? 'Chỗ nghỉ',
        checkIn: booking.checkIn, checkOut: booking.checkOut, adults: booking.adults, children: booking.children,
        infants: booking.infants ?? 0, pets: booking.pets ?? 0,
        status: booking.status, source: booking.source,
        totalCents: canSeeRevenue ? totalCents : 0, serviceCents: canSeeRevenue ? serviceCents : 0,
        revenueRecognised: canSeeRevenue && recognised,
        syncConflict: Boolean(booking.syncConflict && !booking.syncConflictAcknowledgedAt), createdAt: booking.createdAt,
        residenceMissing: ['pending', 'confirmed', 'checked_in'].includes(booking.status) ? (await residenceProgress(ctx, booking)).missing : 0,
        services: lines.map((line) => ({ name: line.nameSnapshot, quantity: line.quantity, free: line.freeQuantity ?? 0, completed: Boolean(line.completedAt) })),
        notes: booking.notes.filter((note) => note.by !== 'sample-data').map((note) => ({ ts: note.ts, text: note.text, by: note.by ?? '' })),
      });
    }
    // Double bookings, counted exactly like the conflicts page (WEBSITE r6):
    // open = unacknowledged overlapping pairs (findConflictPairs), handled =
    // conflictResolutions rows. A conflict is dated by the creation day of the
    // later booking of the pair (when the clash arose) and counted when that
    // day falls in the period. "Chưa xác nhận" = either side was still a
    // request; a booking cancelled to resolve it counts with its prior status.
    const unconfirmed = new Set(['pending', 'hold']);
    const priorStatus = (row: { status: string; statusHistory: Array<{ status: string }> } | null) => {
      if (!row) return 'pending';
      if (row.status !== 'cancelled') return row.status;
      const before = row.statusHistory.filter((step) => step.status !== 'cancelled');
      return before[before.length - 1]?.status ?? 'pending';
    };
    const conflictStats = { confirmed: { open: 0, resolved: 0 }, pending: { open: 0, resolved: 0 } };
    const conflictsByDayMap = new Map<string, { open: number; resolved: number }>();
    const conflictRows: Array<{ id: string; unitName: string; overlapStart: string; overlapEnd: string; codes: string[]; sources: string[]; createdDate: string; resolved: boolean; method?: string; byName?: string; note?: string }> = [];
    const count = (createdDate: string, statuses: string[], resolved: boolean) => {
      const bucket = statuses.some((status) => unconfirmed.has(status)) ? 'pending' : 'confirmed';
      conflictStats[bucket][resolved ? 'resolved' : 'open'] += 1;
      const day = conflictsByDayMap.get(createdDate) ?? { open: 0, resolved: 0 };
      day[resolved ? 'resolved' : 'open'] += 1;
      conflictsByDayMap.set(createdDate, day);
    };
    for (const pair of findConflictPairs(bookings)) {
      const createdDate = dateFormat.format(Math.max(pair.a.createdAt, pair.b.createdAt));
      if (createdDate < args.startDate || createdDate >= args.endDate) continue;
      count(createdDate, [pair.a.status, pair.b.status], false);
      conflictRows.push({
        id: `${pair.a._id}:${pair.b._id}`, unitName: unitById.get(String(pair.a.unitId))?.name ?? 'Chỗ nghỉ',
        overlapStart: pair.overlapStart, overlapEnd: pair.overlapEnd,
        codes: [pair.a.confirmationCode, pair.b.confirmationCode], sources: [pair.a.source, pair.b.source], createdDate, resolved: false,
      });
    }
    const resolutions = await ctx.db
      .query('conflictResolutions')
      .withIndex('by_property_at', (q) => q.eq('propertyId', args.propertyId))
      .collect();
    for (const resolution of resolutions) {
      const [first, second] = await Promise.all([ctx.db.get(resolution.bookingId), resolution.otherBookingId ? ctx.db.get(resolution.otherBookingId) : null]);
      const createdDate = dateFormat.format(Math.max(first?.createdAt ?? resolution.at, second?.createdAt ?? 0));
      if (createdDate < args.startDate || createdDate >= args.endDate) continue;
      count(createdDate, [priorStatus(first), ...(second ? [priorStatus(second)] : [])], true);
      conflictRows.push({
        id: resolution._id, unitName: resolution.unitName, overlapStart: resolution.overlapStart, overlapEnd: resolution.overlapEnd,
        codes: [resolution.bookingCode, ...(resolution.otherBookingCode ? [resolution.otherBookingCode] : [])],
        sources: [first?.source ?? '', ...(second ? [second.source] : [])], createdDate, resolved: true,
        method: resolution.method, byName: resolution.byName, note: resolution.note,
      });
    }
    conflictRows.sort((x, y) => Number(x.resolved) - Number(y.resolved) || y.createdDate.localeCompare(x.createdDate));
    const conflictsByDay = [...conflictsByDayMap.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([date, value]) => ({ date, ...value }));

    const periodNights = daysBetween(args.startDate, args.endDate);
    const activeUnits = units.filter(row => row.status === 'active');
    const occupancyByUnit = activeUnits.map(unit => {
      let nights = 0;
      let lastEnd = args.startDate;
      for (const stay of inRange.filter(b=>b.unitId===unit._id).sort((a,b)=>a.checkIn.localeCompare(b.checkIn))) {
        const start = stay.checkIn > lastEnd ? stay.checkIn : lastEnd;
        const end = stay.checkOut < args.endDate ? stay.checkOut : args.endDate;
        if (end > start) { nights += daysBetween(start,end); lastEnd = end; }
      }
      return {unitId:unit._id,nights};
    });
    const occupiedNights = occupancyByUnit.reduce((sum,u)=>sum+u.nights,0);
    return {
      occupancyByUnit,
      property: { name: property.name, currency: property.currency },
      canSeeRevenue,
      conflictStats,
      conflictsByDay,
      conflictRows,
      newBookings,
      channelReport: {
        total: created.length,
        channels: Object.entries(channelCounts).map(([source, count]) => ({ source, count })),
        direct: directBookings,
        directWithServices,
      },
      kpis: {
        totalBookings: newBookings.length,
        pendingBookings: newBookings.filter((row) => row.status === 'pending').length,
        confirmedBookings: inRange.filter((row) => row.status === 'confirmed').length,
        // Every guest counts, infants included.
        currentGuests: inRange.filter((row) => row.status === 'checked_in').reduce((sum, row) => sum + row.adults + row.children + (row.infants ?? 0), 0),
        roomRevenueCents: canSeeRevenue ? roomRevenueCents : 0,
        serviceRevenueCents: canSeeRevenue ? serviceRevenueCents : 0,
        totalRevenueCents: canSeeRevenue ? roomRevenueCents + serviceRevenueCents : 0,
        occupancyPercent: activeUnits.length && periodNights ? Math.min(100, Math.round((occupiedNights / (activeUnits.length * periodNights)) * 100)) : 0,
        // Same count as the conflicts page: open pairs dated by booking creation in the period.
        conflictCount: conflictStats.confirmed.open + conflictStats.pending.open,
        conflictResolvedCount: conflictStats.confirmed.resolved + conflictStats.pending.resolved,
      },
      bookings: bookingRows.sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
      units: units.sort((a, b) => a.sortOrder - b.sortOrder).map((row) => ({ ...row, type: typeById.get(String(row.unitTypeId)) })),
      dailyRevenue: canSeeRevenue ? Object.entries(dailyRevenue).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, ...value, totalCents: value.roomCents + value.serviceCents })) : [],
      sourceCounts: Object.entries(sourceCounts).map(([source, count]) => ({ source, count })),
      serviceUsage: [...serviceGroups.values()].map((group) => ({ ...group, count: group.units, revenueCents: canSeeRevenue ? group.revenueCents : 0 })),
    };
  },
});

/**
 * Front-desk note on a booking (flight landing time, luggage drop-off…).
 * Appended to bookings.notes; idempotent on the caller's requestId
 * (convention #15) so a double click or a retry never writes it twice.
 */
export const addFrontDeskNote = mutation({
  args: { propertyId: v.id('properties'), bookingId: v.id('bookings'), text: v.string(), requestId: v.string() },
  handler: async (ctx, args) => {
    let actorName = 'Lễ tân';
    let actorUserId: Id<'users'> | null = null;
    try {
      const access = await requireMutationPropertyCapability(ctx, args.propertyId, 'booking.write', 'song.booking.note');
      actorName = access.profile.name;
      actorUserId = access.userId;
    } catch (error) {
      if (process.env.DEMO_MODE !== 'true') throw error;
    }
    const requestId = args.requestId.trim();
    if (!requestId || requestId.length > 100) throw new ConvexError('REQUEST_ID_REQUIRED');
    const prior = await ctx.db.query('operationRequests').withIndex('by_property_request', (q) => q.eq('propertyId', args.propertyId).eq('requestId', requestId)).unique();
    if (prior) {
      if (prior.action !== 'song.booking.note') throw new ConvexError('IDEMPOTENCY_KEY_REUSED');
      return JSON.parse(prior.resultJson) as { added: boolean; ts: number };
    }
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || booking.propertyId !== args.propertyId) throw new ConvexError('BOOKING_NOT_FOUND');
    const text = args.text.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, 500);
    if (!text) throw new ConvexError({ code: 'NOTE_REQUIRED', message: 'Vui lòng nhập nội dung ghi chú.' });
    const now = Date.now();
    // Without a staff row (DEMO_MODE) there is no operationRequests actor: fall back to a short duplicate guard.
    const last = booking.notes[booking.notes.length - 1];
    if (!actorUserId && last && last.text === text && now - last.ts < 10_000) return { added: false, ts: last.ts };
    await ctx.db.patch(booking._id, { notes: [...booking.notes, { ts: now, text, by: `Lễ tân · ${actorName}` }], updatedAt: now });
    const result = { added: true, ts: now };
    if (actorUserId) {
      await ctx.db.insert('operationRequests', { propertyId: args.propertyId, requestId, action: 'song.booking.note', actorUserId, resultJson: JSON.stringify(result), createdAt: now });
    }
    return result;
  },
});
