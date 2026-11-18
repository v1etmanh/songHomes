/// <reference types="vite/client" />
// @ts-nocheck -- convex-test's generic DatabaseReader indexes are resolved by Vitest's module harness.
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/!(*.*.*)*.*s');

async function seeded(t: any) {
  await t.mutation((internal as any).seed.run, {});
  return await t.run(async (ctx) => {
    const property = await ctx.db.query('properties').withIndex('by_slug', (q) => q.eq('slug', 'song-homestay')).unique();
    const units = await ctx.db.query('units').withIndex('by_property', (q) => q.eq('propertyId', property._id)).collect();
    const addOns = await ctx.db.query('addOns').withIndex('by_property', (q) => q.eq('propertyId', property._id)).collect();
    return { property, units, addOns };
  });
}

describe('Sóng front-desk shift services', () => {
  beforeEach(() => vi.stubEnv('DEMO_MODE', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('lists the add-on services of guests arriving on the day, and not other days or cancelled stays', async () => {
    const t = convexTest(schema, modules);
    const { property, units, addOns } = await seeded(t);
    const unit = units[0];
    const bike = addOns.find((row) => row.name.startsWith('Thuê xe máy'));
    const ratePlan = await t.run((ctx) => ctx.db.query('ratePlans').withIndex('by_unitType', (q) => q.eq('unitTypeId', unit.unitTypeId).eq('active', true)).unique());
    const guestUserId = await t.run((ctx) => ctx.db.insert('users', { email: 'shift@example.com', name: 'Khách' }));
    const asGuest = t.withIdentity({ subject: `${guestUserId}|test-session` });
    const hold = await asGuest.mutation(api.bookings.createHold, {
      unitId: unit._id, ratePlanId: ratePlan!._id, checkIn: '2027-03-10', checkOut: '2027-03-12', adults: 2, children: 0,
      guest: { name: 'Khách có dịch vụ', email: 'shift@example.com', phone: '0911000001', marketingOptIn: false },
      addOns: [{ addOnId: bike!._id, quantity: 2 }],
    });

    const onArrival = await t.query((api as any).songHomestay.shiftServices, { propertyId: property._id, date: '2027-03-10' });
    expect(onArrival).toHaveLength(1);
    expect(onArrival[0]).toMatchObject({ code: hold.confirmationCode, quantity: 2, completed: false });
    expect(await t.query((api as any).songHomestay.shiftServices, { propertyId: property._id, date: '2027-03-11' })).toEqual([]);

    await t.run((ctx) => ctx.db.patch(hold.bookingId, { status: 'cancelled' }));
    expect(await t.query((api as any).songHomestay.shiftServices, { propertyId: property._id, date: '2027-03-10' })).toEqual([]);
  });

  it('rejects a malformed date', async () => {
    const t = convexTest(schema, modules);
    const { property } = await seeded(t);
    await expect(t.query((api as any).songHomestay.shiftServices, { propertyId: property._id, date: '10/03/2027' })).rejects.toThrow();
  });
});
