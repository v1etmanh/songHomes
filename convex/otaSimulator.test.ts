/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import { parseIcs } from '../shared/ical';

const modules = import.meta.glob('./**/!(*.*.*)*.*s');
const SITE = 'https://sim-test.convex.site';

async function connectSong(t: ReturnType<typeof convexTest>) {
  await t.mutation((internal as any).seed.run, {});
  await t.mutation((api as any).otaSimulator.connect, {});
  return await t.run(async (ctx: any) => {
    const property = await ctx.db.query('properties').withIndex('by_slug', (q: any) => q.eq('slug', 'song-homestay')).unique();
    const units = await ctx.db.query('units').withIndex('by_property', (q: any) => q.eq('propertyId', property._id)).collect();
    const listings = await ctx.db.query('otaSimListings').collect();
    return { property, units, listings };
  });
}

/** Route fetches of simulated feed URLs to the internal feed query, like the HTTP route does. */
async function withSimFetch<T>(t: ReturnType<typeof convexTest>, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => {
    const match = String(url).match(/\/sim\/ical\/([A-Za-z0-9]+)\.ics$/);
    const body = match ? await t.query((internal as any).otaSimulator.feedText, { token: match[1] }) : null;
    return body === null ? new Response('not found', { status: 404 }) : new Response(body, { status: 200 });
  }) as unknown as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

describe('OTA simulator', () => {
  beforeEach(() => {
    vi.stubEnv('DEMO_MODE', 'true');
    vi.stubEnv('CONVEX_SITE_URL', SITE);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('connects every unit to two simulated feeds and serves only active reservations', async () => {
    const t = convexTest(schema, modules);
    const fx = await connectSong(t);
    expect(fx.listings).toHaveLength(fx.units.length * 2);
    for (const unit of fx.units) {
      expect(unit.icalImports.map((i: any) => i.label).sort()).toEqual(['Airbnb', 'Booking.com']);
      expect(unit.icalImports.every((i: any) => i.url.startsWith(`${SITE}/sim/ical/`))).toBe(true);
    }

    const listing = fx.listings[0];
    const view: any = await t.query((api as any).otaSimulator.platformView, { platform: listing.platform });
    const row = view.listings.find((l: any) => l.listingId === listing._id);
    expect(row.reservations.length).toBeGreaterThan(0);
    await t.mutation((api as any).otaSimulator.cancelReservation, { reservationId: row.reservations[0].reservationId });

    const text = await t.query((internal as any).otaSimulator.feedText, { token: listing.feedToken });
    const uids = parseIcs(text).events.map((e) => e.uid);
    expect(uids).not.toContain(row.reservations[0].uid);
    expect(uids).toHaveLength(row.reservations.length - 1);

    await t.mutation((api as any).otaSimulator.setListingActive, { listingId: listing._id, active: false });
    expect(await t.query((internal as any).otaSimulator.feedText, { token: listing.feedToken })).toBeNull();
  });

  it('refuses a same-platform overlap but lets a cross-channel clash through to sync, which flags it', async () => {
    const t = convexTest(schema, modules);
    const fx = await connectSong(t);
    const unit = fx.units[0];
    const airbnb = fx.listings.find((l: any) => l.unitId === unit._id && l.platform === 'airbnb');
    const booking = fx.listings.find((l: any) => l.unitId === unit._id && l.platform === 'booking');
    await t.mutation((api as any).otaSimulator.resetSimulation, {});
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query('otaSimReservations').collect()) await ctx.db.delete(row._id);
    });

    await t.mutation((api as any).otaSimulator.addReservation, { listingId: airbnb._id, checkIn: '2027-01-10', checkOut: '2027-01-13' });
    await expect(t.mutation((api as any).otaSimulator.addReservation, { listingId: airbnb._id, checkIn: '2027-01-12', checkOut: '2027-01-14' }))
      .rejects.toThrow(/SIM_OVERLAP|đã có đặt phòng/);
    await t.mutation((api as any).otaSimulator.addReservation, { listingId: booking._id, checkIn: '2027-01-12', checkOut: '2027-01-14' });

    const summary: any = await withSimFetch(t, () => t.action((api as any).icalImport.syncNow, { propertyId: fx.property._id }));
    expect(summary.failedFeeds).toBe(0);
    const flagged = await t.run(async (ctx) => (await ctx.db.query('bookings').collect()).filter((b) => b.syncConflict));
    expect(flagged).toHaveLength(1);
    const inbox: any = await t.query((api as any).icalAlerts.inbox, { propertyId: fx.property._id });
    expect(inbox.alerts.filter((a: any) => a.kind === 'conflict')).toHaveLength(1);
  });

  it('plants exactly one conflict on demand and runs the daily churn once per day', async () => {
    const t = convexTest(schema, modules);
    await connectSong(t);
    const tally: any = await t.mutation((api as any).otaSimulator.randomizeNow, { mode: 'conflict' });
    expect(tally.conflicts).toBe(1);
    expect(tally.added).toBe(1);

    const first: any = await t.mutation((internal as any).otaSimulator.dailyRandomize, {});
    expect(first.skipped).toBeUndefined();
    const second: any = await t.mutation((internal as any).otaSimulator.dailyRandomize, {});
    expect(second.skipped).toBe('already_ran');

    const reservations = await t.run(async (ctx) => (await ctx.db.query('otaSimReservations').collect()).filter((r) => r.status === 'active'));
    const byListing = new Map<string, typeof reservations>();
    for (const r of reservations) byListing.set(String(r.listingId), [...(byListing.get(String(r.listingId)) ?? []), r]);
    for (const rows of byListing.values()) {
      for (const a of rows) for (const b of rows) {
        if (a._id !== b._id) expect(a.checkIn < b.checkOut && b.checkIn < a.checkOut).toBe(false);
      }
    }
  });

  it('is disabled without an explicit demo flag', async () => {
    const t = convexTest(schema, modules);
    await t.mutation((internal as any).seed.run, {});
    vi.stubEnv('DEMO_MODE', 'false');
    await expect(t.mutation((api as any).otaSimulator.connect, {})).rejects.toThrow(/OTA_SIMULATOR_DISABLED/);
    expect(await t.mutation((internal as any).otaSimulator.dailyRandomize, {})).toEqual({ skipped: 'disabled' });
  });
});
