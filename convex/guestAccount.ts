import { getAuthUserId } from '@convex-dev/auth/server';
import { query } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { todayInTimezone } from '../shared/pricing';
import { residenceProgress } from './residence';

// Signed-in guest views (requireGuestAccount properties). An account only ever
// sees bookings whose userId is its own; it grants no staff rights.

// Declaration opens only once staff confirmed the booking (WEBSITE.pdf r5):
// a pending request may still be declined, so no ID data is collected yet.
const DECLARABLE = new Set(['confirmed', 'checked_in']);

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return { userId, name: user.name ?? '', email: user.email ?? '', phone: user.phone ?? '' };
  },
});

async function myBookingRows(ctx: QueryCtx, userId: Id<'users'>) {
  const bookings = await ctx.db.query('bookings').withIndex('by_user', (q) => q.eq('userId', userId)).collect();
  const rows = [];
  for (const booking of bookings) {
    const [property, unit] = await Promise.all([ctx.db.get(booking.propertyId), ctx.db.get(booking.unitId)]);
    const progress = await residenceProgress(ctx, booking);
    const today = todayInTimezone(property?.timezone ?? 'UTC');
    rows.push({
      bookingId: booking._id,
      confirmationCode: booking.confirmationCode,
      status: booking.status,
      propertyName: property?.name ?? '',
      unitName: unit?.name ?? '',
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      adults: booking.adults,
      children: booking.children,
      infants: booking.infants ?? 0,
      pets: booking.pets ?? 0,
      nights: booking.nights,
      holdExpiresAt: booking.status === 'hold' ? booking.holdExpiresAt ?? null : null,
      totalCents: booking.priceBreakdown?.totalCents ?? 0,
      currency: property?.currency ?? 'VND',
      progress,
      needsDeclaration: DECLARABLE.has(booking.status) && booking.checkOut >= today && progress.missing > 0,
    });
  }
  return rows.sort((a, b) => (a.checkIn < b.checkIn ? 1 : -1));
}

export const myBookings = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await myBookingRows(ctx, userId);
  },
});

/** Bell badge: bookings that still need a thông báo lưu trú. */
export const pendingDeclarations = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { count: 0, bookingIds: [] as Id<'bookings'>[], items: [] as Array<{ bookingId: Id<'bookings'>; confirmationCode: string; unitName: string; missing: number }> };
    const rows = (await myBookingRows(ctx, userId)).filter((row) => row.needsDeclaration);
    return {
      count: rows.length,
      bookingIds: rows.map((row) => row.bookingId),
      // Bell entries: each confirmed booking still waiting for its declarations.
      items: rows.map((row) => ({ bookingId: row.bookingId, confirmationCode: row.confirmationCode, unitName: row.unitName, missing: row.progress.missing })),
    };
  },
});
