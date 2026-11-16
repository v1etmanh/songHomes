/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import { SONG_ADD_ONS, SONG_STAYS } from './songCatalog';

const modules = import.meta.glob('./**/!(*.*.*)*.*s');

describe('Sóng catalog', () => {
  it('reshapes a five-type, eight-unit deployment into eight stays without losing units or bookings', async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const propertyId = await ctx.db.insert('properties', {
        name: 'Sóng Homestay — Đà Nẵng', slug: 'song-homestay', timezone: 'Asia/Ho_Chi_Minh', currency: 'VND',
        taxRateBps: 800, email: 'x@example.com', phone: '0', address: 'Đà Nẵng', checkInTime: '14:00', checkOutTime: '12:00', active: true,
      });
      const typeIds = [];
      for (const [i, name] of ['Sóng Pool Villa - K65 Tô Hiến Thành', 'Sóng Garden House - Chế Lan Viên', 'Sóng Rooftop House - An Thượng 17',
        'Sóng Sea View Apartment - Mỹ Khê', 'Sóng Coastal Apartment - Mỹ Khê'].entries()) {
        typeIds.push(await ctx.db.insert('unitTypes', {
          propertyId, name, slug: `legacy-${i}`, kind: 'room', bookingMode: 'nightly', description: '', photoUrls: [],
          maxOccupancy: 4, amenities: [], comingSoon: false, sortOrder: i + 1,
        }));
      }
      const unitIds = [];
      for (let i = 0; i < 8; i++) {
        unitIds.push(await ctx.db.insert('units', {
          propertyId, unitTypeId: typeIds[i < 3 ? 0 : 4], name: `Căn ${i}`, slug: `can-${i}`, status: 'active',
          icalExportToken: `token-${i}`, icalImports: [], sortOrder: i + 1,
        }));
      }
      const bookingId = await ctx.db.insert('bookings', {
        propertyId, unitId: unitIds[6], unitTypeId: typeIds[4], confirmationCode: 'SMP-1', checkIn: '2026-11-01', checkOut: '2026-11-03',
        nights: 2, adults: 2, children: 0, status: 'confirmed', source: 'online', statusHistory: [{ status: 'confirmed', ts: 0 }], notes: [], createdAt: 0, updatedAt: 0,
      });
      const addOnId = await ctx.db.insert('addOns', {
        propertyId, name: 'Vé cáp treo Bà Nà Hills', priceCents: 900_000_00, taxable: false, unitLabel: 'vé', appliesTo: [], active: true, sortOrder: 1,
      });
      return { propertyId, unitIds, bookingId, addOnId };
    });

    await t.mutation(internal.songCatalog.applyToDeployment, {});
    await t.mutation(internal.songCatalog.applyToDeployment, {}); // idempotent

    await t.run(async (ctx) => {
      const types = await ctx.db.query('unitTypes').withIndex('by_property', (q) => q.eq('propertyId', ids.propertyId)).collect();
      const forSale = types.filter((type) => !type.comingSoon);
      expect(forSale.map((type) => type.name)).toEqual(SONG_STAYS.map((stay) => stay.name));
      expect(forSale.filter((type) => type.longStay).map((type) => type.slug)).toEqual(['song-an-thuong-house', 'song-duong-ton-hai-house']);
      expect(forSale[0].photoUrls[0]).toMatch(/^\/song-homestay\/stays\/pool-villa\//);

      const units = await ctx.db.query('units').withIndex('by_property', (q) => q.eq('propertyId', ids.propertyId)).collect();
      expect(units).toHaveLength(8);
      expect(units.map((unit) => unit._id).sort()).toEqual([...ids.unitIds].sort());
      expect(new Set(units.map((unit) => unit.unitTypeId)).size).toBe(8);
      const g = units.find((unit) => unit._id === ids.unitIds[6])!;
      expect(g.name).toBe(SONG_STAYS[6].name);
      expect((await ctx.db.get(ids.bookingId))!.unitTypeId).toBe(g.unitTypeId);

      const plans = await ctx.db.query('ratePlans').withIndex('by_unitType', (q) => q.eq('unitTypeId', g.unitTypeId)).collect();
      expect(plans).toHaveLength(1);
      expect(plans[0]).toMatchObject({ minStayNights: 30, baseNightlyCents: 833_333_00 });

      const addOns = await ctx.db.query('addOns').withIndex('by_property', (q) => q.eq('propertyId', ids.propertyId).eq('active', true)).collect();
      expect(addOns.map((a) => a.name).sort()).toEqual(SONG_ADD_ONS.map((a) => a.name).sort());
      expect((await ctx.db.get(ids.addOnId))!.active).toBe(false);
    });
  });
});
