import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { FunctionReturnType } from 'convex/server';
import {
  ArrowRight,
  Bike,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Instagram,
  MapPin,
  Martini,
  MessageCircle,
  Play,
  Plane,
  Search,
  Sofa,
  Star,
  Users,
  Waves,
  Map as MapIcon,
} from 'lucide-react';

import type { api } from '../../convex/_generated/api';
import { todayIso } from '../lib/dates';
import { SONG_LINKS } from '../lib/songLinks';
import { stayPrice } from '../lib/songStay';

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
  { title: 'Không gian sinh hoạt chung', text: 'Phòng khách rộng, ánh sáng tự nhiên - nơi cả nhóm quây quần mỗi tối.', icon: Sofa, src: '/song-homestay/apartment.webp' },
] as const;

const SERVICES = [
  { title: 'Thuê xe máy', text: 'Xe tay ga giao tận nơi, kèm 2 mũ bảo hiểm và áo mưa - 150.000đ / ngày.', icon: Bike },
  { title: 'Đưa đón sân bay', text: 'Xe riêng đón tại sân bay Đà Nẵng. Miễn phí chiều đón cho booking từ 3 đêm.', icon: Plane },
  { title: 'Tour Đà Nẵng - Hội An', text: 'Bà Nà Hills, Cù Lao Chàm, Sơn Trà, Ký Ức Hội An - lịch trình linh hoạt.', icon: MapIcon },
  { title: 'Tư vấn lịch trình miễn phí', text: 'Chat với Sóng để được gợi ý khung giờ đẹp và báo giá ưu đãi nhất.', icon: MessageCircle },
];

/** Room tour clips, also posted on Instagram. Posters are the frame at 1s. */
const VIDEOS = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ src: `/song-homestay/videos/video-${n}.mp4`, poster: `/song-homestay/videos/video-${n}.jpg` }));

/**
 * Guest reviews quoted from Sóng's public listings. Add new ones here as they
 * come in, in the guest's own words; mark machine translations `translated`.
 */
const REVIEWS = [
  { name: 'Bảo', country: 'Việt Nam', flag: 'vn', translated: false,
    text: 'Không gian yên tĩnh, phòng sạch sẽ, nội thất tối giản nhưng đầy đủ tiện nghi. Vị trí gần biển, thuận tiện để đi dạo và khám phá khu vực xung quanh. Chủ nhà thân thiện và hỗ trợ rất nhiệt tình.' },
  { name: 'Ivan', country: 'Nga', flag: 'ru', translated: true,
    text: 'Cảm ơn vì chỗ ở tuyệt vời và sự thân thiện! Chúng tôi rất hài lòng khi lưu trú tại đây. Nếu có dịp quay lại, chắc chắn chúng tôi sẽ quay lại lần nữa.' },
  { name: 'Evgeniia', country: 'Nga', flag: 'ru', translated: true,
    text: 'Ngôi nhà được trang bị đầy đủ tiện nghi cần thiết và rất phong cách. Không chỉ có phòng tắm tiện nghi như khách sạn thông thường, mà còn có sách, trò chơi cho bạn bè và thậm chí cả thảm tập yoga. Ngồi ngoài sân vào buổi tối hoặc ăn sáng rất thoải mái.' },
] as const;

const EXPERIENCES_URL = '/p/song-homestay/experiences';

function photoFor(unitType: UnitType, index: number) {
  return unitType.photoUrls[0] ?? ROOM_IMAGES[index % ROOM_IMAGES.length];
}

function roomUrl(property: Property, unitType: UnitType) {
  return `/p/${property.slug}/stay/${unitType.slug}`;
}

/** Section heading in the "Escape the *ordinary*" style: sans with an italic serif accent. */
function Heading({ eyebrow, lead, accent, light = false, center = false, compact = false }: { eyebrow: string; lead: string; accent: string; light?: boolean; center?: boolean; compact?: boolean }) {
  return (
    <div className={center ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}>
      <p className={`text-xs font-bold uppercase tracking-[0.28em] ${light ? 'text-sky-200' : 'text-[#1f74b8]'}`}>{eyebrow}</p>
      <h2 className={`mt-3 font-sans text-4xl font-semibold leading-[1.05] tracking-[-0.03em] ${compact ? '' : 'sm:text-5xl'} ${light ? 'text-white' : 'text-[#0b2e4f]'}`}>
        {lead} <span className="font-accent font-normal tracking-normal">{accent}</span>
      </h2>
    </div>
  );
}

function DetailButton({ property, unitType, className = '' }: { property: Property; unitType: UnitType; className?: string }) {
  if (unitType.comingSoon) {
    return <span className={`inline-flex cursor-not-allowed items-center rounded-full border border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-400 ${className}`}>Sắp mở</span>;
  }
  return (
    <Link to={roomUrl(property, unitType)} className={`btn-teal ${className}`}>
      Xem chi tiết <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

function RoomFacts({ property, unitType }: { property: Property; unitType: UnitType }) {
  const price = stayPrice(unitType, property.currency);
  return (
    <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold text-[#1565a8]">
      <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" aria-hidden="true" />{unitType.maxOccupancy ? `Tối đa ${unitType.maxOccupancy} khách` : 'Liên hệ sức chứa'}</span>
      {price ? <span>Từ {price.amount} / {price.period}</span> : null}
      {unitType.longStay ? <span className="rounded-full bg-[#e3eefa] px-2.5 py-0.5 text-xs">Thuê dài hạn</span> : null}
    </p>
  );
}

/**
 * Desktop: a sticky stage whose photo and description follow the scroll
 * position through the room list. Mobile: plain stacked cards.
 */
function RoomShowcase({ property }: { property: Property }) {
  const rooms = property.unitTypes.filter((unitType) => !unitType.comingSoon);
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
      <div ref={track} className="relative hidden stage:block" style={{ height: `${100 + rooms.length * 55}vh` }}>
        <div className="sticky top-0 flex h-screen items-center px-8 pb-6 pt-24">
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
              <Heading eyebrow="Chỗ nghỉ tại Sóng" lead="Your space," accent="your kind of stay." compact />
              <ul className="mt-4 border-t border-[#0b2e4f]/15">
                {rooms.map((unitType, index) => (
                  <li key={unitType.unitTypeId} className="border-b border-[#0b2e4f]/15">
                    <button
                      type="button"
                      onClick={() => jumpTo(index)}
                      aria-current={index === active}
                      className={`flex w-full items-center justify-between gap-3 py-1.5 text-left font-accent text-lg transition ${index === active ? 'text-[#1565a8]' : 'text-[#0b2e4f]/55 hover:text-[#0b2e4f]'}`}
                    >
                      <span>{unitType.name}</span>
                      <ArrowRight className={`h-4 w-4 shrink-0 transition ${index === active ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-0'}`} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              <div key={current.unitTypeId} className="mt-4 animate-[songFade_.5s_ease-out]">
                <p className="line-clamp-3 text-[15px] leading-7 text-slate-600">{current.description}</p>
                <div className="mt-3"><RoomFacts property={property} unitType={current} /></div>
                <DetailButton property={property} unitType={current} className="mt-4" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile / tablet cards */}
      <div className="px-5 py-20 sm:px-8 stage:hidden">
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

function VideoCard({ src, poster, index }: { src: string; poster: string; index: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  function toggle() {
    const video = ref.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }
  return (
    <figure className="relative w-56 shrink-0 snap-start overflow-hidden rounded-[1.5rem] bg-[#0b2e4f] shadow-[0_14px_35px_rgba(8,47,85,0.18)] sm:w-60">
      <video
        ref={ref}
        src={src}
        poster={poster}
        preload="none"
        muted
        loop
        playsInline
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onClick={toggle}
        className="aspect-[9/16] w-full cursor-pointer object-cover"
        aria-label={`Video phòng Sóng Homestay ${index + 1}`}
      />
      {!playing ? (
        <button type="button" onClick={toggle} aria-label={`Phát video ${index + 1}`} className="absolute inset-0 grid place-items-center bg-gradient-to-t from-[#082f55]/55 to-transparent">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-white/90 text-[#0b2e4f] shadow-lg"><Play className="ml-1 h-6 w-6 fill-current" aria-hidden="true" /></span>
        </button>
      ) : null}
    </figure>
  );
}

function RailButtons({ rail, step, label }: { rail: React.RefObject<HTMLDivElement | null>; step: number; label: string }) {
  const scroll = (direction: 1 | -1) => rail.current?.scrollBy({ left: direction * step, behavior: 'smooth' });
  const cls = 'grid h-11 w-11 place-items-center rounded-full bg-white text-[#0b2e4f] shadow-sm ring-1 ring-[#0b2e4f]/10 transition hover:bg-[#e3eefa]';
  return (
    <>
      <button type="button" onClick={() => scroll(-1)} aria-label={`${label} trước`} className={cls}><ChevronLeft className="h-5 w-5" aria-hidden="true" /></button>
      <button type="button" onClick={() => scroll(1)} aria-label={`${label} tiếp theo`} className={cls}><ChevronRight className="h-5 w-5" aria-hidden="true" /></button>
    </>
  );
}

function Videos() {
  const rail = useRef<HTMLDivElement>(null);
  return (
    <section id="videos" className="scroll-mt-24 bg-[#eef4fa] px-5 py-24 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <Heading eyebrow="Sóng trên Instagram" lead="Ghé thăm Sóng" accent="qua từng thước phim." />
          <div className="flex items-center gap-2">
            <RailButtons rail={rail} step={260} label="Video" />
            <a href={SONG_LINKS.instagram} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-2 rounded-full bg-[#0b2e4f] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#1565a8]"><Instagram className="h-4 w-4" aria-hidden="true" /> @_songhomestay</a>
          </div>
        </div>
        <div ref={rail} className="no-scrollbar mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
          {VIDEOS.map((video, index) => <VideoCard key={video.src} {...video} index={index} />)}
        </div>
      </div>
    </section>
  );
}

function Flag({ code }: { code: 'vn' | 'ru' }) {
  if (code === 'vn') {
    return <svg viewBox="0 0 30 20" className="h-3 w-[18px] rounded-[2px]" aria-hidden="true"><rect width="30" height="20" fill="#da251d" /><path fill="#ffcd00" d="m15 4 1.18 3.63h3.82l-3.09 2.24 1.18 3.63L15 11.26l-3.09 2.24 1.18-3.63L10 7.63h3.82Z" /></svg>;
  }
  return <svg viewBox="0 0 30 20" className="h-3 w-[18px] rounded-[2px] ring-1 ring-slate-200" aria-hidden="true"><rect width="30" height="20" fill="#fff" /><rect y="6.67" width="30" height="6.67" fill="#0039a6" /><rect y="13.33" width="30" height="6.67" fill="#d52b1e" /></svg>;
}

function ReviewCard({ review }: { review: (typeof REVIEWS)[number] }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="flex w-[19rem] shrink-0 snap-start flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:w-[22rem]">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-[#1565a8] to-[#4a9ee0] font-bold text-white">{review.name.charAt(0)}</span>
        <div>
          <p className="font-bold text-[#0b2e4f]">{review.name}</p>
          <p className="flex items-center gap-1.5 text-xs text-slate-500"><Flag code={review.flag} /> {review.country}</p>
        </div>
        <span className="ml-auto flex text-[#1565a8]" role="img" aria-label="5 sao">{[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-3.5 w-3.5 fill-current" aria-hidden="true" />)}</span>
      </div>
      <p className={`mt-4 text-[15px] leading-7 text-slate-700 ${open ? '' : 'line-clamp-4'}`}>“{review.text}”</p>
      <button type="button" onClick={() => setOpen(!open)} className="mt-2 self-start text-sm font-semibold text-[#1565a8] hover:underline">{open ? 'Thu gọn' : 'Tìm hiểu thêm'}</button>
      {review.translated ? <p className="mt-auto pt-3 text-xs text-slate-400">Được dịch tự động từ đánh giá gốc</p> : null}
    </article>
  );
}

function Reviews() {
  const rail = useRef<HTMLDivElement>(null);
  return (
    <section id="reviews" className="scroll-mt-24 px-5 pb-28 pt-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <Heading eyebrow="Khách nhà Sóng nói gì" lead="Những kỳ nghỉ" accent="được kể lại." />
          <div className="flex gap-2"><RailButtons rail={rail} step={360} label="Đánh giá" /></div>
        </div>
        <div ref={rail} className="no-scrollbar mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
          {REVIEWS.map((review) => <ReviewCard key={review.name} review={review} />)}
        </div>
        <a href={SONG_LINKS.facebookReviews} target="_blank" rel="noopener noreferrer" className="btn-secondary mt-8">Đọc tất cả đánh giá</a>
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
            <h1 className="mt-5 font-accent text-6xl font-normal leading-[1.02] text-white sm:text-7xl lg:text-8xl">Sóng Homestay</h1>
            <p className="mt-4 font-sans text-2xl font-semibold tracking-[-0.02em] text-white/95 sm:text-3xl">Where the sea meets serenity</p>
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
          <button type="submit" className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0b2e4f] px-8 font-bold text-white shadow-lg shadow-blue-900/20 transition hover:-translate-y-0.5 hover:bg-[#1565a8] hover:shadow-xl lg:mb-2 lg:mt-0 lg:w-auto">
            <Search className="h-5 w-5" aria-hidden="true" /> Tìm phòng
          </button>
        </form>
      </section>

      <RoomShowcase property={property} />
      <Amenities />
      <Videos />
      <Services />

      <section id="about" className="scroll-mt-24 px-5 py-24 sm:px-8">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[.9fr_1.1fr]">
          <div>
            <Heading eyebrow="Về Sóng Homestay" lead="Ở gần biển." accent="Sống chậm một chút." />
            <p className="mt-6 text-base leading-8 text-slate-600">Từ chất liệu tự nhiên, gam xanh dịu mát đến cách đón tiếp chân thành, mỗi căn Sóng được tạo nên để bạn thật sự nghỉ ngơi - không chỉ là tìm một nơi để ngủ.</p>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl bg-white p-4 text-center shadow-sm"><strong className="block text-2xl text-[#1565a8]">{property.unitTypes.filter((unitType) => !unitType.comingSoon).length}</strong><span className="mt-1 block text-xs text-slate-500">Chỗ nghỉ</span></div>
              <div className="rounded-2xl bg-white p-4 text-center shadow-sm"><strong className="block text-2xl text-[#1565a8]">800+</strong><span className="mt-1 block text-xs text-slate-500">Đánh giá từ Airbnb, Booking.com</span></div>
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

      <Reviews />
    </div>
  );
}
