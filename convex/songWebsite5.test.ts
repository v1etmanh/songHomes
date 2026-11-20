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

describe('WEBSITE.pdf rounds 5–6 — Sóng rules', () => {
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
      const may20 = Date.UTC(2027, 4, 20, 5);
      const base = { propertyId: s.property._id, unitId: s.unit._id, unitTypeId: s.unit.unitTypeId, nights: 2, adults: 1, children: 0, statusHistory: [], notes: [], createdAt: may20, updatedAt: may20 };
      const first = await db.db.insert('bookings', { ...base, checkIn: '2027-06-01', checkOut: '2027-06-03', status: 'confirmed', source: 'manual:zalo', confirmationCode: 'OS-CONF-A' });
      const second = await db.db.insert('bookings', { ...base, checkIn: '2027-06-02', checkOut: '2027-06-04', status: 'external', source: 'ical:Airbnb', confirmationCode: 'EXT-CONF-B', syncConflict: true });
      return [first, second];
    });
    const before: any = await s.t.query(api.icalImport.dashboardForProperty, { propertyId: s.property._id });
    expect(before.conflicts.some((c: any) => c.conflictId === `${a}:${b}`)).toBe(true);
    // Dashboard counts the same pairs as the conflicts page, by booking creation day (May), not stay dates (June).
    const may = { propertyId: s.property._id, startDate: '2027-05-01', endDate: '2027-06-01' };
    const june = { propertyId: s.property._id, startDate: '2027-06-01', endDate: '2027-07-01' };
    const openSnap: any = await s.t.query((api as any).songHomestay.adminSnapshot, may);
    expect(openSnap.kpis.conflictCount).toBe(before.conflicts.length);
    expect(openSnap.conflictStats).toEqual({ confirmed: { open: 1, resolved: 0 }, pending: { open: 0, resolved: 0 } });
    expect(openSnap.conflictsByDay).toEqual([{ date: '2027-05-20', open: 1, resolved: 0 }]);
    expect(((await s.t.query((api as any).songHomestay.adminSnapshot, june)) as any).kpis.conflictCount).toBe(0);
    await s.t.mutation(api.icalImport.resolveConflict, { bookingId: b, resolutionType: 'acknowledge', note: 'Đã hủy trên Airbnb', conflictWith: a });
    const doneSnap: any = await s.t.query((api as any).songHomestay.adminSnapshot, may);
    expect(doneSnap.conflictStats).toEqual({ confirmed: { open: 0, resolved: 1 }, pending: { open: 0, resolved: 0 } });
    expect(doneSnap.kpis).toMatchObject({ conflictCount: 0, conflictResolvedCount: 1 });
    expect(doneSnap.conflictRows[0]).toMatchObject({ resolved: true, codes: ['EXT-CONF-B', 'OS-CONF-A'], createdDate: '2027-05-20' });
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

  it('marks a booking declared in person at the desk, once, and clears the guest prompt', async () => {
    const s = await setup();
    const r = await s.hold('2027-08-01', '2027-08-03', [], { adults: 2 });
    await s.t.mutation(api.bookings.confirmPayAtProperty, { bookingId: r.bookingId, confirmationCode: r.confirmationCode, email: 'khach@example.com' });
    await s.t.mutation((api as any).songHomestay.updateBookingStatus, { propertyId: s.property._id, bookingId: r.bookingId, status: 'confirmed' });
    await drain(s.t);
    expect(((await s.t.withIdentity({ subject: `${await s.t.run(async (db) => (await db.db.get(r.bookingId))!.userId)}|x` }).query((api as any).guestAccount.pendingDeclarations, {})) as any).count).toBe(1);
    await s.t.mutation((api as any).residence.markDeclaredInPerson, { bookingId: r.bookingId, requestId: 'desk-1' });
    await s.t.mutation((api as any).residence.markDeclaredInPerson, { bookingId: r.bookingId, requestId: 'desk-2' });
    const booking = await s.t.run(async (db) => db.db.get(r.bookingId));
    expect(booking!.residenceDeclaredInPersonAt).toBeTruthy();
    expect(booking!.notes.filter((n) => n.text.startsWith('Khách khai báo lưu trú trực tiếp')).length).toBe(1);
    expect(((await s.t.withIdentity({ subject: `${booking!.userId}|x` }).query((api as any).guestAccount.pendingDeclarations, {})) as any).count).toBe(0);
    await drain(s.t);
  });

  it('shows full declaration details only to staff; anonymous demo readers see the masked number', async () => {
    const s = await setup();
    const r = await s.hold('2027-09-01', '2027-09-03', []);
    await s.t.mutation(api.bookings.confirmPayAtProperty, { bookingId: r.bookingId, confirmationCode: r.confirmationCode, email: 'khach@example.com' });
    await s.t.mutation((api as any).songHomestay.updateBookingStatus, { propertyId: s.property._id, bookingId: r.bookingId, status: 'confirmed' });
    await s.t.run(async (db) => db.db.insert('residenceRegistrations', {
      propertyId: s.property._id, bookingId: r.bookingId, fullName: 'Nguyễn An', documentType: 'cccd', documentNumber: '079123456789', nationality: 'Việt Nam',
      registrationType: 'tam_tru', checkInDate: '2027-09-01', checkOutDate: '2027-09-03', status: 'verified', submittedBy: 'guest', createdAt: 1, updatedAt: 1,
    }));
    const anonymous: any[] = await s.t.query(api.residence.listForProperty, { propertyId: s.property._id });
    expect(anonymous.find((row) => row.fullName === 'Nguyễn An').documentNumber).toBe('••••6789');
    const staffUser = await s.t.run(async (db) => {
      const userId = await db.db.insert('users', { email: 'staff6@example.com', name: 'Lễ tân 6' });
      await db.db.insert('staffProfiles', { userId, name: 'Lễ tân 6', role: 'owner', active: true, createdAt: 1 });
      return userId;
    });
    const staff: any[] = await s.t.withIdentity({ subject: `${staffUser}|s` }).query(api.residence.listForProperty, { propertyId: s.property._id });
    expect(staff.find((row) => row.fullName === 'Nguyễn An')).toMatchObject({ documentNumber: '079123456789', canReveal: true, contactEmail: 'khach@example.com' });
    await drain(s.t);
  });

  it('service schedule lists services of confirmed bookings, never of pending requests', async () => {
    const s = await setup();
    const bike = s.addOns.find((a) => a.name.startsWith('Thuê xe máy'))!;
    const confirmed = await s.hold('2027-10-01', '2027-10-04', [{ addOnId: bike._id, quantity: 2 }]);
    const pending = await s.hold('2027-10-10', '2027-10-12', [{ addOnId: s.pickup._id, quantity: 1 }]);
    for (const r of [confirmed, pending]) await s.t.mutation(api.bookings.confirmPayAtProperty, { bookingId: r.bookingId, confirmationCode: r.confirmationCode, email: 'khach@example.com' });
    await s.t.mutation((api as any).songHomestay.updateBookingStatus, { propertyId: s.property._id, bookingId: confirmed.bookingId, status: 'confirmed' });
    const overview: any = await s.t.query(api.songHomestay.serviceOverview, { propertyId: s.property._id, startDate: '2027-10-01', endDate: '2027-11-01' });
    const codes = overview.rows.map((row: any) => row.code);
    expect(codes).toContain(confirmed.confirmationCode);
    expect(codes).not.toContain(pending.confirmationCode);
    await drain(s.t);
  });

  it('staff set the free-pickup perk on a service; a recreated pickup without it is charged in full', async () => {
    const s = await setup();
    // Reproduces the demo bug: the flagged pickup was paused and a copy created without the perk.
    await s.t.mutation((api as any).songHomestay.updateAddOn, { propertyId: s.property._id, addOnId: s.pickup._id, name: s.pickup.name, priceCents: s.pickup.priceCents, unitLabel: 'lượt', taxable: false, active: false });
    const { addOnId } = await s.t.mutation((api as any).songHomestay.createAddOn, { propertyId: s.property._id, name: s.pickup.name, priceCents: 150_000_00, unitLabel: 'lượt', taxable: false });
    const noPerk = await s.hold('2027-11-01', '2027-11-05', [{ addOnId, quantity: 1 }]);
    expect(await s.addOnTotal(noPerk.bookingId)).toBe(150_000_00);
    const catalog: any = await s.t.query((api as any).songHomestay.managementCatalog, { propertyId: s.property._id });
    expect(catalog.addOns.find((a: any) => a.addOnId === addOnId).freeFirstUnitMinNights).toBeNull();

    // Staff turn the perk on from the service editor: the next 4-night booking gets the pickup free.
    await s.t.mutation((api as any).songHomestay.updateAddOn, { propertyId: s.property._id, addOnId, name: s.pickup.name, priceCents: 150_000_00, unitLabel: 'lượt', taxable: false, active: true, freeFirstUnitMinNights: 3 });
    const withPerk = await s.hold('2027-11-10', '2027-11-14', [{ addOnId, quantity: 1 }, { addOnId: s.dropoff._id, quantity: 1 }]);
    expect(await s.addOnTotal(withPerk.bookingId)).toBe(s.dropoff.priceCents);
    // Saving without the field keeps the perk; null removes it; out-of-range values are refused.
    await s.t.mutation((api as any).songHomestay.updateAddOn, { propertyId: s.property._id, addOnId, name: s.pickup.name, priceCents: 150_000_00, unitLabel: 'lượt', taxable: false, active: true });
    expect((await s.t.run((db) => db.db.get(addOnId)))!.freeFirstUnitMinNights).toBe(3);
    await expect(s.t.mutation((api as any).songHomestay.updateAddOn, { propertyId: s.property._id, addOnId, name: s.pickup.name, priceCents: 150_000_00, unitLabel: 'lượt', taxable: false, active: true, freeFirstUnitMinNights: 0 })).rejects.toThrow(/INVALID_ADDON|từ 1 đến 60/);
    await s.t.mutation((api as any).songHomestay.updateAddOn, { propertyId: s.property._id, addOnId, name: s.pickup.name, priceCents: 150_000_00, unitLabel: 'lượt', taxable: false, active: true, freeFirstUnitMinNights: null });
    expect((await s.t.run((db) => db.db.get(addOnId)))!.freeFirstUnitMinNights).toBeUndefined();
  });

  it('counts infants toward max occupancy', async () => {
    const s = await setup();
    const max = s.unitType.maxOccupancy;
    await expect(s.hold('2027-04-01', '2027-04-03', [], { adults: max, infants: 1 })).rejects.toThrow(/OVER_OCCUPANCY|at most/);
    await expect(s.hold('2027-04-05', '2027-04-07', [], { adults: max - 1, infants: 1 })).resolves.toBeTruthy();
  });
});
