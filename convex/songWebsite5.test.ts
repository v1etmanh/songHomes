/// <reference types="vite/client" />
// @ts-nocheck -- convex-test's generic DatabaseReader indexes are resolved by Vitest's module harness.
// WEBSITE.pdf round 5: free airport pickup from 3 nights, infants take a seat.
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/!(*.*.*)*.*s');

async function drain(t: ReturnType<typeof convexTest>) {
  for (let index = 0; index < 30; index += 1) {
    const pending = await t.run(async (ctx) => (await ctx.db.system.query('_scheduled_functions').collect()).filter((job) => job.state.kind === 'pending' || job.state.kind === 'inProgress').length);
    if (pending === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await t.finishInProgressScheduledFunctions();
  }
}

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation((internal as any).seed.run, {});
  const ctx = await t.run(async (db) => {
    const property = await db.db.query('properties').withIndex('by_slug', (q) => q.eq('slug', 'song-homestay')).unique();
    const units = await db.db.query('units').withIndex('by_property', (q) => q.eq('propertyId', property!._id)).collect();
    const unit = units.find((u) => u.status === 'active')!;
    const unitType = await db.db.get(unit.unitTypeId);
    const ratePlan = await db.db.query('ratePlans').withIndex('by_unitType', (q) => q.eq('unitTypeId', unit.unitTypeId).eq('active', true)).unique();
    const addOns = await db.db.query('addOns').withIndex('by_property', (q) => q.eq('propertyId', property!._id).eq('active', true)).collect();
    return { property: property!, unit, unitType: unitType!, ratePlan: ratePlan!, addOns };
  });
  const userId = await t.run((db) => db.db.insert('users', { email: 'khach@example.com', name: 'Khách' }));
  const asGuest = t.withIdentity({ subject: `${userId}|test-session` });
  const byName = (prefix: string) => ctx.addOns.find((a) => a.name.startsWith(prefix) && a.name.includes('7 chỗ'))!;
  const hold = (checkIn: string, checkOut: string, addOns: Array<{ addOnId: any; quantity: number }>, party: { adults?: number; children?: number; infants?: number } = {}) =>
    asGuest.mutation(api.bookings.createHold, {
      unitId: ctx.unit._id, ratePlanId: ctx.ratePlan._id, checkIn, checkOut,
      adults: party.adults ?? 1, children: party.children ?? 0, infants: party.infants,
      guest: { name: 'Khách', email: 'khach@example.com', phone: '0911000000', marketingOptIn: false }, addOns,
    });
  const addOnTotal = (bookingId: any) => t.run(async (db) => (await db.db.get(bookingId))!.priceBreakdown.addOnSubtotalCents);
  return { t, ...ctx, pickup: byName('Đón sân bay'), dropoff: byName('Tiễn sân bay'), hold, addOnTotal };
}

describe('WEBSITE.pdf round 5 — booking rules', () => {
  beforeEach(() => vi.stubEnv('DEMO_MODE', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('frees exactly one pickup leg for a 3-night stay; drop-off is still charged', async () => {
    const s = await setup();
    const r = await s.hold('2027-03-01', '2027-03-04', [{ addOnId: s.pickup._id, quantity: 1 }, { addOnId: s.dropoff._id, quantity: 1 }]);
    expect(await s.addOnTotal(r.bookingId)).toBe(s.dropoff.priceCents);
    const lines = await s.t.run((db) => db.db.query('bookingAddOns').withIndex('by_booking', (q) => q.eq('bookingId', r.bookingId)).collect());
    expect(lines.find((l) => l.addOnId === s.pickup._id)?.freeQuantity).toBe(1);
    expect(lines.find((l) => l.addOnId === s.dropoff._id)?.freeQuantity).toBeUndefined();
  });

  it('adversarial: a 2-night stay gets no free pickup, and extra pickups are billed', async () => {
    const s = await setup();
    const short = await s.hold('2027-03-10', '2027-03-12', [{ addOnId: s.pickup._id, quantity: 1 }]);
    expect(await s.addOnTotal(short.bookingId)).toBe(s.pickup.priceCents);
    const many = await s.hold('2027-03-20', '2027-03-25', [{ addOnId: s.pickup._id, quantity: 3 }]);
    expect(await s.addOnTotal(many.bookingId)).toBe(s.pickup.priceCents * 2);
  });

  it('recognises confirmed revenue at once, in the check-in period, for the owner only', async () => {
    const s = await setup();
    const r = await s.hold('2027-05-10', '2027-05-13', []);
    await s.t.mutation(api.bookings.confirmPayAtProperty, { bookingId: r.bookingId, confirmationCode: r.confirmationCode, email: 'khach@example.com' });
    await drain(s.t);
    const period = { propertyId: s.property._id, startDate: '2027-05-01', endDate: '2027-06-01' };
    const pending: any = await s.t.query((api as any).songHomestay.adminSnapshot, period);
    expect(pending.kpis.totalRevenueCents).toBe(0); // a request is not revenue
    await s.t.mutation((api as any).songHomestay.updateBookingStatus, { propertyId: s.property._id, bookingId: r.bookingId, status: 'confirmed' });
    await drain(s.t);
    const confirmed: any = await s.t.query((api as any).songHomestay.adminSnapshot, period);
    const total = await s.t.run(async (db) => (await db.db.get(r.bookingId))!.priceBreakdown.totalCents);
    expect(confirmed.kpis.totalRevenueCents).toBe(total); // stay is months away, still counted

    // Outside DEMO_MODE a front-desk login gets no revenue figures at all.
    vi.stubEnv('DEMO_MODE', 'false');
    const deskUser = await s.t.run(async (db) => {
      const userId = await db.db.insert('users', { email: 'desk@example.com', name: 'Lễ tân' });
      const staffProfileId = await db.db.insert('staffProfiles', { userId, name: 'Lễ tân', role: 'staff', active: true, createdAt: 1 });
      await db.db.insert('staffPropertyAssignments', { staffProfileId, userId, propertyId: s.property._id, role: 'front_desk', active: true, createdAt: 1, updatedAt: 1 });
      return userId;
    });
    const asDesk = s.t.withIdentity({ subject: `${deskUser}|desk-session` });
    const desk: any = await asDesk.query((api as any).songHomestay.adminSnapshot, period);
    expect(desk.canSeeRevenue).toBe(false);
    expect(desk.kpis.totalRevenueCents).toBe(0);
    expect(desk.dailyRevenue).toEqual([]);
    expect(desk.bookings.every((row: any) => row.totalCents === 0)).toBe(true);
  });

  it('logs how a double booking was handled and by whom; simulated conflict rate is capped at 10%', async () => {
    const s = await setup();
    const [a, b] = await s.t.run(async (db) => {
      const base = { propertyId: s.property._id, unitId: s.unit._id, unitTypeId: s.unit.unitTypeId, nights: 2, adults: 1, children: 0, statusHistory: [], notes: [], createdAt: 1, updatedAt: 1 };
      const first = await db.db.insert('bookings', { ...base, checkIn: '2027-06-01', checkOut: '2027-06-03', status: 'confirmed', source: 'manual:zalo', confirmationCode: 'OS-CONF-A' });
      const second = await db.db.insert('bookings', { ...base, checkIn: '2027-06-02', checkOut: '2027-06-04', status: 'external', source: 'ical:Airbnb', confirmationCode: 'EXT-CONF-B', syncConflict: true });
      return [first, second];
    });
    const before: any = await s.t.query(api.icalImport.dashboardForProperty, { propertyId: s.property._id });
    expect(before.conflicts.some((c: any) => c.conflictId === `${a}:${b}`)).toBe(true);
    const june = { propertyId: s.property._id, startDate: '2027-06-01', endDate: '2027-07-01' };
    expect(((await s.t.query((api as any).songHomestay.adminSnapshot, june)) as any).conflictStats).toEqual({ confirmed: { open: 1, resolved: 0 }, pending: { open: 0, resolved: 0 } });
    await s.t.mutation(api.icalImport.resolveConflict, { bookingId: b, resolutionType: 'acknowledge', note: 'Đã hủy trên Airbnb', conflictWith: a });
    expect(((await s.t.query((api as any).songHomestay.adminSnapshot, june)) as any).conflictStats).toEqual({ confirmed: { open: 0, resolved: 1 }, pending: { open: 0, resolved: 0 } });
    const log: any[] = await s.t.query((api as any).icalImport.resolvedConflicts, { propertyId: s.property._id });
    expect(log[0]).toMatchObject({ bookingCode: 'EXT-CONF-B', otherBookingCode: 'OS-CONF-A', method: 'acknowledge', note: 'Đã hủy trên Airbnb', overlapStart: '2027-06-02', overlapEnd: '2027-06-03' });
    expect(log[0].byName).toBeTruthy();
    const after: any = await s.t.query(api.icalImport.dashboardForProperty, { propertyId: s.property._id });
    expect(after.conflicts.some((c: any) => c.conflictId === `${a}:${b}`)).toBe(false);

    await expect(s.t.mutation(api.icalAlerts.updateSettings, { propertyId: s.property._id, alertEmails: [], randomizerEnabled: true, conflictRate: 0.35 })).rejects.toThrow(/INVALID_RATE|10%/);
    await s.t.mutation(api.icalAlerts.updateSettings, { propertyId: s.property._id, alertEmails: [], randomizerEnabled: true, conflictRate: 0.1 });
    expect((await s.t.query(api.icalAlerts.getSettings, { propertyId: s.property._id })).conflictRate).toBe(0.1);
  });

  it('front-desk notes are idempotent on the request id', async () => {
    const s = await setup();
    vi.stubEnv('DEMO_MODE', 'false');
    const owner = await s.t.run(async (db) => {
      const userId = await db.db.insert('users', { email: 'owner5@example.com', name: 'Chủ nhà' });
      await db.db.insert('staffProfiles', { userId, name: 'Chủ nhà', role: 'owner', active: true, createdAt: 1 });
      return userId;
    });
    const asOwner = s.t.withIdentity({ subject: `${owner}|owner-session` });
    const r = await s.hold('2027-07-01', '2027-07-03', []);
    const args = { propertyId: s.property._id, bookingId: r.bookingId, text: 'Khách hạ cánh 14:30', requestId: 'note-1' };
    await asOwner.mutation((api as any).songHomestay.addFrontDeskNote, args);
    await asOwner.mutation((api as any).songHomestay.addFrontDeskNote, args);
    const notes = await s.t.run(async (db) => (await db.db.get(r.bookingId))!.notes.filter((n) => n.text === 'Khách hạ cánh 14:30'));
    expect(notes).toHaveLength(1);
    expect(notes[0].by).toBe('Lễ tân · Chủ nhà');
  });

  it('counts infants toward max occupancy', async () => {
    const s = await setup();
    const max = s.unitType.maxOccupancy;
    await expect(s.hold('2027-04-01', '2027-04-03', [], { adults: max, infants: 1 })).rejects.toThrow(/OVER_OCCUPANCY|at most/);
    await expect(s.hold('2027-04-05', '2027-04-07', [], { adults: max - 1, infants: 1 })).resolves.toBeTruthy();
  });
});
