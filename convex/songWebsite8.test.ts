/// <reference types="vite/client" />
// WEBSITE (1).pdf: distinct guest names on residence declarations, mandatory
// nationality, and OTA-side fixes of a double booking logged as handled.
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/!(*.*.*)*.*s');

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const propertyId = await ctx.db.insert('properties', {
      name: 'Sóng Homestay', slug: 'song-homestay', timezone: 'Asia/Ho_Chi_Minh', currency: 'VND', taxRateBps: 0,
      email: 'b@song.test', phone: '1', address: '51 Trần Bạch Đằng', checkInTime: '14:00', checkOutTime: '12:00', active: true,
    });
    const unitTypeId = await ctx.db.insert('unitTypes', {
      propertyId, name: 'Căn hộ', slug: 'can-ho', kind: 'room', bookingMode: 'nightly', description: '', photoUrls: [],
      maxOccupancy: 4, amenities: [], comingSoon: false, sortOrder: 1,
    });
    const unitId = await ctx.db.insert('units', {
      propertyId, unitTypeId, name: 'Sóng Dương Tôn Hải House', slug: 'duong-ton-hai', status: 'active',
      icalExportToken: 'tok-dth', icalImports: [{ url: 'https://airbnb.test/dth.ics', label: 'Airbnb' }], sortOrder: 1,
    });
    const guestId = await ctx.db.insert('guests', {
      propertyId, name: 'Nguyễn Thị Bảo Ngọc', email: 'ngoc@example.com', normalizedEmail: 'ngoc@example.com',
      phone: '0339088458', normalizedPhone: '0339088458', marketingOptIn: false, notes: [],
    });
    const bookingId = await ctx.db.insert('bookings', {
      propertyId, unitId, unitTypeId, guestId, checkIn: '2026-12-18', checkOut: '2026-12-20', nights: 2, adults: 2, children: 0,
      status: 'confirmed', source: 'online', confirmationCode: 'OS-R9SK9J', statusHistory: [{ status: 'confirmed', ts: now }],
      notes: [], createdAt: now, updatedAt: now,
    });
    for (const date of ['2026-12-18', '2026-12-19']) await ctx.db.insert('unitNights', { unitId, date, bookingId, kind: 'stay' });
    return { propertyId, unitId, bookingId };
  });
}

const declaration = (fullName: string, documentNumber: string) => ({
  confirmationCode: 'OS-R9SK9J', email: 'ngoc@example.com', fullName, documentType: 'cccd' as const, documentNumber,
  nationality: 'Việt Nam', dateOfBirth: '1998-01-23', phone: '0339088458', permanentAddress: 'Đà Nẵng',
  registrationType: 'tam_tru' as const, checkInDate: '2026-12-18', checkOutDate: '2026-12-20', reason: 'Du lịch', consent: true,
});

describe('residence declarations keep each guest’s own name', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('stores two adults under their own names and refuses the same name twice', async () => {
    vi.stubEnv('DEMO_MODE', 'true');
    const t = convexTest(schema, modules);
    const { propertyId } = await seed(t);
    await t.mutation(api.residence.registerForGuest, declaration('Nguyễn Thị Bảo Ngọc', '046305008987'));
    // The old form kept the first guest's name: a second row under the same name is refused, nothing written.
    await expect(t.mutation(api.residence.registerForGuest, declaration('  nguyễn thị  bảo ngọc ', '046305008789'))).rejects.toThrow(/đã được khai báo/);
    await t.mutation(api.residence.registerForGuest, declaration('Trần Mai Linh', '046305008789'));
    const rows = await t.query(api.residence.listForProperty, { propertyId });
    expect(rows.map((row) => row.fullName).sort()).toEqual(['Nguyễn Thị Bảo Ngọc', 'Trần Mai Linh']);
  });

  it('refuses a declaration with a blank nationality', async () => {
    vi.stubEnv('DEMO_MODE', 'true');
    const t = convexTest(schema, modules);
    const { propertyId } = await seed(t);
    await expect(t.mutation(api.residence.registerForGuest, { ...declaration('Trần Mai Linh', '046305008789'), nationality: '  ' })).rejects.toThrow(/quốc tịch/);
    expect(await t.query(api.residence.listForProperty, { propertyId })).toHaveLength(0);
  });
});

describe('double booking fixed on the OTA is logged as handled', () => {
  afterEach(() => vi.unstubAllEnvs());

  const event = (startDate: string, endDate: string) => ({ uid: 'abnb-1@sim', startDate, endDate, summary: 'Reserved' });

  it('logs a cancellation on Airbnb once, with the clashing booking', async () => {
    vi.stubEnv('DEMO_MODE', 'true');
    const t = convexTest(schema, modules);
    const { propertyId, unitId } = await seed(t);
    await t.mutation(internal.icalImport.applyUnitImport, { unitId, label: 'Airbnb', events: [event('2026-12-19', '2026-12-21')] });
    // The reservation disappears from the feed: it was cancelled on Airbnb.
    await t.mutation(internal.icalImport.applyUnitImport, { unitId, label: 'Airbnb', events: [] });
    await t.mutation(internal.icalImport.applyUnitImport, { unitId, label: 'Airbnb', events: [] });
    const log = await t.query(api.icalImport.resolvedConflicts, { propertyId });
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ method: 'ota_update', otherBookingCode: 'OS-R9SK9J', overlapStart: '2026-12-19', overlapEnd: '2026-12-20', byName: 'Airbnb (đồng bộ iCal)' });
    expect(log[0].detail).toMatch(/đã hủy trên Airbnb/);
  });

  it('logs a move to free dates; a move that still clashes logs nothing', async () => {
    vi.stubEnv('DEMO_MODE', 'true');
    const t = convexTest(schema, modules);
    const { propertyId, unitId } = await seed(t);
    await t.mutation(internal.icalImport.applyUnitImport, { unitId, label: 'Airbnb', events: [event('2026-12-19', '2026-12-21')] });
    await t.mutation(internal.icalImport.applyUnitImport, { unitId, label: 'Airbnb', events: [event('2026-12-18', '2026-12-19')] });
    expect(await t.query(api.icalImport.resolvedConflicts, { propertyId })).toHaveLength(0);
    await t.mutation(internal.icalImport.applyUnitImport, { unitId, label: 'Airbnb', events: [event('2026-12-20', '2026-12-22')] });
    const log = await t.query(api.icalImport.resolvedConflicts, { propertyId });
    expect(log).toHaveLength(1);
    expect(log[0].detail).toMatch(/đổi ngày trên Airbnb: 20\/12\/26 → 22\/12\/26/);
  });
});
