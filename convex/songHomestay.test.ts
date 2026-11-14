/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/!(*.*.*)*.*s');

async function drainScheduled(t: ReturnType<typeof convexTest>) {
  for (let i = 0; i < 50; i += 1) {
    const pending = await t.run(async (ctx) =>
      (await ctx.db.system.query('_scheduled_functions').collect())
        .filter((job) => job.state.kind === 'pending' || job.state.kind === 'inProgress').length);
    if (pending === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await t.finishInProgressScheduledFunctions();
  }
}

async function seedSong(t: ReturnType<typeof convexTest>) {
  await t.mutation((internal as any).seed.run, {});
  return await t.run(async (ctx: any) => {
    const property = await ctx.db.query('properties').withIndex('by_slug', (q: any) => q.eq('slug', 'song-homestay')).unique();
    if (!property) throw new Error('song seed missing');
    const units = await ctx.db.query('units').withIndex('by_property', (q: any) => q.eq('propertyId', property._id)).collect();
    const unitTypes = await ctx.db.query('unitTypes').withIndex('by_property', (q: any) => q.eq('propertyId', property._id)).collect();
    return { property, units, unitTypes };
  });
}

describe('Sóng Homestay admin management', () => {
  beforeEach(() => vi.stubEnv('DEMO_MODE', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('saves an accommodation that has no address yet, and still rejects an empty name', async () => {
    const t = convexTest(schema, modules);
    const fx = await seedSong(t);
    const unitType = (fx.unitTypes as any[])[0];
    const base = {
      propertyId: fx.property._id, unitTypeId: unitType._id, name: 'Phòng đổi tên', address: '   ', accommodationType: 'Căn hộ',
      description: 'Mô tả', bedrooms: 0, bathrooms: 0, highlights: [], amenities: [], photoUrls: [], comingSoon: false,
    };
    await t.mutation((api as any).songHomestay.updateAccommodation, base);
    const saved = await t.run(async (ctx) => ctx.db.get(unitType._id));
    expect(saved).toMatchObject({ name: 'Phòng đổi tên' });
    expect((saved as any).address).toBeUndefined();
    await expect(t.mutation((api as any).songHomestay.updateAccommodation, { ...base, name: ' ' })).rejects.toThrow(/INVALID_ACCOMMODATION/);
  });

  it('creates a confirmed Zalo booking, blocks its nights, and rejects an overlap', async () => {
    const t = convexTest(schema, modules);
    const fx = await seedSong(t);
    const unit = (fx.units as any[])[0];
    const result = await t.mutation((api as any).songHomestay.createManualBooking, {
      propertyId: fx.property._id,
      unitId: unit._id,
      checkIn: '2026-12-10',
      checkOut: '2026-12-13',
      guestName: 'Nguyễn Văn A',
      guestPhone: '0905000001',
      guestEmail: 'a@example.com',
      adults: 2,
      children: 1,
      source: 'zalo',
      note: 'Đã nhận cọc',
    });
    const state = await t.run(async (ctx) => ({
      booking: await ctx.db.get(result.bookingId),
      nights: await ctx.db.query('unitNights').withIndex('by_booking', (q) => q.eq('bookingId', result.bookingId)).collect(),
    }));
    expect(state.booking).toMatchObject({ status: 'confirmed', source: 'manual:zalo', nights: 3 });
    expect(state.nights.map((row) => row.date)).toEqual(['2026-12-10', '2026-12-11', '2026-12-12']);

    await expect(t.mutation((api as any).songHomestay.createManualBooking, {
      propertyId: fx.property._id,
      unitId: unit._id,
      checkIn: '2026-12-12',
      checkOut: '2026-12-14',
      guestName: 'Trần Văn B',
      guestPhone: '0905000002',
      adults: 1,
      children: 0,
      source: 'facebook',
    })).rejects.toThrow('Căn đã có booking');
  });

  it('creates and updates units and service catalog entries', async () => {
    const t = convexTest(schema, modules);
    const fx = await seedSong(t);
    const createdUnit = await t.mutation((api as any).songHomestay.createUnit, {
      propertyId: fx.property._id,
      unitTypeId: (fx.unitTypes as any[])[0]._id,
      name: 'Căn I - Căn hộ 2PN',
      slug: 'can-i-can-ho-2pn',
    });
    await t.mutation((api as any).songHomestay.updateUnit, {
      propertyId: fx.property._id,
      unitId: createdUnit.unitId,
      name: 'Căn I - View biển',
      status: 'coming_soon',
    });
    const createdAddOn = await t.mutation((api as any).songHomestay.createAddOn, {
      propertyId: fx.property._id,
      name: 'Giặt ủi nhanh',
      priceCents: 80_000_00,
      unitLabel: 'lần',
      taxable: false,
    });
    await t.mutation((api as any).songHomestay.updateAddOn, {
      propertyId: fx.property._id,
      addOnId: createdAddOn.addOnId,
      name: 'Giặt ủi trong ngày',
      priceCents: 90_000_00,
      unitLabel: 'lần',
      taxable: false,
      active: false,
    });
    const catalog = await t.query((api as any).songHomestay.managementCatalog, { propertyId: fx.property._id });
    expect(catalog.units.find((row: any) => row.unitId === createdUnit.unitId)).toMatchObject({ name: 'Căn I - View biển', status: 'coming_soon' });
    expect(catalog.addOns.find((row: any) => row.addOnId === createdAddOn.addOnId)).toMatchObject({ name: 'Giặt ủi trong ngày', priceCents: 90_000_00, active: false });
  });

  it('submits a web booking as pending without a payment and keeps its nights blocked', async () => {
    const t = convexTest(schema, modules);
    const fx = await seedSong(t);
    const unit = (fx.units as any[])[1];
    const ratePlan = await t.run(async (ctx: any) => ctx.db
      .query('ratePlans')
      .withIndex('by_unitType', (q: any) => q.eq('unitTypeId', unit.unitTypeId).eq('active', true))
      .first());
    const guestUserId = await t.run((ctx) => ctx.db.insert('users', { email: 'web@example.com', name: 'Khách' }));
    const asGuest = t.withIdentity({ subject: `${guestUserId}|test-session` });
    const hold = await asGuest.mutation(api.bookings.createHold, {
      unitId: unit._id,
      ratePlanId: ratePlan._id,
      checkIn: '2026-12-20',
      checkOut: '2026-12-22',
      adults: 2,
      children: 0,
      guest: { name: 'Khách web', email: 'web@example.com', phone: '0905123456', marketingOptIn: false },
      addOns: [],
    });
    await t.mutation(api.bookings.confirmPayAtProperty, {
      bookingId: hold.bookingId,
      confirmationCode: hold.confirmationCode,
      email: 'web@example.com',
    });
    await drainScheduled(t);
    const state = await t.run(async (ctx) => ({
      booking: await ctx.db.get(hold.bookingId),
      payments: await ctx.db.query('payments').withIndex('by_booking', (q) => q.eq('bookingId', hold.bookingId)).collect(),
      receipts: await ctx.db.query('consensusReceipts').withIndex('by_booking', (q) => q.eq('bookingId', hold.bookingId)).collect(),
      nights: await ctx.db.query('unitNights').withIndex('by_booking', (q) => q.eq('bookingId', hold.bookingId)).collect(),
    }));
    expect(state.booking?.status).toBe('pending');
    expect(state.booking?.notes.at(-1)?.text).toContain('chờ nhân viên xác nhận');
    expect(state.payments).toEqual([]);
    expect(state.receipts).toEqual([]);
    expect(state.nights).toHaveLength(2);
  });
});
