import type { BookingRow } from './songAdminTypes';
import { isOverduePending, managementStatus, shortDate, stayRange } from './songBookingStatus';

/**
 * Work the front desk owns today, derived from the booking snapshot.
 * Display-only: every action still goes through the existing staff mutations.
 */
export type ShiftOverview = {
  /** Guests arriving today who are not cancelled. */
  arrivals: BookingRow[];
  /** Guests leaving today who are not cancelled. */
  departures: BookingRow[];
  /** Website requests nobody has confirmed or declined yet. */
  webPending: BookingRow[];
  /** Pending requests whose stay already started. */
  overduePending: BookingRow[];
  /** Double bookings staff have not resolved. */
  conflicts: BookingRow[];
  /** Arrivals and in-house guests who still owe a residence (tạm trú) declaration. */
  residenceMissing: BookingRow[];
};

const live = (row: BookingRow) => managementStatus(row) !== 'cancelled' && row.status !== 'blocked';

export function shiftOverview(bookings: BookingRow[], today: string): ShiftOverview {
  const rows = bookings.filter(live);
  const byArrival = (a: BookingRow, b: BookingRow) => a.unitName.localeCompare(b.unitName) || a.confirmationCode.localeCompare(b.confirmationCode);
  return {
    arrivals: rows.filter((row) => row.checkIn === today).sort(byArrival),
    departures: rows.filter((row) => row.checkOut === today).sort(byArrival),
    webPending: rows.filter((row) => row.source === 'online' && row.status === 'pending').sort((a, b) => a.createdAt - b.createdAt),
    overduePending: rows.filter((row) => isOverduePending(row, today)),
    conflicts: rows.filter((row) => row.syncConflict),
    residenceMissing: rows.filter((row) => (row.residenceMissing ?? 0) > 0 && row.checkIn <= today && row.checkOut > today).sort(byArrival),
  };
}

export type ShiftNotification = {
  id: string;
  tone: 'alert' | 'info';
  title: string;
  detail: string;
  /** Admin route that handles it. */
  to: string;
};

/** Notifications derived from live data (no read state): they stay until the work is done. */
export function derivedNotifications(bookings: BookingRow[], today: string): ShiftNotification[] {
  const shift = shiftOverview(bookings, today);
  const out: ShiftNotification[] = [];
  for (const row of shift.webPending) {
    out.push({ id: `web:${row.confirmationCode}`, tone: 'alert', title: `Đơn website chờ xác nhận ${row.confirmationCode}`, detail: `${row.guestName} · ${row.unitName} · ${stayRange(row.checkIn, row.checkOut)}`, to: `/admin/bookings?status=pending&booking=${encodeURIComponent(row.confirmationCode)}` });
  }
  for (const row of shift.overduePending) {
    if (row.source === 'online') continue; // already listed above
    out.push({ id: `overdue:${row.confirmationCode}`, tone: 'alert', title: `Booking ${row.confirmationCode} quá hạn xác nhận`, detail: `${row.guestName} · ${row.unitName} · đã đến ngày ${shortDate(row.checkIn)}`, to: `/admin/bookings?status=pending&booking=${encodeURIComponent(row.confirmationCode)}` });
  }
  for (const row of shift.residenceMissing) {
    out.push({ id: `residence:${row.confirmationCode}`, tone: 'info', title: `Thiếu khai báo tạm trú ${row.confirmationCode}`, detail: `${row.guestName} · ${row.unitName} · còn ${row.residenceMissing} khách`, to: '/admin/residence' });
  }
  return out;
}
