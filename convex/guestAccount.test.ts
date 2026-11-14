/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/!(*.*.*)*.*s');
const identityFor = (userId: Id<'users'>) => ({ subject: `${userId}|test-session` });

async function drainScheduled(t: ReturnType<typeof convexTest>) {
  for (let i = 0; i < 30; i += 1) {
    const pending = await t.run(async (ctx) =>
      (await ctx.db.system.query('_scheduled_functions').collect()).filter((job) => job.state.kind === 'pending' || job.state.kind === 'inProgress').length);
    if (pending === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await t.finishInProgressScheduledFunctions();
  }
}

async function setup(t: ReturnType<typeof convexTest>) {
  await t.mutation((internal as any).seed.run, {});
  return await t.run(async (ctx: any) => {
    const song = await ctx.db.query('properties').withIndex('by_slug', (q: any) => q.eq('slug', 'song-homestay')).unique();
    const pinewood = await ctx.db.query('properties').withIndex('by_slug', (q: any) => q.eq('slug', 'pinewood-flats')).unique();
    const pick = async (propertyId: Id<'properties'>, capacity: number) => {
      const units = await ctx.db.query('units').withIndex('by_property', (q: any) => q.eq('propertyId', propertyId)).collect();
      for (const unit of units) {
        const type = await ctx.db.get(unit.unitTypeId);
        if (unit.status === 'active' && type.capacityKnown !== false && type.maxOccupancy >= capacity && type.bookingMode === 'nightly') {
          const ratePlan = await ctx.db.query('ratePlans').withIndex('by_unitType', (q: any) => q.eq('unitTypeId', unit.unitTypeId).eq('active', true)).first();
          if (ratePlan) return { unit, ratePlan, type };
        }
      }
      throw new Error('no bookable unit');
    };
    const alice = await ctx.db.insert('users', { email: 'alice@example.com', name: 'Alice' });
    const bob = await ctx.db.insert('users', { email: 'bob@example.com', name: 'Bob' });
    return { song, pinewood, songUnit: await pick(song._id, 2), pineUnit: await pick(pinewood._id, 2), alice, bob };
  });
}

function holdArgs(target: { unit: any; ratePlan: any }, email: string, dates = { checkIn: '2027-03-10', checkOut: '2027-03-12' }) {
  return {
    unitId: target.unit._id, ratePlanId: target.ratePlan._id, ...dates, adults: 2, children: 0,
    guest: { name: 'Khách', email, phone: '0905000000', marketingOptIn: false }, addOns: [],
  };
}

describe('guest accounts for Sóng bookings', () => {
  beforeEach(() => vi.stubEnv('DEMO_MODE', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('requires a signed-in account for Sóng but not for other properties', async () => {
    const t = convexTest(schema, modules);
    const fx = await setup(t);
    await expect(t.mutation(api.bookings.createHold, holdArgs(fx.songUnit, 'anon@example.com'))).rejects.toThrow(/ACCOUNT_REQUIRED|đăng nhập/);
    const pine = await t.mutation(api.bookings.createHold, holdArgs(fx.pineUnit, 'anon@example.com', { checkIn: '2027-06-10', checkOut: '2027-06-12' }));
    const booking = await t.run(async (ctx) => ctx.db.get(pine.bookingId));
    expect(booking?.userId).toBeUndefined();
  });

  it('books under the account email, never a client-supplied one', async () => {
    const t = convexTest(schema, modules);
    const fx = await setup(t);
    const hold = await t.withIdentity(identityFor(fx.alice)).mutation(api.bookings.createHold, holdArgs(fx.songUnit, 'victim@example.com'));
    const state = await t.run(async (ctx) => {
      const booking = await ctx.db.get(hold.bookingId);
      return { booking, guest: booking?.guestId ? await ctx.db.get(booking.guestId) : null };
    });
    expect(state.booking?.userId).toBe(fx.alice);
    expect(state.guest?.normalizedEmail).toBe('alice@example.com');
    await expect(t.mutation(api.bookings.confirmPayAtProperty, { bookingId: hold.bookingId, confirmationCode: hold.confirmationCode, email: 'victim@example.com' }))
      .rejects.toThrow();
  });

  it('tracks mandatory declarations per adult, scopes them to the booking owner, and gates check-in', async () => {
    const t = convexTest(schema, modules);
    const fx = await setup(t);
    const asAlice = t.withIdentity(identityFor(fx.alice));
    const asBob = t.withIdentity(identityFor(fx.bob));
    const hold = await asAlice.mutation(api.bookings.createHold, holdArgs(fx.songUnit, 'alice@example.com'));
    await t.mutation(api.bookings.confirmPayAtProperty, { bookingId: hold.bookingId, confirmationCode: hold.confirmationCode, email: 'alice@example.com' });
    await drainScheduled(t);

    expect(await asAlice.query((api as any).guestAccount.pendingDeclarations, {})).toEqual({ count: 1, bookingIds: [hold.bookingId] });
    expect(await asBob.query((api as any).guestAccount.pendingDeclarations, {})).toEqual({ count: 0, bookingIds: [] });
    await expect(asBob.query((api as any).residence.listForMyBooking, { bookingId: hold.bookingId })).rejects.toThrow(/NOT_FOUND|Không tìm thấy/);

    const declaration = {
      bookingId: hold.bookingId, fullName: 'Nguyễn Văn An', documentType: 'cccd', documentNumber: '079123456789',
      reason: 'Du lịch', checkInDate: '2027-03-10', checkOutDate: '2027-03-12', consent: true,
    };
    await expect(asBob.mutation((api as any).residence.registerForMyBooking, declaration)).rejects.toThrow(/NOT_FOUND|Không tìm thấy/);
    await expect(asAlice.mutation((api as any).residence.registerForMyBooking, { ...declaration, documentNumber: '12345' })).rejects.toThrow(/12 chữ số/);
    await expect(asAlice.mutation((api as any).residence.registerForMyBooking, { ...declaration, reason: '  ' })).rejects.toThrow(/lý do/);
    await expect(asAlice.mutation((api as any).residence.registerForMyBooking, { ...declaration, checkOutDate: '2027-03-15' })).rejects.toThrow(/INVALID_DATES|phải nằm trong/);

    await asAlice.mutation((api as any).residence.registerForMyBooking, declaration);
    await expect(asAlice.mutation((api as any).residence.registerForMyBooking, declaration)).rejects.toThrow(/DUPLICATE_DOCUMENT|đã được khai báo/);
    const mine: any = await asAlice.query((api as any).residence.listForMyBooking, { bookingId: hold.bookingId });
    expect(mine.progress).toEqual({ required: 2, declared: 1, missing: 1 });
    expect(mine.registrations[0].stayAddress).toContain(fx.songUnit.type.address);

    await t.mutation((api as any).songHomestay.updateBookingStatus, { propertyId: fx.song._id, bookingId: hold.bookingId, status: 'confirmed' });
    await expect(t.mutation((api as any).songHomestay.updateBookingStatus, { propertyId: fx.song._id, bookingId: hold.bookingId, status: 'checked_in' }))
      .rejects.toThrow(/RESIDENCE_INCOMPLETE|Còn thiếu 1/);

    await asAlice.mutation((api as any).residence.registerForMyBooking, {
      ...declaration, fullName: 'John Smith', documentType: 'passport', documentNumber: 'c1234567', nationality: 'Hoa Kỳ',
    });
    expect((await asAlice.query((api as any).guestAccount.pendingDeclarations, {})).count).toBe(0);
    await t.mutation((api as any).songHomestay.updateBookingStatus, { propertyId: fx.song._id, bookingId: hold.bookingId, status: 'checked_in' });
    const after = await t.run(async (ctx) => ctx.db.get(hold.bookingId));
    expect(after?.status).toBe('checked_in');
  });

  it('lets the owner withdraw only unrecorded declarations', async () => {
    const t = convexTest(schema, modules);
    const fx = await setup(t);
    const asAlice = t.withIdentity(identityFor(fx.alice));
    const hold = await asAlice.mutation(api.bookings.createHold, holdArgs(fx.songUnit, 'alice@example.com'));
    const { registrationId } = await asAlice.mutation((api as any).residence.registerForMyBooking, {
      bookingId: hold.bookingId, fullName: 'Nguyễn Văn An', documentType: 'cmnd', documentNumber: '123456789',
      reason: 'Công tác', checkInDate: '2027-03-10', checkOutDate: '2027-03-11', consent: true,
    });
    await t.mutation((api as any).residence.verifyRegistration, { registrationId, status: 'verified' });
    await expect(asAlice.mutation((api as any).residence.removeForMyBooking, { bookingId: hold.bookingId, registrationId }))
      .rejects.toThrow(/ALREADY_VERIFIED|không thể tự xóa/);
  });
});
