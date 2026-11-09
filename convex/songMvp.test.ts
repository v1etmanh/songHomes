/// <reference types="vite/client" />
// @ts-nocheck -- convex-test's generic DatabaseReader indexes are resolved by Vitest's module harness.
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/!(*.*.*)*.*s');

async function drainScheduled(t: ReturnType<typeof convexTest>) {
  for (let index = 0; index < 30; index += 1) {
    const pending = await t.run(async (ctx) => (await ctx.db.system.query('_scheduled_functions').collect()).filter((job) => job.state.kind === 'pending' || job.state.kind === 'inProgress').length);
    if (pending === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await t.finishInProgressScheduledFunctions();
  }
}

async function seeded(t: any) {
  await t.mutation((internal as any).seed.run, {});
  return await t.run(async (ctx) => {
    const property = await ctx.db.query('properties').withIndex('by_slug', (q) => q.eq('slug', 'song-homestay')).unique();
    if (!property) throw new Error('missing song property');
    const units = await ctx.db.query('units').withIndex('by_property', (q) => q.eq('propertyId', property._id)).collect();
    return { property, units };
  });
}

describe('Sóng Homestay v2 MVP', () => {
  beforeEach(() => vi.stubEnv('DEMO_MODE', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('searches all five accommodations by capacity and excludes unknown capacity', async () => {
    const t = convexTest(schema, modules);
    await seeded(t);
    const fiveGuests = await t.query(api.availability.searchProperty, { propertySlug: 'song-homestay', checkIn: '2027-01-10', checkOut: '2027-01-12', guests: 5 });
    expect(fiveGuests.valid).toBe(true);
    expect(fiveGuests.unitTypeIds).toHaveLength(4);
    const eightGuests = await t.query(api.availability.searchProperty, { propertySlug: 'song-homestay', checkIn: '2027-01-10', checkOut: '2027-01-12', guests: 8 });
    expect(eightGuests.unitTypeIds).toHaveLength(1);
  });

  it('keeps pending nights blocked, then releases them when staff cancels', async () => {
    const t = convexTest(schema, modules);
    const { property, units } = await seeded(t);
    const unit = units[0];
    const ratePlan = await t.run((ctx) => ctx.db.query('ratePlans').withIndex('by_unitType', (q) => q.eq('unitTypeId', unit.unitTypeId).eq('active', true)).unique());
    const hold = await t.mutation(api.bookings.createHold, {
      unitId: unit._id, ratePlanId: ratePlan!._id, checkIn: '2027-02-10', checkOut: '2027-02-12', adults: 2, children: 0,
      guest: { name: 'Khách chờ xác nhận', email: 'pending@example.com', phone: '0911000000', marketingOptIn: false }, addOns: [],
    });
    await t.mutation(api.bookings.confirmPayAtProperty, { bookingId: hold.bookingId, confirmationCode: hold.confirmationCode, email: 'pending@example.com' });
    await drainScheduled(t);
    expect((await t.run((ctx) => ctx.db.query('unitNights').withIndex('by_booking', (q) => q.eq('bookingId', hold.bookingId)).collect()))).toHaveLength(2);
    await t.mutation((api as any).songHomestay.updateBookingStatus, { propertyId: property._id, bookingId: hold.bookingId, status: 'cancelled' });
    expect((await t.run((ctx) => ctx.db.query('unitNights').withIndex('by_booking', (q) => q.eq('bookingId', hold.bookingId)).collect()))).toHaveLength(0);
  });

  it('stores public contact requests for the staff inbox', async () => {
    const t = convexTest(schema, modules);
    const { property } = await seeded(t);
    await t.mutation(api.contacts.submit, { propertySlug: 'song-homestay', name: 'Nguyễn An', phone: '0911222333', email: 'an@example.com', message: 'Tư vấn Pool Villa cho 8 khách.' });
    const rows = await t.query(api.contacts.listForProperty, { propertyId: property._id });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Nguyễn An', status: 'new' });
  });
});
