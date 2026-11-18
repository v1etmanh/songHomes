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
/** Calendar legend/filter entries: no OTA/iCal status, no grey "Khóa phòng", cancelled stays are not drawn. */
export const CALENDAR_STATUS_FILTERS: CalendarStatus[] = ['pending', 'confirmed', 'completed'];

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

/** The booking sources staff see, in a fixed order; anything unknown (incl. legacy walk-in) is "Khác". */
export const SOURCE_LABELS = ['Booking.com', 'Airbnb', 'Zalo', 'Phone', 'Facebook', 'Website', 'Khác'] as const;
export type SourceLabel = (typeof SOURCE_LABELS)[number];

/** Canonical, capitalised source name: "ical:Booking.com" -> "Booking.com", "manual:zalo" -> "Zalo", "online" -> "Website". */
export function sourceLabel(source: string): SourceLabel {
  const raw = source.replace(/^(ical|manual|channel|upload):/, '').trim().toLowerCase();
  if (source === 'online' || raw === 'website' || raw === 'online') return 'Website';
  if (raw.includes('booking')) return 'Booking.com';
  if (raw.includes('airbnb')) return 'Airbnb';
  if (raw === 'zalo') return 'Zalo';
  if (raw === 'phone' || raw === 'điện thoại') return 'Phone';
  if (raw === 'facebook') return 'Facebook';
  return 'Khác';
}

/** Admin date format: ISO 'YYYY-MM-DD' -> 'dd/mm/yy' (string slicing only, convention #2). */
export function shortDate(iso: string): string {
  const day = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(2, 4)}` : iso;
}

/** A stay range in the admin format: '18/11/26 → 20/11/26'. */
export function stayRange(checkIn: string, checkOut: string): string {
  return `${shortDate(checkIn)} → ${shortDate(checkOut)}`;
}

/** An instant as 'dd/mm/yy HH:mm' in the property timezone. */
export function shortDateTime(ts: number, timezone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(ts).map((p) => [p.type, p.value]));
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}
