import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { FunctionReturnType } from 'convex/server';
import {
  ArrowRight,
  Bike,
  ChefHat,
  Clock3,
  MapPin,
  Martini,
  Plane,
  Search,
  Sofa,
  Star,
  Ticket,
  Users,
  Waves,
  Map as MapIcon,
} from 'lucide-react';

import type { api } from '../../convex/_generated/api';
import { todayIso } from '../lib/dates';
import { formatMoney } from '../lib/money';

type Property = NonNullable<FunctionReturnType<typeof api.properties.bySlug>>;
type UnitType = Property['unitTypes'][number];

const ROOM_IMAGES = [
  '/song-homestay/apartment.webp',
  '/song-homestay/townhouse.webp',
  '/song-homestay/family.webp',
  '/song-homestay/hero.webp',
  '/song-homestay/studio.webp',
];

/**
 * Amenity photos. These are crops of the existing showcase images until real
 * Sóng photos are dropped in — replace `src` (and drop `crop`) per amenity.
 */
const AMENITIES = [
  { title: 'Hồ bơi', text: 'Làn nước mát giữa khu vườn nhiệt đới, dành cho những buổi chiều thật chậm.', icon: Waves, src: '/song-homestay/townhouse.webp', crop: { position: '50% 55%', scale: 2.2 } },
  { title: 'Quầy bar', text: 'Một ly nước mát, vài câu chuyện cùng bạn đồng hành khi hoàng hôn buông.', icon: Martini, src: '/song-homestay/townhouse.webp', crop: { position: '88% 68%', scale: 2.4 } },
  { title: 'Khu bếp', text: 'Bếp đầy đủ dụng cụ để bạn tự tay nấu bữa sáng hay một bữa tối hải sản.', icon: ChefHat, src: '/song-homestay/townhouse.webp', crop: { position: '100% 45%', scale: 2.6 } },
  { title: 'Không gian sinh hoạt chung', text: 'Phòng khách rộng, ánh sáng tự nhiên — nơi cả nhóm quây quần mỗi tối.', icon: Sofa, src: '/song-homestay/apartment.webp' },
] as const;

const SERVICES = [
  { title: 'Thuê xe máy', text: 'Tự do khám phá Đà Nẵng với xe tay ga giao tận nơi.', icon: Bike },
  { title: 'Đưa đón sân bay', text: 'Xe riêng đón bạn tại sân bay, đưa thẳng về Sóng.', icon: Plane },
  { title: 'Vé tham quan & vui chơi', text: 'Hỗ trợ đặt vé Bà Nà Hills và các điểm vui chơi nổi bật.', icon: Ticket },
  { title: 'Tour du lịch & khám phá', text: 'Khám phá Đà Nẵng, Hội An và các điểm lân cận cùng Sóng.', icon: MapIcon },
];

const EXPERIENCES_URL = '/p/song-homestay/experiences';

function photoFor(unitType: UnitType, index: number) {
  return unitType.photoUrls[0] ?? ROOM_IMAGES[index % ROOM_IMAGES.length];
}

function roomUrl(property: Property, unitType: UnitType) {
  return `/p/${property.slug}/stay/${unitType.slug}`;
}

/** Section heading in the "Escape the *ordinary*" style: sans with an italic serif accent. */
function Heading({ eyebrow, lead, accent, light = false, center = false }: { eyebrow: string; lead: string; accent: string; light?: boolean; center?: boolean }) {
  return (
    <div className={center ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}>
      <p className={`text-xs font-bold uppercase tracking-[0.28em] ${light ? 'text-sky-200' : 'text-[#1f74b8]'}`}>{eyebrow}</p>
      <h2 className={`mt-3 font-sans text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-5xl ${light ? 'text-white' : 'text-[#0b2e4f]'}`}>
        {lead} <span className="font-accent font-normal italic tracking-normal">{accent}</span>
      </h2>
    </div>
  );
}

function DetailButton({ property, unitType, className = '' }: { property: Property; unitType: UnitType; className?: string }) {
  if (unitType.comingSoon) {
    return <span className={`inline-flex cursor-not-allowed items-center rounded-full border border-slate-300 px-6 py-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-400 ${className}`}>Sắp mở</span>;
  }
  return (
    <Link to={roomUrl(property, unitType)} className={`inline-flex items-center gap-2 rounded-full bg-[#0b2e4f] px-6 py-3 text-xs font-bold uppercase tracking-[0.18em] text-white transition hover:bg-[#1565a8] ${className}`}>
      Xem chi tiết <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

function RoomFacts({ property, unitType }: { property: Property; unitType: UnitType }) {
  return (
    <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold text-[#1565a8]">
      <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" aria-hidden="true" />{unitType.maxOccupancy ? `Tối đa ${unitType.maxOccupancy} khách` : 'Liên hệ sức chứa'}</span>
      {unitType.fromPriceCents ? <span>Từ {formatMoney(unitType.fromPriceCents, property.currency)} / đêm</span> : null}
    </p>
  );
}

/**
 * Desktop: a sticky stage whose photo and description follow the scroll
 * position through the room list. Mobile: plain stacked cards.
 */
function RoomShowcase({ property }: { property: Property }) {
  const rooms = property.unitTypes;
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    function onScroll() {
      const el = track.current;
      if (!el || !el.offsetParent) return; // hidden below lg
      const rect = el.getBoundingClientRect();
      const range = rect.height - window.innerHeight;
      if (range <= 0) return;
      const progress = Math.min(0.9999, Math.max(0, -rect.top / range));
      setActive(Math.floor(progress * rooms.length));
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [rooms.length]);

  function jumpTo(index: number) {
    const el = track.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const range = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + ((index + 0.5) / rooms.length) * range, behavior: 'smooth' });
  }

  if (!rooms.length) return null;
  const current = rooms[Math.min(active, rooms.length - 1)];

  return (
    <section id="rooms" className="scroll-mt-24 bg-[#eef4fa]">
      {/* Desktop scroll-driven stage */}
      <div ref={track} className="relative hidden lg:block" style={{ height: `${100 + rooms.length * 55}vh` }}>
        <div className="sticky top-0 flex h-screen items-center px-8 pb-6 pt-28">
          <div className="mx-auto grid w-full max-w-6xl grid-cols-[1.15fr_.85fr] items-center gap-14">
            <div className="relative h-[min(64vh,34rem)] overflow-hidden rounded-[2rem] bg-sky-100 shadow-[0_30px_70px_rgba(8,47,85,0.18)]">
              {rooms.map((unitType, index) => (
                <img
                  key={unitType.unitTypeId}
                  src={photoFor(unitType, index)}
                  alt={`${unitType.name} tại Sóng Homestay`}
                  className={`absolute inset-0 h-full w-full object-cover transition duration-700 ease-out ${index === active ? 'scale-100 opacity-100' : 'scale-105 opacity-0'}`}
                  loading={index === 0 ? 'eager' : 'lazy'}
                />
              ))}
              <span className="absolute bottom-5 left-5 rounded-full bg-white/90 px-4 py-1.5 text-xs font-bold text-[#0b2e4f] backdrop-blur">
                {String(active + 1).padStart(2, '0')} / {String(rooms.length).padStart(2, '0')}
              </span>
            </div>
            <div>
              <Heading eyebrow="Chỗ nghỉ tại Sóng" lead="Your space," accent="your kind of stay." />
              <ul className="mt-6 border-t border-[#0b2e4f]/15">
                {rooms.map((unitType, index) => (
                  <li key={unitType.unitTypeId} className="border-b border-[#0b2e4f]/15">
                    <button
                      type="button"
                      onClick={() => jumpTo(index)}
                      aria-current={index === active}
                      className={`flex w-full items-center justify-between gap-3 py-2.5 text-left font-accent text-xl transition ${index === active ? 'text-[#1565a8]' : 'text-[#0b2e4f]/55 hover:text-[#0b2e4f]'}`}
                    >
                      <span>{unitType.name}</span>
                      <ArrowRight className={`h-4 w-4 shrink-0 transition ${index === active ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-0'}`} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              <div key={current.unitTypeId} className="mt-5 animate-[songFade_.5s_ease-out]">
                <p className="line-clamp-3 text-[15px] leading-7 text-slate-600">{current.description}</p>
                <div className="mt-4"><RoomFacts property={property} unitType={current} /></div>
                <DetailButton property={property} unitType={current} className="mt-6" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile / tablet cards */}
      <div className="px-5 py-20 sm:px-8 lg:hidden">
        <Heading eyebrow="Chỗ nghỉ tại Sóng" lead="Your space," accent="your kind of stay." />
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {rooms.map((unitType, index) => (
            <article key={unitType.unitTypeId} className="overflow-hidden rounded-[1.75rem] bg-white shadow-[0_12px_35px_rgba(8,47,85,0.09)]">
              <img src={photoFor(unitType, index)} alt={`${unitType.name} tại Sóng Homestay`} className="aspect-[4/3] w-full object-cover" loading="lazy" />
              <div className="p-6">
                <h3 className="font-accent text-2xl text-[#0b2e4f]">{unitType.name}</h3>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{unitType.description}</p>
                <div className="mt-3"><RoomFacts property={property} unitType={unitType} /></div>
                <DetailButton property={property} unitType={unitType} className="mt-5" />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Amenities() {
  return (
    <section id="amenities" className="scroll-mt-24 bg-white px-5 py-24 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid items-end gap-6 lg:grid-cols-[1fr_.9fr]">
          <Heading eyebrow="Tiện nghi tại Sóng" lead="Mọi tiện nghi cho" accent="kỳ nghỉ trọn vẹn." />
          <p className="text-base leading-8 text-slate-600">Từ những phút giây thư giãn bên hồ bơi, khoảng thời gian quây quần tại khu bếp đến những buổi trò chuyện tại quầy bar, mỗi không gian tại Sóng đều góp phần tạo nên một kỳ nghỉ đáng nhớ.</p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {AMENITIES.map(({ title, text, icon: Icon, src, ...rest }, index) => {
            const crop = 'crop' in rest ? rest.crop : undefined;
            return (
              <article key={title} className={`group relative overflow-hidden rounded-[1.75rem] bg-sky-100 ${index === 0 ? 'lg:col-span-2 lg:row-span-2' : ''} ${index === 3 ? 'lg:col-span-2' : ''}`}>
                <div className={`relative w-full overflow-hidden ${index === 0 ? 'aspect-[4/3] lg:aspect-auto lg:h-full lg:min-h-[34rem]' : 'aspect-[4/3] lg:aspect-auto lg:h-[17rem]'}`}>
                  <img
                    src={src}
                    alt={`${title} tại Sóng Homestay`}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                    style={crop ? { objectPosition: crop.position, transform: `scale(${crop.scale})`, transformOrigin: crop.position } : undefined}
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-[#082f55]/85 via-[#082f55]/15 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-6 text-white">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-white/15 backdrop-blur"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                  <h3 className="mt-3 font-accent text-2xl">{title}</h3>
                  <p className="mt-1 line-clamp-2 max-w-sm text-sm leading-6 text-white/85">{text}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Services() {
  return (
    <section id="services" className="scroll-mt-24 bg-[#eef4fa] px-5 py-24 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Heading eyebrow="Trọn vẹn kỳ nghỉ" lead="Thêm tiện ích, thêm trải nghiệm" accent="cho hành trình của bạn." />
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {SERVICES.map(({ title, text, icon: Icon }) => (
            <Link key={title} to={EXPERIENCES_URL} className="group flex items-center gap-5 rounded-[1.5rem] bg-white p-5 shadow-[0_10px_30px_rgba(8,47,85,0.07)] ring-1 ring-[#0b2e4f]/5 transition hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(8,47,85,0.13)]">
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#1565a8] to-[#4a9ee0] text-white shadow-md shadow-blue-900/15"><Icon className="h-7 w-7" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-sans text-lg font-bold text-[#0b2e4f]">{title}</span>
                <span className="mt-1 block text-sm leading-6 text-slate-500">{text}</span>
                <span className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-[#1565a8]">Tìm hiểu thêm <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" /></span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SongLanding({ property }: { property: Property }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState({ checkIn: '', checkOut: '', guests: 2 });

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!search.checkIn || !search.checkOut || search.checkOut <= search.checkIn) return;
    navigate(`/p/song-homestay/stays?checkIn=${encodeURIComponent(search.checkIn)}&checkOut=${encodeURIComponent(search.checkOut)}&guests=${search.guests}`);
  }

  const fieldClass = 'mt-2 h-12 w-full rounded-xl border border-[#0b2e4f]/15 bg-white px-4 font-medium text-slate-700 shadow-sm outline-none transition focus:border-[#1565a8] focus:ring-4 focus:ring-blue-100';

  return (
    <div className="song-page overflow-x-clip bg-[#f5f9fd] text-[#0b2e4f]">
      <section className="relative isolate flex min-h-[100svh] flex-col bg-[#0d4f8b] text-white">
        <img src="/song-homestay/hero.webp" alt="Không gian nghỉ dưỡng nhìn ra biển Mỹ Khê, Đà Nẵng" className="absolute inset-0 -z-20 h-full w-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#082f55]/85 via-[#0e5a9a]/40 to-transparent" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#062a4c]/60 via-transparent to-[#0b2e4f]/25" />

        <div className="mx-auto flex w-full max-w-6xl flex-1 items-center px-5 pb-10 pt-32 sm:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.32em] text-white/85 sm:text-sm">Đà Nẵng · Mỹ Khê</p>
            <h1 className="mt-5 font-sans text-5xl font-semibold leading-[1.02] tracking-[-0.04em] text-white sm:text-6xl lg:text-7xl">
              Sóng Homestay –<br />Where the sea meets <span className="font-accent font-normal italic tracking-normal">serenity.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-base font-medium leading-8 text-white/90 sm:text-lg">
              Một không gian lưu trú hiện đại, nơi bạn thức dậy cùng ánh nắng, lắng nghe tiếng sóng và tận hưởng nhịp sống dịu dàng của thành phố biển Đà Nẵng.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4">
              <button type="button" onClick={() => document.getElementById('rooms')?.scrollIntoView({ behavior: 'smooth' })} className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 font-bold text-[#0b2e4f] shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl">
                Khám phá Sóng Homestay <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </button>
              <span className="flex flex-wrap gap-5 text-sm font-semibold text-white/90">
                <span className="flex items-center gap-2"><Waves className="h-5 w-5" aria-hidden="true" /> 3 phút ra biển</span>
                <span className="flex items-center gap-2"><Star className="h-5 w-5 fill-current" aria-hidden="true" /> 4.9 từ khách lưu trú</span>
              </span>
            </div>
          </div>
        </div>

        <form aria-label="Tìm phòng trống" onSubmit={handleSearch} className="relative mx-5 mb-8 max-w-5xl rounded-[2rem] bg-white p-4 text-[#0b2e4f] shadow-[0_24px_65px_rgba(2,40,80,0.28)] sm:mx-8 lg:mx-auto lg:grid lg:w-[calc(100%-4rem)] lg:grid-cols-[1fr_1fr_.75fr_auto] lg:items-end lg:gap-3 lg:p-5">
          <label className="block px-2 py-2 text-sm font-bold">
            Ngày nhận phòng
            <input type="date" min={todayIso()} value={search.checkIn} onChange={(event) => setSearch((current) => ({ ...current, checkIn: event.target.value }))} className={fieldClass} />
          </label>
          <label className="block px-2 py-2 text-sm font-bold">
            Ngày trả phòng
            <input type="date" min={search.checkIn || todayIso()} value={search.checkOut} onChange={(event) => setSearch((current) => ({ ...current, checkOut: event.target.value }))} className={fieldClass} />
          </label>
          <label className="block px-2 py-2 text-sm font-bold">
            Số khách
            <input type="number" min={1} max={12} value={search.guests} onChange={(event) => setSearch((current) => ({ ...current, guests: Number(event.target.value) }))} className={fieldClass} />
          </label>
          <button type="submit" className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1565a8] to-[#3b8fd6] px-8 font-bold text-white shadow-lg shadow-blue-900/20 transition hover:-translate-y-0.5 hover:shadow-xl lg:mb-2 lg:mt-0 lg:w-auto">
            <Search className="h-5 w-5" aria-hidden="true" /> Tìm phòng
          </button>
        </form>
      </section>

      <RoomShowcase property={property} />
      <Amenities />
      <Services />

      <section id="about" className="scroll-mt-24 px-5 py-24 sm:px-8">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[.9fr_1.1fr]">
          <div>
            <Heading eyebrow="Về Sóng Homestay" lead="Ở gần biển." accent="Sống chậm một chút." />
            <p className="mt-6 text-base leading-8 text-slate-600">Từ chất liệu tự nhiên, gam xanh dịu mát đến cách đón tiếp chân thành, mỗi căn Sóng được tạo nên để bạn thật sự nghỉ ngơi — không chỉ là tìm một nơi để ngủ.</p>
            <div className="mt-8 grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-white p-4 text-center shadow-sm"><strong className="block text-2xl text-[#1565a8]">{property.unitTypes.length}</strong><span className="mt-1 block text-xs text-slate-500">Chỗ nghỉ</span></div>
              <div className="rounded-2xl bg-white p-4 text-center shadow-sm"><strong className="block text-2xl text-[#1565a8]">4.9</strong><span className="mt-1 block text-xs text-slate-500">Điểm yêu thích</span></div>
              <div className="rounded-2xl bg-white p-4 text-center shadow-sm"><strong className="block text-2xl text-[#1565a8]">3'</strong><span className="mt-1 block text-xs text-slate-500">Đi bộ ra biển</span></div>
            </div>
            <div className="mt-8 flex flex-wrap gap-5 text-sm font-semibold text-[#1565a8]">
              <span className="flex items-center gap-2"><Clock3 className="h-5 w-5" aria-hidden="true" /> Nhận phòng từ {property.checkInTime}</span>
              <span className="flex items-center gap-2"><MapPin className="h-5 w-5" aria-hidden="true" /> {property.address}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <img src="/song-homestay/apartment.webp" alt="Phòng khách nhìn ra biển" className="h-72 w-full rounded-[2rem] object-cover shadow-xl sm:h-96" loading="lazy" />
            <div className="grid gap-4 pt-8">
              <img src="/song-homestay/studio.webp" alt="Phòng ngủ hướng biển" className="h-40 w-full rounded-[1.5rem] object-cover shadow-lg sm:h-48" loading="lazy" />
              <img src="/song-homestay/family.webp" alt="Phòng nghỉ dành cho gia đình" className="h-40 w-full rounded-[1.5rem] object-cover shadow-lg sm:h-48" loading="lazy" />
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 pb-24 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 rounded-[2rem] bg-gradient-to-r from-[#0d4f8b] to-[#2f80c9] px-7 py-10 text-white shadow-xl sm:px-12 lg:flex-row lg:items-center">
          <div>
            <p className="font-bold uppercase tracking-[0.2em] text-blue-100">Sóng đang chờ bạn</p>
            <h2 className="mt-2 font-sans text-3xl font-semibold tracking-tight">Sẵn sàng cho những ngày <span className="font-accent font-normal italic">thật xanh?</span></h2>
          </div>
          <button type="button" onClick={() => document.getElementById('rooms')?.scrollIntoView({ behavior: 'smooth' })} className="rounded-full bg-white px-7 py-3.5 font-bold text-[#1565a8] shadow-lg transition hover:-translate-y-0.5">Khám phá phòng <ArrowRight className="ml-2 inline h-5 w-5" aria-hidden="true" /></button>
        </div>
      </section>
    </div>
  );
}
