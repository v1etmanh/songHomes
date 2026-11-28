/// <reference types="vite/client" />
// The reverse iCal direction, simulated like a real OTA subscription: each
// simulated platform pulls the unit's public OpenStays export URL over HTTP.
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/!(*.*.*)*.*s');
const SITE = 'https://sim-test.convex.site';

const make = () => convexTest(schema, modules);
type T = ReturnType<typeof make>;

async function setup(t: T) {
  await t.mutation(internal.seed.run, {});
  await t.mutation(api.otaSimulator.connect, {});
  await t.mutation(api.otaSimulator.resetSimulation, {});
  return await t.run(async (ctx) => {
    for (const row of await ctx.db.query('otaSimReservations').collect()) await ctx.db.delete(row._id);
    const property = (await ctx.db.query('properties').withIndex('by_slug', (q) => q.eq('slug', 'song-homestay')).unique())!;
    const unit = (await ctx.db.query('units').withIndex('by_property', (q) => q.eq('propertyId', property._id)).collect())[0];
    const airbnb = (await ctx.db.query('otaSimListings').collect()).find((l) => l.unitId === unit._id && l.platform === 'airbnb')!;
    const guestId = await ctx.db.insert('guests', {
      propertyId: property._id, name: 'Mai Linh', email: 'linh@example.com', normalizedEmail: 'linh@example.com',
      phone: '0905000111', normalizedPhone: '0905000111', marketingOptIn: false, notes: [],
    });
    const now = Date.now();
    const booking = (code: string, status: 'confirmed' | 'cancelled' | 'external', checkIn: string, checkOut: string, source = 'online') =>
      ctx.db.insert('bookings', {
        propertyId: property._id, unitId: unit._id, unitTypeId: unit.unitTypeId, guestId, checkIn, checkOut, nights: 2,
        adults: 2, children: 0, status, source, confirmationCode: code, statusHistory: [{ status, ts: now }], notes: [], createdAt: now, updatedAt: now,
      });
    const confirmed = await booking('OS-PULL01', 'confirmed', '2027-02-10', '2027-02-12');
    const cancelled = await booking('OS-PULL02', 'cancelled', '2027-02-20', '2027-02-22');
    const external = await booking('EXT-PULL03', 'external', '2027-03-01', '2027-03-03', 'ical:Booking.com');
    return { property, unit, airbnb, confirmed, cancelled, external };
  });
}

/** Serve the public export route like convex/http.ts does; `fail` simulates the URL being unreachable. */
async function withExportFetch<R>(t: T, run: () => Promise<R>, fail = false): Promise<R> {
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => {
    if (fail) return new Response('boom', { status: 500 });
    const match = String(url).match(/\/ical\/u\/([^/]+)\.ics$/);
    const body = match ? await t.query(internal.ical.exportFeed, { token: match[1] }) : null;
    return body === null ? new Response('not found', { status: 404 }) : new Response(body, { status: 200 });
  }) as unknown as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

const listingOf = (t: T, id: Id<'otaSimListings'>) => t.run(async (ctx) => (await ctx.db.get(id))!);

describe('simulated OTAs pull the OpenStays export URL', () => {
  beforeEach(() => {
    vi.stubEnv('DEMO_MODE', 'true');
    vi.stubEnv('CONVEX_SITE_URL', SITE);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('subscribes each listing to its unit’s public export URL and imports only exportable bookings', async () => {
    const t = make();
    const fx = await setup(t);
    expect(fx.airbnb.importUrl).toBe(`${SITE}/ical/u/${fx.unit.icalExportToken}.ics`);
    expect(fx.airbnb.importedEvents).toBeUndefined();

    const tally = await withExportFetch(t, () => t.action(api.otaSimulator.pullNow, { platform: 'airbnb' }));
    expect(tally.failed).toBe(0);
    const listing = await listingOf(t, fx.airbnb._id);
    const uids = (listing.importedEvents ?? []).map((e) => e.uid);
    expect(uids).toContain(`${fx.confirmed}@openstays`);
    expect(uids).not.toContain(`${fx.cancelled}@openstays`);
    // Stays imported from another OTA are never re-exported (loop prevention).
    expect(uids).not.toContain(`${fx.external}@openstays`);
    expect(listing.lastPullOk).toBe(true);
  });

  it('blocks imported nights only after a pull, and a cancellation unblocks on the next pull', async () => {
    const t = make();
    const fx = await setup(t);
    const stay = { listingId: fx.airbnb._id, checkIn: '2027-02-11', checkOut: '2027-02-13' };
    // Never pulled: Airbnb has not seen the OpenStays booking yet, so it still sells the night (the lag that causes clashes).
    const early = await t.mutation(api.otaSimulator.addReservation, stay);
    await t.mutation(api.otaSimulator.cancelReservation, { reservationId: early.reservationId });

    await withExportFetch(t, () => t.action(internal.otaSimulator.pullAll, {}));
    await expect(t.mutation(api.otaSimulator.addReservation, stay)).rejects.toThrow(/khóa bởi lịch nhập từ OpenStays/);

    await t.run(async (ctx) => ctx.db.patch(fx.confirmed, { status: 'cancelled' }));
    // Still blocked until the platform pulls again.
    await expect(t.mutation(api.otaSimulator.addReservation, stay)).rejects.toThrow(/khóa/);
    await withExportFetch(t, () => t.action(internal.otaSimulator.pullAll, {}));
    await t.mutation(api.otaSimulator.addReservation, stay);
  });

  it('keeps the last good calendar when a pull fails', async () => {
    const t = make();
    const fx = await setup(t);
    await withExportFetch(t, () => t.action(internal.otaSimulator.pullAll, {}));
    const before = (await listingOf(t, fx.airbnb._id)).importedEvents;
    const tally = await withExportFetch(t, () => t.action(api.otaSimulator.pullNow, { platform: 'airbnb' }), true);
    expect(tally.failed).toBe(tally.listings);
    const after = await listingOf(t, fx.airbnb._id);
    expect(after.lastPullOk).toBe(false);
    expect(after.lastPullStatus).toMatch(/HTTP 500/);
    expect(after.importedEvents).toEqual(before);
  });

  it('does nothing when the simulator is off', async () => {
    const t = make();
    const fx = await setup(t);
    vi.stubEnv('DEMO_MODE', '');
    vi.stubEnv('ALLOW_OTA_SIMULATOR', '');
    expect(await t.action(internal.otaSimulator.pullAll, {})).toEqual({ skipped: 'disabled' });
    await expect(t.action(api.otaSimulator.pullNow, { platform: 'airbnb' })).rejects.toThrow(/OTA_SIMULATOR_DISABLED/);
    expect((await listingOf(t, fx.airbnb._id)).lastPullAt).toBeUndefined();
  });
});
