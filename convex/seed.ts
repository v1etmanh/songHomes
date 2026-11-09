import { internalMutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { CONSENSUS_COMMONS_PHOTO_URLS } from '../shared/consensusCommonsExperience';

const SONG_HOMESTAY_PHOTO_URLS = [
  '/song-homestay/apartment.webp',
  '/song-homestay/studio.webp',
  '/song-homestay/family.webp',
  '/song-homestay/townhouse.webp',
];

/**
 * Seed the fictional "Pinewood Flats Campground" — the ONLY inventory that
 * ever lives in this repo. Real operators load their own inventory as data
 * in their own deployment (see docs/configuration.md).
 *
 * Run with: npx convex run seed:run
 * Idempotent: skips if the property already exists.
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const song = await ctx.db
      .query('properties')
      .withIndex('by_slug', (q) => q.eq('slug', 'song-homestay'))
      .first();
    const pinewood = await ctx.db
      .query('properties')
      .withIndex('by_slug', (q) => q.eq('slug', 'pinewood-flats'))
      .first();
    const commons = await ctx.db
      .query('properties')
      .withIndex('by_slug', (q) => q.eq('slug', 'consensus-commons'))
      .first();
    if (!song) await seedSongHomestay(ctx);
    else {
      await ctx.db.patch(song._id, { allowPayAtProperty: true });
      const songTypes = await ctx.db.query('unitTypes').withIndex('by_property', (q) => q.eq('propertyId', song._id)).collect();
      for (const unitType of songTypes) await ctx.db.patch(unitType._id, { photoUrls: SONG_HOMESTAY_PHOTO_URLS });
    }
    if (!pinewood) await seedPinewoodFlats(ctx);
    if (!commons) await seedConsensusCommons(ctx);
    else await refreshConsensusCommons(ctx, commons._id);
    return {
      seeded: !song || !pinewood || !commons,
      songHomestaySeeded: !song,
      pinewoodSeeded: !pinewood,
      consensusCommonsSeeded: !commons,
    };
  },
});

export async function seedSongHomestay(ctx: MutationCtx): Promise<void> {
  const propertyId = await ctx.db.insert('properties', {
    name: 'Sóng Homestay — Đà Nẵng',
    slug: 'song-homestay',
    timezone: 'Asia/Ho_Chi_Minh',
    currency: 'VND',
    taxRateBps: 800,
    taxLabel: 'VAT (8%)',
    email: 'Songhomestay@gmail.com',
    phone: '0911.388.703',
    address: 'Đà Nẵng, Việt Nam',
    checkInTime: '14:00',
    checkOutTime: '12:00',
    active: true,
    allowPayAtProperty: true,
  });

  const now = Date.now();
  const stays = [
    {
      name: 'Sóng Garden House · Chế Lan Viên', slug: 'song-garden-house', kind: 'cabin' as const,
      accommodationType: 'Nhà nguyên căn', address: 'Chế Lan Viên, Đà Nẵng', bedrooms: 2, bathrooms: 2,
      maxOccupancy: 5, capacityKnown: true, price: 1_600_000_00,
      description: 'Ngôi nhà nguyên căn yên tĩnh với khu vườn riêng, phù hợp cho cặp đôi và gia đình nhỏ.',
      highlights: ['Vườn riêng', 'Không gian yên tĩnh', 'Bếp đầy đủ'],
    },
    {
      name: 'Sóng Sea View Apartment · Mỹ Khê', slug: 'song-sea-view-apartment', kind: 'room' as const,
      accommodationType: 'Căn hộ', address: 'Mỹ Khê, Đà Nẵng', bedrooms: 2, bathrooms: 2,
      maxOccupancy: 5, capacityKnown: true, price: 1_200_000_00,
      description: 'Căn hộ hai phòng ngủ có ban công riêng nhìn ra biển Mỹ Khê, thuận tiện cho kỳ nghỉ gia đình.',
      highlights: ['Ban công hướng biển', 'Gần biển Mỹ Khê', 'Bếp riêng'],
    },
    {
      name: 'Sóng Coastal Apartment · Mỹ Khê', slug: 'song-coastal-apartment', kind: 'room' as const,
      accommodationType: 'Căn hộ', address: 'Mỹ Khê, Đà Nẵng', bedrooms: 2, bathrooms: 2,
      maxOccupancy: 5, capacityKnown: true, price: 1_200_000_00,
      description: 'Căn hộ ven biển thoáng sáng với ban công quầy bar, cách bãi biển Mỹ Khê vài phút.',
      highlights: ['Ban công quầy bar', 'Gần biển', 'Không gian thoáng'],
    },
    {
      name: 'Sóng Pool Villa · K65 Tô Hiến Thành', slug: 'song-pool-villa', kind: 'cabin' as const,
      accommodationType: 'Biệt thự', address: 'K65 Tô Hiến Thành, Đà Nẵng', bedrooms: 4, bathrooms: 4,
      maxOccupancy: 8, capacityKnown: true, price: 3_500_000_00,
      description: 'Biệt thự bốn phòng ngủ dành cho nhóm bạn và gia đình đông, có hồ bơi trong nhà và sân thượng riêng.',
      highlights: ['Hồ bơi trong nhà', 'Sân thượng riêng', 'Phù hợp nhóm đông'],
    },
    {
      name: 'Sóng Rooftop House · An Thượng 17', slug: 'song-rooftop-house', kind: 'cabin' as const,
      accommodationType: 'Nhà nguyên căn', address: 'An Thượng 17, Đà Nẵng', bedrooms: 6, bathrooms: 6,
      maxOccupancy: 0, capacityKnown: false, price: 5_200_000_00,
      description: 'Nhà nguyên căn sáu phòng ngủ với sân thượng BBQ và hướng nhìn núi Sơn Trà.',
      highlights: ['Sân thượng BBQ', 'Hướng núi Sơn Trà', 'Không gian cho đoàn'],
    },
  ];

  for (const [index, stay] of stays.entries()) {
    const photoUrls = [
      SONG_HOMESTAY_PHOTO_URLS[index % SONG_HOMESTAY_PHOTO_URLS.length],
      ...SONG_HOMESTAY_PHOTO_URLS.filter((_, photoIndex) => photoIndex !== index % SONG_HOMESTAY_PHOTO_URLS.length),
    ];
    const unitTypeId = await ctx.db.insert('unitTypes', {
      propertyId,
      name: stay.name,
      slug: stay.slug,
      kind: stay.kind,
      bookingMode: 'nightly',
      description: stay.description,
      photoUrls,
      maxOccupancy: stay.maxOccupancy,
      amenities: ['Wi-Fi', 'Điều hòa', 'Bếp', ...stay.highlights],
      address: stay.address,
      accommodationType: stay.accommodationType,
      bedrooms: stay.bedrooms,
      bathrooms: stay.bathrooms,
      capacityKnown: stay.capacityKnown,
      highlights: stay.highlights,
      policies: {
        checkIn: 'Từ 14:00',
        checkOut: 'Trước 12:00',
        children: 'Trẻ em được chào đón; cần khai báo đúng số lượng khách.',
        pets: 'Vui lòng liên hệ trước nếu đi cùng vật nuôi.',
        cancellation: 'Chính sách hủy được xác nhận cùng yêu cầu đặt phòng.',
      },
      comingSoon: false,
      sortOrder: index + 1,
    });
    await ctx.db.insert('units', {
      propertyId,
      unitTypeId,
      name: stay.name,
      slug: stay.slug,
      status: 'active',
      icalExportToken: crypto.randomUUID().replaceAll('-', ''),
      icalImports: [],
      sortOrder: index + 1,
    });
    await ctx.db.insert('ratePlans', {
      propertyId,
      unitTypeId,
      name: 'Giá tiêu chuẩn',
      active: true,
      currency: 'VND',
      baseNightlyCents: stay.price,
      seasons: [],
      minStayNights: 1,
      maxStayNights: 30,
      minLeadTimeHours: 0,
      maxAdvanceDays: 365,
      prepBufferNights: 0,
      depositPolicy: { type: 'percent', value: 30 },
      cancellationPolicy: [{ daysBefore: 7, refundPercent: 100 }, { daysBefore: 0, refundPercent: 0 }],
    });
  }

  await ctx.db.insert('promoCodes', {
    propertyId, code: 'SONGDANANG10', normalizedCode: 'SONGDANANG10', kind: 'percent', valueBps: 1_000,
    description: 'Ưu đãi đặt phòng trực tiếp tại website Sóng Homestay — Giảm 10%', oncePerGuest: false,
    appliesToUnitTypes: [], active: true, redemptionCount: 0, createdAt: now,
  });
  const services = [
    { name: 'Thuê xe máy', priceCents: 150_000_00, unitLabel: 'ngày' },
    { name: 'Đưa đón sân bay', priceCents: 200_000_00, unitLabel: 'lượt' },
    { name: 'Vé tham quan Bà Nà Hills', priceCents: 950_000_00, unitLabel: 'vé' },
  ];
  for (const [index, service] of services.entries()) {
    await ctx.db.insert('addOns', {
      propertyId, ...service, taxable: false, appliesTo: [], active: true, sortOrder: index + 1,
    });
  }
}

/** Retained only as a migration reference for pre-v2 local demo data. */
export async function seedLegacySongHomestay(ctx: MutationCtx): Promise<void> {
  const propertyId = await ctx.db.insert('properties', {
    name: 'Sóng Homestay — Đà Nẵng',
    slug: 'song-homestay',
    timezone: 'Asia/Ho_Chi_Minh',
    currency: 'VND',
    taxRateBps: 800, // 8% VAT
    taxLabel: 'VAT (8%)',
    email: 'booking@songhomestay.vn',
    phone: '0905 688 999',
    address: 'Mỹ Khê, Quận Sơn Trà, TP. Đà Nẵng',
    checkInTime: '14:00',
    checkOutTime: '12:00',
    active: true,
    allowPayAtProperty: true,
  });

  const now = Date.now();

  // 1. Căn hộ 2 phòng ngủ (3 căn ngắn hạn: Phòng A, Phòng B, Phòng C)
  const apt2BrTypeId = await ctx.db.insert('unitTypes', {
    propertyId,
    name: 'Căn hộ Sóng 2 Phòng Ngủ (View Biển)',
    slug: 'can-ho-2pn',
    kind: 'room',
    bookingMode: 'nightly',
    description:
      'Căn hộ 2 phòng ngủ hiện đại cách biển Mỹ Khê 150m, đầy đủ bếp riêng, phòng khách thoáng rộng và ban công đón gió biển.',
    photoUrls: SONG_HOMESTAY_PHOTO_URLS,
    maxOccupancy: 4,
    amenities: ['Cách biển 150m', '2 Phòng ngủ', 'Bếp đầy đủ', 'Wi-Fi tốc độ cao', 'Máy giặt riêng', 'Ban công view biển'],
    comingSoon: false,
    sortOrder: 1,
  });

  // Phòng A: Gắn sẵn 2 nguồn iCal giả lập (Airbnb 20-23/09 và Booking.com 22-24/09) để demo Double Booking
  await ctx.db.insert('units', {
    propertyId,
    unitTypeId: apt2BrTypeId,
    name: 'Phòng A - Căn hộ 2PN',
    slug: 'phong-a-can-ho-2pn',
    status: 'active',
    icalExportToken: seedToken('song-phong-a'),
    icalImports: [
      { label: 'Airbnb', url: '/mock-ical/airbnb-phong-a.ics' },
      { label: 'Booking.com', url: '/mock-ical/booking-phong-a.ics' },
    ],
    sortOrder: 1,
  });
  await ctx.db.insert('units', {
    propertyId,
    unitTypeId: apt2BrTypeId,
    name: 'Phòng B - Căn hộ 2PN',
    slug: 'phong-b-can-ho-2pn',
    status: 'active',
    icalExportToken: seedToken('song-phong-b'),
    icalImports: [],
    sortOrder: 2,
  });
  await ctx.db.insert('units', {
    propertyId,
    unitTypeId: apt2BrTypeId,
    name: 'Phòng C - Căn hộ 2PN',
    slug: 'phong-c-can-ho-2pn',
    status: 'active',
    icalExportToken: seedToken('song-phong-c'),
    icalImports: [],
    sortOrder: 3,
  });
  await ctx.db.insert('ratePlans', {
    propertyId,
    unitTypeId: apt2BrTypeId,
    name: 'Giá tiêu chuẩn ngắn hạn',
    active: true,
    currency: 'VND',
    baseNightlyCents: 1_200_000_00, // 1.200.000 ₫/đêm
    weeklyRateCents: 7_500_000_00,
    seasons: [],
    minStayNights: 1,
    maxStayNights: 30,
    minLeadTimeHours: 0,
    maxAdvanceDays: 365,
    prepBufferNights: 0,
    depositPolicy: { type: 'percent', value: 50 },
    cancellationPolicy: [
      { daysBefore: 5, refundPercent: 100 },
      { daysBefore: 2, refundPercent: 50 },
      { daysBefore: 0, refundPercent: 0 },
    ],
  });

  // 2. Nhà nguyên căn 2 phòng ngủ (1 căn ngắn hạn: Căn D)
  const house2BrTypeId = await ctx.db.insert('unitTypes', {
    propertyId,
    name: 'Nhà Nguyên Căn Sóng 2 Phòng Ngủ',
    slug: 'nha-nguyen-can-2pn',
    kind: 'cabin',
    bookingMode: 'nightly',
    description:
      'Nhà nguyên căn 2 tầng riêng tư có sân vườn BBQ nhỏ, 2 phòng ngủ khép kín, phù hợp gia đình hoặc nhóm bạn từ 4-5 khách.',
    photoUrls: SONG_HOMESTAY_PHOTO_URLS,
    maxOccupancy: 5,
    amenities: ['Nhà nguyên căn riêng tư', 'Sân BBQ', '2 Phòng ngủ', 'Bếp & Phòng ăn', 'Chỗ đậu ô tô'],
    comingSoon: false,
    sortOrder: 2,
  });
  await ctx.db.insert('units', {
    propertyId,
    unitTypeId: house2BrTypeId,
    name: 'Căn D - Nhà nguyên căn 2PN',
    slug: 'can-d-nha-2pn',
    status: 'active',
    icalExportToken: seedToken('song-can-d'),
    icalImports: [],
    sortOrder: 4,
  });
  await ctx.db.insert('ratePlans', {
    propertyId,
    unitTypeId: house2BrTypeId,
    name: 'Giá tiêu chuẩn ngắn hạn',
    active: true,
    currency: 'VND',
    baseNightlyCents: 1_600_000_00, // 1.600.000 ₫/đêm
    seasons: [],
    minStayNights: 1,
    maxStayNights: 30,
    minLeadTimeHours: 0,
    maxAdvanceDays: 365,
    prepBufferNights: 0,
    depositPolicy: { type: 'percent', value: 50 },
    cancellationPolicy: [
      { daysBefore: 5, refundPercent: 100 },
      { daysBefore: 0, refundPercent: 0 },
    ],
  });

  // 3. Villa 4 phòng ngủ (1 căn ngắn hạn: Căn E)
  const villa4BrTypeId = await ctx.db.insert('unitTypes', {
    propertyId,
    name: 'Villa Sóng 4 Phòng Ngủ (Hồ Bơi Riêng)',
    slug: 'villa-4pn',
    kind: 'cabin',
    bookingMode: 'nightly',
    description:
      'Biệt thự nghỉ dưỡng 4 phòng ngủ có hồ bơi riêng, phòng karaoke gia đình và không gian tiệc nướng ngoài trời.',
    photoUrls: SONG_HOMESTAY_PHOTO_URLS,
    maxOccupancy: 8,
    amenities: ['Hồ bơi riêng', '4 Phòng ngủ lớn', 'Sân vườn BBQ', 'Bếp đảo hiện đại', 'Miễn phí gửi xe'],
    comingSoon: false,
    sortOrder: 3,
  });
  await ctx.db.insert('units', {
    propertyId,
    unitTypeId: villa4BrTypeId,
    name: 'Căn E - Villa 4PN Hồ Bơi',
    slug: 'can-e-villa-4pn',
    status: 'active',
    icalExportToken: seedToken('song-can-e'),
    icalImports: [],
    sortOrder: 5,
  });
  await ctx.db.insert('ratePlans', {
    propertyId,
    unitTypeId: villa4BrTypeId,
    name: 'Giá tiêu chuẩn Villa 4PN',
    active: true,
    currency: 'VND',
    baseNightlyCents: 3_500_000_00, // 3.500.000 ₫/đêm
    seasons: [],
    minStayNights: 1,
    maxStayNights: 30,
    minLeadTimeHours: 0,
    maxAdvanceDays: 365,
    prepBufferNights: 0,
    depositPolicy: { type: 'percent', value: 50 },
    cancellationPolicy: [
      { daysBefore: 7, refundPercent: 100 },
      { daysBefore: 0, refundPercent: 0 },
    ],
  });

  // 4. Villa 6 phòng ngủ (1 căn ngắn hạn: Căn F)
  const villa6BrTypeId = await ctx.db.insert('unitTypes', {
    propertyId,
    name: 'Villa Sóng 6 Phòng Ngủ (Sát Biển Mỹ Khê)',
    slug: 'villa-6pn',
    kind: 'cabin',
    bookingMode: 'nightly',
    description:
      'Villa cao cấp 6 phòng ngủ dành cho đoàn đông đến 12 khách, hồ bơi tràn viền, sân thượng ngắm biển và khu vực bếp tiệc.',
    photoUrls: SONG_HOMESTAY_PHOTO_URLS,
    maxOccupancy: 12,
    amenities: ['6 Phòng ngủ', 'Hồ bơi tràn viền', 'Sân thượng view biển', 'Phòng khách rộng', 'Khu BBQ đoàn'],
    comingSoon: false,
    sortOrder: 4,
  });
  await ctx.db.insert('units', {
    propertyId,
    unitTypeId: villa6BrTypeId,
    name: 'Căn F - Villa 6PN Sát Biển',
    slug: 'can-f-villa-6pn',
    status: 'active',
    icalExportToken: seedToken('song-can-f'),
    icalImports: [],
    sortOrder: 6,
  });
  await ctx.db.insert('ratePlans', {
    propertyId,
    unitTypeId: villa6BrTypeId,
    name: 'Giá tiêu chuẩn Villa 6PN',
    active: true,
    currency: 'VND',
    baseNightlyCents: 5_200_000_00, // 5.200.000 ₫/đêm
    seasons: [],
    minStayNights: 1,
    maxStayNights: 30,
    minLeadTimeHours: 0,
    maxAdvanceDays: 365,
    prepBufferNights: 0,
    depositPolicy: { type: 'percent', value: 50 },
    cancellationPolicy: [
      { daysBefore: 7, refundPercent: 100 },
      { daysBefore: 0, refundPercent: 0 },
    ],
  });

  // 5. Nhà 2 phòng ngủ dài hạn (2 căn: Căn G, Căn H) -> Tổng cộng đủ 8 căn của Sóng Homestay
  const longTermHouseTypeId = await ctx.db.insert('unitTypes', {
    propertyId,
    name: 'Nhà Sóng 2 Phòng Ngủ (Ưu Đãi Lưu Trú Dài Hạn)',
    slug: 'nha-dai-han-2pn',
    kind: 'cabin',
    bookingMode: 'nightly',
    description:
      'Hai căn nhà 2 phòng ngủ yên tĩnh dành cho khách công tác, chuyên gia hoặc gia đình lưu trú dài ngày với mức giá ưu đãi.',
    photoUrls: SONG_HOMESTAY_PHOTO_URLS,
    maxOccupancy: 4,
    amenities: ['Khu dân cư yên tĩnh', '2 Phòng ngủ', 'Bàn làm việc', 'Bếp & Máy giặt sấy', 'Internet cáp quang riêng'],
    comingSoon: false,
    sortOrder: 5,
  });
  await ctx.db.insert('units', {
    propertyId,
    unitTypeId: longTermHouseTypeId,
    name: 'Căn G - Nhà dài hạn 2PN (Số 1)',
    slug: 'can-g-nha-dai-han-1',
    status: 'active',
    icalExportToken: seedToken('song-can-g'),
    icalImports: [],
    sortOrder: 7,
  });
  await ctx.db.insert('units', {
    propertyId,
    unitTypeId: longTermHouseTypeId,
    name: 'Căn H - Nhà dài hạn 2PN (Số 2)',
    slug: 'can-h-nha-dai-han-2',
    status: 'active',
    icalExportToken: seedToken('song-can-h'),
    icalImports: [],
    sortOrder: 8,
  });
  await ctx.db.insert('ratePlans', {
    propertyId,
    unitTypeId: longTermHouseTypeId,
    name: 'Giá ưu đãi lưu trú dài hạn',
    active: true,
    currency: 'VND',
    baseNightlyCents: 750_000_00, // 750.000 ₫/đêm
    weeklyRateCents: 4_500_000_00,
    seasons: [],
    minStayNights: 1,
    maxStayNights: 90,
    minLeadTimeHours: 0,
    maxAdvanceDays: 365,
    prepBufferNights: 0,
    depositPolicy: { type: 'percent', value: 30 },
    cancellationPolicy: [
      { daysBefore: 7, refundPercent: 100 },
      { daysBefore: 0, refundPercent: 0 },
    ],
  });

  // Mã giảm giá mẫu cho Sóng Homestay
  await ctx.db.insert('promoCodes', {
    propertyId,
    code: 'SONGDANANG10',
    normalizedCode: 'SONGDANANG10',
    kind: 'percent',
    valueBps: 1_000, // Giảm 10%
    description: 'Ưu đãi đặt phòng trực tiếp tại website Sóng Homestay — Giảm 10%',
    oncePerGuest: false,
    appliesToUnitTypes: [],
    active: true,
    redemptionCount: 0,
    createdAt: now,
  });

  // 3 Dịch vụ bổ sung (Add-ons) theo yêu cầu đề tài: Thuê xe máy, Vé Bà Nà Hills, Đưa đón sân bay
  await ctx.db.insert('addOns', {
    propertyId,
    name: 'Thuê xe máy (Tay ga AirBlade / Vision đời mới)',
    priceCents: 150_000_00, // 150.000 ₫ / ngày
    taxable: false,
    unitLabel: 'ngày',
    appliesTo: [],
    active: true,
    sortOrder: 1,
  });
  await ctx.db.insert('addOns', {
    propertyId,
    name: 'Vé cáp treo Bà Nà Hills (Khứ hồi + Buffet trưa)',
    priceCents: 900_000_00, // 900.000 ₫ / vé
    taxable: false,
    unitLabel: 'vé',
    appliesTo: [],
    active: true,
    sortOrder: 2,
  });
  await ctx.db.insert('addOns', {
    propertyId,
    name: 'Đưa đón sân bay Quốc tế Đà Nẵng (Xe riêng 4-7 chỗ)',
    priceCents: 250_000_00, // 250.000 ₫ / chuyến
    taxable: false,
    unitLabel: 'chuyến',
    appliesTo: [],
    active: true,
    sortOrder: 3,
  });
}

/** Keep existing fictional demo deployments aligned with binding hackathon invariants. */
async function refreshConsensusCommons(
  ctx: MutationCtx,
  propertyId: Id<'properties'>,
): Promise<void> {
  await ctx.db.patch(propertyId, { taxRateBps: 1300, taxLabel: 'HST' });
  const nodeRoom = await ctx.db
    .query('unitTypes')
    .withIndex('by_property_slug', (q) => q.eq('propertyId', propertyId).eq('slug', 'node-room'))
    .first();
  if (!nodeRoom) return;
  await ctx.db.patch(nodeRoom._id, { photoUrls: [...CONSENSUS_COMMONS_PHOTO_URLS] });
  await ensureConsensusPromo(ctx, propertyId, nodeRoom._id);
  const ratePlan = await ctx.db
    .query('ratePlans')
    .withIndex('by_unitType', (q) => q.eq('unitTypeId', nodeRoom._id).eq('active', true))
    .first();
  if (!ratePlan) return;
  await ctx.db.patch(ratePlan._id, {
    baseNightlyCents: 19,
    minStayNights: 1,
    maxStayNights: 1,
  });
}

/** Fictional, judge-safe Bitcoin++ Toronto demo inventory. */
export async function seedConsensusCommons(ctx: MutationCtx): Promise<void> {
  const propertyId = await ctx.db.insert('properties', {
    name: 'Consensus Commons',
    slug: 'consensus-commons',
    timezone: 'America/Toronto',
    currency: 'CAD',
    taxRateBps: 1300,
    taxLabel: 'HST',
    email: 'hosts@consensuscommons.example',
    phone: '555-021-0724',
    address: '21 Open Block Way, Toronto, ON',
    checkInTime: '15:00',
    checkOutTime: '11:00',
    active: true,
  });
  const roomTypeId = await ctx.db.insert('unitTypes', {
    propertyId,
    name: 'Node Room',
    slug: 'node-room',
    kind: 'room',
    bookingMode: 'nightly',
    description: 'A fictional conference stay where independent payment rails converge on one conflict-proof reservation state.',
    photoUrls: [...CONSENSUS_COMMONS_PHOTO_URLS],
    maxOccupancy: 2,
    amenities: ['Fast Wi-Fi', 'Shared hack lounge', 'Signet faucet guide', 'Late-night coffee'],
    comingSoon: false,
    sortOrder: 1,
  });
  await ensureConsensusPromo(ctx, propertyId, roomTypeId);
  for (let i = 1; i <= 4; i += 1) {
    await ctx.db.insert('units', {
      propertyId, unitTypeId: roomTypeId, name: `Node ${i}`, slug: `node-${i}`,
      status: 'active', icalExportToken: seedToken(`consensus-node-${i}`), icalImports: [], sortOrder: i,
    });
  }
  await ctx.db.insert('ratePlans', {
    propertyId, unitTypeId: roomTypeId, name: 'Hackathon rate', active: true, currency: 'CAD',
    // 19 cents + rounded 13% HST (2 cents) = the fixed CAD 0.21 / 210-sat demo.
    baseNightlyCents: 19, seasons: [], minStayNights: 1, maxStayNights: 1,
    minLeadTimeHours: 0, maxAdvanceDays: 365, prepBufferNights: 0,
    depositPolicy: { type: 'full', value: 0 },
    cancellationPolicy: [{ daysBefore: 1, refundPercent: 100 }, { daysBefore: 0, refundPercent: 0 }],
  });
}

async function ensureConsensusPromo(
  ctx: MutationCtx,
  propertyId: Id<'properties'>,
  roomTypeId: Id<'unitTypes'>,
): Promise<void> {
  const existing = await ctx.db
    .query('promoCodes')
    .withIndex('by_code', (q) => q.eq('propertyId', propertyId).eq('normalizedCode', 'CONSENSUS10'))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, {
      code: 'CONSENSUS10',
      kind: 'percent',
      valueBps: 1_000,
      valueCents: undefined,
      description: 'Consensus Commons demo — 10% off the nightly rate',
      oncePerGuest: true,
      appliesToUnitTypes: [roomTypeId],
      active: true,
    });
    return;
  }
  await ctx.db.insert('promoCodes', {
    propertyId,
    code: 'CONSENSUS10',
    normalizedCode: 'CONSENSUS10',
    kind: 'percent',
    valueBps: 1_000,
    description: 'Consensus Commons demo — 10% off the nightly rate',
    oncePerGuest: true,
    appliesToUnitTypes: [roomTypeId],
    active: true,
    redemptionCount: 0,
    createdAt: Date.now(),
  });
}

export async function seedPinewoodFlats(ctx: MutationCtx): Promise<void> {
  const propertyId = await ctx.db.insert('properties', {
    name: 'Pinewood Flats Campground',
    slug: 'pinewood-flats',
    timezone: 'America/Edmonton',
    currency: 'CAD',
    taxRateBps: 500, // 5% GST
    taxLabel: 'GST',
    gstNumber: '123456789RT0001',
    email: 'hello@pinewoodflats.example',
    phone: '555-010-2030',
    address: '1 Lakeshore Drive, Pinewood, AB',
    checkInTime: '16:00',
    checkOutTime: '11:00',
    active: true,
  });

  // --- Cabins ---
  const cabinTypeId = await ctx.db.insert('unitTypes', {
    propertyId,
    name: 'Lakeview Cabin',
    slug: 'lakeview-cabin',
    kind: 'cabin',
    bookingMode: 'nightly',
    description:
      'A cozy one-bedroom cabin with a loft, kitchenette, and a porch looking over the water. Sleeps four comfortably.',
    photoUrls: [],
    maxOccupancy: 4,
    amenities: ['Kitchenette', 'Loft bedroom', 'Porch', 'Fire pit', 'Lake view'],
    comingSoon: false,
    sortOrder: 1,
  });
  for (let i = 1; i <= 3; i += 1) {
    await ctx.db.insert('units', {
      propertyId,
      unitTypeId: cabinTypeId,
      name: `Cabin ${i}`,
      slug: `cabin-${i}`,
      status: 'active',
      icalExportToken: seedToken(`cabin-${i}`),
      icalImports: [],
      sortOrder: i,
    });
  }
  await ctx.db.insert('ratePlans', {
    propertyId,
    unitTypeId: cabinTypeId,
    name: 'Standard',
    active: true,
    currency: 'CAD',
    baseNightlyCents: 14_900,
    weeklyRateCents: 89_400, // 6 nights for 7
    seasons: [
      { label: 'Peak summer', startDate: '2026-06-15', endDate: '2026-09-01', nightlyCents: 18_900, minStayNights: 2 },
    ],
    minStayNights: 1,
    maxStayNights: 21,
    minLeadTimeHours: 0,
    maxAdvanceDays: 365,
    prepBufferNights: 0,
    depositPolicy: { type: 'percent', value: 50 },
    cancellationPolicy: [
      { daysBefore: 7, refundPercent: 100 },
      { daysBefore: 2, refundPercent: 50 },
      { daysBefore: 0, refundPercent: 0 },
    ],
  });

  // --- Yurt ---
  const yurtTypeId = await ctx.db.insert('unitTypes', {
    propertyId,
    name: 'Ridge Yurt',
    slug: 'ridge-yurt',
    kind: 'yurt',
    bookingMode: 'nightly',
    description:
      'Canvas-and-timber glamping on the ridge. Woodstove, queen bed, and the best stars on the property.',
    photoUrls: [],
    maxOccupancy: 2,
    amenities: ['Woodstove', 'Queen bed', 'Shared bathhouse', 'Fire pit'],
    comingSoon: false,
    sortOrder: 2,
  });
  await ctx.db.insert('units', {
    propertyId,
    unitTypeId: yurtTypeId,
    name: 'Yurt 1',
    slug: 'yurt-1',
    status: 'active',
    icalExportToken: seedToken('yurt-1'),
    icalImports: [],
    sortOrder: 1,
  });
  await ctx.db.insert('ratePlans', {
    propertyId,
    unitTypeId: yurtTypeId,
    name: 'Standard',
    active: true,
    currency: 'CAD',
    baseNightlyCents: 11_900,
    seasons: [],
    minStayNights: 1,
    maxStayNights: 14,
    minLeadTimeHours: 0,
    maxAdvanceDays: 365,
    prepBufferNights: 1, // turnover day between glamping stays
    depositPolicy: { type: 'first_night', value: 0 },
    cancellationPolicy: [
      { daysBefore: 3, refundPercent: 100 },
      { daysBefore: 0, refundPercent: 0 },
    ],
  });

  // --- RV sites (nightly) ---
  const siteTypeId = await ctx.db.insert('unitTypes', {
    propertyId,
    name: 'Full-Hookup RV Site',
    slug: 'rv-site',
    kind: 'site',
    bookingMode: 'nightly',
    description: '30/50-amp full-hookup pull-through sites under the pines. Fire ring and picnic table at every site.',
    photoUrls: [],
    maxOccupancy: 8,
    amenities: ['50-amp power', 'Water', 'Sewer', 'Fire ring', 'Picnic table'],
    comingSoon: false,
    sortOrder: 3,
  });
  for (let i = 1; i <= 10; i += 1) {
    await ctx.db.insert('units', {
      propertyId,
      unitTypeId: siteTypeId,
      name: `Site ${100 + i}`,
      slug: `site-${100 + i}`,
      status: 'active',
      icalExportToken: seedToken(`site-${100 + i}`),
      icalImports: [],
      sortOrder: i,
    });
  }
  await ctx.db.insert('ratePlans', {
    propertyId,
    unitTypeId: siteTypeId,
    name: 'Standard',
    active: true,
    currency: 'CAD',
    baseNightlyCents: 6_500,
    weeklyRateCents: 39_000,
    seasons: [],
    minStayNights: 1,
    maxStayNights: 28,
    minLeadTimeHours: 0,
    maxAdvanceDays: 365,
    prepBufferNights: 0,
    depositPolicy: { type: 'full', value: 0 },
    cancellationPolicy: [
      { daysBefore: 2, refundPercent: 100 },
      { daysBefore: 0, refundPercent: 0 },
    ],
  });

  // --- Promo code (demo) ---
  await ctx.db.insert('promoCodes', {
    propertyId,
    code: 'WELCOME10',
    normalizedCode: 'WELCOME10',
    kind: 'percent',
    valueBps: 1_000, // 10% off, pre-tax
    description: 'Welcome discount — 10% off your first stay',
    oncePerGuest: true,
    appliesToUnitTypes: [],
    active: true,
    redemptionCount: 0,
    createdAt: Date.now(),
  });

  // --- Add-ons ---
  await ctx.db.insert('addOns', {
    propertyId,
    name: 'Firewood bundle',
    priceCents: 1_200,
    taxable: true,
    unitLabel: 'bundle',
    appliesTo: [],
    active: true,
    sortOrder: 1,
  });
  await ctx.db.insert('addOns', {
    propertyId,
    name: 'Late checkout (1pm)',
    priceCents: 2_500,
    taxable: true,
    unitLabel: 'stay',
    appliesTo: [cabinTypeId, yurtTypeId],
    active: true,
    sortOrder: 2,
  });
}

/**
 * Deterministic seed tokens so demo iCal URLs are stable across resets.
 * Real deployments generate cryptographically random tokens (M1 admin UI).
 */
function seedToken(slug: string): string {
  return `demo-${slug}-${'x'.repeat(24)}`;
}
