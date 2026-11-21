/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import { addDays, todayInTimezone } from '../shared/pricing';

const modules = import.meta.glob('./**/!(*.*.*)*.*s');
const PROPERTY_SCOPED_TABLES = Object.entries((schema as any).tables)
  .filter(([, table]: any) => JSON.stringify(table.validator?.json ?? table.export?.() ?? {}).includes('"propertyId"'))
  .map(([name]) => name);

async function songId(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx: any) =>
    (await ctx.db.query('properties').withIndex('by_slug', (q: any) => q.eq('slug', 'song-homestay')).unique())?._id);
}

async function rowsByProperty(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx: any) => {
    const counts: Record<string, Record<string, number>> = {};
    for (const table of PROPERTY_SCOPED_TABLES) {
      for (const row of await ctx.db.query(table).collect()) {
        const key = String(row.propertyId);
        counts[key] ??= {};
        counts[key][table] = (counts[key][table] ?? 0) + 1;
      }
    }
    return counts;
  });
}

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation((internal as any).seed.run, {});
  vi.stubEnv('ALLOW_SONG_SAMPLE', 'true');
  await t.mutation((internal as any).songSampleData.run, {});
  const oldSong = await songId(t);
  const ids = await t.run(async (ctx: any) => {
    const now = Date.now();
    const staffUser = await ctx.db.insert('users', { email: 'staff@example.com' });
    const profile = await ctx.db.insert('staffProfiles', { userId: staffUser, name: 'Lễ tân', role: 'staff', active: true, createdAt: now });
    await ctx.db.insert('staffPropertyAssignments', {
      staffProfileId: profile, userId: staffUser, propertyId: oldSong, role: 'manager', active: true, createdAt: now, updatedAt: now,
    });
    const guestUser = await ctx.db.insert('users', { email: 'khach@example.com' });
    await ctx.db.insert('authAccounts', { userId: guestUser, provider: 'password', providerAccountId: 'khach@example.com' });
    const session = await ctx.db.insert('authSessions', { userId: guestUser, expirationTime: now + 1e6 });
    await ctx.db.insert('authRefreshTokens', { sessionId: session, expirationTime: now + 1e6 });
    const booking = (await ctx.db.query('bookings').withIndex('by_property_checkIn', (q: any) => q.eq('propertyId', oldSong)).first());
    await ctx.db.patch(booking._id, { userId: guestUser });
    const unit = await ctx.db.query('units').withIndex('by_property', (q: any) => q.eq('propertyId', oldSong)).first();
    await ctx.db.insert('icalSyncRuns', {
      propertyId: oldSong, unitId: unit._id, label: 'Airbnb', trigger: 'cron', ok: false, error: 'x',
      inserted: 0, updated: 0, removed: 0, conflicts: 0, newConflicts: 0, ts: now,
    });
    return { staffUser, guestUser };
  });
  return { t, oldSong, ...ids };
}

describe('songReset.run', () => {
  beforeEach(() => vi.stubEnv('ALLOW_SONG_RESET', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('refuses without the env gate or with live payments', async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv('ALLOW_SONG_RESET', '');
    await expect(t.mutation((internal as any).songReset.run, {})).rejects.toThrow(/SONG_RESET_DISABLED/);
    vi.stubEnv('ALLOW_SONG_RESET', 'true');
    vi.stubEnv('PUBLIC_LIVE_PAYMENTS', 'true');
    await expect(t.mutation((internal as any).songReset.run, {})).rejects.toThrow(/LIVE_PAYMENTS/);
  });

  it('dryRun counts without changing anything', async () => {
    const { t, oldSong } = await setup();
    const before = await rowsByProperty(t);
    const result = await t.mutation((internal as any).songReset.run, { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.counts.bookings).toBeGreaterThan(0);
    expect(result.counts.users).toBe(1);
    expect(await songId(t)).toBe(oldSong);
    expect(await rowsByProperty(t)).toEqual(before);
  });

  it('wipes every Sóng row, leaves other properties, keeps staff and drops guest accounts', async () => {
    const { t, oldSong, staffUser, guestUser } = await setup();
    const before = await rowsByProperty(t);
    const result = await t.mutation((internal as any).songReset.run, {});
    expect(result).toMatchObject({ reset: true, staffAssignmentsMoved: 1 });

    const after = await rowsByProperty(t);
    expect(after[String(oldSong)]).toBeUndefined();
    for (const [propertyId, counts] of Object.entries(before)) {
      if (propertyId !== String(oldSong)) expect(after[propertyId]).toEqual(counts);
    }

    const fresh = await songId(t);
    expect(fresh).not.toBe(oldSong);
    const state = await t.run(async (ctx: any) => ({
      staff: await ctx.db.get(staffUser),
      guest: await ctx.db.get(guestUser),
      authAccounts: await ctx.db.query('authAccounts').collect(),
      authSessions: await ctx.db.query('authSessions').collect(),
      authRefreshTokens: await ctx.db.query('authRefreshTokens').collect(),
      orphanNights: (await ctx.db.query('unitNights').collect()).length,
      bookings: await ctx.db.query('bookings').withIndex('by_property_checkIn', (q: any) => q.eq('propertyId', fresh)).collect(),
    }));
    expect(state.staff).not.toBeNull();
    expect(state.guest).toBeNull();
    expect(state.authAccounts).toHaveLength(0);
    expect(state.authSessions).toHaveLength(0);
    expect(state.authRefreshTokens).toHaveLength(0);
    expect(state.bookings).toHaveLength(0);

    // Staff keep Sóng access on the new property row (no DEMO_MODE bypass).
    const today = todayInTimezone('Asia/Ho_Chi_Minh');
    const snapshot: any = await t.withIdentity({ subject: `${staffUser}|s` }).query((api as any).songHomestay.adminSnapshot, {
      propertyId: fresh, startDate: addDays(today, -7), endDate: addDays(today, 7),
    });
    expect(snapshot.kpis.totalBookings).toBe(0);

    // Sample data loads cleanly on top of the fresh catalog.
    const sample = await t.mutation((internal as any).songSampleData.run, {});
    expect(sample.skipped).toBe(false);
  });
});
