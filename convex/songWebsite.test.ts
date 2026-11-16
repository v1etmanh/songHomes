/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/!(*.*.*)*.*s');

async function seedSong(t: ReturnType<typeof convexTest>) {
  await t.mutation(internal.seed.run, {});
  return await t.run(async (ctx: any) => {
    const property = (await ctx.db.query('properties').withIndex('by_slug', (q: any) => q.eq('slug', 'song-homestay')).unique())!;
    const units = await ctx.db.query('units').withIndex('by_property', (q: any) => q.eq('propertyId', property._id)).collect();
    return { property: property as { _id: Id<'properties'> }, units: units as Array<{ _id: Id<'units'>; unitTypeId: Id<'unitTypes'> }> };
  });
}

describe('Sóng website requirements (WEBSITE.pdf)', () => {
  beforeEach(() => vi.stubEnv('DEMO_MODE', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('adds a stay with its own unit and rate, idempotently, and keeps unit names in step with renames', async () => {
    const t = convexTest(schema, modules);
    const fx = await seedSong(t);
    const args = {
      propertyId: fx.property._id, name: 'Sóng Mỹ An House', accommodationType: 'Nhà nguyên căn', address: 'Mỹ An, Đà Nẵng',
      description: 'Nhà mới', bedrooms: 2, bathrooms: 2, maxOccupancy: 4, nightlyCents: 833_300_00, longStay: true,
      monthlyPriceCents: 25_000_000_00, photoUrls: ['/song-homestay/hero.webp'],
    };
    const first = await t.mutation(api.songHomestay.createAccommodation, args);
    const again = await t.mutation(api.songHomestay.createAccommodation, args);
    expect(first.created).toBe(true);
    expect(again).toEqual({ unitTypeId: first.unitTypeId, created: false });
    await expect(t.mutation(api.songHomestay.createAccommodation, { ...args, name: 'Khác', nightlyCents: 1.5 })).rejects.toThrow(/INVALID_RATE/);

    const state = await t.run(async (ctx) => ({
      type: await ctx.db.get(first.unitTypeId),
      units: await ctx.db.query('units').withIndex('by_type', (q) => q.eq('unitTypeId', first.unitTypeId)).collect(),
      plans: await ctx.db.query('ratePlans').withIndex('by_unitType', (q) => q.eq('unitTypeId', first.unitTypeId)).collect(),
    }));
    expect(state.type).toMatchObject({ slug: 'song-my-an-house', longStay: true, monthlyPriceCents: 25_000_000_00 });
    expect(state.units).toHaveLength(1);
    expect(state.plans).toMatchObject([{ minStayNights: 30, baseNightlyCents: 833_300_00 }]);

    await t.mutation(api.songHomestay.updateAccommodation, {
      propertyId: fx.property._id, unitTypeId: first.unitTypeId, name: 'Sóng Mỹ An Garden', address: '', accommodationType: 'Nhà nguyên căn',
      description: '', bedrooms: 2, bathrooms: 2, maxOccupancy: 4, highlights: [], amenities: [], photoUrls: [], comingSoon: false,
    });
    expect((await t.run(async (ctx) => ctx.db.get(state.units[0]._id)))!.name).toBe('Sóng Mỹ An Garden');
  });

  it('removes only simulator feeds and releases their blocks, and refuses to run where the simulator is off', async () => {
    const t = convexTest(schema, modules);
    const fx = await seedSong(t);
    const [simUnit, realUnit] = fx.units;
    const blockId = await t.run(async (ctx) => {
      await ctx.db.patch(simUnit._id, { icalImports: [{ label: 'Airbnb', url: 'https://x.convex.site/sim/ical/abc.ics' }] });
      await ctx.db.patch(realUnit._id, { icalImports: [{ label: 'Airbnb', url: 'https://www.airbnb.com/calendar/ical/1.ics' }] });
      const blockId = await ctx.db.insert('bookings', {
        propertyId: fx.property._id, unitId: simUnit._id, unitTypeId: simUnit.unitTypeId, confirmationCode: 'EXT-SIM1',
        checkIn: '2026-12-01', checkOut: '2026-12-03', nights: 2, adults: 0, children: 0, status: 'external', source: 'ical:Airbnb',
        externalUid: 'sim-1', statusHistory: [{ status: 'external', ts: 0 }], notes: [], createdAt: 0, updatedAt: 0,
      });
      for (const date of ['2026-12-01', '2026-12-02']) await ctx.db.insert('unitNights', { unitId: simUnit._id, date, bookingId: blockId, kind: 'external' });
      return blockId;
    });

    vi.stubEnv('DEMO_MODE', 'false');
    await expect(t.mutation(internal.icalImport.removeSimulatorFeeds, { propertySlug: 'song-homestay' })).rejects.toThrow(/OTA_SIMULATOR_DISABLED/);
    vi.stubEnv('DEMO_MODE', 'true');

    expect(await t.mutation(internal.icalImport.removeSimulatorFeeds, { propertySlug: 'song-homestay' })).toEqual({ feedsRemoved: 1, blocksReleased: 1 });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(simUnit._id as Id<'units'>))!.icalImports).toEqual([]);
      expect((await ctx.db.get(realUnit._id as Id<'units'>))!.icalImports).toHaveLength(1);
      expect((await ctx.db.get(blockId))!.status).toBe('cancelled');
      expect(await ctx.db.query('unitNights').withIndex('by_booking', (q) => q.eq('bookingId', blockId)).collect()).toHaveLength(0);
    });
  });

  it('searches residence records by booking, name, unit, and only a document suffix for viewers who cannot reveal it', async () => {
    const t = convexTest(schema, modules);
    const fx = await seedSong(t);
    const unit = fx.units[0];
    await t.run(async (ctx) => {
      const bookingId = await ctx.db.insert('bookings', {
        propertyId: fx.property._id, unitId: unit._id, unitTypeId: unit.unitTypeId, confirmationCode: 'OS-FIND01',
        checkIn: '2026-12-01', checkOut: '2026-12-03', nights: 2, adults: 1, children: 0, status: 'confirmed', source: 'online',
        statusHistory: [{ status: 'confirmed', ts: 0 }], notes: [], createdAt: 0, updatedAt: 0,
      });
      await ctx.db.insert('residenceRegistrations', {
        propertyId: fx.property._id, bookingId: bookingId as Id<'bookings'>, fullName: 'Trần Thị Đào', documentType: 'cccd', documentNumber: '079123456789',
        nationality: 'Việt Nam', registrationType: 'tam_tru', checkInDate: '2026-12-01', checkOutDate: '2026-12-03', status: 'declared',
        submittedBy: 'staff', createdAt: 1, updatedAt: 1,
      });
    });
    const find = (search: string) => t.query(api.residence.listForProperty, { propertyId: fx.property._id, search });
    expect(await find('os-find01')).toHaveLength(1);
    expect(await find('tran thi dao')).toHaveLength(1); // accent-insensitive
    expect(await find('6789')).toHaveLength(1);
    expect(await find('079123456789')).toHaveLength(0); // full number needs reveal rights
    expect(await find('không có')).toHaveLength(0);
  });
});
