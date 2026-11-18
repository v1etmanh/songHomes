import { describe, expect, it } from 'vitest';
import { calendarStatus, channelOf, isOverduePending, managementStatus } from './songBookingStatus';

const today = '2026-11-15';

describe('calendarStatus', () => {
  it('shows a stay that ended on or before today as completed, whatever step it was left in', () => {
    expect(calendarStatus({ status: 'pending', checkIn: '2026-11-14', checkOut: '2026-11-15' }, today)).toBe('completed');
    expect(calendarStatus({ status: 'confirmed', checkIn: '2026-11-10', checkOut: '2026-11-12' }, today)).toBe('completed');
    expect(calendarStatus({ status: 'external', checkIn: '2026-11-10', checkOut: '2026-11-12' }, today)).toBe('completed');
  });

  it('keeps pending and confirmed for stays that have not ended', () => {
    expect(calendarStatus({ status: 'pending', checkIn: '2026-11-17', checkOut: '2026-11-19' }, today)).toBe('pending');
    expect(calendarStatus({ status: 'confirmed', checkIn: '2026-11-14', checkOut: '2026-11-16' }, today)).toBe('confirmed');
    expect(calendarStatus({ status: 'checked_in', checkIn: '2026-11-14', checkOut: '2026-11-16' }, today)).toBe('confirmed');
  });

  it('never labels an imported block as OTA/iCal: it reads as a normal confirmed stay', () => {
    expect(calendarStatus({ status: 'external', checkIn: '2026-11-17', checkOut: '2026-11-18' }, today)).toBe('confirmed');
  });

  it('keeps cancelled and blocked apart from stay history', () => {
    expect(calendarStatus({ status: 'cancelled', checkIn: '2026-11-10', checkOut: '2026-11-12' }, today)).toBe('cancelled');
    expect(calendarStatus({ status: 'blocked', checkIn: '2026-11-10', checkOut: '2026-11-12' }, today)).toBe('blocked');
  });
});

describe('managementStatus', () => {
  it('collapses every workflow status into pending, confirmed or cancelled', () => {
    expect(managementStatus({ status: 'hold' })).toBe('pending');
    expect(managementStatus({ status: 'pending' })).toBe('pending');
    for (const status of ['confirmed', 'checked_in', 'checked_out', 'external']) expect(managementStatus({ status })).toBe('confirmed');
    for (const status of ['cancelled', 'expired']) expect(managementStatus({ status })).toBe('cancelled');
  });
});

describe('isOverduePending', () => {
  it('flags a pending request whose stay already started', () => {
    expect(isOverduePending({ status: 'pending', checkIn: '2026-11-14', checkOut: '2026-11-16' }, today)).toBe(true);
    expect(isOverduePending({ status: 'pending', checkIn: '2026-11-15', checkOut: '2026-11-16' }, today)).toBe(false);
    expect(isOverduePending({ status: 'confirmed', checkIn: '2026-11-10', checkOut: '2026-11-16' }, today)).toBe(false);
  });
});

describe('channelOf', () => {
  it('strips source prefixes', () => {
    expect(channelOf({ source: 'ical:airbnb' })).toBe('airbnb');
    expect(channelOf({ source: 'manual:zalo' })).toBe('zalo');
  });
});
