import { ConvexError } from 'convex/values';
import { internalMutation } from './_generated/server';
import { seedSongHomestay } from './seed';

const PROPERTY_TABLES = [
  'propertyFeatures', 'staffPropertyAssignments', 'operationRequests', 'unitGroups', 'unitGroupMembers',
  'maintenanceTasks', 'unitServiceStates', 'housekeepingAssignments', 'bookingOperationalFlags',
  'housekeepingChecklistTemplates', 'housekeepingChecklistItems', 'folios', 'folioEntries',
  'complimentaryAuthorizations', 'rateAdjustments', 'nightAuditSnapshots', 'groupReservations',
  'operationalSearchDocuments', 'payments', 'refundCases', 'bookingMessages', 'channelSync',
  'channelSyncLog', 'auditLog', 'residenceRegistrations', 'contactSubmissions', 'promoCodes',
  'giftCertificates', 'seasonalContracts', 'quotes', 'waitlistEntries', 'staffTasks', 'bookings',
  'guests', 'ratePlans', 'units', 'unitTypes', 'addOns',
] as const;

async function deletePropertyRows(ctx: any, table: string, propertyId: string) {
  const rows = await ctx.db.query(table).collect();
  for (const row of rows) {
    if (String(row.propertyId ?? '') === propertyId) await ctx.db.delete(row._id);
  }
}

/**
 * Explicit, destructive local/demo reset for the Sóng profile only.
 * Run with DEMO_MODE=true or ALLOW_SONG_RESET=true; other properties are never touched.
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.DEMO_MODE !== 'true' && process.env.ALLOW_SONG_RESET !== 'true') {
      throw new ConvexError('SONG_RESET_DISABLED');
    }
    const property = await ctx.db
      .query('properties')
      .withIndex('by_slug', (q) => q.eq('slug', 'song-homestay'))
      .unique();
    if (!property) {
      await seedSongHomestay(ctx);
      return { reset: false, seeded: true };
    }
    if (property.slug !== 'song-homestay') throw new ConvexError('SONG_PROPERTY_MISMATCH');

    const propertyId = String(property._id);
    const bookingIds = new Set(
      (await ctx.db.query('bookings').collect())
        .filter((row) => row.propertyId === property._id)
        .map((row) => String(row._id)),
    );
    const unitIds = new Set(
      (await ctx.db.query('units').collect())
        .filter((row) => row.propertyId === property._id)
        .map((row) => String(row._id)),
    );
    const addOnIds = new Set(
      (await ctx.db.query('addOns').collect())
        .filter((row) => row.propertyId === property._id)
        .map((row) => String(row._id)),
    );
    const promoIds = new Set(
      (await ctx.db.query('promoCodes').collect())
        .filter((row) => row.propertyId === property._id)
        .map((row) => String(row._id)),
    );

    for (const row of await ctx.db.query('unitNights').collect()) {
      if (unitIds.has(String(row.unitId)) || bookingIds.has(String(row.bookingId))) await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db.query('bookingAddOns').collect()) {
      if (bookingIds.has(String(row.bookingId)) || addOnIds.has(String(row.addOnId))) await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db.query('promoRedemptions').collect()) {
      if (bookingIds.has(String(row.bookingId)) || promoIds.has(String(row.promoCodeId))) await ctx.db.delete(row._id);
    }
    for (const table of PROPERTY_TABLES) await deletePropertyRows(ctx, table, propertyId);
    await ctx.db.delete(property._id);
    await seedSongHomestay(ctx);
    return { reset: true, seeded: true };
  },
});
