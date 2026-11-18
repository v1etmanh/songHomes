/**
 * Staff-facing booking status for Sóng Homestay (single source for the booking
 * list, the calendar and the front-desk dashboard).
 *
 * Display only: it never changes the stored status. Stay dates are
 * property-local ISO strings, so comparisons are lexicographic (convention #2)
 * and `today` must come from `todayIso(property.timezone)`.
 */

export type StatusInput = { status: string; checkIn: string; checkOut: string };

/** The three statuses shown in "Quản lý booking". */
export type ManagementStatus = 'pending' | 'confirmed' | 'cancelled';
/** The calendar additionally shows stays whose checkout has passed as completed. */
export type CalendarStatus = ManagementStatus | 'completed' | 'blocked';

export const MANAGEMENT_STATUSES: ManagementStatus[] = ['pending', 'confirmed', 'cancelled'];
/** Calendar legend/filter entries: no OTA/iCal status, cancelled stays are not drawn. */
export const CALENDAR_STATUS_FILTERS: CalendarStatus[] = ['pending', 'confirmed', 'completed', 'blocked'];

export const STATUS_LABELS: Record<CalendarStatus, string> = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  completed: 'Đã hoàn thành',
  cancelled: 'Đã hủy',
  blocked: 'Khóa phòng',
};

const CANCELLED = new Set(['cancelled', 'expired']);

/** Status for the booking list: pending, confirmed or cancelled only. */
export function managementStatus(row: Pick<StatusInput, 'status'>): ManagementStatus {
  if (CANCELLED.has(row.status)) return 'cancelled';
  if (row.status === 'pending' || row.status === 'hold') return 'pending';
  return 'confirmed';
}

/**
 * Status for the room calendar. A stay that has ended (checkout on or before
 * today) is history, whatever workflow step it was left in; pending and
 * confirmed only describe stays that have not ended yet.
 */
export function calendarStatus(row: StatusInput, today: string): CalendarStatus {
  if (row.status === 'blocked') return 'blocked';
  if (CANCELLED.has(row.status)) return 'cancelled';
  if (row.checkOut <= today) return 'completed';
  return managementStatus(row);
}

/** A website/manual request nobody confirmed even though the stay has already started. */
export function isOverduePending(row: StatusInput, today: string): boolean {
  return managementStatus(row) === 'pending' && row.checkIn < today;
}

/** Channel label for an imported booking ("airbnb", "booking.com"), not a status. */
export function channelOf(row: { source: string }): string {
  return row.source.replace(/^(ical|manual|channel):/, '');
}
