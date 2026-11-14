/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import { addDays, todayInTimezone } from '../shared/pricing';

const modules = import.meta.glob('./**/!(*.*.*)*.*s');

async function seedSong(t: ReturnType<typeof convexTest>) {
  await t.mutation((internal as any).seed.run, {});
  return await t.run(async (ctx: any) => {
    const property = await ctx.db.query('properties').withIndex('by_slug', (q: any) => q.eq('slug', 'song-homestay')).unique();
    return { property };
  });
}

describe('Sóng Homestay sample data', () => {
  beforeEach(() => vi.stubEnv('DEMO_MODE', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('fills the 60-day dashboard window with consistent, reviewable data', async () => {
    const t = convexTest(schema, modules);
    const { property } = await seedSong(t);
    const result = await t.mutation((internal as any).songSampleData.run, {});
    expect(result.skipped).toBe(false);

    const today = todayInTimezone(property.timezone);
    const snapshot: any = await t.query((api as any).songHomestay.adminSnapshot, {
      propertyId: property._id,
      startDate: addDays(today, -60),
      endDate: addDays(today, 14),
    });
    expect(snapshot.kpis.totalRevenueCents).toBeGreaterThan(0);
    expect(snapshot.kpis.serviceRevenueCents).toBeGreaterThan(0);
    expect(snapshot.kpis.occupancyPercent).toBeGreaterThanOrEqual(30);
    expect(snapshot.kpis.occupancyPercent).toBeLessThanOrEqual(100);
    expect(snapshot.kpis.conflictCount).toBeGreaterThanOrEqual(2);
    expect(snapshot.kpis.pendingBookings).toBeGreaterThan(0);
    expect(snapshot.sourceCounts.length).toBeGreaterThanOrEqual(5);
    expect(snapshot.serviceUsage.length).toBe(3);
    for (const row of snapshot.serviceUsage) expect(row.count).toBeGreaterThan(0);
    expect(snapshot.dailyRevenue.length).toBeGreaterThan(20);
    expect(snapshot.bookings.length).toBeGreaterThanOrEqual(40);

    const residence: any[] = await t.query((api as any).residence.listForProperty, { propertyId: property._id });
    expect(residence.some((row) => row.registrationType === 'tam_tru')).toBe(true);
    expect(residence.some((row) => row.registrationType === 'tam_vang')).toBe(true);
  });

  it('keeps occupancy rows consistent: no double nights, none for finished or cancelled stays', async () => {
    const t = convexTest(schema, modules);
    await seedSong(t);
    await t.mutation((internal as any).songSampleData.run, {});
    await t.run(async (ctx) => {
      const nights = await ctx.db.query('unitNights').collect();
      const keys = nights.map((row) => `${row.unitId}|${row.date}`);
      expect(new Set(keys).size).toBe(keys.length);
      for (const booking of await ctx.db.query('bookings').collect()) {
        const rows = nights.filter((row) => row.bookingId === booking._id);
        if (booking.status === 'checked_out' || booking.status === 'cancelled') expect(rows).toHaveLength(0);
        if (booking.status === 'pending' || booking.status === 'confirmed' || booking.status === 'checked_in') {
          expect(rows).toHaveLength(booking.nights);
        }
      }
    });
  });

  it('is idempotent and replace re-creates the same amount of data', async () => {
    const t = convexTest(schema, modules);
    await seedSong(t);
    const first = await t.mutation((internal as any).songSampleData.run, {});
    const count = () => t.run(async (ctx) => (await ctx.db.query('bookings').collect()).length);
    const afterFirst = await count();
    const second = await t.mutation((internal as any).songSampleData.run, {});
    expect(second.skipped).toBe(true);
    expect(await count()).toBe(afterFirst);

    const replaced = await t.mutation((internal as any).songSampleData.run, { replace: true });
    expect(replaced.internalBookings).toBe(first.internalBookings);
    expect(await count()).toBe(afterFirst);
    const guests = await t.run(async (ctx) => (await ctx.db.query('guests').collect()).length);
    expect(guests).toBe(first.guests);
  });

  it('refuses to run unless the deployment opted in, and needs the Sóng seed', async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation((internal as any).songSampleData.run, {})).rejects.toThrow(/SONG_NOT_SEEDED/);
    await seedSong(t);
    vi.stubEnv('DEMO_MODE', 'false');
    await expect(t.mutation((internal as any).songSampleData.run, {})).rejects.toThrow(/SONG_SAMPLE_DISABLED/);
    vi.stubEnv('ALLOW_SONG_SAMPLE', 'true');
    vi.stubEnv('PUBLIC_LIVE_PAYMENTS', 'true');
    await expect(t.mutation((internal as any).songSampleData.run, {})).rejects.toThrow(/PROHIBITED_LIVE_PAYMENTS/);
  });
});
