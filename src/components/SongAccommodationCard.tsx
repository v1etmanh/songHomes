import { Bath, BedDouble, MapPin, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatMoney } from '../lib/money';

type Stay = {
  unitTypeId: string;
  name: string;
  slug: string;
  description: string;
  photoUrls: string[];
  maxOccupancy: number | null;
  address?: string;
  accommodationType?: string;
  bedrooms?: number;
  bathrooms?: number;
  highlights?: string[];
  fromPriceCents: number | null;
  comingSoon: boolean;
};

export function SongAccommodationCard({ stay, currency, query = '' }: { stay: Stay; currency: string; query?: string }) {
  const detailPath = `/p/song-homestay/stay/${stay.slug}${query}`;
  return (
    <article className="group overflow-hidden rounded-[1.6rem] border border-sky-950/5 bg-white shadow-[0_12px_35px_rgba(8,70,96,0.09)] transition hover:-translate-y-1 hover:shadow-[0_20px_45px_rgba(8,70,96,0.15)]">
      <Link to={stay.comingSoon ? '#' : detailPath} onClick={(event) => stay.comingSoon && event.preventDefault()} className="block">
        <div className="relative aspect-[4/3] overflow-hidden bg-sky-100">
          <img src={stay.photoUrls[0] ?? '/song-homestay/hero.webp'} alt={stay.name} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
          <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#087795] shadow-sm backdrop-blur">
            {stay.accommodationType ?? 'Chỗ nghỉ'}
          </span>
        </div>
      </Link>
      <div className="p-6">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"><MapPin className="h-3.5 w-3.5 text-cyan-600" /> {stay.address ?? 'Đà Nẵng'}</p>
        <h2 className="mt-2 font-sans text-xl font-extrabold leading-tight text-[#073b59]">{stay.name}</h2>
        <p className="mt-3 line-clamp-2 min-h-12 text-sm leading-6 text-slate-600">{stay.description}</p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-slate-600">
          <span className="flex items-center gap-1.5"><BedDouble className="h-4 w-4 text-cyan-600" /> {stay.bedrooms ?? '—'} phòng ngủ</span>
          <span className="flex items-center gap-1.5"><Bath className="h-4 w-4 text-cyan-600" /> {stay.bathrooms ?? '—'} phòng tắm</span>
          <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-cyan-600" /> {stay.maxOccupancy ? `Tối đa ${stay.maxOccupancy} khách` : 'Liên hệ sức chứa'}</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(stay.highlights ?? []).slice(0, 3).map((item) => <span key={item} className="rounded-full bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-800">{item}</span>)}
        </div>
        <div className="mt-6 flex items-end justify-between border-t border-sky-950/10 pt-5">
          <div><p className="text-xs text-slate-500">Giá từ</p><p className="mt-0.5 text-lg font-extrabold text-[#087795]">{stay.fromPriceCents ? formatMoney(stay.fromPriceCents, currency) : 'Liên hệ'} <span className="text-xs font-medium text-slate-500">/ đêm</span></p></div>
          <div className="flex gap-2">
            <Link to={`${detailPath}#availability`} className="rounded-full border border-cyan-700/20 px-3 py-2 text-xs font-bold text-cyan-800 hover:bg-cyan-50">Kiểm tra phòng trống</Link>
            <Link to={detailPath} className="rounded-full bg-[#087795] px-3 py-2 text-xs font-bold text-white hover:bg-[#06647c]">Xem chi tiết</Link>
          </div>
        </div>
      </div>
    </article>
  );
}
