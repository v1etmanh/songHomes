import { useState, type FormEvent } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { AlertTriangle, ArrowUpRight, CalendarDays, CircleDollarSign, FileUp, Hotel, RefreshCw, Save } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { addDays } from '../../shared/pricing';
import { useAdminProperty } from '../components/AdminShell';
import { extractErrorMessage } from '../components/ErrorMessage';
import { ConflictResolver } from '../components/ConflictResolver';
import { IcalSyncHub } from '../components/IcalSyncHub';
import { SongHomestayManagementSection } from '../components/SongHomestayManagementSection';
import { Spinner } from '../components/Spinner';
import { ResidenceDesk } from '../components/ResidenceDesk';
import { ServicesDesk } from '../components/ServicesDesk';
import { addMonths, startOfMonth, startOfWeek, startOfYear } from 'date-fns';
import { todayIso, dateToIso, isoToDate, daysBetween } from '../lib/dates';
import { formatMoney } from '../lib/money';

export type SongAdminSection = 'dashboard'|'accommodations'|'bookings'|'calendar'|'ical'|'services'|'conflicts'|'residence';

type BookingRow = { bookingId: Id<'bookings'>; confirmationCode: string; guestName: string; guestEmail: string; guestPhone: string; unitId: Id<'units'>; unitName: string; checkIn: string; checkOut: string; adults: number; children: number; status: string; source: string; totalCents: number; serviceCents: number; syncConflict: boolean; createdAt: number; residenceMissing?: number };
type Snapshot = {
  occupancyByUnit: Array<{unitId:Id<'units'>;nights:number}>;
  newBookings: Array<{date:string; unitId:Id<'units'>; code:string}>;
  property: { name: string; currency: string };
  kpis: { totalBookings: number; pendingBookings: number; confirmedBookings: number; currentGuests: number; roomRevenueCents: number; serviceRevenueCents: number; totalRevenueCents: number; occupancyPercent: number; conflictCount: number };
  bookings: BookingRow[];
  units: Array<{ _id: Id<'units'>; name: string; status: string; sortOrder: number; type?: { name: string } }>;
  dailyRevenue: Array<{ date: string; roomCents: number; serviceCents: number; totalCents: number }>;
  sourceCounts: Array<{ source: string; count: number }>;
  serviceUsage: Array<{ name: string; count: number; revenueCents: number }>;
};
type Catalog = { property: { currency: string }; unitTypes: Accommodation[]; units: Array<{ unitId: Id<'units'>; unitTypeId: Id<'unitTypes'>; name: string; status: string }>; addOns: Array<{ addOnId: Id<'addOns'>; name: string; priceCents: number; unitLabel: string; active: boolean }> };
type Accommodation = { rates?: Array<{id:Id<'ratePlans'>; name:string; cents:number}>; unitTypeId: Id<'unitTypes'>; name: string; slug: string; description: string; photoUrls: string[]; maxOccupancy: number|null; capacityKnown: boolean; address?: string; accommodationType?: string; bedrooms?: number; bathrooms?: number; areaSqm?: number; highlights: string[]; amenities: string[]; comingSoon: boolean };

const STATUS_LABELS: Record<string,string> = { hold:'Đang giữ chỗ', pending:'Chờ xác nhận', confirmed:'Đã xác nhận', checked_in:'Đang lưu trú', checked_out:'Đã hoàn thành', cancelled:'Đã hủy', external:'OTA / iCal', blocked:'Khóa phòng' };
const SECTION_COPY: Record<SongAdminSection,[string,string]> = {
  dashboard:['Dashboard tổng quan','Tình hình hoạt động của Sóng Homestay trong kỳ đã chọn'], accommodations:['Quản lý chỗ nghỉ','Thông tin, sức chứa, hình ảnh và trạng thái của 5 cơ sở'], bookings:['Quản lý booking','Tiếp nhận, tìm kiếm và xử lý booking từ mọi nguồn'], calendar:['Lịch phòng','Theo dõi ngày trống và khoảng lưu trú của từng cơ sở'], ical:['Đồng bộ dữ liệu iCal','Kéo lịch Airbnb và Booking.com về, tự động mỗi 30 phút hoặc khi bấm'], services:['Dịch vụ bổ sung','Quản lý dịch vụ và nhu cầu phát sinh theo booking'], conflicts:['Cảnh báo trùng booking','Kiểm tra và xử lý các khoảng thời gian xung đột'], residence:['Khai báo lưu trú','Quản lý thông tin khách lưu trú và trạng thái vắng mặt'],
};

export function SongAdminPage({ section }: { section: SongAdminSection }) {
  const { property } = useAdminProperty();
  const [customStart, setStartDate] = useState(() => addDays(todayIso(), -60));
  const [customEnd, setEndDate] = useState(() => addDays(todayIso(), 14));
  const [period,setPeriod] = useState('month');
  const [calendarPeriod,setCalendarPeriod] = useState('week');
  const [anchor,setAnchor] = useState(() => todayIso(property.timezone));
  const defaultStart=addDays(todayIso(property.timezone),-60);
  const defaultEnd=addDays(todayIso(property.timezone),15);
  const [metric,setMetric] = useState('');
  const selected = section === 'calendar' ? calendarPeriod : period;
  const date = isoToDate(anchor);
  const month = startOfMonth(date);
  const start = selected === 'week' ? startOfWeek(date,{weekStartsOn:1}) : selected === 'year' ? startOfYear(date) :
    selected === 'quarter' ? addMonths(month,-(month.getMonth()%3)) : selected === 'month' ? month : date;
  const filtered = ['calendar','dashboard','services'].includes(section);
  const startDate = !filtered ? defaultStart : selected === 'custom' ? customStart : dateToIso(start);
  const endDate = !filtered ? defaultEnd : selected === 'custom' ? addDays(customEnd,1) : selected === 'day' ? addDays(anchor,1) :
    selected === 'week' ? addDays(startDate,7) : dateToIso(addMonths(start, selected === 'year' ? 12 : selected === 'quarter' ? 3 : 1));
  const snapshot = useQuery((api as any).songHomestay.adminSnapshot, { propertyId: property.propertyId, startDate, endDate }) as Snapshot|undefined;
  const [title, subtitle] = SECTION_COPY[section];
  if (property.slug !== 'song-homestay') return <div className="card p-8"><h1 className="text-xl font-semibold">Màn hình dành riêng cho Sóng Homestay</h1><p className="mt-2 text-stone-600">Hãy chọn property Sóng Homestay ở thanh trên cùng.</p></div>;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-[.2em] text-[#328ee0]">Sóng Homestay</p><h1 className="mt-1 text-2xl font-extrabold text-[#10234a]">{title}</h1><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div>{filtered && <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Kỳ hiển thị" className="field-input w-auto" value={selected} onChange={e => section==='calendar' ? setCalendarPeriod(e.target.value) : setPeriod(e.target.value)}>
        <option value="day">Ngày</option>{section==='calendar' && <option value="week">Tuần</option>}<option value="month">Tháng</option>
        {section!=='calendar' && <><option value="quarter">3 tháng (quý)</option><option value="year">Năm</option><option value="custom">Tùy chọn</option></>}
      </select>
      {selected==='custom' ? <><input aria-label="Từ ngày" className="field-input w-auto" type="date" value={customStart} max={customEnd} onChange={e=>{if(e.target.value && e.target.value<=customEnd)setStartDate(e.target.value)}}/>
      <input aria-label="Đến ngày" className="field-input w-auto" type="date" min={customStart} value={customEnd} onChange={e=>{if(e.target.value>=customStart)setEndDate(e.target.value)}}/></> :
      <input aria-label="Ngày trong kỳ" className="field-input w-auto" type="date" value={anchor} onChange={e=>{if(e.target.value)setAnchor(e.target.value)}}/>}
      <span className="text-xs text-slate-600">{startDate} → {addDays(endDate,-1)}</span></div>}</div>
    {snapshot === undefined ? <Spinner label="Đang tổng hợp dữ liệu Sóng Homestay…" /> : section==='dashboard' ? <Dashboard snapshot={snapshot} metric={metric} setMetric={setMetric} startDate={startDate} endDate={endDate} /> : section==='accommodations' ? <Accommodations propertyId={property.propertyId} /> : section==='bookings' ? <Bookings propertyId={property.propertyId} snapshot={snapshot} /> : section==='calendar' ? <Calendar snapshot={snapshot} startDate={startDate} endDate={endDate} /> : section==='ical' ? <div className="space-y-6"><IcalSyncHub propertyId={property.propertyId} /><details className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm"><summary className="cursor-pointer font-extrabold text-[#10234a]">Nhập tệp .ics thủ công</summary><div className="mt-4"><IcalImport propertyId={property.propertyId} /></div></details></div> : section==='services' ? <ServicesDesk propertyId={property.propertyId} startDate={startDate} endDate={endDate} currency={snapshot.property.currency}/> : section==='conflicts' ? <ConflictResolver propertyId={property.propertyId} /> : <ResidenceDesk propertyId={property.propertyId} />}
  </div>;
}

function KpiCard({ label, value, detail, tone, icon: Icon, onClick }: { label:string; value:string; detail:string; tone:string; icon:typeof Hotel; onClick:()=>void }) { return <button type="button" onClick={onClick} className={`text-left relative overflow-hidden rounded-2xl border p-5 shadow-sm ${tone}`}><div className="flex items-start gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-white/70"><Icon className="h-6 w-6" /></span><div><p className="text-sm font-bold text-slate-700">{label}</p><p className="mt-1 text-2xl font-extrabold text-[#10234a]">{value}</p><p className="mt-2 text-xs font-semibold text-emerald-600">{detail}</p></div></div><span className="mt-3 block text-xs font-semibold">Xem chi tiết ↗</span></button>; }

function Dashboard({snapshot, metric, setMetric, startDate, endDate}: {snapshot:Snapshot; metric:string; setMetric:(metric:string)=>void; startDate:string; endDate:string}) {
  const maxRevenue=Math.max(1,...snapshot.dailyRevenue.map((row)=>row.totalCents)); const totalSources=snapshot.sourceCounts.reduce((s,r)=>s+r.count,0)||1;
  return <>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><KpiCard onClick={()=>setMetric('Doanh thu trong kỳ')} label="Doanh thu trong kỳ" value={formatMoney(snapshot.kpis.totalRevenueCents,snapshot.property.currency)} detail={`Phòng ${formatMoney(snapshot.kpis.roomRevenueCents,snapshot.property.currency)}`} tone="border-blue-100 bg-blue-50 text-blue-500" icon={CircleDollarSign}/><KpiCard onClick={()=>setMetric('Công suất phòng')} label="Công suất phòng" value={`${snapshot.kpis.occupancyPercent}%`} detail={`${snapshot.units.length} cơ sở đang theo dõi`} tone="border-emerald-100 bg-emerald-50 text-emerald-600" icon={Hotel}/><KpiCard onClick={()=>setMetric('Booking mới')} label="Booking mới" value={String(snapshot.kpis.totalBookings)} detail={`${snapshot.kpis.pendingBookings} chờ xác nhận`} tone="border-violet-100 bg-violet-50 text-violet-600" icon={CalendarDays}/><KpiCard onClick={()=>setMetric('Cảnh báo trùng lịch')} label="Cảnh báo trùng lịch" value={String(snapshot.kpis.conflictCount)} detail={snapshot.kpis.conflictCount?'Cần xử lý ngay':'Lịch đang an toàn'} tone="border-orange-100 bg-orange-50 text-orange-500" icon={AlertTriangle}/></div>
    {metric && <section className="card p-5"><div className="flex justify-between"><h2 className="font-bold">{metric} · Chi tiết</h2><button onClick={()=>setMetric('')}>Đóng</button></div>
      {metric==='Cảnh báo trùng lịch' ? <ConflictTable rows={snapshot.bookings.filter(row=>row.syncConflict)}/> :
       metric==='Công suất phòng' ? <div className="mt-3 space-y-2">{snapshot.units.filter(u=>u.status==='active').map((unit,i)=>{
         const nights=snapshot.occupancyByUnit.find(row=>row.unitId===unit._id)?.nights ?? 0;
         return <div key={unit._id}><span style={{color:unitColors[i%unitColors.length]}}>{unit.name}</span> · {nights} / {daysBetween(startDate,endDate)} đêm</div>
       })}</div> :
       metric==='Booking mới' ? <div className="mt-4 flex items-end gap-4 overflow-x-auto">{snapshot.units.map((unit,index)=>{
         const bookings=snapshot.newBookings.filter(b=>b.unitId===unit._id);
         const max=Math.max(1,...snapshot.units.map(u=>snapshot.newBookings.filter(b=>b.unitId===u._id).length));
         return <div key={unit._id} className="min-w-24 flex-1 text-center text-sm"><strong>{bookings.length}</strong><div className="mx-auto w-12 rounded-t" style={{background:unitColors[index%unitColors.length],height:120*bookings.length/max}}/><p>{unit.name}</p>{bookings.length>0 && <details><summary className="cursor-pointer">Mã booking</summary><small>{bookings.map(b=>b.code).join(', ')}</small></details>}</div>})}</div> :
       <div className="mt-4 grid gap-4 sm:grid-cols-2">{[['Phòng',snapshot.kpis.roomRevenueCents],['Dịch vụ',snapshot.kpis.serviceRevenueCents]].map(([name,value])=><p key={name}>{name} · <strong>{formatMoney(Number(value),snapshot.property.currency)}</strong></p>)}</div>}
    </section>}
    <div className="grid gap-5 xl:grid-cols-[1.45fr_.75fr]">
      <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-extrabold text-[#10234a]">Biểu đồ doanh thu</h2><span className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">Theo ngày nhận phòng</span></div><div className="mt-6 flex overflow-x-auto h-64 items-end gap-3 border-b border-l border-slate-200 px-3 pt-4">{snapshot.dailyRevenue.length ? snapshot.dailyRevenue.map((row)=><div key={row.date} className="flex min-w-8 flex-1 flex-col items-center justify-end gap-2"><div title={formatMoney(row.totalCents,snapshot.property.currency)} className="w-full max-w-12 rounded-t-lg bg-gradient-to-t from-blue-600 to-sky-300" style={{height:`${Math.max(8,(row.totalCents/maxRevenue)*190)}px`}}/><span className="text-[10px] text-slate-500">{row.date.slice(5)}</span></div>):<p className="m-auto self-center text-sm text-slate-400">Chưa có doanh thu trong kỳ</p>}</div><div className="mt-4 flex gap-5 text-xs font-semibold text-slate-500"><span>● Phòng</span><span className="text-cyan-500">● Dịch vụ</span><span className="text-blue-700">● Tổng</span></div></section>
      <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm"><h2 className="font-extrabold text-[#10234a]">Nguồn booking</h2><div className="mt-6 space-y-4">{snapshot.sourceCounts.length?snapshot.sourceCounts.map((row,index)=><div key={row.source}><div className="flex justify-between text-sm"><span className="font-semibold text-slate-600">{row.source}</span><strong>{Math.round(row.count/totalSources*100)}%</strong></div><div className="mt-2 h-2 rounded-full bg-slate-100"><div className={`h-full rounded-full ${['bg-blue-500','bg-orange-400','bg-teal-500','bg-violet-500'][index%4]}`} style={{width:`${row.count/totalSources*100}%`}}/></div></div>):<p className="text-sm text-slate-400">Chưa có booking</p>}</div></section>
    </div>
    <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]"><ConflictTable rows={snapshot.bookings.filter((row)=>row.syncConflict).slice(0,4)} /><section className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm"><img src="/song-homestay/hero.webp" alt="Sóng Homestay bên biển Mỹ Khê" className="h-36 w-full object-cover"/><div className="p-5"><h2 className="font-extrabold text-[#10234a]">Thao tác nhanh</h2><div className="mt-4 grid grid-cols-2 gap-3"><Link className="rounded-xl bg-blue-50 p-3 text-center text-sm font-bold text-blue-700" to="/admin/bookings">Thêm booking</Link><Link className="rounded-xl bg-emerald-50 p-3 text-center text-sm font-bold text-emerald-700" to="/admin/accommodations">Quản lý phòng</Link><Link className="rounded-xl bg-violet-50 p-3 text-center text-sm font-bold text-violet-700" to="/admin/ical">Đồng bộ iCal</Link></div></div></section></div>
    <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm"><h2 className="font-extrabold text-[#10234a]">Hiệu quả dịch vụ</h2><div className="mt-4 grid gap-4 md:grid-cols-3">{snapshot.serviceUsage.map((row)=><div key={row.name} className="rounded-xl bg-slate-50 p-4"><h3 className="font-bold">{row.name}</h3><p className="mt-2 text-2xl font-extrabold text-blue-700">{row.count}</p><p className="text-xs text-slate-500">{formatMoney(row.revenueCents,snapshot.property.currency)}</p></div>)}</div></section>
    <Calendar snapshot={snapshot} startDate={startDate} endDate={endDate} compact />
  </>;
}

function ConflictTable({ rows }: { rows: BookingRow[] }) { return <section className="overflow-hidden rounded-2xl border border-red-200 bg-white shadow-sm"><div className="flex items-center gap-2 bg-red-50 px-5 py-4 text-red-800"><AlertTriangle className="h-5 w-5"/><h2 className="font-extrabold">Cảnh báo Double Booking ({rows.length})</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[42rem] text-left text-sm"><thead className="bg-red-50/50 text-xs text-slate-500"><tr><th className="p-3">Mã booking</th><th className="p-3">Chỗ nghỉ</th><th className="p-3">Nguồn</th><th className="p-3">Thời gian</th><th className="p-3">Trạng thái</th></tr></thead><tbody>{rows.map((row)=><tr key={row.bookingId} className="border-t border-red-100"><td className="p-3 font-bold">{row.confirmationCode}</td><td className="p-3">{row.unitName}</td><td className="p-3">{row.source}</td><td className="p-3">{row.checkIn} → {row.checkOut}</td><td className="p-3"><span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700">Chưa xử lý</span></td></tr>)}{!rows.length?<tr><td colSpan={5} className="p-8 text-center text-slate-400">Không có cảnh báo trùng lịch.</td></tr>:null}</tbody></table></div></section>; }

function Accommodations({ propertyId }: { propertyId: Id<'properties'> }) {
  const catalog = useQuery(api.songHomestay.managementCatalog, { propertyId });
  const needsPublishedPrices = catalog?.unitTypes.some(
    (item) => item.rates == null,
  );
  const published = useQuery(
    api.properties.bySlug,
    needsPublishedPrices ? { slug: 'song-homestay' } : 'skip',
  );
  if (!catalog) return <Spinner label="Đang tải danh sách cơ sở…" />;
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      {catalog.unitTypes.map((item) => (
        <AccommodationEditor
          key={item.unitTypeId}
          propertyId={propertyId}
          item={item}
          publishedPrice={
            published?.unitTypes.find(
              (unit) => unit.unitTypeId === item.unitTypeId,
            )?.fromPriceCents
          }
          currency={catalog.property.currency}
        />
      ))}
    </div>
  );
}
function AccommodationEditor({
  propertyId,
  item,
  publishedPrice,
  currency,
}: {
  publishedPrice?: number | null;
  currency: string;
  propertyId: Id<'properties'>;
  item: Accommodation;
}) {
  const update = useMutation((api as any).songHomestay.updateAccommodation);
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({});
  const rates = item.rates ?? [];
  const [draft, setDraft] = useState({
    ...item,
    maxOccupancy: item.maxOccupancy?.toString() ?? '',
    highlights: item.highlights.join(', '),
    amenities: item.amenities.join(', '),
    photoUrls: item.photoUrls.join('\n'),
  });
  const [state, setState] = useState('');
  async function save() {
    setState('Đang lưu…');
    try {
      const changedRates = rates
        .filter(
          (rate) =>
            priceEdits[rate.id] !== undefined &&
            (priceEdits[rate.id] === '' ||
              Number(priceEdits[rate.id]) * 100 !== rate.cents),
        )
        .map((rate) => {
          const value = priceEdits[rate.id];
          const cents = Math.round(Number(value) * 100);
          if (!value.trim() || !Number.isSafeInteger(cents) || cents < 0)
            throw new Error('Giá phòng không hợp lệ.');
          return { id: rate.id, cents };
        });
      await update({
        propertyId,
        unitTypeId: item.unitTypeId,
        name: draft.name,
        ...(changedRates.length ? { rates: changedRates } : {}),
        address: draft.address ?? '',
        accommodationType: draft.accommodationType ?? '',
        description: draft.description,
        bedrooms: Number(draft.bedrooms ?? 0),
        bathrooms: Number(draft.bathrooms ?? 0),
        areaSqm: draft.areaSqm ? Number(draft.areaSqm) : undefined,
        maxOccupancy: draft.maxOccupancy
          ? Number(draft.maxOccupancy)
          : undefined,
        highlights: draft.highlights.split(','),
        amenities: draft.amenities.split(','),
        photoUrls: draft.photoUrls.split('\n'),
        comingSoon: draft.comingSoon,
      });
      setState('Đã lưu');
    } catch (e) {
      setState(extractErrorMessage(e));
    }
  }
  return (
    <article className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm">
      <img
        src={item.photoUrls[0] ?? '/song-homestay/hero.webp'}
        alt={item.name}
        className="h-44 w-full object-cover"
      />
      <div className="grid gap-3 p-5 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="field-label">Tên cơ sở</span>
          <input
            className="field-input"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label>
          <span className="field-label">Loại hình</span>
          <input
            className="field-input"
            value={draft.accommodationType ?? ''}
            onChange={(e) =>
              setDraft({ ...draft, accommodationType: e.target.value })
            }
          />
        </label>
        {rates.length ? (
          rates.map((rate) => (
            <label key={rate.id}>
              <span className="field-label">
                Giá phòng / đêm (VND) · {rate.name}
              </span>
              <input
                className="field-input"
                type="number"
                min="0"
                value={priceEdits[rate.id] ?? rate.cents / 100}
                onChange={(e) =>
                  setPriceEdits({ ...priceEdits, [rate.id]: e.target.value })
                }
              />
            </label>
          ))
        ) : item.rates == null ? (
          <p>
            <span className="field-label">Giá phòng / đêm</span>
            {publishedPrice != null
              ? formatMoney(publishedPrice, currency)
              : 'Chưa có giá hiển thị'}
            <small className="block text-slate-500">
              Cần cập nhật Convex để chỉnh sửa giá.
            </small>
          </p>
        ) : (
          <p>Chưa có bảng giá đang hoạt động.</p>
        )}
        <label>
          <span className="field-label">Địa chỉ</span>
          <input
            className="field-input"
            value={draft.address ?? ''}
            onChange={(e) => setDraft({ ...draft, address: e.target.value })}
          />
        </label>
        <label>
          <span className="field-label">Phòng ngủ</span>
          <input
            className="field-input"
            type="number"
            value={draft.bedrooms ?? 0}
            onChange={(e) =>
              setDraft({ ...draft, bedrooms: Number(e.target.value) })
            }
          />
        </label>
        <label>
          <span className="field-label">Phòng tắm</span>
          <input
            className="field-input"
            type="number"
            value={draft.bathrooms ?? 0}
            onChange={(e) =>
              setDraft({ ...draft, bathrooms: Number(e.target.value) })
            }
          />
        </label>
        <label>
          <span className="field-label">Sức chứa (để trống nếu chưa rõ)</span>
          <input
            className="field-input"
            type="number"
            value={draft.maxOccupancy}
            onChange={(e) =>
              setDraft({ ...draft, maxOccupancy: e.target.value })
            }
          />
        </label>
        <label>
          <span className="field-label">Diện tích m²</span>
          <input
            className="field-input"
            type="number"
            value={draft.areaSqm ?? ''}
            onChange={(e) =>
              setDraft({
                ...draft,
                areaSqm: Number(e.target.value) || undefined,
              })
            }
          />
        </label>
        <label className="sm:col-span-2">
          <span className="field-label">Mô tả</span>
          <textarea
            className="field-input min-h-24"
            value={draft.description}
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
          />
        </label>
        <label className="sm:col-span-2">
          <span className="field-label">
            Điểm nổi bật (phân cách bằng dấu phẩy)
          </span>
          <input
            className="field-input"
            value={draft.highlights}
            onChange={(e) => setDraft({ ...draft, highlights: e.target.value })}
          />
        </label>
        <label className="sm:col-span-2">
          <span className="field-label">Tiện nghi</span>
          <input
            className="field-input"
            value={draft.amenities}
            onChange={(e) => setDraft({ ...draft, amenities: e.target.value })}
          />
        </label>
        <label className="sm:col-span-2">
          <span className="field-label">URL ảnh (mỗi dòng một ảnh)</span>
          <textarea
            className="field-input min-h-24"
            value={draft.photoUrls}
            onChange={(e) => setDraft({ ...draft, photoUrls: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.comingSoon}
            onChange={(e) =>
              setDraft({ ...draft, comingSoon: e.target.checked })
            }
          />{' '}
          Tạm dừng nhận booking
        </label>
        <div className="flex items-center justify-end gap-3">
          <span className="text-xs text-slate-500">{state}</span>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void save()}
          >
            <Save className="h-4 w-4" />
            Lưu
          </button>
        </div>
      </div>
    </article>
  );
}

function Bookings({propertyId,snapshot}:{propertyId:Id<'properties'>;snapshot:Snapshot}) { const update=useMutation((api as any).songHomestay.updateBookingStatus); const [search,setSearch]=useState(''); const rows=snapshot.bookings.filter((row)=>`${row.confirmationCode} ${row.guestName} ${row.unitName}`.toLowerCase().includes(search.toLowerCase())); async function transition(row:BookingRow,status:'confirmed'|'checked_in'|'checked_out'|'cancelled'){try{await update({propertyId,bookingId:row.bookingId,status});}catch(error){window.alert(extractErrorMessage(error));}} return <div className="space-y-6"><details className="card p-4"><summary className="cursor-pointer font-bold text-blue-700">Tạo booking và khóa lịch</summary><SongHomestayManagementSection propertyId={propertyId} initialTab="booking" showTabs={false}/></details><section className="rounded-2xl border border-sky-100 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 p-4"><h2 className="font-extrabold text-[#10234a]">Danh sách booking</h2><input className="field-input max-w-sm" placeholder="Tìm mã, khách hoặc cơ sở…" value={search} onChange={(e)=>setSearch(e.target.value)}/></div><div className="overflow-x-auto"><table className="w-full min-w-[70rem] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Mã</th><th className="p-3">Khách</th><th className="p-3">Chỗ nghỉ</th><th className="p-3">Lưu trú</th><th className="p-3">Nguồn</th><th className="p-3">Tổng tiền</th><th className="p-3">Trạng thái</th><th className="p-3">Thao tác</th></tr></thead><tbody>{rows.map((row)=><tr key={row.bookingId} className="border-t border-slate-100"><td className="p-3 font-bold">{row.confirmationCode}</td><td className="p-3"><strong>{row.guestName}</strong><br/><span className="text-xs text-slate-500">{row.guestPhone}</span></td><td className="p-3">{row.unitName}</td><td className="p-3">{row.checkIn}<br/>→ {row.checkOut}</td><td className="p-3">{row.source}</td><td className="p-3 font-semibold">{formatMoney(row.totalCents,snapshot.property.currency)}</td><td className="p-3"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{STATUS_LABELS[row.status]??row.status}</span>{row.residenceMissing?<span className="mt-1 block w-fit rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">Thiếu khai báo {row.residenceMissing}</span>:null}</td><td className="p-3"><div className="flex gap-2">{row.status==='pending'?<button className="text-xs font-bold text-emerald-700" onClick={()=>void transition(row,'confirmed')}>Xác nhận</button>:null}{row.status==='confirmed'?<button className="text-xs font-bold text-blue-700" onClick={()=>void transition(row,'checked_in')}>Check-in</button>:null}{row.status==='checked_in'?<button className="text-xs font-bold text-violet-700" onClick={()=>void transition(row,'checked_out')}>Hoàn thành</button>:null}{['pending','confirmed'].includes(row.status)?<button className="text-xs font-bold text-red-700" onClick={()=>void transition(row,'cancelled')}>Hủy</button>:null}</div></td></tr>)}</tbody></table></div></section></div>; }

const unitColors = ['#1d4ed8','#7e22ce','#047857','#b45309','#be185d','#0e7490'];
const statusColors: Record<string,string> = {hold:'#475569',pending:'#a16207',confirmed:'#1d4ed8',checked_in:'#047857',checked_out:'#6d28d9',external:'#0e7490',blocked:'#991b1b'};
function Calendar({snapshot,startDate,endDate,compact=false}:{snapshot:Snapshot;startDate:string;endDate:string;compact?:boolean}) {
  const [status,setStatus]=useState('');
  const [selected,setSelected]=useState('');
  const days=Array.from({length:Math.min(compact?7:31,daysBetween(startDate,endDate))},(_,i)=>addDays(startDate,i));
  const rows=snapshot.bookings.filter(row=>!status || row.status===status);
  const detail=rows.find(row=>row.bookingId===selected);
  return <section className="card overflow-hidden p-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">Lịch phòng tổng quan</h2>
    {compact ? <Link to="/admin/calendar" className="text-blue-700">Xem toàn bộ <ArrowUpRight className="inline h-4 w-4"/></Link> :
      <select aria-label="Trạng thái booking" className="field-input w-auto" value={status} onChange={e=>setStatus(e.target.value)}>
      <option value="">Mọi trạng thái</option>{Object.keys(statusColors).map(s=><option value={s} key={s}>{STATUS_LABELS[s]}</option>)}</select>}</div>
    {!compact && <div className="mb-3 flex flex-wrap gap-3 text-xs">{Object.entries(statusColors).map(([s,color])=><span key={s} style={{color}}>● {STATUS_LABELS[s]}</span>)}</div>}
    <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="min-w-36 p-2">Căn lưu trú</th>
    {days.map(day=><th key={day} className="min-w-20 p-2">{day.slice(8)}/{day.slice(5,7)}</th>)}</tr></thead><tbody>
    {snapshot.units.map((unit,i)=><tr key={unit._id} className="border-t"><th className="p-2" style={{color:unitColors[i%unitColors.length]}}>{unit.name}</th>
      {days.map(day=><td key={day} className="h-12 border-l p-1">{rows.filter(r=>r.unitId===unit._id && r.checkIn<=day && day<r.checkOut).map(b=>
        <button type="button" key={b.bookingId} onClick={()=>setSelected(b.bookingId)} title={STATUS_LABELS[b.status]} className="mb-1 block rounded px-2 py-1 text-white"
          style={{background:compact?unitColors[i%unitColors.length]:statusColors[b.status]}}>{b.guestName}</button>)}</td>)}</tr>)}</tbody></table></div>
    {detail && <aside className="mt-3 rounded-xl bg-slate-50 p-4 text-sm"><button className="float-right" onClick={()=>setSelected('')}>Đóng</button>
      <strong>{detail.guestName} · {detail.confirmationCode}</strong><p>{detail.unitName} · {detail.checkIn} → {detail.checkOut}</p>
      <p>{STATUS_LABELS[detail.status]} · {detail.adults} người lớn, {detail.children} trẻ em · {detail.guestPhone}</p></aside>}
  </section>;
}

function IcalImport({propertyId}:{propertyId:Id<'properties'>}) { const catalog=useQuery((api as any).songHomestay.managementCatalog,{propertyId}) as Catalog|undefined; const upload=useAction((api as any).icalImport.uploadManualIcs); const [unitId,setUnitId]=useState(''); const [source,setSource]=useState<'Airbnb'|'Booking.com'>('Airbnb'); const [file,setFile]=useState<File|null>(null); const [message,setMessage]=useState(''); const [working,setWorking]=useState(false); async function submit(e:FormEvent){e.preventDefault();if(!file||!unitId)return;setWorking(true);try{const result=await upload({propertyId,unitId:unitId as Id<'units'>,source,icsText:await file.text()});setMessage(`Đã nhập: ${result.inserted} mới, ${result.updated} cập nhật, ${result.removed} hủy, ${result.conflicts} xung đột.`);}catch(error){setMessage(extractErrorMessage(error));}finally{setWorking(false);}} if(!catalog)return <Spinner label="Đang tải danh sách cơ sở…"/>; return <div className="grid gap-6 xl:grid-cols-[.75fr_1.25fr]"><form onSubmit={submit} className="rounded-2xl border border-sky-100 bg-white p-6 shadow-sm"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600"><FileUp className="h-7 w-7"/></span><h2 className="mt-5 text-xl font-extrabold text-[#10234a]">Tải lên tệp .ics</h2><div className="mt-5 space-y-4"><label><span className="field-label">Cơ sở lưu trú</span><select required className="field-input" value={unitId} onChange={(e)=>setUnitId(e.target.value)}><option value="">Chọn cơ sở</option>{catalog.units.map((unit)=><option key={unit.unitId} value={unit.unitId}>{unit.name}</option>)}</select></label><label><span className="field-label">Nguồn dữ liệu</span><select className="field-input" value={source} onChange={(e)=>setSource(e.target.value as typeof source)}><option>Airbnb</option><option>Booking.com</option></select></label><label><span className="field-label">Tệp iCal (tối đa 1 MB)</span><input required accept=".ics,text/calendar" type="file" className="field-input" onChange={(e)=>setFile(e.target.files?.[0]??null)}/></label><button className="btn-primary w-full justify-center" disabled={working||!file||!unitId}>{working?<><RefreshCw className="h-4 w-4 animate-spin"/>Đang nhập…</>:<>Nhập dữ liệu iCal</>}</button>{message?<p role="status" className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{message}</p>:null}</div></form><section className="rounded-2xl border border-sky-100 bg-white p-6 shadow-sm"><h2 className="font-extrabold text-[#10234a]">Lần nhập gần nhất theo cơ sở</h2><div className="mt-4 space-y-3">{catalog.units.map((unit)=>{const raw=(unit as any).icalImports??[];return <div key={unit.unitId} className="rounded-xl border border-slate-100 p-4"><h3 className="font-bold text-slate-800">{unit.name}</h3><p className="mt-1 text-sm text-slate-500">{raw.length?`${raw.length} nguồn đã cấu hình`:'Chưa nhập tệp iCal'}</p></div>})}</div><div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">Dùng khi nền tảng không cung cấp link iCal. Đồng bộ qua iCal là một chiều và có độ trễ; hệ thống không kết nối API trực tiếp và không đẩy lịch ngược lên Airbnb/Booking.com.</div></section></div>; }
