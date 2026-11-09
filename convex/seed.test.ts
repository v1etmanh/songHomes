/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/!(*.*.*)*.*s');

describe('Consensus Commons seed migration', () => {
  it('refreshes an existing fictional rate to 19 cents plus 13% HST', async () => {
    const t = convexTest(schema, modules);
    const { propertyId, ratePlanId } = await t.run(async (ctx) => {
      const propertyId = await ctx.db.insert('properties', {
        name: 'Consensus Commons', slug: 'consensus-commons', timezone: 'America/Toronto',
        currency: 'CAD', taxRateBps: 500, email: 'hosts@example.test', phone: '555-0210',
        address: 'Toronto', checkInTime: '15:00', checkOutTime: '11:00', active: true,
      });
      const unitTypeId = await ctx.db.insert('unitTypes', {
        propertyId, name: 'Node Room', slug: 'node-room', kind: 'room', bookingMode: 'nightly',
        description: '', photoUrls: [], maxOccupancy: 2, amenities: [], comingSoon: false, sortOrder: 1,
      });
      const ratePlanId = await ctx.db.insert('ratePlans', {
        propertyId, unitTypeId, name: 'Hackathon rate', active: true, currency: 'CAD',
        baseNightlyCents: 21_000, seasons: [], minStayNights: 1, maxStayNights: 7,
        minLeadTimeHours: 0, maxAdvanceDays: 365, prepBufferNights: 0,
        depositPolicy: { type: 'full', value: 0 }, cancellationPolicy: [],
      });
      return { propertyId, ratePlanId };
    });

    await t.mutation((internal as any).seed.run, {});
    const state = await t.run(async (ctx) => ({
      property: await ctx.db.get(propertyId),
      ratePlan: await ctx.db.get(ratePlanId),
      unitType: await ctx.db.query('unitTypes')
        .withIndex('by_property_slug', (q) => q.eq('propertyId', propertyId).eq('slug', 'node-room'))
        .first(),
      promos: await ctx.db.query('promoCodes')
        .withIndex('by_code', (q) => q.eq('propertyId', propertyId).eq('normalizedCode', 'CONSENSUS10'))
        .collect(),
    }));
    expect(state.property).toMatchObject({ taxRateBps: 1300, taxLabel: 'HST' });
    expect(state.ratePlan).toMatchObject({ baseNightlyCents: 19, minStayNights: 1, maxStayNights: 1 });
    expect(state.unitType?.photoUrls).toEqual([
      '/demo/consensus-commons/exterior.webp',
      '/demo/consensus-commons/node-room.webp',
      '/demo/consensus-commons/hack-lounge.webp',
    ]);
    expect(state.promos).toHaveLength(1);
    expect(state.promos[0]).toMatchObject({
      code: 'CONSENSUS10', kind: 'percent', valueBps: 1_000, oncePerGuest: true, active: true,
    });

    await t.mutation((internal as any).seed.run, {});
    expect(await t.run((ctx) => ctx.db.query('promoCodes')
      .withIndex('by_code', (q) => q.eq('propertyId', propertyId).eq('normalizedCode', 'CONSENSUS10'))
      .collect())).toHaveLength(1);
  });

  it('seeds Sóng Homestay — Đà Nẵng with exactly 5 named accommodations and 3 services', async () => {
    const t = convexTest(schema, modules);
    await t.mutation((internal as any).seed.run, {});

    const songData = await t.run(async (ctx) => {
      const prop = await ctx.db
        .query('properties')
        .withIndex('by_slug', (q) => q.eq('slug', 'song-homestay'))
        .first();
      if (!prop) return null;
      const units = await ctx.db
        .query('units')
        .withIndex('by_property', (q) => q.eq('propertyId', prop._id))
        .collect();
      const addOns = await ctx.db
        .query('addOns')
        .withIndex('by_property', (q) => q.eq('propertyId', prop._id))
        .collect();
      const unitTypes = await ctx.db.query('unitTypes').withIndex('by_property', (q) => q.eq('propertyId', prop._id)).collect();
      return { prop, units, unitTypes, addOns };
    });

    expect(songData).not.toBeNull();
    expect(songData!.prop.currency).toBe('VND');
    expect(songData!.prop).toMatchObject({ phone: '0911.388.703', email: 'Songhomestay@gmail.com' });
    expect(songData!.units).toHaveLength(5);
    expect(songData!.unitTypes).toHaveLength(5);
    expect(songData!.addOns).toHaveLength(3);
    expect(songData!.units.map((u) => u.slug)).toEqual([
      'song-garden-house', 'song-sea-view-apartment', 'song-coastal-apartment', 'song-pool-villa', 'song-rooftop-house',
    ]);
    expect(songData!.units.every((unit) => unit.icalImports.length === 0)).toBe(true);
    expect(songData!.unitTypes.find((row) => row.slug === 'song-rooftop-house')).toMatchObject({ capacityKnown: false, maxOccupancy: 0, bedrooms: 6, bathrooms: 6 });
  });
});
