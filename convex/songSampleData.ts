import { ConvexError, v } from 'convex/values';
import { internalMutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { markPropertyDirtyInline } from './channel/ari';
import { addDays, computePrice, enumerateNights, todayInTimezone } from '../shared/pricing';

// Fictional review data for the Sóng Homestay admin screens. Every row it
// creates is tagged (SMP- / EXT-SMP codes, a marker note on guests and
// residence rows) so it can be skipped or replaced without touching real data.
const SAMPLE_CODE = 'SMP-';
const EXT_CODE = 'EXT-SMP';
const SAMPLE_NOTE = 'Dữ liệu mẫu để review giao diện';
const PAST_DAYS = 60;
const FUTURE_DAYS = 21;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

type StayStatus = 'checked_out' | 'checked_in' | 'confirmed' | 'pending' | 'cancelled';

const SURNAMES = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Võ', 'Đặng', 'Bùi'];
const MIDDLES = ['Văn', 'Thị', 'Minh', 'Ngọc', 'Quốc', 'Thu', 'Hồng', 'Gia', 'Anh'];
const GIVEN = ['An', 'Bình', 'Chi', 'Dũng', 'Giang', 'Hà', 'Hải', 'Hương', 'Khoa', 'Lan', 'Linh', 'Nam', 'Phúc', 'Quân', 'Thảo', 'Trang', 'Tuấn', 'Vy'];
const FOREIGN: Array<{ name: string; nationality: string }> = [
  { name: 'Kim Min-jun', nationality: 'Hàn Quốc' },
  { name: 'Sarah Johnson', nationality: 'Hoa Kỳ' },
  { name: 'Lucas Martin', nationality: 'Pháp' },
  { name: 'Emma Schmidt', nationality: 'Đức' },
  { name: 'Tanaka Haruto', nationality: 'Nhật Bản' },
  { name: 'Olivia Brown', nationality: 'Úc' },
];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Vietnam is UTC+7 with no DST: local midnight of an ISO day, as an instant.
function localMidnightMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) - 7 * HOUR_MS;
}

type GuestSeed = { name: string; email: string; phone: string; nationality: string; foreign: boolean; id?: Id<'guests'> };

function buildGuestPool(): GuestSeed[] {
  const pool: GuestSeed[] = [];
  for (let i = 0; i < 36; i += 1) {
    pool.push({
      name: `${SURNAMES[i % SURNAMES.length]} ${MIDDLES[(i * 3) % MIDDLES.length]} ${GIVEN[(i * 5) % GIVEN.length]}`,
      email: `khach.mau${i + 1}@example.com`,
      phone: `09${String(10_000_000 + ((i * 3_217_411) % 80_000_000)).padStart(8, '0')}`,
      nationality: 'Việt Nam',
      foreign: false,
    });
  }
  FOREIGN.forEach((guest, i) => {
    pool.push({
      name: guest.name,
      email: `guest.sample${i + 1}@example.com`,
      phone: `09${String(70_000_000 + i * 1_111_111).padStart(8, '0')}`,
      nationality: guest.nationality,
      foreign: true,
    });
  });
  return pool;
}

async function clearSample(ctx: MutationCtx, propertyId: Id<'properties'>) {
  const bookings = await ctx.db
    .query('bookings')
    .withIndex('by_property_checkIn', (q) => q.eq('propertyId', propertyId))
    .collect();
  for (const booking of bookings) {
    if (!booking.confirmationCode.startsWith(SAMPLE_CODE) && !booking.confirmationCode.startsWith(EXT_CODE)) continue;
    for (const row of await ctx.db.query('unitNights').withIndex('by_booking', (q) => q.eq('bookingId', booking._id)).collect()) await ctx.db.delete(row._id);
    for (const row of await ctx.db.query('bookingAddOns').withIndex('by_booking', (q) => q.eq('bookingId', booking._id)).collect()) await ctx.db.delete(row._id);
    for (const row of await ctx.db.query('residenceRegistrations').withIndex('by_booking', (q) => q.eq('bookingId', booking._id)).collect()) await ctx.db.delete(row._id);
    await ctx.db.delete(booking._id);
  }
  const guests = await ctx.db.query('guests').withIndex('by_email', (q) => q.eq('propertyId', propertyId)).collect();
  for (const guest of guests) {
    if (guest.notes.some((note) => note.text === SAMPLE_NOTE)) await ctx.db.delete(guest._id);
  }
}

async function insertExternal(
  ctx: MutationCtx,
  unit: Doc<'units'>,
  args: { source: string; startDate: string; endDate: string; uid: string; code: string; summary: string; conflict: boolean; acknowledgedAt?: number; createdAt: number },
): Promise<Id<'bookings'>> {
  const blocked = new Set(
    (await ctx.db
      .query('unitNights')
      .withIndex('by_unit_date', (q) => q.eq('unitId', unit._id).gte('date', args.startDate).lt('date', args.endDate))
      .collect()).map((row) => row.date),
  );
  const nights = enumerateNights(args.startDate, args.endDate);
  const bookingId = await ctx.db.insert('bookings', {
    propertyId: unit.propertyId,
    unitId: unit._id,
    unitTypeId: unit.unitTypeId,
    checkIn: args.startDate,
    checkOut: args.endDate,
    nights: nights.length,
    adults: 0,
    children: 0,
    status: 'external',
    source: args.source,
    externalUid: args.uid,
    syncConflict: args.conflict,
    ...(args.acknowledgedAt !== undefined ? { syncConflictAcknowledgedAt: args.acknowledgedAt } : {}),
    confirmationCode: args.code,
    statusHistory: [{ status: 'external', ts: args.createdAt }],
    notes: [{ ts: args.createdAt, text: args.summary, by: args.source }],
    createdAt: args.createdAt,
    updatedAt: args.createdAt,
  });
  for (const date of nights) {
    if (!blocked.has(date)) await ctx.db.insert('unitNights', { unitId: unit._id, date, bookingId, kind: 'external' });
  }
  return bookingId;
}

/**
 * Seed ~2 months of recent, internally consistent Sóng Homestay activity.
 * Run: npx convex run songSampleData:run   (add '{"replace":true}' to re-anchor to today)
 * Needs DEMO_MODE=true or ALLOW_SONG_SAMPLE=true; never touches other properties.
 */
export const run = internalMutation({
  args: { replace: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    if (process.env.DEMO_MODE !== 'true' && process.env.ALLOW_SONG_SAMPLE !== 'true') {
      throw new ConvexError('SONG_SAMPLE_DISABLED');
    }
    if (process.env.PUBLIC_LIVE_PAYMENTS === 'true') {
      throw new ConvexError('SONG_SAMPLE_PROHIBITED_LIVE_PAYMENTS');
    }
    const property = await ctx.db
      .query('properties')
      .withIndex('by_slug', (q) => q.eq('slug', 'song-homestay'))
      .unique();
    if (!property) throw new ConvexError('SONG_NOT_SEEDED');

    const existing = await ctx.db
      .query('bookings')
      .withIndex('by_property_checkIn', (q) => q.eq('propertyId', property._id))
      .collect();
    const hasSample = existing.some((b) => b.confirmationCode.startsWith(SAMPLE_CODE) || b.confirmationCode.startsWith(EXT_CODE));
    if (hasSample && !args.replace) {
      return { skipped: true, reason: 'sample data already present', bookings: existing.length };
    }
    if (hasSample) await clearSample(ctx, property._id);

    const units = (await ctx.db
      .query('units')
      .withIndex('by_property', (q) => q.eq('propertyId', property._id))
      .collect()).filter((unit) => unit.status === 'active');
    const addOns = (await ctx.db
      .query('addOns')
      .withIndex('by_property', (q) => q.eq('propertyId', property._id).eq('active', true))
      .collect()).sort((a, b) => a.sortOrder - b.sortOrder);
    if (units.length === 0) throw new ConvexError('SONG_NOT_SEEDED');

    const rand = mulberry32(20_261_114);
    const ri = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
    const now = Date.now();
    const today = todayInTimezone(property.timezone);
    const windowStart = addDays(today, -PAST_DAYS);
    const windowEnd = addDays(today, FUTURE_DAYS);

    const pool = buildGuestPool();
    for (const guest of pool) {
      guest.id = await ctx.db.insert('guests', {
        propertyId: property._id,
        name: guest.name,
        email: guest.email,
        phone: guest.phone,
        normalizedEmail: guest.email.trim().toLowerCase(),
        normalizedPhone: guest.phone.replace(/\D/g, ''),
        marketingOptIn: rand() < 0.3,
        notes: [{ ts: now, text: SAMPLE_NOTE, by: 'sample-data' }],
      });
    }

    const usedCodes = new Set<string>();
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const newCode = () => {
      for (;;) {
        let code = SAMPLE_CODE;
        for (let i = 0; i < 6; i += 1) code += alphabet[ri(0, alphabet.length - 1)];
        if (!usedCodes.has(code)) {
          usedCodes.add(code);
          return code;
        }
      }
    };

    type Internal = { bookingId: Id<'bookings'>; unit: Doc<'units'>; status: StayStatus; checkIn: string; checkOut: string; guest: GuestSeed };
    const internal: Internal[] = [];
    let externalCount = 0;
    let externalSeq = 0;
    let addOnRows = 0;
    const nextExternalCode = () => `${EXT_CODE}${String(++externalSeq).padStart(3, '0')}`;

    for (const unit of units) {
      const unitType = await ctx.db.get(unit.unitTypeId);
      const ratePlan = await ctx.db
        .query('ratePlans')
        .withIndex('by_unitType', (q) => q.eq('unitTypeId', unit.unitTypeId).eq('active', true))
        .first();
      if (!unitType || !ratePlan) continue;
      const capacity = unitType.maxOccupancy > 0 ? unitType.maxOccupancy : 6;

      let cursor = addDays(windowStart, ri(0, 3));
      while (cursor < windowEnd) {
        const nights = ri(1, 5);
        const checkIn = cursor;
        const checkOut = addDays(checkIn, nights);
        cursor = addDays(checkOut, ri(0, 6));
        const createdAt = Math.min(now - HOUR_MS, localMidnightMs(checkIn) - ri(1, 20) * DAY_MS);

        if (rand() < 0.14) {
          const source = rand() < 0.5 ? 'ical:Airbnb' : 'ical:Booking.com';
          await insertExternal(ctx, unit, {
            source, startDate: checkIn, endDate: checkOut, uid: `sample-${unit.slug}-${checkIn}@example.com`,
            code: nextExternalCode(), summary: source === 'ical:Airbnb' ? 'Airbnb (Reserved)' : 'Booking.com — CLOSED', conflict: false, createdAt,
          });
          externalCount += 1;
          continue;
        }

        let status: StayStatus;
        const r = rand();
        if (checkOut <= today) status = r < 0.08 ? 'cancelled' : 'checked_out';
        else if (checkIn <= today) status = 'checked_in';
        else status = r < 0.08 ? 'cancelled' : r < 0.35 ? 'pending' : 'confirmed';

        const guest = pool[ri(0, pool.length - 1)];
        const adults = ri(1, Math.min(capacity, 5));
        const children = Math.min(rand() < 0.3 ? ri(1, 2) : 0, capacity - adults);
        const sr = rand();
        const source = sr < 0.38 ? 'online' : sr < 0.62 ? 'manual:zalo' : sr < 0.76 ? 'manual:facebook' : sr < 0.9 ? 'manual:phone' : 'manual:walk_in';

        const lines: Array<{ addOn: Doc<'addOns'>; quantity: number }> = [];
        if (status !== 'cancelled' && rand() < 0.4 && addOns.length) {
          const count = rand() < 0.3 ? 2 : 1;
          const picks = new Set<number>();
          while (picks.size < Math.min(count, addOns.length)) picks.add(ri(0, addOns.length - 1));
          for (const index of picks) {
            const quantity = index === 0 ? nights : index === 1 ? ri(1, 2) : adults;
            lines.push({ addOn: addOns[index], quantity });
          }
        }
        const price = computePrice({
          ratePlan,
          checkIn,
          checkOut,
          addOns: lines.map((l) => ({ name: l.addOn.name, unitPriceCents: l.addOn.priceCents, quantity: l.quantity, taxable: l.addOn.taxable })),
          taxRateBps: property.taxRateBps,
        });

        const steps: Record<StayStatus, string[]> = {
          checked_out: ['pending', 'confirmed', 'checked_in', 'checked_out'],
          checked_in: ['pending', 'confirmed', 'checked_in'],
          confirmed: ['pending', 'confirmed'],
          pending: ['pending'],
          cancelled: ['pending', 'cancelled'],
        };
        const stamps = [createdAt, createdAt + 3 * HOUR_MS, localMidnightMs(checkIn) + 14 * HOUR_MS, localMidnightMs(checkOut) + 12 * HOUR_MS];
        const history = steps[status].map((step, i) => ({
          status: step,
          ts: Math.min(now - 60_000, status === 'cancelled' && step === 'cancelled' ? createdAt + DAY_MS : stamps[i]),
        }));

        const bookingId = await ctx.db.insert('bookings', {
          propertyId: property._id,
          unitId: unit._id,
          unitTypeId: unit.unitTypeId,
          guestId: guest.id,
          ratePlanId: ratePlan._id,
          checkIn,
          checkOut,
          nights,
          adults,
          children,
          status,
          source,
          confirmationCode: newCode(),
          priceBreakdown: price,
          statusHistory: history,
          notes: [{ ts: createdAt, text: SAMPLE_NOTE, by: 'sample-data' }],
          createdAt,
          updatedAt: history[history.length - 1].ts,
        });
        if (status === 'pending' || status === 'confirmed' || status === 'checked_in') {
          for (const date of enumerateNights(checkIn, checkOut)) {
            await ctx.db.insert('unitNights', { unitId: unit._id, date, bookingId, kind: 'stay' });
          }
        }
        for (const line of lines) {
          await ctx.db.insert('bookingAddOns', {
            bookingId, addOnId: line.addOn._id, nameSnapshot: line.addOn.name, unitPriceCents: line.addOn.priceCents,
            quantity: line.quantity, taxable: line.addOn.taxable, soldAt: createdAt + HOUR_MS, soldBy: 'sample-data',
          });
          addOnRows += 1;
        }
        internal.push({ bookingId, unit, status, checkIn, checkOut, guest });
      }
    }

    // Double-booking warnings: external events landing on active internal stays.
    const upcoming = internal.filter((b) => (b.status === 'confirmed' || b.status === 'pending' || b.status === 'checked_in') && b.checkOut > today);
    const seenUnits = new Set<string>();
    let conflictCount = 0;
    for (const target of upcoming) {
      if (conflictCount >= 4 || seenUnits.has(String(target.unit._id))) continue;
      seenUnits.add(String(target.unit._id));
      const acknowledged = conflictCount === 3;
      await insertExternal(ctx, target.unit, {
        source: conflictCount % 2 === 0 ? 'ical:Airbnb' : 'ical:Booking.com',
        startDate: target.checkIn,
        endDate: addDays(target.checkOut, 1),
        uid: `sample-conflict-${conflictCount + 1}@example.com`,
        code: nextExternalCode(),
        summary: 'Trùng lịch với booking nội bộ (dữ liệu mẫu)',
        conflict: !acknowledged,
        acknowledgedAt: acknowledged ? now - 2 * HOUR_MS : undefined,
        createdAt: now - (conflictCount + 1) * DAY_MS,
      });
      conflictCount += 1;
      externalCount += 1;
    }

    // Residence declarations for recent stays (list is not date-filtered; newest 200 by createdAt).
    const recent = internal
      .filter((b) => (b.status === 'checked_in' || b.status === 'checked_out') && b.checkIn >= addDays(today, -14))
      .sort((a, b) => (a.checkIn < b.checkIn ? 1 : -1))
      .slice(0, 15);
    let residenceCount = 0;
    for (const [index, stay] of recent.entries()) {
      const createdAt = Math.min(now - 60_000, localMidnightMs(stay.checkIn) + 15 * HOUR_MS);
      const away = index % 5 === 4;
      const seq = String(index + 1).padStart(4, '0');
      await ctx.db.insert('residenceRegistrations', {
        propertyId: property._id,
        bookingId: stay.bookingId,
        fullName: stay.guest.name,
        documentType: stay.guest.foreign ? 'passport' : 'cccd',
        documentNumber: `SAMPLE-${seq}`,
        nationality: stay.guest.nationality,
        phone: stay.guest.phone,
        registrationType: away ? 'tam_vang' : 'tam_tru',
        checkInDate: stay.checkIn,
        checkOutDate: stay.checkOut,
        ...(away ? { reason: 'Đi công tác / du lịch ngắn ngày', absenceStatus: (index % 10 === 4 ? 'away' : 'returned') as 'away' | 'returned' } : {}),
        status: stay.status === 'checked_out' ? (index % 3 === 0 ? 'verified' : 'completed') : index % 2 === 0 ? 'declared' : 'verified',
        notes: SAMPLE_NOTE,
        submittedBy: index % 4 === 0 ? 'staff' : 'guest',
        consentAt: createdAt,
        retentionUntil: now + 180 * DAY_MS,
        createdAt,
        updatedAt: createdAt,
      });
      residenceCount += 1;
    }

    await markPropertyDirtyInline(ctx, property._id);
    return {
      skipped: false,
      window: { from: windowStart, to: windowEnd },
      guests: pool.length,
      internalBookings: internal.length,
      externalBookings: externalCount,
      conflictRows: conflictCount,
      bookingAddOns: addOnRows,
      residenceRegistrations: residenceCount,
    };
  },
});
