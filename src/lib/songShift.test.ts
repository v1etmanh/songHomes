import { describe, expect, it } from 'vitest';
import type { BookingRow } from './songAdminTypes';
import { derivedNotifications, shiftOverview } from './songShift';

const today = '2026-11-15';
let n = 0;
function row(patch: Partial<BookingRow>): BookingRow {
  n += 1;
  return {
    bookingId: `b${n}` as BookingRow['bookingId'], confirmationCode: `SMP-${n}`, guestName: `Khách ${n}`, guestEmail: '', guestPhone: '',
    unitId: 'u1' as BookingRow['unitId'], unitName: 'Sóng Pool Villa', checkIn: '2026-11-20', checkOut: '2026-11-22', adults: 2, children: 0,
    status: 'confirmed', source: 'online', totalCents: 0, serviceCents: 0, syncConflict: false, createdAt: n, residenceMissing: 0, ...patch,
  };
}

describe('shiftOverview', () => {
  it('splits today arrivals and departures and skips cancelled and blocked rows', () => {
    const arriving = row({ checkIn: today, checkOut: '2026-11-17' });
    const leaving = row({ checkIn: '2026-11-13', checkOut: today, status: 'checked_in' });
    const cancelled = row({ checkIn: today, checkOut: '2026-11-17', status: 'cancelled' });
    const blocked = row({ checkIn: today, checkOut: '2026-11-17', status: 'blocked' });
    const shift = shiftOverview([arriving, leaving, cancelled, blocked], today);
    expect(shift.arrivals).toEqual([arriving]);
    expect(shift.departures).toEqual([leaving]);
  });

  it('lists website requests waiting for a decision, oldest first, and unresolved double bookings', () => {
    const newer = row({ status: 'pending', createdAt: 900 });
    const older = row({ status: 'pending', createdAt: 100 });
    const manual = row({ status: 'pending', source: 'manual:zalo' });
    const clash = row({ syncConflict: true });
    const shift = shiftOverview([newer, older, manual, clash], today);
    expect(shift.webPending).toEqual([older, newer]);
    expect(shift.conflicts).toEqual([clash]);
  });

  it('only asks for residence declarations from guests who are in the house today', () => {
    const inHouse = row({ checkIn: '2026-11-14', checkOut: '2026-11-17', residenceMissing: 2 });
    const future = row({ checkIn: '2026-11-18', residenceMissing: 1 });
    const gone = row({ checkIn: '2026-11-10', checkOut: '2026-11-15', residenceMissing: 1 });
    expect(shiftOverview([inHouse, future, gone], today).residenceMissing).toEqual([inHouse]);
  });
});

describe('derivedNotifications', () => {
  it('turns open work into deep-linked notifications without duplicating website requests', () => {
    const web = row({ status: 'pending', checkIn: '2026-11-14', checkOut: '2026-11-16' });
    const overdueManual = row({ status: 'pending', source: 'manual:zalo', checkIn: '2026-11-14', checkOut: '2026-11-16' });
    const residence = row({ checkIn: '2026-11-14', checkOut: '2026-11-17', residenceMissing: 1 });
    const list = derivedNotifications([web, overdueManual, residence], today);
    expect(list.map((item) => item.id)).toEqual([`web:${web.confirmationCode}`, `overdue:${overdueManual.confirmationCode}`, `residence:${residence.confirmationCode}`]);
    expect(list[0].to).toContain('/admin/bookings');
    expect(list[2].to).toBe('/admin/residence');
  });
});
