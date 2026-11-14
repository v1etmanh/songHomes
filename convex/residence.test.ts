/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/!(*.*.*)*.*s');

describe('residence registration (Đăng ký tạm trú / tạm vắng)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows a guest to submit, list, and delete temporary residence declarations, and allows staff to verify', async () => {
    vi.stubEnv('DEMO_MODE', 'true');
    const t = convexTest(schema, modules);

    const { propertyId, confirmationCode, email } = await t.run(async (ctx) => {
      const propertyId = await ctx.db.insert('properties', {
        name: 'Sóng Homestay — Đà Nẵng',
        slug: 'song-homestay',
        timezone: 'Asia/Ho_Chi_Minh',
        currency: 'VND',
        taxRateBps: 800,
        email: 'booking@songhomestay.vn',
        phone: '+84 905 123 456',
        address: '128 Võ Nguyên Giáp, Đà Nẵng',
        checkInTime: '14:00',
        checkOutTime: '12:00',
        active: true,
      });
      const unitTypeId = await ctx.db.insert('unitTypes', {
        propertyId,
        name: 'Căn hộ tiêu chuẩn 2PN',
        slug: 'can-ho-2pn',
        kind: 'room',
        bookingMode: 'nightly',
        description: '',
        photoUrls: [],
        maxOccupancy: 4,
        amenities: [],
        comingSoon: false,
        sortOrder: 1,
      });
      const unitId = await ctx.db.insert('units', {
        propertyId,
        unitTypeId,
        name: 'Phòng A - Căn hộ 2PN',
        slug: 'phong-a',
        status: 'active',
        icalExportToken: 'token-phong-a',
        icalImports: [],
        sortOrder: 1,
      });
      const guestId = await ctx.db.insert('guests', {
        propertyId,
        name: 'Nguyễn Văn Minh',
        email: 'minh.nguyen@example.com',
        normalizedEmail: 'minh.nguyen@example.com',
        phone: '0905111222',
        normalizedPhone: '0905111222',
        marketingOptIn: false,
        notes: [],
      });
      await ctx.db.insert('bookings', {
        propertyId,
        unitId,
        unitTypeId,
        guestId,
        checkIn: '2026-09-25',
        checkOut: '2026-09-28',
        nights: 3,
        adults: 2,
        children: 0,
        status: 'confirmed',
        source: 'online',
        confirmationCode: 'OS-SONG01',
        statusHistory: [{ status: 'confirmed', ts: Date.now() }],
        notes: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return {
        propertyId,
        confirmationCode: 'OS-SONG01',
        email: 'minh.nguyen@example.com',
      };
    });

    const created = await t.mutation((api as any).residence.registerForGuest, {
      confirmationCode,
      email,
      fullName: 'Nguyễn Văn Minh',
      documentType: 'cccd',
      documentNumber: '048095001234',
      nationality: 'Việt Nam',
      dateOfBirth: '1995-04-12',
      phone: '0905111222',
      permanentAddress: '45 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh',
      registrationType: 'tam_tru',
      checkInDate: '2026-09-25',
      checkOutDate: '2026-09-28',
      reason: 'Du lịch / Nghỉ dưỡng cùng gia đình',
      consent: true,
    });
    expect(created.registrationId).toBeDefined();

    const guestData = await t.query((api as any).residence.listForGuest, {
      confirmationCode,
      email,
    });
    expect(guestData.registrations).toHaveLength(1);
    expect(guestData.registrations[0].fullName).toBe('Nguyễn Văn Minh');
    expect(guestData.registrations[0].documentNumber).toBe('048095001234');
    expect(guestData.registrations[0].status).toBe('declared');

    // Wrong email throws NOT_FOUND for guest privacy
    await expect(
      t.query((api as any).residence.listForGuest, {
        confirmationCode,
        email: 'stranger@example.com',
      }),
    ).rejects.toThrow();

    // Staff can list and verify
    const propertyList = await t.query((api as any).residence.listForProperty, {
      propertyId,
    });
    expect(propertyList).toHaveLength(1);
    expect(propertyList[0].unitName).toBe('Phòng A - Căn hộ 2PN');

    await t.mutation((api as any).residence.verifyRegistration, {
      registrationId: created.registrationId,
      status: 'verified',
    });

    const afterVerify = await t.query((api as any).residence.listForGuest, {
      confirmationCode,
      email,
    });
    expect(afterVerify.registrations[0].status).toBe('verified');

    // Reset to declared so guest can remove declaration
    await t.mutation((api as any).residence.verifyRegistration, {
      registrationId: created.registrationId,
      status: 'declared',
    });

    await t.mutation((api as any).residence.removeForGuest, {
      confirmationCode,
      email,
      registrationId: created.registrationId,
    });
    const afterDelete = await t.query((api as any).residence.listForGuest, {
      confirmationCode,
      email,
    });
    expect(afterDelete.registrations).toHaveLength(0);

    const userId = await t.run(async ctx => {
      const id = await ctx.db.insert('users', {name:'Lễ tân'});
      await ctx.db.insert('staffProfiles',{userId:id,name:'Lễ tân',role:'staff',active:true,createdAt:Date.now()});
      return id;
    });
    const desk=t.withIdentity({subject:userId+'|session'});
    const resident=await desk.mutation(api.residence.staffRegister,{bookingId:guestData.bookingId, nationality:'Việt Nam',
      documentType:'passport',documentNumber:'P1234567',dateOfBirth:'1994-02-08',gender:'Nam',permanentAddress:'Đà Nẵng'});
    const list=await desk.query(api.residence.listForProperty,{propertyId});
    expect(list[0]).toMatchObject({canReveal:true, documentNumber:'••••4567', recordCode:expect.stringMatching(/^TT-\d{4}-001$/)});
    expect(await desk.query(api.residence.fullDocument,{id:resident})).toBe('P1234567');
    await expect(t.query(api.residence.fullDocument,{id:resident})).rejects.toThrow();
    const args={residentId:resident,start:'2026-09-25T18:00',end:'2026-09-26T10:00',reason:'Thăm gia đình',notes:'Gọi khi về'};
    await expect(desk.mutation(api.residence.saveAbsence,{...args,end:args.start})).rejects.toThrow();
    await desk.mutation(api.residence.saveAbsence,args);
    const [away]=await desk.query(api.residence.listForProperty,{propertyId});
    expect(away).toMatchObject({absenceStatus:'away',residentId:resident,recordCode:expect.stringMatching(/^TV-\d{4}-001$/)});
    await desk.mutation(api.residence.saveAbsence,{...args,id:away._id,end:'2026-09-26T11:00'});
    await desk.mutation(api.residence.updateAbsenceStatus,{registrationId:away._id,absenceStatus:'returned'});
    expect(await t.run(ctx=>ctx.db.get(away._id))).toMatchObject({absenceStatus:'returned',notes:args.notes,checkOutDate:'2026-09-26T11:00'});
  });

  it('purges only declarations whose privacy retention period has expired', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    await t.run(async (ctx) => {
      const propertyId = await ctx.db.insert('properties', {
        name: 'Sóng Homestay',
        slug: 'song-homestay-retention',
        timezone: 'Asia/Ho_Chi_Minh',
        currency: 'VND',
        taxRateBps: 0,
        email: 'booking@example.com',
        phone: '0900000000',
        address: 'Đà Nẵng',
        checkInTime: '14:00',
        checkOutTime: '12:00',
        active: true,
      });
      const unitTypeId = await ctx.db.insert('unitTypes', {
        propertyId,
        name: 'Căn hộ',
        slug: 'can-ho-retention',
        kind: 'room',
        bookingMode: 'nightly',
        description: '',
        photoUrls: [],
        maxOccupancy: 2,
        amenities: [],
        comingSoon: false,
        sortOrder: 1,
      });
      const unitId = await ctx.db.insert('units', {
        propertyId,
        unitTypeId,
        name: 'Phòng A',
        slug: 'phong-a-retention',
        status: 'active',
        icalExportToken: 'retention-token',
        icalImports: [],
        sortOrder: 1,
      });
      const guestId = await ctx.db.insert('guests', {
        propertyId,
        name: 'Khách thử nghiệm',
        email: 'guest@example.com',
        normalizedEmail: 'guest@example.com',
        phone: '0900000000',
        normalizedPhone: '0900000000',
        marketingOptIn: false,
        notes: [],
      });
      const bookingId = await ctx.db.insert('bookings', {
        propertyId,
        unitId,
        unitTypeId,
        guestId,
        checkIn: '2026-11-01',
        checkOut: '2026-11-02',
        nights: 1,
        adults: 1,
        children: 0,
        status: 'confirmed',
        source: 'online',
        confirmationCode: 'OS-RETENTION',
        statusHistory: [{ status: 'confirmed', ts: now }],
        notes: [],
        createdAt: now,
        updatedAt: now,
      });
      const baseRegistration = {
        propertyId,
        bookingId,
        fullName: 'Khách thử nghiệm',
        documentType: 'cccd' as const,
        documentNumber: '000000000000',
        nationality: 'Việt Nam',
        registrationType: 'tam_tru' as const,
        checkInDate: '2026-11-01',
        checkOutDate: '2026-11-02',
        status: 'declared' as const,
        submittedBy: 'guest' as const,
        consentAt: now,
        createdAt: now,
        updatedAt: now,
      };
      await ctx.db.insert('residenceRegistrations', {
        ...baseRegistration,
        documentNumber: 'expired',
        retentionUntil: now - 1,
      });
      await ctx.db.insert('residenceRegistrations', {
        ...baseRegistration,
        documentNumber: 'active',
        retentionUntil: now + 86_400_000,
      });
      await ctx.db.insert('residenceRegistrations', {
        ...baseRegistration,
        documentNumber: 'legacy',
      });
    });

    const result = await t.mutation(internal.residence.purgeExpired, {});
    expect(result).toEqual({ removed: 1 });
    const remaining = await t.run((ctx) => ctx.db.query('residenceRegistrations').collect());
    expect(remaining.map((row) => row.documentNumber).sort()).toEqual(['active', 'legacy']);
  });
});
