import type { Id } from '../../convex/_generated/dataModel';

/** Row shape returned by `songHomestay.adminSnapshot` (shared by the admin pages, the shift dashboard and the bell). */
export type BookingRow = { bookingId: Id<'bookings'>; confirmationCode: string; guestName: string; guestEmail: string; guestPhone: string; unitId: Id<'units'>; unitName: string; checkIn: string; checkOut: string; adults: number; children: number; infants?: number; pets?: number; status: string; source: string; totalCents: number; serviceCents: number; syncConflict: boolean; createdAt: number; residenceMissing?: number };
export type Snapshot = {
  occupancyByUnit: Array<{unitId:Id<'units'>;nights:number}>;
  newBookings: Array<{date:string; unitId:Id<'units'>; code:string}>;
  property: { name: string; currency: string };
  kpis: { totalBookings: number; pendingBookings: number; confirmedBookings: number; currentGuests: number; roomRevenueCents: number; serviceRevenueCents: number; totalRevenueCents: number; occupancyPercent: number; conflictCount: number };
  bookings: BookingRow[];
  units: Array<{ _id: Id<'units'>; name: string; status: string; sortOrder: number; type?: { name: string } }>;
  dailyRevenue: Array<{ date: string; roomCents: number; serviceCents: number; totalCents: number }>;
  sourceCounts: Array<{ source: string; count: number }>;
  serviceUsage: Array<{ name: string; count: number; revenueCents: number }>;
};
