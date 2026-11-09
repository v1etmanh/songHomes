import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from 'convex/react';
import {
  ArrowRight,
  Bike,
  CarFront,
  Check,
  Clock3,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  Waves,
} from 'lucide-react';

import { api } from '../../convex/_generated/api';
import { Spinner } from '../components/Spinner';
import { todayIso } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { NotFoundPage } from './NotFoundPage';

const ROOM_IMAGES = [
  '/song-homestay/apartment.webp',
  '/song-homestay/townhouse.webp',
  '/song-homestay/family.webp',
  '/song-homestay/hero.webp',
  '/song-homestay/studio.webp',
];

const KIND_LABELS: Record<string, string> = {
  room: 'Căn hộ',
  cabin: 'Nhà & villa',
  site: 'Khu nghỉ dưỡng',
  rv_rental: 'Lưu trú',
  yurt: 'Lưu trú',
  geodome: 'Lưu trú',
};

const FALLBACK_SERVICES = [
  { name: 'Thuê xe máy', priceCents: 150_000_00, unitLabel: 'ngày' },
  { name: 'Đón sân bay', priceCents: 200_000_00, unitLabel: 'lượt' },
  { name: 'Trải nghiệm địa phương', priceCents: 0, unitLabel: 'khách' },
];

const SERVICE_COPY = [
  'Xe tay ga đời mới, giao tận nơi cùng hai mũ bảo hiểm.',
  'Xe riêng 4–7 chỗ đón tại sân bay Đà Nẵng về homestay.',
  'Gợi ý lịch trình biển, ẩm thực và những góc Đà Nẵng đáng nhớ.',
];

export function PropertyPage() {
  const { propertySlug } = useParams<{ propertySlug: string }>();
  const property = useQuery(api.properties.bySlug, propertySlug ? { slug: propertySlug } : 'skip');
  const navigate = useNavigate();
  const [search, setSearch] = useState({ checkIn: '', checkOut: '', guests: 2 });

  if (!propertySlug) return <NotFoundPage />;
  if (property === undefined) return <Spinner label="Loading property…" />;
  if (property === null) return <NotFoundPage />;
  const isSong = property.slug === 'song-homestay';

  if (!isSong) {
    return (
      <div>
        <div className="card mb-8 p-8">
          <h1 className="text-3xl font-semibold text-stone-900">{property.name}</h1>
          <p className="mt-2 flex items-center gap-1.5 text-stone-500">
            <MapPin className="h-4 w-4" aria-hidden="true" />
            {property.address}
          </p>
        </div>
        <h2 className="mb-4 text-xl font-semibold text-stone-900">Places to stay</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {property.unitTypes.map((unitType) => (
            <Link key={unitType.unitTypeId} to={`/p/${property.slug}/stay/${unitType.slug}`} className="card p-6">
              <h3 className="text-lg font-semibold">{unitType.name}</h3>
              <p className="mt-2 text-sm text-stone-600">{unitType.description}</p>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const services = property.addOns.length > 0 ? property.addOns.slice(0, 3) : FALLBACK_SERVICES;

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!search.checkIn || !search.checkOut || search.checkOut <= search.checkIn) return;
    navigate(`/p/song-homestay/stays?checkIn=${encodeURIComponent(search.checkIn)}&checkOut=${encodeURIComponent(search.checkOut)}&guests=${search.guests}`);
  }

  return (
    <div className="song-page overflow-hidden bg-[#f4fafc] text-[#073b59]">
      <section className="relative isolate min-h-[780px] bg-[#0b6f93] text-white lg:min-h-[calc(100vh-82px)]">
        <img
          src="/song-homestay/hero.webp"
          alt="Không gian nghỉ dưỡng nhìn ra biển Mỹ Khê, Đà Nẵng"
          className="absolute inset-0 -z-20 h-full w-full object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#06344f]/85 via-[#0a5875]/45 to-transparent" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#052f47]/55 via-transparent to-[#0d6380]/10" />

        <div className="mx-auto flex min-h-[780px] max-w-6xl items-center px-5 pb-36 pt-16 sm:px-8 lg:min-h-[calc(100vh-82px)] lg:pb-28">
          <div className="max-w-3xl">
            <p className="mb-5 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.32em] text-white/90 sm:text-sm">
              <span className="h-px w-10 bg-white/60" /> Đà Nẵng · Mỹ Khê
            </p>
            <h1 className="font-sans text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Sóng Homestay — Đà Nẵng
            </h1>
            <h2 className="mt-4 max-w-3xl font-sans text-5xl font-extrabold leading-[0.98] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">
              Chạm vào bình yên,<br />tận hưởng từng khoảnh khắc
            </h2>
            <p className="mt-7 max-w-2xl text-base font-medium leading-7 text-white/90 sm:text-lg">
              Feel at home — Live like a local. Năm không gian lưu trú được chăm chút tại Đà Nẵng, nơi tiếng sóng, nắng sớm và sự hiếu khách cùng chào đón bạn.
            </p>
            <div className="mt-8 flex flex-wrap gap-4 text-sm font-semibold text-white/90">
              <span className="flex items-center gap-2"><Waves className="h-5 w-5" /> 3 phút ra biển</span>
              <span className="flex items-center gap-2"><Star className="h-5 w-5 fill-current" /> 4.9 từ khách lưu trú</span>
            </div>
          </div>
        </div>

        <form
          aria-label="Tìm phòng trống"
          onSubmit={handleSearch}
          className="absolute inset-x-5 bottom-0 mx-auto max-w-5xl translate-y-1/2 rounded-[2rem] bg-white p-4 text-[#073b59] shadow-[0_24px_65px_rgba(2,64,91,0.22)] sm:inset-x-8 lg:grid lg:grid-cols-[1fr_1fr_.75fr_auto] lg:items-end lg:gap-3 lg:p-5"
        >
          <label className="block px-2 py-2 text-sm font-bold">
            Ngày nhận phòng
            <input
              type="date"
              min={todayIso()}
              value={search.checkIn}
              onChange={(event) => setSearch((current) => ({ ...current, checkIn: event.target.value }))}
              className="mt-2 h-12 w-full rounded-xl border border-sky-900/15 bg-white px-4 font-medium text-slate-700 shadow-sm outline-none transition focus:border-cyan-600 focus:ring-4 focus:ring-cyan-100"
            />
          </label>
          <label className="block px-2 py-2 text-sm font-bold">
            Ngày trả phòng
            <input
              type="date"
              min={search.checkIn || todayIso()}
              value={search.checkOut}
              onChange={(event) => setSearch((current) => ({ ...current, checkOut: event.target.value }))}
              className="mt-2 h-12 w-full rounded-xl border border-sky-900/15 bg-white px-4 font-medium text-slate-700 shadow-sm outline-none transition focus:border-cyan-600 focus:ring-4 focus:ring-cyan-100"
            />
          </label>
          <label className="block px-2 py-2 text-sm font-bold">
            Số khách
            <input
              type="number"
              min={1}
              max={12}
              value={search.guests}
              onChange={(event) => setSearch((current) => ({ ...current, guests: Number(event.target.value) }))}
              className="mt-2 h-12 w-full rounded-xl border border-sky-900/15 bg-white px-4 font-medium text-slate-700 shadow-sm outline-none transition focus:border-cyan-600 focus:ring-4 focus:ring-cyan-100"
            />
          </label>
          <button type="submit" className="mt-2 flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0286b2] to-[#36b4c6] px-8 font-bold text-white shadow-lg shadow-cyan-900/15 transition hover:-translate-y-0.5 hover:shadow-xl lg:mb-2 lg:mt-0">
            <Search className="h-5 w-5" aria-hidden="true" /> Tìm phòng
          </button>
        </form>
      </section>

      <section id="rooms" className="scroll-mt-24 px-5 pb-24 pt-48 sm:px-8 lg:pt-36">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#1598ad]">Lựa chọn của bạn</p>
              <h2 className="mt-2 font-sans text-3xl font-extrabold tracking-tight text-[#073b59] sm:text-4xl">Các căn đang mở đặt phòng</h2>
              <p className="mt-3 text-slate-600">Từ căn hộ view biển đến villa dành cho cả nhóm bạn.</p>
            </div>
            <p className="flex items-center gap-2 text-sm font-semibold text-[#0a7294]"><ShieldCheck className="h-5 w-5" /> Đặt trực tiếp · Giá minh bạch</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {property.unitTypes.map((unitType, index) => (
              <Link
                key={unitType.unitTypeId}
                to={unitType.comingSoon ? '#' : `/p/${property.slug}/stay/${unitType.slug}`}
                aria-disabled={unitType.comingSoon}
                onClick={(event) => { if (unitType.comingSoon) event.preventDefault(); }}
                className={`group overflow-hidden rounded-[1.75rem] bg-white shadow-[0_12px_35px_rgba(8,70,96,0.09)] ring-1 ring-sky-950/5 transition duration-300 ${unitType.comingSoon ? 'cursor-not-allowed opacity-60' : 'hover:-translate-y-1.5 hover:shadow-[0_22px_45px_rgba(8,70,96,0.16)]'}`}
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-sky-100">
                  <img
                    src={ROOM_IMAGES[index % ROOM_IMAGES.length]}
                    alt={`${unitType.name} tại Sóng Homestay`}
                    className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                    loading={index < 3 ? 'eager' : 'lazy'}
                  />
                  <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#087795] shadow-sm backdrop-blur">
                    {KIND_LABELS[unitType.kind] ?? 'Lưu trú'}
                  </span>
                </div>
                <div className="p-6">
                  <h3 className="font-sans text-xl font-extrabold leading-tight text-[#073b59]">{unitType.name}</h3>
                  <p className="mt-3 line-clamp-2 min-h-12 text-sm leading-6 text-slate-600">{unitType.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
                    <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-[#20a7b8]" /> {unitType.maxOccupancy ? `Tối đa ${unitType.maxOccupancy} khách` : 'Liên hệ sức chứa'}</span>
                    <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-[#20a7b8]" /> Xác nhận nhanh</span>
                  </div>
                  <div className="mt-6 flex items-end justify-between border-t border-sky-950/10 pt-5">
                    <div>
                      <p className="text-xs text-slate-500">Giá từ</p>
                      <p className="mt-0.5 text-lg font-extrabold text-[#087795]">
                        {unitType.fromPriceCents ? formatMoney(unitType.fromPriceCents, property.currency) : 'Liên hệ'}
                        {unitType.fromPriceCents ? <span className="text-xs font-medium text-slate-500"> / đêm</span> : null}
                      </p>
                    </div>
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-[#e5f7fa] text-[#087795] transition group-hover:bg-[#087795] group-hover:text-white"><ArrowRight className="h-5 w-5" /></span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="services" className="scroll-mt-24 bg-white px-5 py-24 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#1598ad]">Trọn vẹn kỳ nghỉ</p>
            <h2 className="mt-2 font-sans text-3xl font-extrabold tracking-tight text-[#073b59] sm:text-4xl">Dịch vụ bổ sung</h2>
            <p className="mt-3 leading-7 text-slate-600">Những tiện ích nhỏ giúp hành trình của bạn nhẹ nhàng ngay từ lúc hạ cánh.</p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {services.map((service, index) => {
              const Icon = [Bike, CarFront, Sparkles][index] ?? Sparkles;
              return (
                <article key={service.name} className="rounded-[1.5rem] border border-sky-900/10 bg-[#f5fbfc] p-6 transition hover:-translate-y-1 hover:border-cyan-600/25 hover:shadow-lg">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#0b88a7] to-[#35b5bd] text-white shadow-lg shadow-cyan-900/10"><Icon className="h-6 w-6" /></div>
                  <h3 className="mt-5 font-sans text-xl font-extrabold text-[#073b59]">{service.name}</h3>
                  <p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">{SERVICE_COPY[index]}</p>
                  {service.priceCents > 0 ? <p className="mt-5 font-bold text-[#087795]">{formatMoney(service.priceCents, property.currency)} <span className="text-xs font-medium text-slate-500">/ {service.unitLabel}</span></p> : <p className="mt-5 font-bold text-[#087795]">Theo nhu cầu</p>}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="about" className="scroll-mt-24 px-5 py-24 sm:px-8">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[.9fr_1.1fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#1598ad]">Về Sóng Homestay</p>
            <h2 className="mt-2 font-sans text-4xl font-extrabold leading-tight tracking-tight text-[#073b59]">Ở gần biển.<br />Sống chậm một chút.</h2>
            <p className="mt-6 text-base leading-8 text-slate-600">Từ chất liệu tự nhiên, gam xanh dịu mát đến cách đón tiếp chân thành, mỗi căn Sóng được tạo nên để bạn thật sự nghỉ ngơi — không chỉ là tìm một nơi để ngủ.</p>
            <div className="mt-8 grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-white p-4 text-center shadow-sm"><strong className="block text-2xl text-[#087795]">5</strong><span className="mt-1 block text-xs text-slate-500">Chỗ nghỉ</span></div>
              <div className="rounded-2xl bg-white p-4 text-center shadow-sm"><strong className="block text-2xl text-[#087795]">4.9</strong><span className="mt-1 block text-xs text-slate-500">Điểm yêu thích</span></div>
              <div className="rounded-2xl bg-white p-4 text-center shadow-sm"><strong className="block text-2xl text-[#087795]">3'</strong><span className="mt-1 block text-xs text-slate-500">Đi bộ ra biển</span></div>
            </div>
            <div className="mt-8 flex flex-wrap gap-5 text-sm font-semibold text-[#0a6d88]">
              <span className="flex items-center gap-2"><Clock3 className="h-5 w-5" /> Nhận phòng từ {property.checkInTime}</span>
              <span className="flex items-center gap-2"><MapPin className="h-5 w-5" /> {property.address}</span>
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
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 rounded-[2rem] bg-gradient-to-r from-[#075779] to-[#0d91a5] px-7 py-10 text-white shadow-xl sm:px-12 lg:flex-row lg:items-center">
          <div>
            <p className="font-bold uppercase tracking-[0.2em] text-cyan-100">Sóng đang chờ bạn</p>
            <h2 className="mt-2 font-sans text-3xl font-extrabold">Sẵn sàng cho những ngày thật xanh?</h2>
          </div>
          <button type="button" onClick={() => document.getElementById('rooms')?.scrollIntoView({ behavior: 'smooth' })} className="rounded-full bg-white px-7 py-3.5 font-bold text-[#087795] shadow-lg transition hover:-translate-y-0.5">Khám phá phòng <ArrowRight className="ml-2 inline h-5 w-5" /></button>
        </div>
      </section>
    </div>
  );
}
