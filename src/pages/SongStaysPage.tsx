import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery } from 'convex/react';
import { Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../convex/_generated/api';
import { SongAccommodationCard } from '../components/SongAccommodationCard';
import { Spinner } from '../components/Spinner';
import { todayIso } from '../lib/dates';

export function SongStaysPage() {
  const [params, setParams] = useSearchParams();
  const property = useQuery(api.properties.bySlug, { slug: 'song-homestay' });
  const [form, setForm] = useState({ checkIn: params.get('checkIn') ?? '', checkOut: params.get('checkOut') ?? '', guests: Number(params.get('guests') ?? 2), type: params.get('type') ?? '' });
  const hasSearch = Boolean(params.get('checkIn') && params.get('checkOut'));
  const availability = useQuery(api.availability.searchProperty, hasSearch ? {
    propertySlug: 'song-homestay', checkIn: params.get('checkIn')!, checkOut: params.get('checkOut')!, guests: Number(params.get('guests') ?? 2),
  } : 'skip');
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);
  const stays = useMemo(() => {
    if (!property) return [];
    const allowed = hasSearch && availability?.valid ? new Set(availability.unitTypeIds.map(String)) : null;
    return property.unitTypes.filter((stay) => (!allowed || allowed.has(String(stay.unitTypeId))) && (!form.type || stay.accommodationType === form.type));
  }, [property, availability, hasSearch, form.type]);
  function submit(event: FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams();
    if (form.checkIn) next.set('checkIn', form.checkIn);
    if (form.checkOut) next.set('checkOut', form.checkOut);
    next.set('guests', String(form.guests));
    if (form.type) next.set('type', form.type);
    setParams(next);
  }
  if (property === undefined) return <Spinner label="Đang tải danh sách chỗ nghỉ…" />;
  if (!property) return <p>Không tìm thấy Sóng Homestay.</p>;
  const query = params.toString() ? `?${params.toString()}` : '';
  return (
    <div className="-mx-4 -my-8 min-h-screen bg-[#f4fafc] px-4 py-12 text-[#073b59] sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#1598ad]">Chỗ nghỉ tại Đà Nẵng</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight">Tìm không gian phù hợp với bạn</h1>
        <p className="mt-3 max-w-2xl text-slate-600">Năm chỗ nghỉ riêng biệt, từ căn hộ view biển đến villa và nhà nguyên căn cho nhóm đông.</p>
        <form onSubmit={submit} className="mt-8 grid gap-3 rounded-3xl bg-white p-5 shadow-lg md:grid-cols-5">
          <label><span className="field-label">Nhận phòng</span><input className="field-input" type="date" min={todayIso()} required value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} /></label>
          <label><span className="field-label">Trả phòng</span><input className="field-input" type="date" min={form.checkIn || todayIso()} required value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} /></label>
          <label><span className="field-label">Số khách</span><input className="field-input" type="number" min={1} max={20} value={form.guests} onChange={(e) => setForm({ ...form, guests: Number(e.target.value) })} /></label>
          <label><span className="field-label">Loại hình</span><select className="field-input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="">Tất cả</option><option>Căn hộ</option><option>Nhà nguyên căn</option><option>Biệt thự</option></select></label>
          <button className="btn-primary self-end justify-center"><Search className="h-4 w-4" /> Tìm chỗ nghỉ</button>
        </form>
        {hasSearch && availability === undefined ? <div className="py-12"><Spinner label="Đang kiểm tra lịch trống…" /></div> : null}
        {availability?.reason && stays.length === 0 ? <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">{availability.reason} Hãy thử ngày khác hoặc liên hệ Sóng Homestay.</div> : null}
        <div className="mt-10 grid gap-6 lg:grid-cols-2">{stays.map((stay) => <SongAccommodationCard key={stay.unitTypeId} stay={stay} currency={property.currency} query={query} />)}</div>
      </div>
    </div>
  );
}
