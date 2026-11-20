import { v } from 'convex/values';
import { internalQuery } from './_generated/server';
import { renderIcs } from '../shared/ical';

// Every status that occupies unitNights is exported, so an OTA that pulls this
// feed blocks the night as soon as OpenStays takes a booking — including a
// pending Sóng request, which already locks the calendar. Imported OTA stays
// ('external') are never re-exported (loop prevention).
export const EXPORTABLE = new Set(['pending', 'confirmed', 'checked_in', 'blocked']);

/** The per-unit export URL an OTA subscribes to (GET /ical/u/<token>.ics). */
export function exportFeedUrl(token: string): string {
  const site = (process.env.CONVEX_SITE_URL ?? '').replace(/\/$/, '');
  return `${site}/ical/u/${token}.ics`;
}

/**
 * Build the iCal feed body for a unit identified by its secret export token.
 * Returns null for unknown tokens (route responds 404, indistinguishable
 * from a bad guess). External bookings are never re-exported — that would
 * bounce Airbnb's own events back at it and create loops.
 */
export const exportFeed = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const unit = await ctx.db
      .query('units')
      .withIndex('by_icalToken', (q) => q.eq('icalExportToken', args.token))
      .first();
    if (!unit) return null;

    const bookings = await ctx.db
      .query('bookings')
      .withIndex('by_unit_checkIn', (q) => q.eq('unitId', unit._id))
      .collect();

    return renderIcs({
      prodId: '-//OpenStays//EN',
      events: bookings
        .filter((b) => EXPORTABLE.has(b.status))
        .map((b) => ({
          uid: `${b._id}@openstays`,
          startDate: b.checkIn,
          endDate: b.checkOut, // exclusive — matches half-open semantics
          summary: 'Reserved',
          stampMs: b.updatedAt,
        })),
    });
  },
});
