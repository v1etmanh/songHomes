import { ConvexError, v } from 'convex/values';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { addDays, enumerateNights, todayInTimezone } from '../shared/pricing';
import { renderIcs } from '../shared/ical';
import { requireMutationPropertyCapability, requirePropertyCapability } from './staff';
import { loadSyncSettings } from './icalAlerts';

// Demo-only simulated booking platforms. Each (unit, platform) listing serves
// an iCal feed at <CONVEX_SITE_URL>/sim/ical/<token>.ics; OpenStays pulls it
// through the normal iCal import, so nothing here ever writes `bookings`.
// Excluded from production builds (config/production-profile.json).

type Platform = 'airbnb' | 'booking';
const PLATFORMS: Record<Platform, { label: string; prodId: string; summary: string }> = {
  airbnb: { label: 'Airbnb', prodId: '-//OpenStays Simulator//Airbnb-like//VI', summary: 'Reserved' },
  booking: { label: 'Booking.com', prodId: '-//OpenStays Simulator//Booking.com-like//VI', summary: 'CLOSED - Not available' },
};
const platformArg = v.union(v.literal('airbnb'), v.literal('booking'));
// Everything currently occupying the unit in OpenStays, imported feeds included.
const ACTIVE_INTERNAL = new Set(['hold', 'pending', 'confirmed', 'checked_in', 'blocked', 'external']);
const GUEST_NAMES = ['Minh Anh', 'Hoàng Long', 'Thu Trang', 'Quốc Bảo', 'Ngọc Hân', 'Gia Huy', 'Sarah K.', 'Kim J.', 'Lucas M.', 'Tanaka H.', 'Mai Phương', 'Đức Thịnh'];

function simulatorEnabled(): boolean {
  return process.env.DEMO_MODE === 'true' || process.env.ALLOW_OTA_SIMULATOR === 'true';
}

function assertEnabled() {
  if (!simulatorEnabled()) throw new ConvexError('OTA_SIMULATOR_DISABLED');
}

async function requireRead(ctx: QueryCtx | MutationCtx, propertyId: Id<'properties'>) {
  if (process.env.DEMO_MODE !== 'true') await requirePropertyCapability(ctx, propertyId, 'booking.read');
}

async function requireConfigure(ctx: MutationCtx, propertyId: Id<'properties'>, action: string) {
  if (process.env.DEMO_MODE !== 'true') await requireMutationPropertyCapability(ctx, propertyId, 'property.configure', action);
}

async function songProperty(ctx: QueryCtx | MutationCtx): Promise<Doc<'properties'>> {
  const property = await ctx.db
    .query('properties')
    .withIndex('by_slug', (q) => q.eq('slug', 'song-homestay'))
    .unique();
  if (!property) throw new ConvexError('SONG_NOT_SEEDED');
  return property;
}

function assertDates(checkIn: string, checkOut: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || checkOut <= checkIn) {
    throw new ConvexError({ code: 'INVALID_DATES', message: 'Ngày nhận/trả phòng không hợp lệ.' });
  }
  if (enumerateNights(checkIn, checkOut).length > 30) {
    throw new ConvexError({ code: 'STAY_TOO_LONG', message: 'Tối đa 30 đêm.' });
  }
}

function overlaps(a: { checkIn: string; checkOut: string }, b: { checkIn: string; checkOut: string }) {
  return a.checkIn < b.checkOut && b.checkIn < a.checkOut;
}

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

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function feedUrl(token: string): string {
  const site = (process.env.CONVEX_SITE_URL ?? '').replace(/\/$/, '');
  return `${site}/sim/ical/${token}.ics`;
}

async function listingsFor(ctx: QueryCtx | MutationCtx, propertyId: Id<'properties'>) {
  return await ctx.db.query('otaSimListings').withIndex('by_property', (q) => q.eq('propertyId', propertyId)).collect();
}

async function reservationsFor(ctx: QueryCtx | MutationCtx, listingId: Id<'otaSimListings'>) {
  return await ctx.db.query('otaSimReservations').withIndex('by_listing_checkIn', (q) => q.eq('listingId', listingId)).collect();
}

function guestLabel(platform: Platform, rand: () => number): string {
  const name = GUEST_NAMES[Math.floor(rand() * GUEST_NAMES.length)];
  return platform === 'airbnb' ? name : `${name} · #${String(Math.floor(rand() * 90_000_000) + 10_000_000)}`;
}

async function insertReservation(
  ctx: MutationCtx,
  listing: Doc<'otaSimListings'>,
  unitSlug: string,
  stay: { checkIn: string; checkOut: string; guestLabel: string; origin: 'manual' | 'random' | 'seed' },
) {
  const now = Date.now();
  const suffix = `${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  return await ctx.db.insert('otaSimReservations', {
    propertyId: listing.propertyId,
    listingId: listing._id,
    unitId: listing.unitId,
    platform: listing.platform,
    uid: `sim-${listing.platform}-${unitSlug}-${suffix}@openstays.sim`,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    guestLabel: stay.guestLabel.trim().slice(0, 80) || 'Khách',
    status: 'active',
    origin: stay.origin,
    createdAt: now,
    updatedAt: now,
  });
}

type Range = { checkIn: string; checkOut: string };

/** Ranges already taken on a unit: OpenStays occupancy plus both simulated platforms. */
async function unitCalendar(ctx: MutationCtx, unit: Doc<'units'>, today: string) {
  const internal: Range[] = (await ctx.db
    .query('bookings')
    .withIndex('by_unit_checkIn', (q) => q.eq('unitId', unit._id).gte('checkIn', addDays(today, -30)))
    .collect())
    .filter((b) => ACTIVE_INTERNAL.has(b.status) && b.checkOut > today)
    .map((b) => ({ checkIn: b.checkIn, checkOut: b.checkOut }));
  const sim: Array<Range & { listingId: Id<'otaSimListings'> }> = (await ctx.db
    .query('otaSimReservations')
    .withIndex('by_property', (q) => q.eq('propertyId', unit.propertyId))
    .collect())
    .filter((r) => r.unitId === unit._id && r.status === 'active' && r.checkOut > today)
    .map((r) => ({ checkIn: r.checkIn, checkOut: r.checkOut, listingId: r.listingId }));
  return { internal, sim };
}

type RandomizeTally = { added: number; cancelled: number; moved: number; conflicts: number };

/**
 * Daily churn for one listing: cancel some future stays, move one, add a few.
 * With probability `conflictRate` a new stay deliberately overlaps an
 * OpenStays booking or the other platform on the same unit, which is what a
 * real one-way iCal setup produces when two channels sell the same night.
 */
async function churnListing(
  ctx: MutationCtx,
  listing: Doc<'otaSimListings'>,
  unit: Doc<'units'>,
  today: string,
  rand: () => number,
  opts: { conflictRate: number; addMax: number; forceConflict: boolean },
  tally: RandomizeTally,
) {
  const tomorrow = addDays(today, 1);
  const own = (await reservationsFor(ctx, listing._id)).filter((r) => r.status === 'active');
  const future = own.filter((r) => r.checkIn > today);
  const now = Date.now();

  if (!opts.forceConflict) {
    for (const r of future) {
      if (rand() < 0.15) {
        await ctx.db.patch(r._id, { status: 'cancelled', updatedAt: now });
        tally.cancelled += 1;
      }
    }
    const movable = rand() < 0.2 && future.length ? future[Math.floor(rand() * future.length)] : undefined;
    if (movable) {
      const shift = (rand() < 0.5 ? -1 : 1) * (1 + Math.floor(rand() * 3));
      const next = { checkIn: addDays(movable.checkIn, shift), checkOut: addDays(movable.checkOut, shift) };
      const clash = own.some((r) => r._id !== movable._id && overlaps(r, next));
      if (next.checkIn > today && !clash) {
        await ctx.db.patch(movable._id, { ...next, updatedAt: now });
        tally.moved += 1;
      }
    }
  }

  const calendar = await unitCalendar(ctx, unit, today);
  const ownNow: Range[] = calendar.sim.filter((r) => r.listingId === listing._id);
  const additions = opts.forceConflict ? 1 : Math.floor(rand() * (opts.addMax + 1));
  for (let i = 0; i < additions; i += 1) {
    const wantConflict = opts.forceConflict || rand() < opts.conflictRate;
    let stay: { checkIn: string; checkOut: string } | null = null;
    if (wantConflict) {
      const targets = [...calendar.internal, ...calendar.sim.filter((r) => r.listingId !== listing._id)]
        .filter((t) => t.checkOut > tomorrow);
      for (let attempt = 0; attempt < 6 && targets.length && !stay; attempt += 1) {
        const target = targets[Math.floor(rand() * targets.length)];
        let checkIn = addDays(target.checkIn, -Math.floor(rand() * 2));
        if (checkIn < tomorrow) checkIn = tomorrow;
        if (checkIn >= target.checkOut) continue;
        const anchor = checkIn > target.checkIn ? checkIn : target.checkIn;
        const candidate = { checkIn, checkOut: addDays(anchor, 1 + Math.floor(rand() * 2)) };
        if (!ownNow.some((r) => overlaps(r, candidate))) stay = candidate;
      }
    } else {
      const busy = [...calendar.internal, ...calendar.sim];
      for (let attempt = 0; attempt < 12 && !stay; attempt += 1) {
        const checkIn = addDays(today, 1 + Math.floor(rand() * 30));
        const candidate = { checkIn, checkOut: addDays(checkIn, 1 + Math.floor(rand() * 4)) };
        if (!busy.some((r) => overlaps(r, candidate))) stay = candidate;
      }
    }
    if (!stay) continue;
    await insertReservation(ctx, listing, unit.slug, { ...stay, guestLabel: guestLabel(listing.platform, rand), origin: 'random' });
    ownNow.push(stay);
    calendar.sim.push({ ...stay, listingId: listing._id });
    tally.added += 1;
    if (wantConflict) tally.conflicts += 1;
  }
}

async function runRandomize(
  ctx: MutationCtx,
  property: Doc<'properties'>,
  mode: 'daily' | 'conflict',
  seedKey: string,
): Promise<RandomizeTally> {
  const today = todayInTimezone(property.timezone);
  const settings = await loadSyncSettings(ctx, property._id);
  const listings = (await listingsFor(ctx, property._id)).filter((l) => l.active);
  if (!listings.length) throw new ConvexError({ code: 'SIM_NOT_CONNECTED', message: 'Chưa kết nối nền tảng giả lập.' });
  const tally: RandomizeTally = { added: 0, cancelled: 0, moved: 0, conflicts: 0 };
  const rand = mulberry32(hashSeed(`${today}|${seedKey}`));
  if (mode === 'conflict') {
    const order = [...listings].sort(() => rand() - 0.5);
    for (const listing of order) {
      const unit = await ctx.db.get(listing.unitId);
      if (!unit) continue;
      await churnListing(ctx, listing, unit, today, rand, { conflictRate: 1, addMax: 1, forceConflict: true }, tally);
      if (tally.conflicts > 0) break;
    }
    return tally;
  }
  for (const listing of listings) {
    const unit = await ctx.db.get(listing.unitId);
    if (!unit) continue;
    const listingRand = mulberry32(hashSeed(`${today}|${seedKey}|${listing._id}`));
    await churnListing(ctx, listing, unit, today, listingRand, { conflictRate: settings.conflictRate, addMax: 2, forceConflict: false }, tally);
  }
  return tally;
}

async function seedDefaults(ctx: MutationCtx, property: Doc<'properties'>) {
  const today = todayInTimezone(property.timezone);
  const listings = await listingsFor(ctx, property._id);
  for (const listing of listings) {
    const unit = await ctx.db.get(listing.unitId);
    if (!unit) continue;
    const rand = mulberry32(hashSeed(`seed|${listing._id}`));
    const calendar = await unitCalendar(ctx, unit, today);
    let placed = 0;
    for (let attempt = 0; attempt < 20 && placed < 2; attempt += 1) {
      const checkIn = addDays(today, 2 + Math.floor(rand() * 14));
      const stay = { checkIn, checkOut: addDays(checkIn, 1 + Math.floor(rand() * 3)) };
      if ([...calendar.internal, ...calendar.sim].some((r) => overlaps(r, stay))) continue;
      await insertReservation(ctx, listing, unit.slug, { ...stay, guestLabel: guestLabel(listing.platform, rand), origin: 'seed' });
      calendar.sim.push({ ...stay, listingId: listing._id });
      placed += 1;
    }
  }
}

/** Create the 5 units × 2 platforms listings and point each unit's iCal imports at them. */
export const connect = mutation({
  args: {},
  handler: async (ctx) => {
    assertEnabled();
    const property = await songProperty(ctx);
    await requireConfigure(ctx, property._id, 'ota_sim.connect');
    if (!process.env.CONVEX_SITE_URL) throw new ConvexError('CONVEX_SITE_URL_MISSING');
    const units = (await ctx.db.query('units').withIndex('by_property', (q) => q.eq('propertyId', property._id)).collect())
      .filter((u) => u.status !== 'offline');
    const existing = await listingsFor(ctx, property._id);
    const now = Date.now();
    for (const unit of units) {
      const feeds: Array<{ label: string; url: string }> = [];
      for (const platform of Object.keys(PLATFORMS) as Platform[]) {
        let listing = existing.find((l) => l.unitId === unit._id && l.platform === platform);
        if (!listing) {
          const id = await ctx.db.insert('otaSimListings', {
            propertyId: property._id,
            unitId: unit._id,
            platform,
            title: unit.name,
            feedToken: crypto.randomUUID().replaceAll('-', ''),
            active: true,
            createdAt: now,
          });
          listing = (await ctx.db.get(id))!;
        }
        feeds.push({ label: PLATFORMS[platform].label, url: feedUrl(listing.feedToken) });
      }
      const labels = new Set(feeds.map((f) => f.label));
      // Simulated feeds replace older URLs for the same label; manual-upload records stay.
      const kept = unit.icalImports.filter((imp) => imp.url.startsWith('upload:') || !labels.has(imp.label));
      const next = feeds.map((feed) => {
        const prior = unit.icalImports.find((imp) => imp.url === feed.url);
        return { ...feed, lastSyncedAt: prior?.lastSyncedAt, lastStatus: prior?.lastStatus };
      });
      await ctx.db.patch(unit._id, { icalImports: [...kept, ...next] });
    }
    const anyReservation = await ctx.db.query('otaSimReservations').withIndex('by_property', (q) => q.eq('propertyId', property._id)).first();
    if (!anyReservation) await seedDefaults(ctx, property);
    return { connected: true, listings: units.length * 2 };
  },
});

export const status = query({
  args: {},
  handler: async (ctx) => {
    if (!simulatorEnabled()) return { enabled: false as const };
    const property = await ctx.db.query('properties').withIndex('by_slug', (q) => q.eq('slug', 'song-homestay')).unique();
    if (!property) return { enabled: false as const };
    const listings = await listingsFor(ctx, property._id);
    return {
      enabled: true as const,
      propertyId: property._id,
      connected: listings.length > 0,
      listings: listings.map((l) => ({ listingId: l._id, unitId: l.unitId, platform: l.platform, active: l.active, feedUrl: feedUrl(l.feedToken) })),
    };
  },
});

export const platformView = query({
  args: { platform: platformArg },
  handler: async (ctx, args) => {
    assertEnabled();
    const property = await songProperty(ctx);
    await requireRead(ctx, property._id);
    const today = todayInTimezone(property.timezone);
    const units = await ctx.db.query('units').withIndex('by_property', (q) => q.eq('propertyId', property._id)).collect();
    const listings = (await listingsFor(ctx, property._id)).filter((l) => l.platform === args.platform);
    const rows = [];
    for (const listing of listings) {
      const unit = units.find((u) => u._id === listing.unitId);
      if (!unit) continue;
      const unitType = await ctx.db.get(unit.unitTypeId);
      const reservations = (await reservationsFor(ctx, listing._id))
        .filter((r) => r.checkOut >= addDays(today, -7))
        .sort((a, b) => (a.checkIn < b.checkIn ? -1 : 1));
      rows.push({
        listingId: listing._id,
        active: listing.active,
        unitName: unit.name,
        unitSlug: unit.slug,
        sortOrder: unit.sortOrder,
        photoUrl: unitType?.photoUrls?.[0] ?? null,
        feedUrl: feedUrl(listing.feedToken),
        reservations: reservations.map((r) => ({
          reservationId: r._id, uid: r.uid, checkIn: r.checkIn, checkOut: r.checkOut, guestLabel: r.guestLabel, status: r.status, origin: r.origin,
        })),
      });
    }
    rows.sort((a, b) => a.sortOrder - b.sortOrder);
    return { propertyName: property.name, today, connected: listings.length > 0, listings: rows };
  },
});

async function loadListing(ctx: MutationCtx, listingId: Id<'otaSimListings'>, action: string) {
  assertEnabled();
  const listing = await ctx.db.get(listingId);
  if (!listing) throw new ConvexError('LISTING_NOT_FOUND');
  await requireConfigure(ctx, listing.propertyId, action);
  return listing;
}

export const addReservation = mutation({
  args: { listingId: v.id('otaSimListings'), checkIn: v.string(), checkOut: v.string(), guestLabel: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const listing = await loadListing(ctx, args.listingId, 'ota_sim.reservation.add');
    assertDates(args.checkIn, args.checkOut);
    const own = (await reservationsFor(ctx, listing._id)).filter((r) => r.status === 'active');
    if (own.some((r) => overlaps(r, args))) {
      throw new ConvexError({ code: 'SIM_OVERLAP', message: 'Nền tảng này đã có đặt phòng trong khoảng ngày đó.' });
    }
    const unit = await ctx.db.get(listing.unitId);
    const rand = mulberry32(hashSeed(`${Date.now()}`));
    const id = await insertReservation(ctx, listing, unit?.slug ?? 'unit', {
      checkIn: args.checkIn,
      checkOut: args.checkOut,
      guestLabel: args.guestLabel ?? guestLabel(listing.platform, rand),
      origin: 'manual',
    });
    return { reservationId: id };
  },
});

export const cancelReservation = mutation({
  args: { reservationId: v.id('otaSimReservations') },
  handler: async (ctx, args) => {
    const reservation = await ctx.db.get(args.reservationId);
    if (!reservation) throw new ConvexError('RESERVATION_NOT_FOUND');
    await loadListing(ctx, reservation.listingId, 'ota_sim.reservation.cancel');
    await ctx.db.patch(reservation._id, { status: 'cancelled', updatedAt: Date.now() });
    return { cancelled: true };
  },
});

export const moveReservation = mutation({
  args: { reservationId: v.id('otaSimReservations'), checkIn: v.string(), checkOut: v.string() },
  handler: async (ctx, args) => {
    const reservation = await ctx.db.get(args.reservationId);
    if (!reservation || reservation.status !== 'active') throw new ConvexError('RESERVATION_NOT_FOUND');
    await loadListing(ctx, reservation.listingId, 'ota_sim.reservation.move');
    assertDates(args.checkIn, args.checkOut);
    const own = (await reservationsFor(ctx, reservation.listingId)).filter((r) => r.status === 'active' && r._id !== reservation._id);
    if (own.some((r) => overlaps(r, args))) {
      throw new ConvexError({ code: 'SIM_OVERLAP', message: 'Nền tảng này đã có đặt phòng trong khoảng ngày đó.' });
    }
    await ctx.db.patch(reservation._id, { checkIn: args.checkIn, checkOut: args.checkOut, updatedAt: Date.now() });
    return { moved: true };
  },
});

/** Switching a listing off makes its feed answer 404, i.e. a failing sync. */
export const setListingActive = mutation({
  args: { listingId: v.id('otaSimListings'), active: v.boolean() },
  handler: async (ctx, args) => {
    const listing = await loadListing(ctx, args.listingId, 'ota_sim.listing.toggle');
    await ctx.db.patch(listing._id, { active: args.active });
    return { active: args.active };
  },
});

export const randomizeNow = mutation({
  args: { mode: v.union(v.literal('daily'), v.literal('conflict')) },
  handler: async (ctx, args) => {
    assertEnabled();
    const property = await songProperty(ctx);
    await requireConfigure(ctx, property._id, 'ota_sim.randomize');
    return await runRandomize(ctx, property, args.mode, `${args.mode}|${Date.now()}`);
  },
});

export const resetSimulation = mutation({
  args: {},
  handler: async (ctx) => {
    assertEnabled();
    const property = await songProperty(ctx);
    await requireConfigure(ctx, property._id, 'ota_sim.reset');
    for (const row of await ctx.db.query('otaSimReservations').withIndex('by_property', (q) => q.eq('propertyId', property._id)).collect()) {
      await ctx.db.delete(row._id);
    }
    for (const listing of await listingsFor(ctx, property._id)) {
      if (!listing.active) await ctx.db.patch(listing._id, { active: true });
    }
    await seedDefaults(ctx, property);
    return { reset: true };
  },
});

/** Cron: one deterministic round of churn per property-local day. */
export const dailyRandomize = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (!simulatorEnabled()) return { skipped: 'disabled' };
    const property = await ctx.db.query('properties').withIndex('by_slug', (q) => q.eq('slug', 'song-homestay')).unique();
    if (!property) return { skipped: 'no_property' };
    if (!(await listingsFor(ctx, property._id)).length) return { skipped: 'not_connected' };
    const settings = await loadSyncSettings(ctx, property._id);
    const today = todayInTimezone(property.timezone);
    if (!settings.randomizerEnabled) return { skipped: 'off' };
    if (settings.lastRandomizedOn === today) return { skipped: 'already_ran' };
    const tally = await runRandomize(ctx, property, 'daily', 'cron');
    if (settings.row) await ctx.db.patch(settings.row._id, { lastRandomizedOn: today });
    else {
      await ctx.db.insert('icalSyncSettings', {
        propertyId: property._id,
        alertEmails: settings.alertEmails,
        randomizerEnabled: settings.randomizerEnabled,
        conflictRate: settings.conflictRate,
        lastRandomizedOn: today,
      });
    }
    return tally;
  },
});

export const feedText = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    if (!simulatorEnabled()) return null;
    const listing = await ctx.db.query('otaSimListings').withIndex('by_feedToken', (q) => q.eq('feedToken', args.token)).unique();
    if (!listing || !listing.active) return null;
    const unit = await ctx.db.get(listing.unitId);
    const config = PLATFORMS[listing.platform];
    const reservations = (await reservationsFor(ctx, listing._id)).filter((r) => r.status === 'active');
    return renderIcs({
      prodId: config.prodId,
      calName: `${unit?.name ?? listing.title} (${config.label} · mô phỏng)`,
      events: reservations.map((r) => ({
        uid: r.uid,
        startDate: r.checkIn,
        endDate: r.checkOut,
        summary: config.summary,
        stampMs: r.updatedAt,
      })),
    });
  },
});
