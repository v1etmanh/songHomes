/// <reference types="vite/client" />
// @ts-nocheck -- convex-test's generic DatabaseReader indexes are resolved by Vitest's module harness.
// Bandwidth guards: an unchanged iCal feed must not rewrite its unit (that re-runs every
// admin query reading `units`), and the header bell reads only its own narrow slice.
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/!(*.*.*)*.*s');

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation((internal as any).seed.run, {});
  const ctx = await t.run(async (db) => {
    const property = await db.db.query('properties').withIndex('by_slug', (q) => q.eq('slug', 'song-homestay')).unique();
    const unit = (await db.db.query('units').withIndex('by_property', (q) => q.eq('propertyId', property!._id)).collect()).find((u) => u.status === 'active')!;
    const ratePlan = await db.db.query('ratePlans').withIndex('by_unitType', (q) => q.eq('unitTypeId', unit.unitTypeId).eq('active', true)).first();
    return { property: property!, unit, ratePlan: ratePlan! };
  });
  return { t, ...ctx };
}

describe('bandwidth guards', () => {
  beforeEach(() => vi.stubEnv('DEMO_MODE', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('an unchanged feed status leaves the unit row untouched; a changed one writes it', async () => {
    const { t, unit } = await setup();
    const url = 'https://example.com/feed.ics';
    await t.run((db) => db.db.patch(unit._id, { icalImports: [{ url, label: 'Airbnb' }] }));
    const status = (lastSyncedAt: number, lastStatus: string) => t.mutation(internal.icalImport.updateImportStatus, { unitId: unit._id, url, lastSyncedAt, lastStatus });
    const read = () => t.run(async (db) => (await db.db.get(unit._id))!.icalImports[0]);

    await status(1_000, 'ok: 3 events (inserted 3, updated 0, removed 0, conflicts 0)');
    expect((await read()).lastSyncedAt).toBe(1_000); // first sync is always recorded

    await status(2_000, 'ok: 3 events (inserted 3, updated 0, removed 0, conflicts 0)');
    expect((await read()).lastSyncedAt).toBe(1_000); // identical status → no write

    await status(3_000, 'error: fetch failed');
    expect(await read()).toMatchObject({ lastSyncedAt: 3_000, lastStatus: 'error: fetch failed' }); // ok → error is written
  });

  it('feedOverview and kpiSummary report the latest run time, not the last status change', async () => {
    const { t, property, unit } = await setup();
    const url = 'https://example.com/feed.ics';
    await t.run((db) => db.db.patch(unit._id, { icalImports: [{ url, label: 'Airbnb', lastSyncedAt: 1_000, lastStatus: 'ok: 0 events (inserted 0, updated 0, removed 0, conflicts 0)' }] }));
    await t.run((db) => db.db.insert('icalSyncRuns', { propertyId: property._id, unitId: unit._id, label: 'Airbnb', trigger: 'cron', ok: true, inserted: 0, updated: 0, removed: 0, conflicts: 0, newConflicts: 0, ts: 9_000 }));
    const overview = await t.query(api.icalAlerts.feedOverview, { propertyId: property._id });
    expect(overview.find((u) => u.unitId === unit._id).feeds[0].lastSyncedAt).toBe(9_000);
    const kpis = await t.query((api as any).songHomestay.kpiSummary, { propertyId: property._id, since: '2020-01-01' });
    expect(kpis.lastSyncAt).toBe(9_000);
  });

  it('the bell lists a waiting website request and drops it once confirmed', async () => {
    const { t, property, unit, ratePlan } = await setup();
    const userId = await t.run((db) => db.db.insert('users', { email: 'khach@example.com', name: 'Khách' }));
    const hold = await t.withIdentity({ subject: `${userId}|s` }).mutation(api.bookings.createHold, {
      unitId: unit._id, ratePlanId: ratePlan._id, checkIn: '2027-03-01', checkOut: '2027-03-03', adults: 1, children: 0,
      guest: { name: 'Khách', email: 'khach@example.com', phone: '0911000000', marketingOptIn: false }, addOns: [],
    });
    await t.mutation(api.bookings.confirmPayAtProperty, { bookingId: hold.bookingId, confirmationCode: hold.confirmationCode, email: 'khach@example.com' });
    const bell = () => t.query((api as any).songHomestay.bellItems, { propertyId: property._id, today: '2026-11-26' });
    const waiting = (await bell()).find((row) => row.bookingId === hold.bookingId);
    expect(waiting).toMatchObject({ status: 'pending', source: 'online', unitName: unit.name });
    await t.mutation((api as any).songHomestay.updateBookingStatus, { propertyId: property._id, bookingId: hold.bookingId, status: 'confirmed' });
    expect((await bell()).some((row) => row.bookingId === hold.bookingId)).toBe(false); // not in house yet
  });
});
