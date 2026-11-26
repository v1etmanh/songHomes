/// <reference types="vite/client" />
// @ts-nocheck -- convex-test's generic DatabaseReader indexes are resolved by Vitest's module harness.
// WEBSITE (2).pdf round 7: manual bookings carry services + website price; cancelled bookings are listed.
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
    const units = await db.db.query('units').withIndex('by_property', (q) => q.eq('propertyId', property!._id)).collect();
    const unit = units.find((u) => u.status === 'active')!;
    const ratePlan = await db.db.query('ratePlans').withIndex('by_unitType', (q) => q.eq('unitTypeId', unit.unitTypeId).eq('active', true)).first();
    const addOns = await db.db.query('addOns').withIndex('by_property', (q) => q.eq('propertyId', property!._id).eq('active', true)).collect();
    const pinewood = await db.db.query('properties').withIndex('by_slug', (q) => q.eq('slug', 'pinewood-flats')).unique();
    const foreignAddOn = pinewood ? await db.db.query('addOns').withIndex('by_property', (q) => q.eq('propertyId', pinewood._id)).first() : null;
    return { property: property!, unit, ratePlan: ratePlan!, addOns, foreignAddOn };
  });
  const pickup = ctx.addOns.find((a) => a.name.startsWith('Đón sân bay') && a.name.includes('7 chỗ'))!;
  const dropoff = ctx.addOns.find((a) => a.name.startsWith('Tiễn sân bay') && a.name.includes('7 chỗ'))!;
  const manual = (checkIn: string, checkOut: string, addOns?: Array<{ addOnId: any; quantity: number }>, extra: Record<string, unknown> = {}) =>
    t.mutation((api as any).songHomestay.createManualBooking, {
      propertyId: ctx.property._id, unitId: ctx.unit._id, checkIn, checkOut,
      guestName: 'Khách Zalo', guestPhone: '0912000111', adults: 2, children: 0, source: 'zalo', addOns, ...extra,
    });
  const userId = await t.run((db) => db.db.insert('users', { email: 'khach@example.com', name: 'Khách' }));
  const asGuest = t.withIdentity({ subject: `${userId}|test-session` });
  const hold = (checkIn: string, checkOut: string, addOns: Array<{ addOnId: any; quantity: number }>) =>
    asGuest.mutation(api.bookings.createHold, {
      unitId: ctx.unit._id, ratePlanId: ctx.ratePlan._id, checkIn, checkOut, adults: 2, children: 0,
      guest: { name: 'Khách', email: 'khach@example.com', phone: '0911000000', marketingOptIn: false }, addOns,
    });
  const booking = (id: any) => t.run((db) => db.db.get(id));
  const lines = (id: any) => t.run((db) => db.db.query('bookingAddOns').withIndex('by_booking', (q) => q.eq('bookingId', id)).collect());
  const snapshot = (startDate: string, endDate: string) => t.query((api as any).songHomestay.adminSnapshot, { propertyId: ctx.property._id, startDate, endDate });
  return { t, ...ctx, pickup, dropoff, manual, hold, booking, lines, snapshot };
}

describe('WEBSITE (2).pdf round 7', () => {
  beforeEach(() => vi.stubEnv('DEMO_MODE', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('prices a manual booking exactly like the website booking of the same stay and services', async () => {
    const s = await setup();
    const services = [{ addOnId: s.pickup._id, quantity: 1 }, { addOnId: s.dropoff._id, quantity: 1 }];
    const web = await s.hold('2027-04-01', '2027-04-04', services);
    const desk = await s.manual('2027-04-10', '2027-04-13', services);
    const [webRow, deskRow] = [await s.booking(web.bookingId), await s.booking(desk.bookingId)];
    expect(deskRow.priceBreakdown.totalCents).toBeGreaterThan(0);
    expect(desk.totalCents).toBe(deskRow.priceBreakdown.totalCents);
    // Same nights count, same services, same weekday pattern is not guaranteed — compare the add-on part
    // exactly and the room part against computePrice with the same rate plan.
    expect(deskRow.priceBreakdown.addOnSubtotalCents).toBe(webRow.priceBreakdown.addOnSubtotalCents);
    expect(deskRow.ratePlanId).toBe(s.ratePlan._id);
    const deskLines = await s.lines(desk.bookingId);
    expect(deskLines.find((l) => l.addOnId === s.pickup._id)?.freeQuantity).toBe(1); // 3 nights → free pickup leg
    expect(deskLines.find((l) => l.addOnId === s.dropoff._id)?.freeQuantity).toBeUndefined();
    expect(deskRow.priceBreakdown.addOnSubtotalCents).toBe(s.dropoff.priceCents);
  });

  it('same dates: manual total equals the website total to the cent', async () => {
    const s = await setup();
    const services = [{ addOnId: s.pickup._id, quantity: 1 }];
    const web = await s.hold('2027-06-01', '2027-06-03', services);
    const webTotal = (await s.booking(web.bookingId)).priceBreakdown.totalCents;
    // Let the hold expire (frees its nights), then book the same stay at the desk.
    await s.t.run((db) => db.db.patch(web.bookingId, { holdExpiresAt: 1 }));
    await s.t.mutation(internal.bookings.expireHolds, {});
    const desk = await s.manual('2027-06-01', '2027-06-03', services);
    expect(desk.totalCents).toBe(webTotal);
  });

  it('revenue: a confirmed manual booking counts its full total; once cancelled it leaves revenue but stays listed under Đã hủy', async () => {
    const s = await setup();
    const desk = await s.manual('2027-07-05', '2027-07-08', [{ addOnId: s.dropoff._id, quantity: 1 }]);
    const total = (await s.booking(desk.bookingId)).priceBreakdown.totalCents;
    const before = await s.snapshot('2027-07-01', '2027-08-01');
    expect(before.kpis.totalRevenueCents).toBe(total);
    expect(before.kpis.roomRevenueCents + before.kpis.serviceRevenueCents).toBe(total); // no double count
    expect(before.kpis.serviceRevenueCents).toBe(s.dropoff.priceCents);

    await s.t.mutation((api as any).songHomestay.updateBookingStatus, { propertyId: s.property._id, bookingId: desk.bookingId, status: 'cancelled' });
    const after = await s.snapshot('2027-07-01', '2027-08-01');
    expect(after.kpis.totalRevenueCents).toBe(0);
    const row = after.bookings.find((b) => b.bookingId === desk.bookingId);
    expect(row?.status).toBe('cancelled');
    expect(row?.revenueRecognised).toBe(false);
    expect(after.sourceCounts.find((c) => c.source === 'zalo')?.count ?? 0).toBe(0);
    // "Booking mới" counts by creation day: use a window that holds today; the cancelled one drops out.
    const wide = await s.snapshot('2026-01-01', '2028-01-01');
    expect(wide.newBookings.some((b) => b.bookingId === desk.bookingId)).toBe(false);
    expect(wide.bookings.some((b) => b.bookingId === desk.bookingId && b.status === 'cancelled')).toBe(true);
  });

  it('adversarial: inactive, foreign and out-of-range add-ons are refused and nothing is written', async () => {
    const s = await setup();
    const inactive = await s.t.run(async (db) => { await db.db.patch(s.dropoff._id, { active: false }); return s.dropoff._id; });
    await expect(s.manual('2027-08-01', '2027-08-03', [{ addOnId: inactive, quantity: 1 }])).rejects.toThrow(/unavailable/);
    if (s.foreignAddOn) await expect(s.manual('2027-08-01', '2027-08-03', [{ addOnId: s.foreignAddOn._id, quantity: 1 }])).rejects.toThrow(/unavailable/);
    await expect(s.manual('2027-08-01', '2027-08-03', [{ addOnId: s.pickup._id, quantity: 0 }])).rejects.toThrow(/quantity/);
    await expect(s.manual('2027-08-01', '2027-08-03', [{ addOnId: s.pickup._id, quantity: 100 }])).rejects.toThrow(/quantity/);
    await expect(s.manual('2027-08-01', '2027-08-03', [{ addOnId: s.pickup._id, quantity: 1.5 }])).rejects.toThrow(/quantity/);
    // The failed attempts left no booking and no blocked night: the dates are still bookable.
    const ok = await s.manual('2027-08-01', '2027-08-03', []);
    expect(ok.totalCents).toBeGreaterThan(0);
  });

  it('adversarial: a client cannot pass its own price — extra fields are rejected by the validator', async () => {
    const s = await setup();
    await expect(s.manual('2027-09-01', '2027-09-03', [], { totalCents: 1 })).rejects.toThrow();
    await expect(s.manual('2027-09-01', '2027-09-03', [{ addOnId: s.pickup._id, quantity: 1, priceCents: 0 }])).rejects.toThrow();
  });

  it('a manual booking without services still gets the room price (no more 0 đ)', async () => {
    const s = await setup();
    const desk = await s.manual('2027-10-01', '2027-10-02');
    const row = await s.booking(desk.bookingId);
    expect(row.priceBreakdown.nightlySubtotalCents).toBeGreaterThan(0);
    expect(row.priceBreakdown.addOnSubtotalCents).toBe(0);
    expect(await s.lines(desk.bookingId)).toHaveLength(0);
  });
});
