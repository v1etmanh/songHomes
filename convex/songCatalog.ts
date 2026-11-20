import { internalMutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';

/**
 * Sóng Homestay's eight stays, one bookable unit each. Shared by the seed and
 * by `applyToDeployment`, which brings an existing deployment in line without
 * touching occupancy (unitNights reference units, which are kept).
 */
export type SongStay = {
  name: string;
  slug: string;
  kind: 'room' | 'cabin';
  accommodationType: string;
  address: string;
  bedrooms: number;
  bathrooms: number;
  maxOccupancy: number;
  areaSqm: number;
  /** Nightly price in VND cents. For long stays this is the monthly price / 30. */
  nightlyCents: number;
  /** Long-term rentals are priced and sold by the month. */
  monthlyCents?: number;
  longStay?: boolean;
  description: string;
  highlights: string[];
  amenities: string[];
  photoDir: string;
  photos: string[];
};

const MONTH_NIGHTS = 30;

export const SONG_STAYS: SongStay[] = [
  {
    name: 'Sóng Pool Villa - K65 Tô Hiến Thành', slug: 'song-pool-villa', kind: 'cabin',
    accommodationType: 'Biệt thự', address: 'K65 Tô Hiến Thành, Sơn Trà, Đà Nẵng',
    bedrooms: 4, bathrooms: 4, maxOccupancy: 8, areaSqm: 200, nightlyCents: 4_500_000_00,
    description: 'Biệt thự nguyên căn 4 phòng ngủ, phù hợp cho nhóm bạn và gia đình tối đa 8 khách. Căn nhà có hồ bơi riêng trong nhà kích thước 5 × 2,5 m, sân thượng riêng và không gian sinh hoạt rộng rãi. Mỗi phòng ngủ đều có phòng tắm riêng, điều hòa và giường memory foam kèm topper. Khách có thể tổ chức tiệc BBQ trên sân thượng, vui chơi và thư giãn trong không gian riêng tư, không dùng chung với khách khác.',
    highlights: ['Hồ bơi riêng trong nhà 5 × 2,5 m', 'Sân thượng BBQ', 'View thành phố và núi', '4 phòng ngủ có phòng tắm riêng', 'Bàn bi lắc', 'Không gian nguyên căn riêng tư'],
    amenities: ['Hồ bơi riêng', 'Sân thượng riêng', 'Bếp BBQ', 'Bếp từ', 'Lò vi sóng', 'Nồi cơm điện', 'Máy xay', 'Tủ lạnh', 'Máy giặt', 'Máy sấy', 'Bàn ủi', 'Điều hòa', 'TV màn hình lớn', 'Netflix', 'Sofa chữ L', 'Wi-Fi', 'Bàn bi lắc', 'Board game', 'Khóa cửa mã số', 'Chỗ đậu xe riêng', 'Vòi sen ngoài trời'],
    photoDir: 'pool-villa',
    photos: ['01-pool-lounge.webp', '02-living-room.webp', '03-rooftop.webp', '04-kitchen.webp', '05-bedroom-1.webp', '06-bedroom-2.webp', '07-bedroom-4.webp'],
  },
  {
    name: 'Sóng Garden House - Chế Lan Viên', slug: 'song-garden-house', kind: 'cabin',
    accommodationType: 'Nhà nguyên căn', address: 'K6/17 Chế Lan Viên, Đà Nẵng',
    bedrooms: 2, bathrooms: 2, maxOccupancy: 5, areaSqm: 100, nightlyCents: 1_500_000_00,
    description: 'Nhà nguyên căn 2 phòng ngủ có khu vườn riêng phía trước và phía sau, nằm trong khu dân cư yên tĩnh, cách biển Mỹ Khê vài phút đi bộ. Căn nhà phù hợp cho gia đình hoặc nhóm bạn muốn nghỉ dưỡng kết hợp làm việc. Không gian được trang bị đầy đủ bếp, khu vực làm việc, phòng khách và các tiện ích sinh hoạt như ở nhà. Khách còn được sử dụng miễn phí 2 xe đạp để khám phá khu vực xung quanh.',
    highlights: ['Vườn riêng trước và sau nhà', 'Gần biển Mỹ Khê', 'Wi-Fi 500 Mbps', '2 xe đạp miễn phí', 'Góc làm việc riêng', 'Gần chợ Bắc Mỹ An', 'Khu dân cư yên tĩnh'],
    amenities: ['Vườn riêng', 'Bếp đầy đủ dụng cụ', 'Bếp nấu', 'Tủ lạnh', 'Lò vi sóng', 'Bàn ăn', 'Wi-Fi 500 Mbps', 'Smart TV', 'Netflix', 'YouTube', 'Máy giặt', 'Giá phơi', 'Bàn ủi', 'Góc làm việc', 'Bàn làm việc', 'Kệ sách', 'Thảm yoga', 'Board game', '2 xe đạp miễn phí', 'Điều hòa', 'Phòng tắm riêng', 'Trà và cà phê miễn phí'],
    photoDir: 'garden-house',
    photos: ['01-garden.webp', '02-living-garden.webp', '03-living-stairs.webp', '04-dining-kitchen.webp', '05-dining.webp'],
  },
  {
    name: 'Sóng Rooftop House - An Thượng 17', slug: 'song-rooftop-house', kind: 'cabin',
    accommodationType: 'Nhà nguyên căn', address: '12 An Thượng 17, Đà Nẵng',
    bedrooms: 6, bathrooms: 6, maxOccupancy: 12, areaSqm: 250, nightlyCents: 2_500_000_00,
    description: 'Nhà nguyên căn 6 phòng ngủ, phù hợp cho nhóm bạn đông người hoặc gia đình nhiều thành viên, sức chứa dự kiến tối đa 12 khách. Mỗi phòng đều có phòng tắm riêng, điều hòa, Wi-Fi tốc độ cao và giường king hoặc queen với nệm memory foam. Điểm nhấn của căn nhà là sân thượng rộng với khu vực BBQ ngoài trời, nhiều cây xanh và tầm nhìn hướng thành phố, núi Sơn Trà. Không gian phòng khách có sofa chữ L, Smart TV và nhiều trò chơi giải trí. Nhà nằm tại khu An Thượng, cách biển Mỹ Khê khoảng 10 phút đi bộ.',
    highlights: ['6 phòng ngủ riêng biệt', '6 phòng tắm riêng', 'Sân thượng BBQ', 'View núi Sơn Trà', 'Bàn bi lắc', 'Nhiều trò chơi giải trí', 'Gần biển Mỹ Khê', 'Không gian nguyên căn riêng tư'],
    amenities: ['Sân thượng riêng', 'Khu vực BBQ', 'Bếp nướng', 'Bếp từ', 'Lò vi sóng', 'Tủ lạnh lớn', 'Nồi chảo', 'Bát đĩa', 'Điều hòa', 'Wi-Fi tốc độ cao', 'Smart TV', 'Netflix', 'Sofa chữ L', 'Bàn bi lắc', 'Cờ vua', 'Board game', 'Máy giặt', 'Máy sấy', 'Giá phơi', 'Bàn ủi', 'Bàn làm việc', 'Ban công riêng tại một số phòng', 'Phòng tắm riêng', 'Nước nóng', 'Khăn tắm', 'Dầu gội và sữa tắm'],
    photoDir: 'rooftop-house',
    photos: ['01-living-foosball.webp', '02-kitchen.webp', '03-dining.webp', '04-bedroom-balcony.webp', '05-bedroom-desk.webp', '06-bedroom-classic.webp'],
  },
  {
    name: 'Sóng Sea View Apartment - Mỹ Khê', slug: 'song-sea-view-apartment', kind: 'room',
    accommodationType: 'Căn hộ', address: '51 Trần Bạch Đằng, Ngũ Hành Sơn, Đà Nẵng',
    bedrooms: 2, bathrooms: 2, maxOccupancy: 5, areaSqm: 60, nightlyCents: 1_000_000_00,
    description: 'Căn hộ nguyên căn rộng 60 m², gồm 2 phòng ngủ, 2 phòng tắm và ban công riêng hướng biển Mỹ Khê. Không gian được thiết kế hiện đại với phòng khách ốp gỗ sáng màu, sofa rộng rãi, khu vực bếp đầy đủ tiện nghi và góc làm việc riêng. Ban công có quầy bar và ghế cao, thích hợp để thưởng thức cà phê và ngắm cảnh biển. Phòng ngủ chính được trang bị máy chiếu, phù hợp cho gia đình hoặc nhóm bạn tối đa 5 khách.',
    highlights: ['Ban công riêng view biển', 'Quầy bar ban công', 'Gần biển Mỹ Khê', 'Máy chiếu giải trí', 'Wi-Fi 500 Mbps', '2 phòng ngủ, 2 phòng tắm', 'Hỗ trợ khách 24/7'],
    amenities: ['Ban công riêng', 'Quầy bar', 'Ghế cao', 'Bếp từ', 'Tủ lạnh', 'Lò vi sóng', 'Bàn ăn', 'Máy chiếu', 'TV', 'Netflix', 'Wi-Fi 500 Mbps', 'Điều hòa', 'Máy giặt', 'Máy sấy', 'Giường queen', 'Bàn làm việc', 'Cửa sổ lớn', '2 phòng tắm riêng', 'Nước nóng', 'Nước lọc', 'Khăn tắm', 'Đồ dùng cá nhân'],
    photoDir: 'sea-view-apartment',
    photos: ['01-balcony-sea-view.webp', '02-my-khe-view.webp', '03-balcony.webp', '04-living-room.webp', '05-bedroom-master.webp', '06-bedroom-2.webp'],
  },
  {
    name: 'Sóng Coastal Apartment - Mỹ Khê', slug: 'song-coastal-apartment', kind: 'room',
    accommodationType: 'Căn hộ', address: '51 Trần Bạch Đằng, Ngũ Hành Sơn, Đà Nẵng',
    bedrooms: 2, bathrooms: 2, maxOccupancy: 5, areaSqm: 60, nightlyCents: 1_000_000_00,
    description: 'Căn hộ nguyên căn rộng 60 m², gồm 2 phòng ngủ với giường queen, 2 phòng tắm và ban công riêng có quầy bar nhìn ra biển Mỹ Khê. Căn hộ cách biển khoảng 1 phút đi bộ, được thiết kế với phòng khách tiện nghi, khu vực bếp kính vàng hiện đại và bàn ăn gần ban công. Phòng ngủ chính có máy chiếu phục vụ nhu cầu giải trí. Căn hộ được trang bị đầy đủ tiện nghi sinh hoạt, phù hợp cho gia đình hoặc nhóm bạn tối đa 5 khách muốn nghỉ dưỡng gần biển.',
    highlights: ['Cách biển Mỹ Khê 1 phút đi bộ', 'Ban công riêng view biển', 'Quầy bar ban công', 'Máy chiếu giải trí', 'Wi-Fi 500 Mbps', '2 phòng ngủ giường queen', 'Hỗ trợ khách 24/7'],
    amenities: ['Ban công riêng', 'Quầy bar', 'Ghế gỗ', 'Bếp kính vàng', 'Tủ lạnh', 'Lò vi sóng', 'Ấm đun nước', 'Nồi chảo', 'Bát đĩa', 'Bàn ăn', 'Máy chiếu', 'Smart TV', 'Netflix', 'Wi-Fi 500 Mbps', 'Điều hòa', 'Máy giặt', 'Máy sấy', '2 giường queen', '2 phòng tắm riêng', 'Nước nóng', 'Nước lọc', 'Khăn tắm', 'Đồ dùng cá nhân'],
    photoDir: 'coastal-apartment',
    photos: ['01-balcony-sea-view.webp', '02-my-khe-panorama.webp', '03-living-room.webp', '04-dining.webp', '05-kitchen-dining.webp'],
  },
  {
    name: 'Sóng Ocean View Apartment - Mường Thanh', slug: 'song-ocean-view-apartment', kind: 'room',
    accommodationType: 'Căn hộ', address: '51 Trần Bạch Đằng, Ngũ Hành Sơn, Đà Nẵng',
    bedrooms: 2, bathrooms: 2, maxOccupancy: 5, areaSqm: 60, nightlyCents: 1_000_000_00,
    description: 'Căn hộ nguyên căn rộng 60 m², gồm 2 phòng ngủ với giường queen, 2 phòng tắm và ban công riêng có quầy bar nhìn ra biển Mỹ Khê. Căn hộ cách biển khoảng 1 phút đi bộ, được thiết kế với phòng khách tiện nghi, khu vực bếp kính vàng hiện đại và bàn ăn gần ban công. Phòng ngủ chính có máy chiếu phục vụ nhu cầu giải trí. Căn hộ được trang bị đầy đủ tiện nghi sinh hoạt, phù hợp cho gia đình hoặc nhóm bạn tối đa 5 khách muốn nghỉ dưỡng gần biển.',
    highlights: ['Cách biển Mỹ Khê 1 phút đi bộ', 'Ban công riêng view biển', 'Quầy bar ban công', 'Máy chiếu giải trí', 'Wi-Fi 500 Mbps', '2 phòng ngủ giường queen', 'Hỗ trợ khách 24/7'],
    amenities: ['Ban công riêng', 'Quầy bar', 'Ghế gỗ', 'Bếp kính vàng', 'Tủ lạnh', 'Lò vi sóng', 'Ấm đun nước', 'Nồi chảo', 'Bát đĩa', 'Bàn ăn', 'Máy chiếu', 'Smart TV', 'Netflix', 'Wi-Fi 500 Mbps', 'Điều hòa', 'Máy giặt', 'Máy sấy', '2 giường queen', '2 phòng tắm riêng', 'Nước nóng', 'Nước lọc', 'Khăn tắm', 'Đồ dùng cá nhân'],
    photoDir: 'ocean-view-apartment',
    photos: ['01.jpg', '02.jpg', '03.jpg', '04.jpg', '05.jpg'],
  },
  {
    name: 'Sóng An Thượng House - 28 An Thượng 21', slug: 'song-an-thuong-house', kind: 'cabin',
    accommodationType: 'Nhà nguyên căn', address: '28 An Thượng 21, Ngũ Hành Sơn, Đà Nẵng',
    bedrooms: 2, bathrooms: 2, maxOccupancy: 5, areaSqm: 100,
    nightlyCents: Math.round(25_000_000_00 / MONTH_NIGHTS / 100) * 100, monthlyCents: 25_000_000_00, longStay: true,
    description: 'Sóng An Thượng House là căn nhà nguyên căn 2 phòng ngủ nằm tại khu vực An Thượng, Đà Nẵng. Với thiết kế hiện đại, không gian sinh hoạt rộng rãi và cách bố trí tiện nghi, căn nhà mang đến môi trường sống thoải mái, riêng tư cho gia đình nhỏ hoặc nhóm khách lưu trú dài hạn. Nhà gồm phòng khách, khu vực bếp và bàn ăn riêng, 2 phòng ngủ được trang bị giường queen cùng 2 phòng tắm tiện nghi. Không gian phù hợp cho khách muốn kết hợp sinh hoạt, nghỉ ngơi và làm việc trong thời gian dài.',
    highlights: ['Nhà nguyên căn riêng tư', '2 phòng ngủ, 2 phòng tắm', 'Phòng khách rộng rãi', 'Bếp riêng đầy đủ tiện nghi', 'Khu vực An Thượng thuận tiện', 'Phù hợp lưu trú dài hạn'],
    amenities: ['Phòng khách', 'Sofa', 'Smart TV', 'Wi-Fi', '2 phòng ngủ', 'Giường queen', 'Điều hòa', '2 phòng tắm', 'Nước nóng', 'Bếp riêng', 'Bếp từ', 'Tủ lạnh', 'Lò vi sóng', 'Nồi cơm điện', 'Bàn ăn', 'Máy giặt', 'Giá phơi quần áo', 'Bàn ủi', 'Tủ quần áo', 'Dụng cụ nhà bếp cơ bản'],
    photoDir: 'an-thuong-house',
    photos: ['01.jpg', '02.jpg', '03.jpg', '04.jpg', '05.jpg'],
  },
  {
    name: 'Sóng Dương Tôn Hải House - 73 Dương Tôn Hải', slug: 'song-duong-ton-hai-house', kind: 'cabin',
    accommodationType: 'Nhà nguyên căn', address: '73 Dương Tôn Hải, Ngũ Hành Sơn, Đà Nẵng',
    bedrooms: 2, bathrooms: 2, maxOccupancy: 5, areaSqm: 90,
    nightlyCents: Math.round(25_000_000_00 / MONTH_NIGHTS / 100) * 100, monthlyCents: 25_000_000_00, longStay: true,
    description: 'Sóng Dương Tôn Hải House là căn nhà nguyên căn 2 phòng ngủ, tọa lạc tại đường Dương Tôn Hải, Đà Nẵng. Căn nhà được thiết kế theo phong cách hiện đại, ưu tiên sự tiện nghi và tối ưu không gian sinh hoạt. Bên trong gồm phòng khách kết hợp khu vực tiếp khách, bếp riêng, bàn ăn và 2 phòng ngủ phù hợp cho gia đình nhỏ. Các khu vực sinh hoạt được bố trí độc lập, tạo cảm giác thoải mái và riêng tư. Với đầy đủ tiện ích cơ bản phục vụ đời sống hằng ngày, căn nhà là lựa chọn phù hợp cho khách có nhu cầu thuê dài hạn.',
    highlights: ['Nhà nguyên căn', '2 phòng ngủ, 2 phòng tắm', 'Không gian sinh hoạt riêng tư', 'Bếp riêng', 'Đầy đủ tiện ích gia đình', 'Phù hợp thuê dài hạn'],
    amenities: ['Phòng khách', 'Sofa', 'Smart TV', 'Wi-Fi', '2 phòng ngủ', 'Giường queen', 'Điều hòa', '2 phòng tắm', 'Nước nóng', 'Bếp riêng', 'Bếp từ', 'Tủ lạnh', 'Lò vi sóng', 'Ấm đun nước', 'Bàn ăn', 'Máy giặt', 'Giá phơi quần áo', 'Tủ quần áo', 'Bàn ủi', 'Dụng cụ nhà bếp cơ bản'],
    photoDir: 'duong-ton-hai-house',
    photos: ['01.jpg', '02.jpg', '03.jpg', '04.jpg', '05.jpg'],
  },
];

export function songStayPhotoUrls(stay: SongStay): string[] {
  return stay.photos.map((photo) => `/song-homestay/stays/${stay.photoDir}/${photo}`);
}

const POLICIES = {
  checkIn: 'Từ 14:00',
  checkOut: 'Trước 12:00',
  children: 'Trẻ em được chào đón; cần khai báo đúng số lượng khách.',
  pets: 'Vui lòng liên hệ trước nếu đi cùng thú cưng.',
  cancellation: 'Chính sách hủy được xác nhận cùng yêu cầu đặt phòng.',
};

function unitTypeFields(stay: SongStay, index: number) {
  return {
    name: stay.name,
    slug: stay.slug,
    kind: stay.kind,
    bookingMode: 'nightly' as const,
    description: stay.description,
    photoUrls: songStayPhotoUrls(stay),
    maxOccupancy: stay.maxOccupancy,
    amenities: stay.amenities,
    address: stay.address,
    accommodationType: stay.accommodationType,
    bedrooms: stay.bedrooms,
    bathrooms: stay.bathrooms,
    areaSqm: stay.areaSqm,
    capacityKnown: true,
    highlights: stay.highlights,
    policies: POLICIES,
    longStay: stay.longStay ?? false,
    monthlyPriceCents: stay.monthlyCents,
    comingSoon: false,
    sortOrder: index + 1,
  };
}

function ratePlanFields(stay: SongStay) {
  return {
    name: stay.longStay ? 'Giá thuê dài hạn' : 'Giá tiêu chuẩn',
    active: true,
    currency: 'VND',
    baseNightlyCents: stay.nightlyCents,
    seasons: [],
    minStayNights: stay.longStay ? MONTH_NIGHTS : 1,
    maxStayNights: stay.longStay ? 365 : 30,
    minLeadTimeHours: 0,
    maxAdvanceDays: 365,
    prepBufferNights: 0,
    depositPolicy: { type: 'percent' as const, value: 30 },
    cancellationPolicy: [{ daysBefore: 7, refundPercent: 100 }, { daysBefore: 0, refundPercent: 0 }],
  };
}

const normalize = (value: string) =>
  value.normalize('NFC').toLowerCase().replace(/[·–—-]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Upsert the catalog onto a property. Existing unit types are matched by slug,
 * then by name; existing units keep their id (and so their occupancy, iCal
 * feeds and booking history) and are reassigned in sortOrder. Bookings follow
 * their unit to its new unit type so prices and admin views stay consistent.
 */
export async function upsertSongCatalog(ctx: MutationCtx, propertyId: Id<'properties'>) {
  const types = await ctx.db.query('unitTypes').withIndex('by_property', (q) => q.eq('propertyId', propertyId)).collect();
  const units = (await ctx.db.query('units').withIndex('by_property', (q) => q.eq('propertyId', propertyId)).collect())
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const claimed = new Set<Id<'unitTypes'>>();
  const result: Array<{ unitTypeId: Id<'unitTypes'>; unitId: Id<'units'> }> = [];
  for (const [index, stay] of SONG_STAYS.entries()) {
    const match =
      types.find((t) => !claimed.has(t._id) && t.slug === stay.slug) ??
      types.find((t) => !claimed.has(t._id) && normalize(t.name) === normalize(stay.name));
    const fields = unitTypeFields(stay, index);
    let unitTypeId: Id<'unitTypes'>;
    if (match) {
      unitTypeId = match._id;
      await ctx.db.patch(unitTypeId, fields);
    } else {
      unitTypeId = await ctx.db.insert('unitTypes', { propertyId, ...fields });
    }
    claimed.add(unitTypeId);

    const plans = await ctx.db.query('ratePlans').withIndex('by_unitType', (q) => q.eq('unitTypeId', unitTypeId)).collect();
    const plan = plans.find((p) => p.active) ?? plans[0];
    if (plan) await ctx.db.patch(plan._id, ratePlanFields(stay));
    else await ctx.db.insert('ratePlans', { propertyId, unitTypeId, ...ratePlanFields(stay) });

    const existing: Doc<'units'> | undefined = units[index];
    let unitId: Id<'units'>;
    if (existing) {
      unitId = existing._id;
      await ctx.db.patch(unitId, { unitTypeId, name: stay.name, sortOrder: index + 1 });
      if (existing.unitTypeId !== unitTypeId) {
        const bookings = await ctx.db.query('bookings').withIndex('by_unit_checkIn', (q) => q.eq('unitId', unitId)).collect();
        for (const booking of bookings) if (booking.unitTypeId !== unitTypeId) await ctx.db.patch(booking._id, { unitTypeId });
      }
    } else {
      unitId = await ctx.db.insert('units', {
        propertyId, unitTypeId, name: stay.name, slug: stay.slug, status: 'active',
        icalExportToken: crypto.randomUUID().replaceAll('-', ''), icalImports: [], sortOrder: index + 1,
      });
    }
    result.push({ unitTypeId, unitId });
  }
  // Unit types left without a unit are retired from sale rather than deleted:
  // old bookings and rate plans may still point at them.
  const liveTypes = new Set(result.map((r) => r.unitTypeId));
  const stillUsed = new Set((await ctx.db.query('units').withIndex('by_property', (q) => q.eq('propertyId', propertyId)).collect()).map((u) => u.unitTypeId));
  for (const type of types) {
    if (liveTypes.has(type._id) || stillUsed.has(type._id)) continue;
    await ctx.db.patch(type._id, { comingSoon: true, sortOrder: 100 + type.sortOrder });
  }
  return result;
}

/** Stays of this many nights or more get one airport pickup leg free. */
export const SONG_FREE_PICKUP_MIN_NIGHTS = 3;

/**
 * Add-ons offered while booking: transport is bookable, tour advice is free.
 * Airport transfer is sold per leg: pickup (đón) and drop-off (tiễn) are
 * separate add-ons so only the pickup carries the stay-length perk — from
 * SONG_FREE_PICKUP_MIN_NIGHTS nights one pickup leg is free.
 */
export const SONG_ADD_ONS: Array<{ name: string; priceCents: number; unitLabel: string; freeFirstUnitMinNights?: number }> = [
  { name: 'Thuê xe máy (Tay ga Vision / Air Blade / Lead 125)', priceCents: 150_000_00, unitLabel: 'ngày' },
  { name: 'Đón sân bay Đà Nẵng (Xe riêng 7 chỗ)', priceCents: 150_000_00, unitLabel: 'lượt', freeFirstUnitMinNights: SONG_FREE_PICKUP_MIN_NIGHTS },
  { name: 'Đón sân bay Đà Nẵng (Xe 16 chỗ)', priceCents: 300_000_00, unitLabel: 'lượt', freeFirstUnitMinNights: SONG_FREE_PICKUP_MIN_NIGHTS },
  { name: 'Tiễn sân bay Đà Nẵng (Xe riêng 7 chỗ)', priceCents: 150_000_00, unitLabel: 'lượt' },
  { name: 'Tiễn sân bay Đà Nẵng (Xe 16 chỗ)', priceCents: 300_000_00, unitLabel: 'lượt' },
  { name: 'Tư vấn tour tham quan du lịch Đà Nẵng (Miễn phí)', priceCents: 0, unitLabel: 'lượt' },
];

/**
 * Replace the add-on menu. Old add-ons are deactivated, never deleted:
 * bookingAddOns keep their name/price snapshot either way.
 */
export async function upsertSongAddOns(ctx: MutationCtx, propertyId: Id<'properties'>) {
  const existing = await ctx.db.query('addOns').withIndex('by_property', (q) => q.eq('propertyId', propertyId)).collect();
  const kept = new Set<Id<'addOns'>>();
  for (const [index, addOn] of SONG_ADD_ONS.entries()) {
    const match = existing.find((row) => row.name === addOn.name);
    const fields = { freeFirstUnitMinNights: undefined, ...addOn, taxable: false, appliesTo: [], active: true, sortOrder: index + 1 };
    if (match) {
      await ctx.db.patch(match._id, fields);
      kept.add(match._id);
    } else {
      kept.add(await ctx.db.insert('addOns', { propertyId, ...fields }));
    }
  }
  for (const row of existing) if (!kept.has(row._id) && row.active) await ctx.db.patch(row._id, { active: false });
}

/** One-off: bring an existing Sóng deployment in line with the catalog. Run: npx convex run songCatalog:applyToDeployment */
export const applyToDeployment = internalMutation({
  args: {},
  handler: async (ctx) => {
    const song = await ctx.db.query('properties').withIndex('by_slug', (q) => q.eq('slug', 'song-homestay')).first();
    if (!song) return { applied: false };
    const stays = await upsertSongCatalog(ctx, song._id);
    await upsertSongAddOns(ctx, song._id);
    return { applied: true, stays: stays.length };
  },
});
