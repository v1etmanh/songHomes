import { getAuthUserId } from '@convex-dev/auth/server';
import { query } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { todayInTimezone } from '../shared/pricing';
import { residenceProgress } from './residence';

// Signed-in guest views (requireGuestAccount properties). An account only ever
// sees bookings whose userId is its own; it grants no staff rights.

const DECLARABLE = new Set(['pending', 'confirmed', 'checked_in']);

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
    if (!userId) return { count: 0, bookingIds: [] as Id<'bookings'>[] };
    const rows = (await myBookingRows(ctx, userId)).filter((row) => row.needsDeclaration);
    return { count: rows.length, bookingIds: rows.map((row) => row.bookingId) };
  },
});
