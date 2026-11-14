import { ConvexError, v } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import type { ActionCtx, MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { requireMutationPropertyCapability, requirePropertyCapability } from './staff';

// iCal sync history + staff alerts. A feed alerts when it starts failing (and
// again if it is still failing after FAILURE_REMINDER_MS), when it recovers,
// and once for every booking a sync newly flags as a double booking.
const FAILURE_REMINDER_MS = 6 * 60 * 60 * 1000;
const RECENT_SCAN = 200;

export const DEFAULT_SYNC_SETTINGS = { alertEmails: [] as string[], randomizerEnabled: true, conflictRate: 0.35 };

export async function loadSyncSettings(ctx: QueryCtx | MutationCtx, propertyId: Id<'properties'>) {
  const row = await ctx.db
    .query('icalSyncSettings')
    .withIndex('by_property', (q) => q.eq('propertyId', propertyId))
    .unique();
  return { row, ...DEFAULT_SYNC_SETTINGS, ...(row ?? {}) };
}

async function requireRead(ctx: QueryCtx | MutationCtx, propertyId: Id<'properties'>) {
  if (process.env.DEMO_MODE !== 'true') await requirePropertyCapability(ctx, propertyId, 'booking.read');
}

async function requireMutation(ctx: MutationCtx, propertyId: Id<'properties'>, capability: 'booking.write' | 'property.configure', action: string) {
  if (process.env.DEMO_MODE !== 'true') await requireMutationPropertyCapability(ctx, propertyId, capability, action);
}

function formatTime(ts: number, timezone: string): string {
  return new Intl.DateTimeFormat('vi-VN', { timeZone: timezone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(ts));
}

type OutgoingAlert = { subject: string; body: string; to: string[] };

/** Store the alert for the in-app inbox; the caller emails what this returns. */
async function raiseAlert(
  ctx: MutationCtx,
  property: Doc<'properties'>,
  alert: { kind: Doc<'icalSyncAlerts'>['kind']; unitId?: Id<'units'>; label?: string; bookingId?: Id<'bookings'>; subject: string; body: string },
  outbox: OutgoingAlert[],
) {
  const settings = await loadSyncSettings(ctx, property._id);
  const recipients = settings.alertEmails.length ? settings.alertEmails : property.email ? [property.email] : [];
  await ctx.db.insert('icalSyncAlerts', { propertyId: property._id, ...alert, recipients, createdAt: Date.now() });
  if (recipients.length) outbox.push({ subject: alert.subject, body: alert.body, to: recipients });
}

/** Email every alert a recordRun produced (log-only under DEMO_MODE). */
export async function deliverAlerts(ctx: ActionCtx, propertyId: Id<'properties'>, outbox: OutgoingAlert[]) {
  for (const alert of outbox) {
    try {
      await ctx.runAction(internal.email.sendStaffAlert, { propertyId, ...alert });
    } catch {
      // The inbox row is already stored; a mail failure must not fail the sync.
    }
  }
}

export const recordRun = internalMutation({
  args: {
    propertyId: v.id('properties'),
    unitId: v.id('units'),
    label: v.string(),
    trigger: v.union(v.literal('manual'), v.literal('cron')),
    ok: v.boolean(),
    error: v.optional(v.string()),
    inserted: v.number(),
    updated: v.number(),
    removed: v.number(),
    conflicts: v.number(),
    newConflictBookingIds: v.array(v.id('bookings')),
  },
  handler: async (ctx, args): Promise<OutgoingAlert[]> => {
    const outbox: OutgoingAlert[] = [];
    const property = await ctx.db.get(args.propertyId);
    const unit = await ctx.db.get(args.unitId);
    if (!property || !unit) return outbox;
    const now = Date.now();
    const recentRuns = await ctx.db
      .query('icalSyncRuns')
      .withIndex('by_property_ts', (q) => q.eq('propertyId', args.propertyId))
      .order('desc')
      .take(RECENT_SCAN);
    const previous = recentRuns.find((run) => run.unitId === args.unitId && run.label === args.label);
    const footer = `\n\nThời gian: ${formatTime(now, property.timezone)}\nMở trang Đồng bộ iCal (/admin/ical) để kiểm tra và đồng bộ lại.`;

    if (!args.ok) {
      let shouldAlert = !previous || previous.ok;
      if (!shouldAlert) {
        const recentAlerts = await ctx.db
          .query('icalSyncAlerts')
          .withIndex('by_property_createdAt', (q) => q.eq('propertyId', args.propertyId))
          .order('desc')
          .take(RECENT_SCAN);
        const lastFailure = recentAlerts.find((a) => a.kind === 'sync_failed' && a.unitId === args.unitId && a.label === args.label);
        shouldAlert = !lastFailure || now - lastFailure.createdAt >= FAILURE_REMINDER_MS;
      }
      if (shouldAlert) {
        await raiseAlert(ctx, property, {
          kind: 'sync_failed',
          unitId: unit._id,
          label: args.label,
          subject: `[${property.name}] Đồng bộ iCal lỗi: ${unit.name} · ${args.label}`,
          body: `Không kéo được lịch ${args.label} của "${unit.name}".\nLỗi: ${args.error ?? 'không rõ'}\nLịch của nguồn này có thể đang lệch; booking mới trên ${args.label} sẽ chưa chặn phòng ở đây cho tới khi đồng bộ lại thành công.${footer}`,
        }, outbox);
      }
    } else if (previous && !previous.ok) {
      await raiseAlert(ctx, property, {
        kind: 'sync_recovered',
        unitId: unit._id,
        label: args.label,
        subject: `[${property.name}] Đồng bộ iCal đã khôi phục: ${unit.name} · ${args.label}`,
        body: `Lịch ${args.label} của "${unit.name}" đã đồng bộ lại thành công (mới ${args.inserted}, cập nhật ${args.updated}, hủy ${args.removed}).${footer}`,
      }, outbox);
    }

    for (const bookingId of args.newConflictBookingIds) {
      const booking = await ctx.db.get(bookingId);
      if (!booking) continue;
      const overlapping = (await ctx.db
        .query('bookings')
        .withIndex('by_unit_checkIn', (q) => q.eq('unitId', booking.unitId).lt('checkIn', booking.checkOut))
        .collect())
        .filter((other) => other._id !== booking._id && other.checkOut > booking.checkIn && !['cancelled', 'expired', 'checked_out', 'no_show'].includes(other.status))
        .map((other) => `- ${other.confirmationCode} (${other.source}, ${other.checkIn} → ${other.checkOut})`);
      await raiseAlert(ctx, property, {
        kind: 'conflict',
        unitId: unit._id,
        label: args.label,
        bookingId,
        subject: `[${property.name}] Trùng lịch: ${unit.name} ${booking.checkIn} → ${booking.checkOut} (${args.label})`,
        body: `Lịch ${args.label} vừa có đặt phòng ${booking.confirmationCode} (${booking.checkIn} → ${booking.checkOut}) chồng lên lịch đang có tại "${unit.name}":\n${overlapping.join('\n') || '- (không còn booking chồng lịch)'}\nBooking nội bộ được giữ nguyên; hãy xử lý tại trang Cảnh báo (/admin/conflicts) và cập nhật lại trên ${args.label}.${footer}`,
      }, outbox);
    }

    await ctx.db.insert('icalSyncRuns', {
      propertyId: args.propertyId,
      unitId: args.unitId,
      label: args.label,
      trigger: args.trigger,
      ok: args.ok,
      error: args.error,
      inserted: args.inserted,
      updated: args.updated,
      removed: args.removed,
      conflicts: args.conflicts,
      newConflicts: args.newConflictBookingIds.length,
      ts: now,
    });
    return outbox;
  },
});

export const inbox = query({
  args: { propertyId: v.id('properties') },
  handler: async (ctx, args) => {
    await requireRead(ctx, args.propertyId);
    const alerts = await ctx.db
      .query('icalSyncAlerts')
      .withIndex('by_property_createdAt', (q) => q.eq('propertyId', args.propertyId))
      .order('desc')
      .take(50);
    const unitNames = new Map<string, string>();
    for (const alert of alerts) {
      if (alert.unitId && !unitNames.has(String(alert.unitId))) {
        unitNames.set(String(alert.unitId), (await ctx.db.get(alert.unitId))?.name ?? '');
      }
    }
    return {
      unread: alerts.filter((a) => a.readAt === undefined).length,
      alerts: alerts.map((a) => ({ ...a, unitName: a.unitId ? unitNames.get(String(a.unitId)) ?? '' : '' })),
    };
  },
});

export const unreadCount = query({
  args: { propertyId: v.id('properties') },
  handler: async (ctx, args) => {
    if (process.env.DEMO_MODE !== 'true') {
      try {
        await requirePropertyCapability(ctx, args.propertyId, 'booking.read');
      } catch {
        return 0;
      }
    }
    const alerts = await ctx.db
      .query('icalSyncAlerts')
      .withIndex('by_property_createdAt', (q) => q.eq('propertyId', args.propertyId))
      .order('desc')
      .take(50);
    return alerts.filter((a) => a.readAt === undefined).length;
  },
});

export const listRuns = query({
  args: { propertyId: v.id('properties') },
  handler: async (ctx, args) => {
    await requireRead(ctx, args.propertyId);
    const runs = await ctx.db
      .query('icalSyncRuns')
      .withIndex('by_property_ts', (q) => q.eq('propertyId', args.propertyId))
      .order('desc')
      .take(RECENT_SCAN);
    const unitNames = new Map<string, string>();
    for (const run of runs.slice(0, 20)) {
      if (!unitNames.has(String(run.unitId))) unitNames.set(String(run.unitId), (await ctx.db.get(run.unitId))?.name ?? '');
    }
    return {
      lastCronAt: runs.find((run) => run.trigger === 'cron')?.ts ?? null,
      runs: runs.slice(0, 20).map((run) => ({ ...run, unitName: unitNames.get(String(run.unitId)) ?? '' })),
    };
  },
});

/** Per-unit feeds with their last status and the latest run's counts. */
export const feedOverview = query({
  args: { propertyId: v.id('properties') },
  handler: async (ctx, args) => {
    await requireRead(ctx, args.propertyId);
    const units = await ctx.db.query('units').withIndex('by_property', (q) => q.eq('propertyId', args.propertyId)).collect();
    const runs = await ctx.db
      .query('icalSyncRuns')
      .withIndex('by_property_ts', (q) => q.eq('propertyId', args.propertyId))
      .order('desc')
      .take(RECENT_SCAN);
    return units
      .filter((unit) => unit.status !== 'offline')
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((unit) => ({
        unitId: unit._id,
        name: unit.name,
        slug: unit.slug,
        feeds: unit.icalImports
          .filter((imp) => !imp.url.startsWith('upload:'))
          .map((imp) => {
            const last = runs.find((run) => run.unitId === unit._id && run.label === imp.label);
            return {
              label: imp.label,
              url: imp.url,
              lastSyncedAt: imp.lastSyncedAt ?? null,
              lastStatus: imp.lastStatus ?? null,
              lastRun: last
                ? { ok: last.ok, error: last.error ?? null, inserted: last.inserted, updated: last.updated, removed: last.removed, conflicts: last.conflicts, ts: last.ts }
                : null,
            };
          }),
      }));
  },
});

export const markRead = mutation({
  args: { alertId: v.id('icalSyncAlerts') },
  handler: async (ctx, args) => {
    const alert = await ctx.db.get(args.alertId);
    if (!alert) throw new ConvexError('ALERT_NOT_FOUND');
    await requireMutation(ctx, alert.propertyId, 'booking.write', 'ical.alert.read');
    if (alert.readAt === undefined) await ctx.db.patch(alert._id, { readAt: Date.now() });
    return { read: true };
  },
});

export const markAllRead = mutation({
  args: { propertyId: v.id('properties') },
  handler: async (ctx, args) => {
    await requireMutation(ctx, args.propertyId, 'booking.write', 'ical.alert.read_all');
    const alerts = await ctx.db
      .query('icalSyncAlerts')
      .withIndex('by_property_createdAt', (q) => q.eq('propertyId', args.propertyId))
      .order('desc')
      .take(RECENT_SCAN);
    const now = Date.now();
    let count = 0;
    for (const alert of alerts) {
      if (alert.readAt !== undefined) continue;
      await ctx.db.patch(alert._id, { readAt: now });
      count += 1;
    }
    return { count };
  },
});

export const getSettings = query({
  args: { propertyId: v.id('properties') },
  handler: async (ctx, args) => {
    await requireRead(ctx, args.propertyId);
    const property = await ctx.db.get(args.propertyId);
    const { alertEmails, randomizerEnabled, conflictRate, lastRandomizedOn } = await loadSyncSettings(ctx, args.propertyId);
    return { alertEmails, randomizerEnabled, conflictRate, lastRandomizedOn: lastRandomizedOn ?? null, fallbackEmail: property?.email ?? '' };
  },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const updateSettings = mutation({
  args: {
    propertyId: v.id('properties'),
    alertEmails: v.array(v.string()),
    randomizerEnabled: v.boolean(),
    conflictRate: v.number(),
  },
  handler: async (ctx, args) => {
    await requireMutation(ctx, args.propertyId, 'property.configure', 'ical.settings.update');
    const alertEmails = [...new Set(args.alertEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
    const invalid = alertEmails.find((e) => !EMAIL_RE.test(e));
    if (invalid) throw new ConvexError({ code: 'INVALID_EMAIL', message: `Email không hợp lệ: ${invalid}` });
    if (alertEmails.length > 10) throw new ConvexError({ code: 'TOO_MANY_EMAILS', message: 'Tối đa 10 email nhận cảnh báo.' });
    if (!(args.conflictRate >= 0 && args.conflictRate <= 1)) throw new ConvexError({ code: 'INVALID_RATE', message: 'Tỉ lệ xung đột phải từ 0 đến 1.' });
    const { row } = await loadSyncSettings(ctx, args.propertyId);
    const next = { alertEmails, randomizerEnabled: args.randomizerEnabled, conflictRate: args.conflictRate };
    if (row) await ctx.db.patch(row._id, next);
    else await ctx.db.insert('icalSyncSettings', { propertyId: args.propertyId, ...next });
    return { saved: true };
  },
});
