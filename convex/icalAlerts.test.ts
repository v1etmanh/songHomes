/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/!(*.*.*)*.*s');
const FEED_URL = 'https://feeds.example.com/cabin-1.ics';

async function seedUnit(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const propertyId = await ctx.db.insert('properties', {
      name: 'Test Grounds', slug: 'test-grounds', timezone: 'Asia/Ho_Chi_Minh', currency: 'VND', taxRateBps: 800,
      email: 'owner@example.com', phone: '555', address: '1 Test Rd', checkInTime: '14:00', checkOutTime: '12:00', active: true,
    });
    const unitTypeId = await ctx.db.insert('unitTypes', {
      propertyId, name: 'Cabin', slug: 'cabin', kind: 'cabin', bookingMode: 'nightly', description: '', photoUrls: [],
      maxOccupancy: 4, amenities: [], comingSoon: false, sortOrder: 1,
    });
    const unitId = await ctx.db.insert('units', {
      propertyId, unitTypeId, name: 'Cabin 1', slug: 'cabin-1', status: 'active', icalExportToken: 'tok-cabin-1-xxxxxxxxxxxxxxxx',
      icalImports: [{ url: FEED_URL, label: 'Airbnb' }], sortOrder: 1,
    });
    return { propertyId, unitTypeId, unitId };
  });
}

function ics(events: Array<{ uid: string; start: string; end: string }>): string {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    ...events.flatMap((e) => ['BEGIN:VEVENT', `UID:${e.uid}`, `DTSTART;VALUE=DATE:${e.start}`, `DTEND;VALUE=DATE:${e.end}`, 'END:VEVENT']),
    'END:VCALENDAR',
  ].join('\r\n');
}

async function withFetch<T>(impl: () => Response | Promise<Response>, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => impl()) as unknown as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

describe('iCal sync alerts', () => {
  beforeEach(() => vi.stubEnv('DEMO_MODE', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('alerts once when a feed starts failing, stays quiet while it keeps failing, and reports recovery', async () => {
    const t = convexTest(schema, modules);
    const fx = await seedUnit(t);
    const sync = () => t.action((api as any).icalImport.syncFeedNow, { propertyId: fx.propertyId, unitId: fx.unitId, label: 'Airbnb' });

    const failed = await withFetch(() => new Response('gone', { status: 404 }), sync);
    expect(failed).toMatchObject({ ok: false, error: 'HTTP 404' });
    await withFetch(() => new Response('gone', { status: 404 }), sync);
    let inbox: any = await t.query((api as any).icalAlerts.inbox, { propertyId: fx.propertyId });
    expect(inbox.alerts.map((a: any) => a.kind)).toEqual(['sync_failed']);
    expect(inbox.alerts[0].recipients).toEqual(['owner@example.com']);

    await withFetch(() => new Response(ics([]), { status: 200 }), sync);
    inbox = await t.query((api as any).icalAlerts.inbox, { propertyId: fx.propertyId });
    expect(inbox.alerts.map((a: any) => a.kind)).toEqual(['sync_recovered', 'sync_failed']);
    expect(inbox.unread).toBe(2);

    const runs: any = await t.query((api as any).icalAlerts.listRuns, { propertyId: fx.propertyId });
    expect(runs.runs.map((r: any) => r.ok)).toEqual([true, false, false]);
    expect(runs.lastCronAt).toBeNull();
  });

  it('raises exactly one conflict alert per newly double-booked event and emails every recipient', async () => {
    const t = convexTest(schema, modules);
    const fx = await seedUnit(t);
    await t.mutation((api as any).icalAlerts.updateSettings, {
      propertyId: fx.propertyId, alertEmails: ['A@Example.com', 'b@example.com'], randomizerEnabled: true, conflictRate: 0.35,
    });
    await t.run(async (ctx) => {
      const now = Date.now();
      const bookingId = await ctx.db.insert('bookings', {
        propertyId: fx.propertyId, unitId: fx.unitId, unitTypeId: fx.unitTypeId, checkIn: '2026-12-10', checkOut: '2026-12-13',
        nights: 3, adults: 2, children: 0, status: 'confirmed', source: 'online', confirmationCode: 'OS-INTERN',
        statusHistory: [], notes: [], createdAt: now, updatedAt: now,
      });
      for (const date of ['2026-12-10', '2026-12-11', '2026-12-12']) {
        await ctx.db.insert('unitNights', { unitId: fx.unitId, date, bookingId, kind: 'stay' });
      }
    });
    const feed = ics([{ uid: 'clash@airbnb', start: '20261212', end: '20261214' }]);
    const sync = () => t.action((api as any).icalImport.syncFeedNow, { propertyId: fx.propertyId, unitId: fx.unitId, label: 'Airbnb' });
    await withFetch(() => new Response(feed, { status: 200 }), sync);
    await withFetch(() => new Response(feed, { status: 200 }), sync);

    const inbox: any = await t.query((api as any).icalAlerts.inbox, { propertyId: fx.propertyId });
    expect(inbox.alerts).toHaveLength(1);
    expect(inbox.alerts[0]).toMatchObject({ kind: 'conflict', recipients: ['a@example.com', 'b@example.com'] });
    expect(inbox.alerts[0].body).toContain('OS-INTERN');

    const emails = await t.run(async (ctx) => (await ctx.db.query('emailLog').collect()).filter((row) => row.templateKey === 'staff_alert'));
    expect(emails.map((row) => row.to).sort()).toEqual(['a@example.com', 'b@example.com']);
    expect(emails.every((row) => row.provider === 'log_only')).toBe(true);

    await t.mutation((api as any).icalAlerts.markAllRead, { propertyId: fx.propertyId });
    expect(await t.query((api as any).icalAlerts.unreadCount, { propertyId: fx.propertyId })).toBe(0);
  });

  it('validates alert settings', async () => {
    const t = convexTest(schema, modules);
    const fx = await seedUnit(t);
    await expect(t.mutation((api as any).icalAlerts.updateSettings, {
      propertyId: fx.propertyId, alertEmails: ['not-an-email'], randomizerEnabled: true, conflictRate: 0.3,
    })).rejects.toThrow(/INVALID_EMAIL|không hợp lệ/);
    await expect(t.mutation((api as any).icalAlerts.updateSettings, {
      propertyId: fx.propertyId, alertEmails: [], randomizerEnabled: true, conflictRate: 2,
    })).rejects.toThrow(/INVALID_RATE|Tỉ lệ/);
  });

  it('skips manual-upload records when listing feeds to fetch', async () => {
    const t = convexTest(schema, modules);
    const fx = await seedUnit(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(fx.unitId, { icalImports: [{ url: 'upload:Airbnb', label: 'Airbnb', lastStatus: 'manual:1:0:0:0' }] });
    });
    const targets = await t.query((await import('./_generated/api')).internal.icalImport.listImportTargets, {});
    expect(targets).toEqual([]);
  });
});
