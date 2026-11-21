import { ConvexError, v } from 'convex/values';
import { internalMutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { seedSongHomestay } from './seed';

// Every table that carries a propertyId. Keep in sync with convex/schema.ts —
// songReset.test.ts fails if a property-scoped table is left behind. Showcase
// payment-rail tables are omitted on purpose: Sóng never writes them and the
// production artifact must not name them.
const PROPERTY_TABLES = [
  'propertyFeatures', 'staffPropertyAssignments', 'operationRequests', 'unitGroups', 'unitGroupMembers',
  'maintenanceTasks', 'unitServiceStates', 'housekeepingAssignments', 'bookingOperationalFlags',
  'housekeepingChecklistTemplates', 'housekeepingChecklistItems', 'folios', 'folioEntries',
  'complimentaryAuthorizations', 'rateAdjustments', 'nightAuditSnapshots', 'groupReservations',
  'operationalSearchDocuments', 'payments', 'refundCases', 'bookingMessages', 'channelSync',
  'channelSyncLog', 'auditLog', 'residenceRegistrations', 'residenceCounters', 'contactSubmissions',
  'promoCodes', 'giftCertificates', 'seasonalContracts', 'quotes', 'waitlistEntries', 'staffTasks',
  'icalSyncRuns', 'icalSyncAlerts', 'icalSyncSettings', 'otaSimReservations', 'otaSimListings',
  'conflictResolutions', 'emailLog', 'automationClaims',
  'bookings', 'guests', 'ratePlans', 'units', 'unitTypes', 'addOns',
] as const;

type Plan = { counts: Record<string, number>; ids: Array<{ table: string; id: string }> };

function add(plan: Plan, table: string, id: string) {
  plan.counts[table] = (plan.counts[table] ?? 0) + 1;
  plan.ids.push({ table, id });
}

async function collectAll(ctx: MutationCtx, table: string): Promise<any[]> {
  return await (ctx.db as any).query(table).collect();
}

/**
 * Guest accounts that only ever booked Sóng (Sóng is the only property with
 * requireGuestAccount). A user with a staffProfiles row, or with a booking at
 * any other property, is never deleted.
 */
async function guestUsersToDelete(ctx: MutationCtx, songId: Id<'properties'>): Promise<Set<string>> {
  const staffUserIds = new Set((await ctx.db.query('staffProfiles').collect()).map((row) => String(row.userId)));
  const otherPropertyUsers = new Set<string>();
  for (const booking of await ctx.db.query('bookings').collect()) {
    if (booking.userId && booking.propertyId !== songId) otherPropertyUsers.add(String(booking.userId));
  }
  const result = new Set<string>();
  for (const user of await ctx.db.query('users').collect()) {
    const id = String(user._id);
    if (!staffUserIds.has(id) && !otherPropertyUsers.has(id)) result.add(id);
  }
  return result;
}

async function planReset(ctx: MutationCtx, songId: Id<'properties'>): Promise<Plan> {
  const plan: Plan = { counts: {}, ids: [] };
  const propertyId = String(songId);
  const idsOf = async (table: string) =>
    new Set((await collectAll(ctx, table)).filter((row) => String(row.propertyId) === propertyId).map((row) => String(row._id)));
  const bookingIds = await idsOf('bookings');
  const unitIds = await idsOf('units');
  const addOnIds = await idsOf('addOns');
  const promoIds = await idsOf('promoCodes');

  // Child rows keyed by booking/unit/add-on/promo rather than propertyId.
  for (const row of await ctx.db.query('unitNights').collect()) {
    if (unitIds.has(String(row.unitId)) || bookingIds.has(String(row.bookingId))) add(plan, 'unitNights', row._id);
  }
  for (const row of await ctx.db.query('bookingAddOns').collect()) {
    if (bookingIds.has(String(row.bookingId)) || addOnIds.has(String(row.addOnId))) add(plan, 'bookingAddOns', row._id);
  }
  for (const row of await ctx.db.query('promoRedemptions').collect()) {
    if (bookingIds.has(String(row.bookingId)) || promoIds.has(String(row.promoCodeId))) add(plan, 'promoRedemptions', row._id);
  }
  for (const row of await ctx.db.query('webhookEvents').collect()) {
    if (row.bookingId && bookingIds.has(String(row.bookingId))) add(plan, 'webhookEvents', row._id);
  }
  for (const table of PROPERTY_TABLES) {
    for (const row of await collectAll(ctx, table)) {
      if (String(row.propertyId ?? '') === propertyId) add(plan, table, row._id);
    }
  }

  const guestUsers = await guestUsersToDelete(ctx, songId);
  const sessionIds = new Set<string>();
  for (const row of await ctx.db.query('authSessions').collect()) {
    if (guestUsers.has(String(row.userId))) {
      sessionIds.add(String(row._id));
      add(plan, 'authSessions', row._id);
    }
  }
  const accountIds = new Set<string>();
  for (const row of await ctx.db.query('authAccounts').collect()) {
    if (guestUsers.has(String(row.userId))) {
      accountIds.add(String(row._id));
      add(plan, 'authAccounts', row._id);
    }
  }
  for (const row of await ctx.db.query('authRefreshTokens').collect()) {
    if (sessionIds.has(String(row.sessionId))) add(plan, 'authRefreshTokens', row._id);
  }
  for (const row of await ctx.db.query('authVerificationCodes').collect()) {
    if (accountIds.has(String(row.accountId))) add(plan, 'authVerificationCodes', row._id);
  }
  for (const row of await ctx.db.query('authVerifiers').collect()) {
    if (row.sessionId && sessionIds.has(String(row.sessionId))) add(plan, 'authVerifiers', row._id);
  }
  for (const id of guestUsers) add(plan, 'users', id);
  return plan;
}

/**
 * Step 0 for a long-lived deployment: the iCal sync log grows ~50 rows/day and
 * alone exceeds one mutation's read budget. Deletes one batch of Sóng's
 * icalSyncRuns; repeat until { remaining: false }, then call run.
 */
export const pruneSyncRuns = internalMutation({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    if (process.env.PUBLIC_LIVE_PAYMENTS === 'true') throw new ConvexError('SONG_RESET_PROHIBITED_LIVE_PAYMENTS');
    if (process.env.DEMO_MODE !== 'true' && process.env.ALLOW_SONG_RESET !== 'true') {
      throw new ConvexError('SONG_RESET_DISABLED');
    }
    const property = await ctx.db
      .query('properties')
      .withIndex('by_slug', (q) => q.eq('slug', 'song-homestay'))
      .unique();
    if (!property) return { deleted: 0, remaining: false };
    const batch = await ctx.db
      .query('icalSyncRuns')
      .withIndex('by_property_ts', (q) => q.eq('propertyId', property._id))
      .take(Math.min(Math.max(args.batchSize ?? 1000, 1), 1500));
    for (const row of batch) await ctx.db.delete(row._id);
    const next = await ctx.db
      .query('icalSyncRuns')
      .withIndex('by_property_ts', (q) => q.eq('propertyId', property._id))
      .first();
    return { deleted: batch.length, remaining: next !== null };
  },
});

/**
 * Explicit, destructive local/demo reset for the Sóng profile only.
 * Run with DEMO_MODE=true or ALLOW_SONG_RESET=true; other properties are never touched.
 *
 * Wipes every Sóng row (bookings, occupancy, iCal/OTA-simulator state, mail,
 * residence counters…) plus guest accounts that only booked Sóng, re-seeds the
 * catalog, and moves staff property assignments onto the new property row so
 * staff keep their Sóng access. Pass { dryRun: true } to only count.
 *
 * No markPropertyDirtyInline: the property row itself is replaced, and its
 * channelSync rows are deleted with it, so there is no OTA count to correct.
 */
export const run = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    if (process.env.PUBLIC_LIVE_PAYMENTS === 'true') throw new ConvexError('SONG_RESET_PROHIBITED_LIVE_PAYMENTS');
    if (process.env.DEMO_MODE !== 'true' && process.env.ALLOW_SONG_RESET !== 'true') {
      throw new ConvexError('SONG_RESET_DISABLED');
    }
    const property = await ctx.db
      .query('properties')
      .withIndex('by_slug', (q) => q.eq('slug', 'song-homestay'))
      .unique();
    if (!property) {
      if (args.dryRun) return { dryRun: true, counts: {}, seeded: false };
      await seedSongHomestay(ctx);
      return { reset: false, seeded: true };
    }
    if (property.slug !== 'song-homestay') throw new ConvexError('SONG_PROPERTY_MISMATCH');

    const plan = await planReset(ctx, property._id);
    if (args.dryRun) return { dryRun: true, counts: plan.counts };

    const assignments = (await ctx.db.query('staffPropertyAssignments').collect())
      .filter((row) => row.propertyId === property._id)
      .map(({ _id, _creationTime, propertyId, ...rest }) => rest);

    for (const { id } of plan.ids) await ctx.db.delete(id as any);
    await ctx.db.delete(property._id);
    await seedSongHomestay(ctx);

    const fresh = await ctx.db
      .query('properties')
      .withIndex('by_slug', (q) => q.eq('slug', 'song-homestay'))
      .unique();
    if (!fresh) throw new ConvexError('SONG_RESEED_FAILED');
    for (const assignment of assignments) {
      await ctx.db.insert('staffPropertyAssignments', { ...assignment, propertyId: fresh._id });
    }
    return { reset: true, seeded: true, propertyId: fresh._id, counts: plan.counts, staffAssignmentsMoved: assignments.length };
  },
});
