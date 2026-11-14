import { ConvexError, v } from 'convex/values';
import { action, internalAction, internalMutation, internalQuery, mutation, query } from './_generated/server';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { ActionCtx, MutationCtx } from './_generated/server';
import { parseIcs } from '../shared/ical';
import type { FunctionArgs } from 'convex/server';
import { markPropertyDirtyInline } from './channel/ari';
import { deliverAlerts } from './icalAlerts';
import { requireMutationPropertyCapability, requirePropertyCapability } from './staff';

export const authorizeManualImport = mutation({
  args: { propertyId: v.id('properties'), unitId: v.id('units') },
  handler: async (ctx, args) => {
    if (process.env.DEMO_MODE !== 'true') {
      await requireMutationPropertyCapability(ctx, args.propertyId, 'booking.write', 'ical.manual_import');
    }
    const unit = await ctx.db.get(args.unitId);
    if (!unit || unit.propertyId !== args.propertyId) throw new ConvexError('UNIT_NOT_FOUND');
    return { authorized: true };
  },
});

export const uploadManualIcs = action({
  args: {
    propertyId: v.id('properties'),
    unitId: v.id('units'),
    source: v.union(v.literal('Airbnb'), v.literal('Booking.com')),
    icsText: v.string(),
  },
  handler: async (ctx, args): Promise<{ inserted: number; updated: number; removed: number; conflicts: number; warnings: string[]; importedAt: number }> => {
    await ctx.runMutation(api.icalImport.authorizeManualImport, { propertyId: args.propertyId, unitId: args.unitId });
    if (args.icsText.length > 1_000_000 || !args.icsText.includes('BEGIN:VCALENDAR')) {
      throw new ConvexError({ code: 'INVALID_ICAL', message: 'Tệp iCal không hợp lệ hoặc vượt quá 1 MB.' });
    }
    const parsed = parseIcs(args.icsText);
    if (parsed.events.length === 0 && parsed.warnings.length > 0) {
      throw new ConvexError({ code: 'INVALID_ICAL', message: parsed.warnings[0] });
    }
    const result = await ctx.runMutation(internal.icalImport.applyUnitImport, {
      unitId: args.unitId,
      label: args.source,
      events: parsed.events,
    });
    const importedAt = Date.now();
    await ctx.runMutation(internal.icalImport.recordManualImport, {
      unitId: args.unitId,
      source: args.source,
      importedAt,
      summary: `manual:${result.inserted}:${result.updated}:${result.removed}:${result.conflicts}`,
    });
    await recordRunAndAlert(ctx, {
      propertyId: args.propertyId,
      unitId: args.unitId,
      label: args.source,
      trigger: 'manual',
      ok: true,
      inserted: result.inserted,
      updated: result.updated,
      removed: result.removed,
      conflicts: result.conflicts,
      newConflictBookingIds: result.newConflictBookingIds,
    });
    const { newConflictBookingIds: _ids, ...counts } = result;
    return { ...counts, warnings: parsed.warnings, importedAt };
  },
});

export const recordManualImport = internalMutation({
  args: { unitId: v.id('units'), source: v.string(), importedAt: v.number(), summary: v.string() },
  handler: async (ctx, args) => {
    const unit = await ctx.db.get(args.unitId);
    if (!unit) return;
    const url = `upload:${args.source}`;
    const other = unit.icalImports.filter((item) => item.url !== url);
    await ctx.db.patch(unit._id, {
      icalImports: [...other, { url, label: args.source, lastSyncedAt: args.importedAt, lastStatus: args.summary }],
    });
  },
});

/**
 * iCal calendar IMPORT (M1, builder E) — pulls external calendars (a direct
 * Airbnb listing, a legacy-PMS bridge) into unitNights so external bookings
 * block availability here. The export side already ships (convex/ical.ts).
 *
 * syncAll (30-min cron):
 *  1. runQuery internal.icalImport.listImportTargets — every active unit with
 *     icalImports[] entries (builder E adds that internal query here).
 *  2. For each (unit, import): fetch the .ics (10s timeout), parseIcs, then
 *     runMutation applyUnitImport with the parsed events.
 *  3. Per-import isolation: one failing feed must not stop the rest. Record
 *     lastSyncedAt/lastStatus on the unit's icalImports entry either way.
 *
 * applyUnitImport (one serializable mutation per unit+feed) — reconciles
 * external events for ONE feed label against bookings rows:
 *  - Upsert by (unitId, externalUid) via the by_unit_externalUid index:
 *    new UID → insert bookings row {status: 'external', source:
 *    'ical:<label>', externalUid, no guestId} + its unitNights (kind
 *    'external'); changed dates → delete+rewrite that booking's unitNights;
 *    UID gone from the feed → cancel the external booking + delete its
 *    nights.
 *  - CONFLICT RULE (binding): external events NEVER displace internal
 *    bookings. If an external event's nights overlap non-external unitNights,
 *    keep our booking authoritative, insert the external rows only for free
 *    nights, and set syncConflict=true on the external booking. Staff resolve
 *    on the tape. Never auto-cancel an internal booking.
 *  - Loop prevention: our own export never re-exports kind 'external' rows,
 *    so a feed cycle can't amplify.
 */

const FETCH_TIMEOUT_MS = 10_000;
const MAX_ICS_BYTES = 1_000_000;

function validateFeedUrl(rawUrl: string): string {
  const value = rawUrl.trim();
  if (value.startsWith('/mock-ical/') && value.endsWith('.ics')) return value;
  if (value.length > 2_048) throw new ConvexError('ICAL_URL_TOO_LONG');
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ConvexError('ICAL_URL_INVALID');
  }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new ConvexError('ICAL_URL_INVALID');
  }
  return parsed.toString();
}

const BUILTIN_MOCK_ICS: Record<string, string> = {
  '/mock-ical/airbnb-phong-a.ics': [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Airbnb Inc//Hosting Calendar 0.8.8//EN',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20260920',
    'DTEND;VALUE=DATE:20260923',
    'UID:airbnb-phong-a-20260920@airbnb.com',
    'SUMMARY:Airbnb - Nguyen Minh Tuan (20-23/09)',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n'),
  '/mock-ical/booking-phong-a.ics': [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Booking.com//iCal Export 1.0//EN',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20260922',
    'DTEND;VALUE=DATE:20260924',
    'UID:booking-phong-a-20260922@booking.com',
    'SUMMARY:Booking.com - Tran Thu Ha (22-24/09)',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n'),
  '/mock-ical/booking-boundary-phong-a.ics': [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Booking.com//iCal Export 1.0//EN',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20260923',
    'DTEND;VALUE=DATE:20260925',
    'UID:booking-phong-a-boundary-20260923@booking.com',
    'SUMMARY:Booking.com - Le Hoang Nam (23-25/09 Check-in=Check-out)',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n'),
  '/mock-ical/booking-exact-phong-a.ics': [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Booking.com//iCal Export 1.0//EN',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20260920',
    'DTEND;VALUE=DATE:20260923',
    'UID:booking-phong-a-exact-20260920@booking.com',
    'SUMMARY:Booking.com - Pham Minh Duc (20-23/09 Exact Overlap)',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n'),
  '/mock-ical/booking-safe-phong-a.ics': [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Booking.com//iCal Export 1.0//EN',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20260925',
    'DTEND;VALUE=DATE:20260928',
    'UID:booking-phong-a-safe-20260925@booking.com',
    'SUMMARY:Booking.com - Vo Thi Mai (25-28/09 No Overlap)',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n'),
};

async function fetchIcsFeedText(rawUrl: string): Promise<string> {
  if (rawUrl.startsWith('/')) {
    const baseCandidates = [
      process.env.SITE_URL,
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
    ].filter(( candidate ): candidate is string => Boolean(candidate));
    for (const base of [...new Set(baseCandidates)]) {
      try {
        const res = await fetch(`${base.replace(/\/$/, '')}${rawUrl}`, {
          signal: AbortSignal.timeout(2_500),
        });
        if (res.ok) {
          const text = await res.text();
          if (text.length > MAX_ICS_BYTES) throw new Error('iCal feed exceeds 1 MB limit');
          if (text.includes('BEGIN:VCALENDAR') || text.includes('BEGIN:VEVENT')) {
            return text;
          }
        }
      } catch {
        // Try next candidate or fallback to built-in mock ICS
      }
    }
    if (BUILTIN_MOCK_ICS[rawUrl]) {
      return BUILTIN_MOCK_ICS[rawUrl];
    }
    throw new Error(`Mock iCal feed not found: ${rawUrl}`);
  }

  const res = await fetch(rawUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const text = await res.text();
  if (text.length > MAX_ICS_BYTES) throw new Error('iCal feed exceeds 1 MB limit');
  return text;
}

export const syncAll = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const targets: Array<{
      unitId: Id<'units'>;
      propertyId: Id<'properties'>;
      imports: Array<{ url: string; label: string }>;
    }> = await ctx.runQuery(internal.icalImport.listImportTargets, {});

    for (const target of targets) {
      for (const imp of target.imports) {
        await syncOneFeed(ctx, { ...target, url: imp.url, label: imp.label, trigger: 'cron' });
      }
    }
  },
});

async function recordRunAndAlert(ctx: ActionCtx, run: FunctionArgs<typeof internal.icalAlerts.recordRun>) {
  const outbox = await ctx.runMutation(internal.icalAlerts.recordRun, run);
  await deliverAlerts(ctx, run.propertyId, outbox);
}

type FeedSyncResult =
  | { ok: true; inserted: number; updated: number; removed: number; conflicts: number }
  | { ok: false; error: string };

/**
 * Fetch → parse → reconcile one feed, record its status on the unit, append a
 * sync-history row and raise staff alerts. Never throws: one bad feed must not
 * stop the rest.
 */
async function syncOneFeed(
  ctx: ActionCtx,
  feed: { unitId: Id<'units'>; propertyId: Id<'properties'>; url: string; label: string; trigger: 'manual' | 'cron' },
): Promise<FeedSyncResult> {
  try {
    const icsText = await fetchIcsFeedText(feed.url);
    const { events, warnings } = parseIcs(icsText);
    const result = await ctx.runMutation(internal.icalImport.applyUnitImport, {
      unitId: feed.unitId,
      label: feed.label,
      events,
    });
    const warningSuffix = warnings.length > 0 ? `; ${warnings.length} warning(s)` : '';
    await ctx.runMutation(internal.icalImport.updateImportStatus, {
      unitId: feed.unitId,
      url: feed.url,
      lastSyncedAt: Date.now(),
      lastStatus: `ok: ${events.length} events (inserted ${result.inserted}, updated ${result.updated}, removed ${result.removed}, conflicts ${result.conflicts})${warningSuffix}`,
    });
    await recordRunAndAlert(ctx, {
      propertyId: feed.propertyId,
      unitId: feed.unitId,
      label: feed.label,
      trigger: feed.trigger,
      ok: true,
      inserted: result.inserted,
      updated: result.updated,
      removed: result.removed,
      conflicts: result.conflicts,
      newConflictBookingIds: result.newConflictBookingIds,
    });
    return { ok: true, inserted: result.inserted, updated: result.updated, removed: result.removed, conflicts: result.conflicts };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await ctx.runMutation(internal.icalImport.updateImportStatus, {
      unitId: feed.unitId,
      url: feed.url,
      lastSyncedAt: Date.now(),
      lastStatus: `error: ${message}`,
    });
    await recordRunAndAlert(ctx, {
      propertyId: feed.propertyId,
      unitId: feed.unitId,
      label: feed.label,
      trigger: feed.trigger,
      ok: false,
      error: message,
      inserted: 0,
      updated: 0,
      removed: 0,
      conflicts: 0,
      newConflictBookingIds: [],
    });
    return { ok: false, error: message };
  }
}

async function assertCanSync(ctx: ActionCtx, propertyId: Id<'properties'>) {
  // Sync changes bookings and sellable inventory. Keep the classroom demo
  // frictionless, but require property-scoped staff access everywhere else.
  if (process.env.DEMO_MODE !== 'true') {
    const access = await ctx.runQuery(api.staff.propertyContext, { propertyId });
    if (!access.capabilities.includes('booking.write')) {
      throw new ConvexError('CAPABILITY_DENIED');
    }
  }
}

/** "Đồng bộ ngay" for one unit + feed label. */
export const syncFeedNow = action({
  args: { propertyId: v.id('properties'), unitId: v.id('units'), label: v.string() },
  handler: async (ctx, args): Promise<FeedSyncResult & { syncedAt: number }> => {
    await assertCanSync(ctx, args.propertyId);
    const targets: Array<{ unitId: Id<'units'>; propertyId: Id<'properties'>; imports: Array<{ url: string; label: string }> }> =
      await ctx.runQuery(internal.icalImport.listImportTargets, {});
    const target = targets.find((t) => t.unitId === args.unitId && t.propertyId === args.propertyId);
    const feed = target?.imports.find((imp) => imp.label === args.label);
    if (!target || !feed) throw new ConvexError({ code: 'FEED_NOT_CONFIGURED', message: 'Phòng này chưa có link iCal cho nguồn đã chọn.' });
    const result = await syncOneFeed(ctx, { ...target, url: feed.url, label: feed.label, trigger: 'manual' });
    return { ...result, syncedAt: Date.now() };
  },
});

/**
 * Staff/demo action triggered by clicking "Đồng bộ ngay" in the Admin UI.
 * Syncs all units with iCal feeds (optionally filtered to one property) and
 * returns a summary of inserted/updated/removed/conflicting events.
 */
export const syncNow = action({
  args: {
    propertyId: v.id('properties'),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    syncedUnits: number;
    feedsSynced: number;
    failedFeeds: number;
    inserted: number;
    updated: number;
    removed: number;
    conflicts: number;
    syncedAt: number;
  }> => {
    await assertCanSync(ctx, args.propertyId);
    const allTargets: Array<{
      unitId: Id<'units'>;
      propertyId: Id<'properties'>;
      imports: Array<{ url: string; label: string }>;
    }> = await ctx.runQuery(internal.icalImport.listImportTargets, {});

    const targets = allTargets.filter((t) => t.propertyId === args.propertyId);

    let feedsSynced = 0;
    let failedFeeds = 0;
    let inserted = 0;
    let updated = 0;
    let removed = 0;
    let conflicts = 0;

    for (const target of targets) {
      for (const imp of target.imports) {
        const result = await syncOneFeed(ctx, { ...target, url: imp.url, label: imp.label, trigger: 'manual' });
        if (!result.ok) {
          failedFeeds += 1;
          continue;
        }
        feedsSynced += 1;
        inserted += result.inserted;
        updated += result.updated;
        removed += result.removed;
        conflicts += result.conflicts;
      }
    }

    return {
      syncedUnits: targets.length,
      feedsSynced,
      failedFeeds,
      inserted,
      updated,
      removed,
      conflicts,
      syncedAt: Date.now(),
    };
  },
});

/** Every active unit with at least one icalImports entry. (builder E) */
export const listImportTargets = internalQuery({
  args: {},
  handler: async (ctx) => {
    const units = await ctx.db.query('units').collect();
    // 'upload:<source>' entries only record manual file imports; there is
    // nothing to fetch for them.
    return units
      .map((u) => ({
        unitId: u._id,
        propertyId: u.propertyId,
        status: u.status,
        imports: u.icalImports.filter((i) => !i.url.startsWith('upload:')).map((i) => ({ url: i.url, label: i.label })),
      }))
      .filter((u) => u.status !== 'offline' && u.imports.length > 0)
      .map(({ status: _status, ...target }) => target);
  },
});

/** Patch the matching icalImports[] entry (by url) with the latest sync outcome. (builder E) */
export const updateImportStatus = internalMutation({
  args: {
    unitId: v.id('units'),
    url: v.string(),
    lastSyncedAt: v.number(),
    lastStatus: v.string(),
  },
  handler: async (ctx, args) => {
    const unit = await ctx.db.get(args.unitId);
    if (!unit) return;
    const icalImports = unit.icalImports.map((imp) =>
      imp.url === args.url ? { ...imp, lastSyncedAt: args.lastSyncedAt, lastStatus: args.lastStatus } : imp,
    );
    await ctx.db.patch(args.unitId, { icalImports });
  },
});

export const applyUnitImport = internalMutation({
  args: {
    unitId: v.id('units'),
    label: v.string(),
    events: v.array(
      v.object({
        uid: v.string(),
        startDate: v.string(),
        endDate: v.string(), // exclusive
        summary: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args): Promise<{ inserted: number; updated: number; removed: number; conflicts: number; newConflictBookingIds: Id<'bookings'>[] }> => {
    // Defense in depth: listImportTargets only lists live units, but a unit
    // could vanish between the query and this mutation running. Nothing sane
    // to reconcile against without propertyId/unitTypeId — no-op, don't throw.
    const unit = await ctx.db.get(args.unitId);
    if (!unit) {
      return { inserted: 0, updated: 0, removed: 0, conflicts: 0, newConflictBookingIds: [] };
    }
    // Bookings this run newly flagged as double-booked (drives staff alerts).
    const newConflictBookingIds: Id<'bookings'>[] = [];

    const source = `ical:${args.label}`;
    let inserted = 0;
    let updated = 0;
    let removed = 0;
    let conflicts = 0;

    // Existing external bookings for this unit+label. There's no dedicated
    // index for (unitId, source) — cardinality of bookings per unit is low
    // (hundreds at most) and by_unit_checkIn already scopes to the unit, so a
    // single indexed range read + in-memory filter is fine here.
    const unitBookings = await ctx.db
      .query('bookings')
      .withIndex('by_unit_checkIn', (q) => q.eq('unitId', args.unitId))
      .collect();
    const propertyBookings = await ctx.db
      .query('bookings')
      .withIndex('by_property_checkIn', (q) => q.eq('propertyId', unit.propertyId))
      .collect();
    const existingByUid = new Map<string, Doc<'bookings'>>();
    const manuallyResolvedUids = new Set<string>();
    for (const booking of unitBookings) {
      if (booking.status === 'external' && booking.source === source && booking.externalUid) {
        existingByUid.set(booking.externalUid, booking);
      }
    }
    for (const booking of propertyBookings) {
      if (
        booking.source === source &&
        booking.externalUid &&
        booking.notes.some((n) => n.text.includes('Xử lý Double Booking')) &&
        (booking.unitId !== unit._id || booking.status === 'cancelled')
      ) {
        manuallyResolvedUids.add(booking.externalUid);
      }
    }

    const seenUids = new Set<string>();
    const now = Date.now();
    // Track whether ANY unitNights row was inserted/deleted this invocation.
    // Note: the syncConflict re-evaluation branch below rewrites nights without
    // bumping `updated`, so we can't rely on the counters alone to decide
    // whether to mark the property dirty.
    let nightsChanged = false;

    for (const event of args.events) {
      seenUids.add(event.uid);
      if (manuallyResolvedUids.has(event.uid)) {
        continue;
      }
      const existing = existingByUid.get(event.uid);

      if (!existing) {
        const { conflict, bookingId } = await insertExternalBooking(ctx, unit, source, event, now);
        inserted += 1;
        nightsChanged = true;
        if (conflict) {
          conflicts += 1;
          newConflictBookingIds.push(bookingId);
        }
        continue;
      }

      // Date change → rewrite this booking's unitNights under the same
      // conflict rule; otherwise leave it untouched (no-op re-sync).
      if (existing.checkIn !== event.startDate || existing.checkOut !== event.endDate) {
        const conflict = await rewriteExternalNights(ctx, existing, event, now);
        updated += 1;
        nightsChanged = true;
        if (conflict) {
          conflicts += 1;
          if (!existing.syncConflict) newConflictBookingIds.push(existing._id);
        }
      } else if (existing.syncConflict) {
        // Dates unchanged but still flagged — re-evaluate in case the
        // internal booking that caused the conflict has since freed up.
        const conflict = await rewriteExternalNights(ctx, existing, event, now);
        nightsChanged = true;
        if (conflict) conflicts += 1;
      }
    }

    // UIDs that vanished from the feed → cancel + free nights.
    for (const [uid, booking] of existingByUid) {
      if (seenUids.has(uid)) continue;
      await deleteNightsForBooking(ctx, booking._id);
      await ctx.db.patch(booking._id, {
        status: 'cancelled',
        statusHistory: [...booking.statusHistory, { status: 'cancelled', ts: now }],
        updatedAt: now,
      });
      removed += 1;
      nightsChanged = true;
    }

    // If this feed changed occupancy for the unit (a new external booking, a
    // date rewrite, a conflict re-evaluation, or a cancellation freed/blocked
    // nights), mark the unit's property dirty so the 1-min 'channex ari flush'
    // cron pushes the corrected count to OTAs. Without this, an iCal-imported
    // Airbnb booking (occupancy UP) leaves Channex advertising the pre-import
    // HIGHER count until the nightly full resync (~24h) — a cross-channel
    // oversell window. No-op unless the property has an enabled channelSync row
    // (unconnected deployments and tests stay clean). Once per property per
    // invocation (idempotent anyway).
    if (nightsChanged) {
      await markPropertyDirtyInline(ctx, unit.propertyId);
    }

    return { inserted, updated, removed, conflicts, newConflictBookingIds };
  },
});

/**
 * Nights on this unit currently blocked by ANY existing booking (internal or
 * external). Including external nights here ensures that two overlapping iCal
 * feeds (e.g., Airbnb 20-23/09 and Booking.com 22-24/09 on the same unit)
 * are detected as a Double Booking conflict (`syncConflict = true`) while
 * keeping the first-imported nights authoritative and still recording both
 * booking rows in the database.
 */
async function internalBlockedNights(ctx: MutationCtx, unitId: Id<'units'>): Promise<Set<string>> {
  const nights = await ctx.db
    .query('unitNights')
    .withIndex('by_unit_date', (q) => q.eq('unitId', unitId))
    .collect();
  const blocked = new Set<string>();
  for (const night of nights) {
    blocked.add(night.date);
  }
  return blocked;
}

/** All ISO dates in [startDate, endDate). */
function nightsInRange(startDate: string, endDate: string): string[] {
  const nights: string[] = [];
  for (let d = startDate; d < endDate; d = addOneDay(d)) nights.push(d);
  return nights;
}

function addOneDay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

async function deleteNightsForBooking(ctx: MutationCtx, bookingId: Id<'bookings'>): Promise<void> {
  const rows = await ctx.db
    .query('unitNights')
    .withIndex('by_booking', (q) => q.eq('bookingId', bookingId))
    .collect();
  for (const row of rows) await ctx.db.delete(row._id);
}

/**
 * Insert a new external booking + its unitNights, honoring the conflict rule:
 * only free (non-internal-blocked) nights get an external unitNights row;
 * any overlap sets syncConflict=true but the booking row still covers the
 * full imported range (so date-change detection above stays correct).
 */
async function insertExternalBooking(
  ctx: MutationCtx,
  unit: Doc<'units'>,
  source: string,
  event: { uid: string; startDate: string; endDate: string; summary?: string },
  now: number,
): Promise<{ conflict: boolean; bookingId: Id<'bookings'> }> {
  const unitId = unit._id;
  const blockedByInternal = await internalBlockedNights(ctx, unitId);

  const allNights = nightsInRange(event.startDate, event.endDate);
  const freeNights = allNights.filter((n) => !blockedByInternal.has(n));
  const conflict = freeNights.length < allNights.length;

  const bookingId = await ctx.db.insert('bookings', {
    propertyId: unit.propertyId,
    unitId,
    unitTypeId: unit.unitTypeId,
    guestId: undefined,
    ratePlanId: undefined,
    checkIn: event.startDate,
    checkOut: event.endDate,
    nights: allNights.length,
    adults: 0,
    children: 0,
    status: 'external',
    source,
    externalUid: event.uid,
    syncConflict: conflict,
    confirmationCode: `EXT-${externalCode(event.uid)}`,
    statusHistory: [{ status: 'external', ts: now }],
    notes: event.summary ? [{ ts: now, text: event.summary, by: source }] : [],
    createdAt: now,
    updatedAt: now,
  });

  for (const date of freeNights) {
    await ctx.db.insert('unitNights', { unitId, date, bookingId, kind: 'external' });
  }

  return { conflict, bookingId };
}

/** Rewrite an existing external booking's dates + unitNights under the same conflict rule. */
async function rewriteExternalNights(
  ctx: MutationCtx,
  booking: Doc<'bookings'>,
  event: { uid: string; startDate: string; endDate: string; summary?: string },
  now: number,
): Promise<boolean> {
  await deleteNightsForBooking(ctx, booking._id);

  // Exclude this booking's own (about-to-be-rewritten) nights from the
  // "internal blocked" set — they were already deleted above, so a fresh
  // read is correct without extra bookkeeping.
  const blockedByInternal = await internalBlockedNights(ctx, booking.unitId);

  const allNights = nightsInRange(event.startDate, event.endDate);
  const freeNights = allNights.filter((n) => !blockedByInternal.has(n));
  const conflict = freeNights.length < allNights.length;

  for (const date of freeNights) {
    await ctx.db.insert('unitNights', { unitId: booking.unitId, date, bookingId: booking._id, kind: 'external' });
  }

  await ctx.db.patch(booking._id, {
    checkIn: event.startDate,
    checkOut: event.endDate,
    nights: allNights.length,
    syncConflict: conflict,
    syncConflictAcknowledgedAt: undefined,
    updatedAt: now,
  });

  return conflict;
}

/** Short, stable, human-glanceable suffix for an external confirmation code. */
function externalCode(uid: string): string {
  const cleaned = uid.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return (cleaned.slice(0, 8) || 'UNKNOWN').padEnd(6, '0');
}

/**
 * Re-evaluates all remaining external bookings on a unit after a conflicting
 * booking has been moved or cancelled, healing their unitNights and clearing
 * syncConflict when the overlap no longer exists.
 */
async function healExternalBookingsOnUnit(ctx: MutationCtx, unitId: Id<'units'>, now: number): Promise<void> {
  const bookings = await ctx.db
    .query('bookings')
    .withIndex('by_unit_checkIn', (q) => q.eq('unitId', unitId))
    .collect();
  const externals = bookings.filter((b) => b.status === 'external');
  for (const ext of externals) {
    await rewriteExternalNights(
      ctx,
      ext,
      {
        uid: ext.externalUid ?? ext.confirmationCode,
        startDate: ext.checkIn,
        endDate: ext.checkOut,
      },
      now,
    );
  }
}

/**
 * Dashboard query for Admin iCal Sync & Double Booking Conflict Alert Center.
 * Returns all units with their iCal feed configurations, sync statuses, and
 * active Double Booking conflicts (both iCal-vs-iCal and iCal-vs-Internal).
 */
export const dashboardForProperty = query({
  args: {
    propertyId: v.optional(v.id('properties')),
  },
  handler: async (ctx, args) => {
    let property: Doc<'properties'> | null = null;
    if (args.propertyId) {
      property = await ctx.db.get(args.propertyId);
    } else {
      const song = await ctx.db
        .query('properties')
        .withIndex('by_slug', (q) => q.eq('slug', 'song-homestay'))
        .first();
      property = song ?? (await ctx.db.query('properties').first());
    }
    if (!property) return null;

    if (process.env.DEMO_MODE !== 'true') {
      await requirePropertyCapability(ctx, property._id, 'booking.read');
    }

    const units = await ctx.db
      .query('units')
      .withIndex('by_property', (q) => q.eq('propertyId', property._id))
      .collect();
    units.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

    const allBookings = await ctx.db
      .query('bookings')
      .withIndex('by_property_checkIn', (q) => q.eq('propertyId', property._id))
      .collect();
    const activeStatuses = new Set(['hold', 'pending', 'confirmed', 'checked_in', 'external']);
    const activeBookings = allBookings.filter((b) => activeStatuses.has(b.status));

    const guestsById = new Map<Id<'guests'>, Doc<'guests'>>();
    for (const b of activeBookings) {
      if (b.guestId && !guestsById.has(b.guestId)) {
        const g = await ctx.db.get(b.guestId);
        if (g) guestsById.set(b.guestId, g);
      }
    }

    const nightsByUnit = new Map<Id<'units'>, Set<string>>();
    for (const u of units) {
      const unitNights = await ctx.db
        .query('unitNights')
        .withIndex('by_unit_date', (q) => q.eq('unitId', u._id))
        .collect();
      nightsByUnit.set(u._id, new Set(unitNights.map((n) => n.date)));
    }

    function resolveGuestName(b: Doc<'bookings'>): string {
      if (b.guestId) {
        const g = guestsById.get(b.guestId);
        if (g?.name) return g.name;
      }
      if (b.notes.length > 0 && b.notes[0].text) {
        return b.notes[0].text;
      }
      return b.status === 'external' ? `Khách ${b.source.replace('ical:', '')}` : 'Khách đặt phòng';
    }

    function availableUnitsForRange(excludeUnitId: Id<'units'>, checkIn: string, checkOut: string) {
      const rangeNights = nightsInRange(checkIn, checkOut);
      return units
        .filter((u) => u.status === 'active' && u._id !== excludeUnitId)
        .filter((u) => {
          const occupied = nightsByUnit.get(u._id) ?? new Set<string>();
          return rangeNights.every((d) => !occupied.has(d));
        })
        .map((u) => ({ unitId: u._id, name: u.name, slug: u.slug }));
    }

    const conflicts: Array<{
      conflictId: string;
      unitId: Id<'units'>;
      unitName: string;
      unitSlug: string;
      overlapStart: string;
      overlapEnd: string;
      overlapNights: string[];
      bookingA: {
        bookingId: Id<'bookings'>;
        confirmationCode: string;
        source: string;
        status: string;
        checkIn: string;
        checkOut: string;
        nights: number;
        guestName: string;
        syncConflict: boolean;
        totalCents?: number;
        notes: Array<{ ts: number; text: string; by: string }>;
      };
      bookingB: {
        bookingId: Id<'bookings'>;
        confirmationCode: string;
        source: string;
        status: string;
        checkIn: string;
        checkOut: string;
        nights: number;
        guestName: string;
        syncConflict: boolean;
        totalCents?: number;
        notes: Array<{ ts: number; text: string; by: string }>;
      };
      availableUnitsForA: Array<{ unitId: Id<'units'>; name: string; slug: string }>;
      availableUnitsForB: Array<{ unitId: Id<'units'>; name: string; slug: string }>;
    }> = [];

    for (const unit of units) {
      const unitActive = activeBookings
        .filter((b) => b.unitId === unit._id)
        .sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.createdAt - b.createdAt);

      for (let i = 0; i < unitActive.length; i += 1) {
        for (let j = i + 1; j < unitActive.length; j += 1) {
          const b1 = unitActive[i];
          const b2 = unitActive[j];
          // Half-open [checkIn, checkOut) overlap check:
          // If b1.checkOut === b2.checkIn (e.g. 23/09 checkout and 23/09 check-in),
          // b2.checkIn < b1.checkOut is FALSE -> no conflict!
          if (
            b1.checkIn < b2.checkOut &&
            b2.checkIn < b1.checkOut &&
            !b1.syncConflictAcknowledgedAt &&
            !b2.syncConflictAcknowledgedAt
          ) {
            const overlapStart = b1.checkIn > b2.checkIn ? b1.checkIn : b2.checkIn;
            const overlapEnd = b1.checkOut < b2.checkOut ? b1.checkOut : b2.checkOut;
            const overlapNights = nightsInRange(overlapStart, overlapEnd);
            conflicts.push({
              conflictId: `${b1._id}:${b2._id}`,
              unitId: unit._id,
              unitName: unit.name,
              unitSlug: unit.slug,
              overlapStart,
              overlapEnd,
              overlapNights,
              bookingA: {
                bookingId: b1._id,
                confirmationCode: b1.confirmationCode,
                source: b1.source,
                status: b1.status,
                checkIn: b1.checkIn,
                checkOut: b1.checkOut,
                nights: b1.nights,
                guestName: resolveGuestName(b1),
                syncConflict: Boolean(b1.syncConflict),
                totalCents: b1.priceBreakdown?.totalCents,
                notes: b1.notes,
              },
              bookingB: {
                bookingId: b2._id,
                confirmationCode: b2.confirmationCode,
                source: b2.source,
                status: b2.status,
                checkIn: b2.checkIn,
                checkOut: b2.checkOut,
                nights: b2.nights,
                guestName: resolveGuestName(b2),
                syncConflict: Boolean(b2.syncConflict),
                totalCents: b2.priceBreakdown?.totalCents,
                notes: b2.notes,
              },
              availableUnitsForA: availableUnitsForRange(unit._id, b1.checkIn, b1.checkOut),
              availableUnitsForB: availableUnitsForRange(unit._id, b2.checkIn, b2.checkOut),
            });
          }
        }
      }
    }

    return {
      property: {
        propertyId: property._id,
        name: property.name,
        slug: property.slug,
        currency: property.currency,
      },
      units: units.map((u) => ({
        unitId: u._id,
        name: u.name,
        slug: u.slug,
        status: u.status,
        icalExportToken: u.icalExportToken,
        icalImports: u.icalImports,
      })),
      externalBookings: activeBookings
        .filter((b) => b.status === 'external')
        .map((b) => ({
          bookingId: b._id,
          unitId: b.unitId,
          unitName: units.find((u) => u._id === b.unitId)?.name ?? 'Phòng',
          confirmationCode: b.confirmationCode,
          source: b.source,
          checkIn: b.checkIn,
          checkOut: b.checkOut,
          nights: b.nights,
          syncConflict: Boolean(b.syncConflict),
          guestName: resolveGuestName(b),
        })),
      conflicts,
    };
  },
});

/**
 * Configure iCal import feeds on a unit (Admin Settings / Command Center).
 */
export const configureUnitFeeds = mutation({
  args: {
    unitId: v.id('units'),
    imports: v.array(
      v.object({
        label: v.string(),
        url: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const unit = await ctx.db.get(args.unitId);
    if (!unit) throw new ConvexError('UNIT_NOT_FOUND');
    if (process.env.DEMO_MODE !== 'true') {
      await requireMutationPropertyCapability(ctx, unit.propertyId, 'property.configure', 'ical.configure');
    }

    const sanitized = args.imports
      .map((imp) => ({ label: imp.label.trim().slice(0, 80), url: validateFeedUrl(imp.url) }))
      .filter((imp) => imp.label.length > 0 && imp.url.length > 0)
      .map((imp) => {
        const existing = unit.icalImports.find((e) => e.url === imp.url && e.label === imp.label);
        return {
          label: imp.label,
          url: imp.url,
          lastSyncedAt: existing?.lastSyncedAt,
          lastStatus: existing?.lastStatus,
        };
      });

    await ctx.db.patch(args.unitId, { icalImports: sanitized });
    return { updated: true, count: sanitized.length };
  },
});

/**
 * One-click preset loader for Sóng Homestay iCal Demo Scenarios on a unit:
 * - 'conflict_partial': Airbnb (20-23/09) + Booking.com (22-24/09) -> Double Booking on 22-23/09
 * - 'conflict_exact': Airbnb (20-23/09) + Booking.com (20-23/09) -> Exact Double Booking on 20-23/09
 * - 'boundary_safe': Airbnb (20-23/09) + Booking.com (23-25/09) -> Check-out = Check-in (23/09), NO conflict
 * - 'no_overlap': Airbnb (20-23/09) + Booking.com (25-28/09) -> Disjoint dates, NO conflict
 */
export const applyDemoScenario = mutation({
  args: {
    unitId: v.id('units'),
    scenario: v.union(
      v.literal('conflict_partial'),
      v.literal('conflict_exact'),
      v.literal('boundary_safe'),
      v.literal('no_overlap'),
    ),
  },
  handler: async (ctx, args) => {
    const unit = await ctx.db.get(args.unitId);
    if (!unit) throw new ConvexError('UNIT_NOT_FOUND');
    if (process.env.DEMO_MODE !== 'true') {
      await requireMutationPropertyCapability(ctx, unit.propertyId, 'booking.write', 'ical.demo_scenario');
    }

    // Clear existing external bookings across the property that came from the demo feeds
    // so re-running the scenario starts from a clean slate.
    const propBookings = await ctx.db
      .query('bookings')
      .withIndex('by_property_checkIn', (q) => q.eq('propertyId', unit.propertyId))
      .collect();
    for (const b of propBookings) {
      if (b.status === 'external' && (b.unitId === unit._id || b.externalUid?.includes('phong-a'))) {
        await deleteNightsForBooking(ctx, b._id);
        await ctx.db.delete(b._id);
      }
    }

    const bookingUrlByScenario: Record<typeof args.scenario, string> = {
      conflict_partial: '/mock-ical/booking-phong-a.ics',
      conflict_exact: '/mock-ical/booking-exact-phong-a.ics',
      boundary_safe: '/mock-ical/booking-boundary-phong-a.ics',
      no_overlap: '/mock-ical/booking-safe-phong-a.ics',
    };

    const nextImports = [
      { label: 'Airbnb', url: '/mock-ical/airbnb-phong-a.ics' },
      { label: 'Booking.com', url: bookingUrlByScenario[args.scenario] },
    ];

    await ctx.db.patch(unit._id, { icalImports: nextImports });
    return { configured: true, scenario: args.scenario, imports: nextImports };
  },
});

/**
 * Resolve a Double Booking conflict from the Admin dashboard:
 * - 'move_unit': Move the selected booking to another available unit while preserving
 *   its original price (BRULE06 / US13), and heal the remaining booking on the original unit.
 * - 'cancel_booking': Cancel the selected booking, free its nights, and heal the remaining booking.
 * - 'acknowledge': Record the staff resolution note and clear the syncConflict warning flag.
 */
export const resolveConflict = mutation({
  args: {
    bookingId: v.id('bookings'),
    resolutionType: v.union(v.literal('move_unit'), v.literal('cancel_booking'), v.literal('acknowledge')),
    targetUnitId: v.optional(v.id('units')),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new ConvexError('BOOKING_NOT_FOUND');

    let actorName = 'Admin Sóng Homestay';
    if (process.env.DEMO_MODE !== 'true') {
      const access = await requireMutationPropertyCapability(
        ctx,
        booking.propertyId,
        'booking.write',
        'ical.resolve_conflict',
      );
      actorName = access.profile.name;
    }

    const now = Date.now();
    const originalUnitId = booking.unitId;
    const customNote = args.note?.trim();

    if (args.resolutionType === 'move_unit') {
      if (!args.targetUnitId) throw new ConvexError('TARGET_UNIT_REQUIRED');
      const targetUnit = await ctx.db.get(args.targetUnitId);
      if (!targetUnit || targetUnit.propertyId !== booking.propertyId || targetUnit.status !== 'active') {
        throw new ConvexError('INVALID_TARGET_UNIT');
      }

      const targetBlocked = await internalBlockedNights(ctx, targetUnit._id);
      const neededNights = nightsInRange(booking.checkIn, booking.checkOut);
      if (neededNights.some((d) => targetBlocked.has(d))) {
        throw new ConvexError('TARGET_UNIT_UNAVAILABLE');
      }

      await deleteNightsForBooking(ctx, booking._id);
      const kind = booking.status === 'external' ? 'external' : 'stay';
      for (const date of neededNights) {
        await ctx.db.insert('unitNights', {
          unitId: targetUnit._id,
          date,
          bookingId: booking._id,
          kind,
        });
      }

      const resolutionText = customNote
        ? `Xử lý Double Booking (Đổi sang ${targetUnit.name}, giữ nguyên giá gốc): ${customNote}`
        : `Xử lý Double Booking: Đã chuyển sang ${targetUnit.name} (giữ nguyên giá gốc theo quy định).`;

      await ctx.db.patch(booking._id, {
        unitId: targetUnit._id,
        unitTypeId: targetUnit.unitTypeId,
        syncConflict: false,
        syncConflictAcknowledgedAt: undefined,
        notes: [...booking.notes, { ts: now, text: resolutionText, by: actorName }],
        updatedAt: now,
      });

      await healExternalBookingsOnUnit(ctx, originalUnitId, now);
      await markPropertyDirtyInline(ctx, booking.propertyId);
      return { resolved: true, action: 'move_unit', targetUnitName: targetUnit.name };
    }

    if (args.resolutionType === 'cancel_booking') {
      await deleteNightsForBooking(ctx, booking._id);
      const resolutionText = customNote
        ? `Xử lý Double Booking (Hủy đơn): ${customNote}`
        : `Xử lý Double Booking: Đã hủy đơn trùng lịch.`;

      await ctx.db.patch(booking._id, {
        status: 'cancelled',
        syncConflict: false,
        syncConflictAcknowledgedAt: undefined,
        statusHistory: [...booking.statusHistory, { status: 'cancelled', ts: now }],
        notes: [...booking.notes, { ts: now, text: resolutionText, by: actorName }],
        updatedAt: now,
      });

      await healExternalBookingsOnUnit(ctx, originalUnitId, now);
      await markPropertyDirtyInline(ctx, booking.propertyId);
      return { resolved: true, action: 'cancel_booking' };
    }

    const resolutionText = customNote
      ? `Đã xử lý trên OTA: ${customNote}`
      : `Đã kiểm tra và xử lý xung đột trực tiếp trên OTA.`;

    await ctx.db.patch(booking._id, {
      syncConflict: false,
      syncConflictAcknowledgedAt: now,
      notes: [...booking.notes, { ts: now, text: resolutionText, by: actorName }],
      updatedAt: now,
    });
    return { resolved: true, action: 'acknowledge' };
  },
});
