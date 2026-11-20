import type { Id } from '../../convex/_generated/dataModel';

/** Row shape returned by `songHomestay.adminSnapshot` (shared by the admin pages, the shift dashboard and the bell). */
export type BookingRow = {
  bookingId: Id<'bookings'>; confirmationCode: string; guestName: string; guestEmail: string; guestPhone: string;
  unitId: Id<'units'>; unitName: string; checkIn: string; checkOut: string; adults: number; children: number; infants?: number; pets?: number;
  status: string; source: string; totalCents: number; serviceCents: number; syncConflict: boolean; createdAt: number; residenceMissing?: number;
  /** Counted in the period's revenue (owner view only). */
  revenueRecognised?: boolean;
  services?: Array<{ name: string; quantity: number; free: number; completed: boolean }>;
  notes?: Array<{ ts: number; text: string; by: string }>;
};
export type NewBookingRow = {
  date: string; unitId: Id<'units'>; code: string; status: string; bookingId: Id<'bookings'>; guestName: string; unitName: string;
  checkIn: string; checkOut: string; source: string; hasServices: boolean;
};
export type Snapshot = {
  occupancyByUnit: Array<{unitId:Id<'units'>;nights:number}>;
  newBookings: NewBookingRow[];
  property: { name: string; currency: string };
  /** False for every role but the owner: revenue fields are then zero/empty. */
  canSeeRevenue: boolean;
  /** Double bookings in the period: confirmed bookings vs unconfirmed requests, each split open/handled. */
  conflictStats: { confirmed: { open: number; resolved: number }; pending: { open: number; resolved: number } };
  channelReport: { total: number; channels: Array<{ source: string; count: number }>; direct: number; directWithServices: number };
  kpis: { totalBookings: number; pendingBookings: number; confirmedBookings: number; currentGuests: number; roomRevenueCents: number; serviceRevenueCents: number; totalRevenueCents: number; occupancyPercent: number; conflictCount: number };
  bookings: BookingRow[];
  units: Array<{ _id: Id<'units'>; name: string; status: string; sortOrder: number; type?: { name: string } }>;
  dailyRevenue: Array<{ date: string; roomCents: number; serviceCents: number; totalCents: number }>;
  sourceCounts: Array<{ source: string; count: number }>;
  serviceUsage: Array<{ name: string; count: number; bookings: number; units: number; freeUnits: number; revenueCents: number }>;
};
