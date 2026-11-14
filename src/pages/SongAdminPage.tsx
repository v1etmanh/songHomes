import { useEffect, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { AlertTriangle, ArrowUpRight, CalendarDays, CircleDollarSign, FileUp, Hotel, RefreshCw, Save } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
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
import { todayIso, dateToIso, isoToDate, daysBetween, isIsoDate } from '../lib/dates';
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

const PERIOD_LABELS: Record<string,string> = { day:'Ngày', week:'Tuần', month:'Tháng', quarter:'3 tháng (quý)', year:'Năm', custom:'Tùy chọn' };
const CALENDAR_PERIODS = ['day','week','month'];
const METRICS: Record<string,string> = { revenue:'Doanh thu trong kỳ', occupancy:'Công suất phòng', bookings:'Booking mới', conflicts:'Cảnh báo trùng lịch' };

export function SongAdminPage({ section }: { section: SongAdminSection }) {
  const { property } = useAdminProperty();
  // Filters, the open KPI detail and the calendar view live in the URL so every state is deep-linkable (convention #12).
  const [params, setParams] = useSearchParams();
  const today = todayIso(property.timezone);
  const update = (patch: Record<string,string>) => setParams(prev => { const next = new URLSearchParams(prev); for (const [k,v] of Object.entries(patch)) { if (v) next.set(k,v); else next.delete(k); } return next; }, { replace: true });
  const validIso = (value: string|null) => value && isIsoDate(value) ? value : null;
  const allowedPeriods = section === 'calendar' ? CALENDAR_PERIODS : Object.keys(PERIOD_LABELS);
  const rawPeriod = params.get('period') ?? '';
  const selected = allowedPeriods.includes(rawPeriod) ? rawPeriod : section === 'calendar' ? 'week' : 'month';
  const anchor = validIso(params.get('date')) ?? today;
  const customStart = validIso(params.get('from')) ?? addDays(today, -30);
  const customEndRaw = validIso(params.get('to')) ?? today;
  const customEnd = customEndRaw < customStart ? customStart : customEndRaw;
  const defaultStart=addDays(today,-60);
  const defaultEnd=addDays(today,15);
  const metric = METRICS[params.get('metric') ?? ''] ? params.get('metric')! : '';
  const setMetric = (value: string) => update({ metric: value });
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
      <div role="group" aria-label="Kỳ hiển thị" className="flex overflow-hidden rounded-xl border border-slate-200 bg-white text-sm">
        {allowedPeriods.map(value => <button type="button" key={value} aria-pressed={selected===value} onClick={() => update({ period: value })} className={`px-3 py-2 font-semibold ${selected===value ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{PERIOD_LABELS[value]}</button>)}
      </div>
      {selected==='custom' ? <><input aria-label="Từ ngày" className="field-input w-auto" type="date" value={customStart} max={customEnd} onChange={e=>{if(e.target.value && e.target.value<=customEnd)update({ from: e.target.value })}}/>
      <input aria-label="Đến ngày" className="field-input w-auto" type="date" min={customStart} value={customEnd} onChange={e=>{if(e.target.value>=customStart)update({ to: e.target.value })}}/></> :
      <input aria-label="Ngày trong kỳ" className="field-input w-auto" type="date" value={anchor} onChange={e=>{if(e.target.value)update({ date: e.target.value === today ? '' : e.target.value })}}/>}
      <span className="text-xs text-slate-600">{startDate} → {addDays(endDate,-1)}</span></div>}</div>
    {snapshot === undefined ? <Spinner label="Đang tổng hợp dữ liệu Sóng Homestay…" /> : section==='dashboard' ? <Dashboard snapshot={snapshot} metric={metric} setMetric={setMetric} startDate={startDate} endDate={endDate} /> : section==='accommodations' ? <Accommodations propertyId={property.propertyId} /> : section==='bookings' ? <Bookings propertyId={property.propertyId} snapshot={snapshot} /> : section==='calendar' ? <Calendar snapshot={snapshot} startDate={startDate} endDate={endDate} /> : section==='ical' ? <div className="space-y-6"><IcalSyncHub propertyId={property.propertyId} /><details className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm"><summary className="cursor-pointer font-extrabold text-[#10234a]">Nhập tệp .ics thủ công</summary><div className="mt-4"><IcalImport propertyId={property.propertyId} /></div></details></div> : section==='services' ? <ServicesDesk propertyId={property.propertyId} startDate={startDate} endDate={endDate} currency={snapshot.property.currency}/> : section==='conflicts' ? <ConflictResolver propertyId={property.propertyId} /> : <ResidenceDesk propertyId={property.propertyId} />}
  </div>;
}

function KpiCard({ label, value, detail, tone, icon: Icon, active, onClick }: { label:string; value:string; detail:string; tone:string; icon:typeof Hotel; active:boolean; onClick:()=>void }) { return <button type="button" aria-expanded={active} onClick={onClick} className={`text-left relative overflow-hidden rounded-2xl border p-5 shadow-sm transition hover:shadow-md ${tone} ${active ? 'ring-2 ring-blue-500' : ''}`}><div className="flex items-start gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-white/70"><Icon className="h-6 w-6" /></span><div><p className="text-sm font-bold text-slate-700">{label}</p><p className="mt-1 text-2xl font-extrabold text-[#10234a]">{value}</p><p className="mt-2 text-xs font-semibold text-emerald-600">{detail}</p></div></div><span className="mt-3 block text-xs font-semibold">{active ? 'Đang xem chi tiết' : 'Xem chi tiết ↗'}</span></button>; }

type Segment = { label: string; color: string; value: number };
type Column = { key: string; label: string; segments: Segment[] };

/** Time buckets for a [start, end) range: days up to a month, weeks up to ~4 months, months beyond. */
function timeBuckets(startDate: string, endDate: string) {
  const span = daysBetween(startDate, endDate);
  const mode = span <= 31 ? 'day' : span <= 120 ? 'week' : 'month';
  const keyOf = (day: string) => mode === 'day' ? day : mode === 'week' ? dateToIso(startOfWeek(isoToDate(day), { weekStartsOn: 1 })) : day.slice(0, 7);
  const labelOf = (key: string) => mode === 'day' ? `${key.slice(8)}/${key.slice(5,7)}` : mode === 'week' ? `${key.slice(8)}/${key.slice(5,7)}` : `${key.slice(5)}/${key.slice(0,4)}`;
  const keys: string[] = [];
  for (let day = startDate; day < endDate; day = addDays(day, 1)) { const key = keyOf(day); if (keys[keys.length - 1] !== key) keys.push(key); }
  return { keys, keyOf, labelOf, unit: mode === 'day' ? 'ngày' : mode === 'week' ? 'tuần (nhãn = thứ Hai đầu tuần)' : 'tháng' };
}

function StackedBars({ columns, format, empty }: { columns: Column[]; format: (value: number) => string; empty: string }) {
  const max = Math.max(0, ...columns.map(column => column.segments.reduce((sum, s) => sum + s.value, 0)));
  if (!max) return <p className="grid h-56 place-items-center text-sm text-slate-400">{empty}</p>;
  return <div className="mt-4 flex h-64 items-end gap-2 overflow-x-auto border-b border-l border-slate-200 px-2 pt-6">
    {columns.map(column => { const total = column.segments.reduce((sum, s) => sum + s.value, 0); return <div key={column.key} className="flex h-full min-w-12 flex-1 flex-col items-center justify-end gap-1">
      {total > 0 && <span className="whitespace-nowrap text-[10px] font-bold text-slate-600">{format(total)}</span>}
      <div className="flex w-full max-w-12 flex-col-reverse overflow-hidden rounded-t-md" style={{ height: `${(total / max) * 190}px` }} title={column.segments.filter(s => s.value).map(s => `${s.label}: ${format(s.value)}`).join('\n')}>
        {column.segments.map(s => s.value ? <div key={s.label} style={{ background: s.color, height: `${(s.value / total) * 100}%` }} /> : null)}
      </div>
      <span className="whitespace-nowrap text-[10px] text-slate-500">{column.label}</span>
    </div>; })}
  </div>;
}

function Legend({ items }: { items: Array<{ label: string; color: string }> }) { return <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold text-slate-600">{items.map(item => <span key={item.label} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} />{item.label}</span>)}</div>; }

const ROOM_COLOR = '#2563eb';
const SERVICE_COLOR = '#06b6d4';

function revenueColumns(snapshot: Snapshot, startDate: string, endDate: string): Column[] {
  const buckets = timeBuckets(startDate, endDate);
  const sums = new Map(buckets.keys.map(key => [key, { room: 0, service: 0 }]));
  for (const row of snapshot.dailyRevenue) { const sum = sums.get(buckets.keyOf(row.date)); if (sum) { sum.room += row.roomCents; sum.service += row.serviceCents; } }
  return buckets.keys.map(key => ({ key, label: buckets.labelOf(key), segments: [{ label: 'Phòng', color: ROOM_COLOR, value: sums.get(key)!.room }, { label: 'Dịch vụ', color: SERVICE_COLOR, value: sums.get(key)!.service }] }));
}

function Dashboard({snapshot, metric, setMetric, startDate, endDate}: {snapshot:Snapshot; metric:string; setMetric:(metric:string)=>void; startDate:string; endDate:string}) {
  const currency = snapshot.property.currency;
  const money = (cents: number) => formatMoney(cents, currency);
  const totalSources=snapshot.sourceCounts.reduce((s,r)=>s+r.count,0)||1;
  const colorOf = (unitId: Id<'units'>) => unitColors[Math.max(0, snapshot.units.findIndex(u => u._id === unitId)) % unitColors.length];
  const unitLegend = snapshot.units.map(unit => ({ label: unit.name, color: colorOf(unit._id) }));
  const buckets = timeBuckets(startDate, endDate);
  const toggle = (key: string) => setMetric(metric === key ? '' : key);
  const periodNights = daysBetween(startDate, endDate);
  return <>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard active={metric==='revenue'} onClick={()=>toggle('revenue')} label={METRICS.revenue} value={money(snapshot.kpis.totalRevenueCents)} detail={`Phòng ${money(snapshot.kpis.roomRevenueCents)}`} tone="border-blue-100 bg-blue-50 text-blue-500" icon={CircleDollarSign}/>
      <KpiCard active={metric==='occupancy'} onClick={()=>toggle('occupancy')} label={METRICS.occupancy} value={`${snapshot.kpis.occupancyPercent}%`} detail={`${snapshot.units.length} cơ sở đang theo dõi`} tone="border-emerald-100 bg-emerald-50 text-emerald-600" icon={Hotel}/>
      <KpiCard active={metric==='bookings'} onClick={()=>toggle('bookings')} label={METRICS.bookings} value={String(snapshot.kpis.totalBookings)} detail={`${snapshot.kpis.pendingBookings} chờ xác nhận`} tone="border-violet-100 bg-violet-50 text-violet-600" icon={CalendarDays}/>
      <KpiCard active={metric==='conflicts'} onClick={()=>toggle('conflicts')} label={METRICS.conflicts} value={String(snapshot.kpis.conflictCount)} detail={snapshot.kpis.conflictCount?'Cần xử lý ngay':'Lịch đang an toàn'} tone="border-orange-100 bg-orange-50 text-orange-500" icon={AlertTriangle}/>
    </div>
    {metric && <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm" aria-label={`${METRICS[metric]} · Chi tiết`}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-extrabold text-[#10234a]">{METRICS[metric]} · Chi tiết <span className="text-xs font-semibold text-slate-500">({startDate} → {addDays(endDate,-1)})</span></h2><button type="button" className="btn-secondary" onClick={()=>setMetric('')}>Đóng</button></div>
      {metric==='conflicts' ? <div className="mt-4"><ConflictTable rows={snapshot.bookings.filter(row=>row.syncConflict)}/><Link className="mt-3 inline-block text-sm font-bold text-blue-700" to="/admin/conflicts">Mở trang xử lý trùng lịch ↗</Link></div> :
       metric==='occupancy' ? <div className="mt-4 space-y-3">{snapshot.units.filter(u=>u.status==='active').map(unit=>{
         const nights=snapshot.occupancyByUnit.find(row=>row.unitId===unit._id)?.nights ?? 0;
         const percent = periodNights ? Math.round(nights / periodNights * 100) : 0;
         return <div key={unit._id}><div className="flex justify-between text-sm"><span className="font-semibold" style={{color:colorOf(unit._id)}}>{unit.name}</span><span><strong>{percent}%</strong> · {nights}/{periodNights} đêm</span></div><div className="mt-1 h-3 rounded-full bg-slate-100"><div className="h-full rounded-full" style={{width:`${percent}%`,background:colorOf(unit._id)}}/></div></div>;
       })}</div> :
       metric==='bookings' ? <>
         <p className="mt-1 text-xs text-slate-500">Số booking mới theo {buckets.unit} (ngày tạo), tách màu theo căn.</p>
         <StackedBars format={String} empty="Không có booking mới trong kỳ." columns={buckets.keys.map(key => ({ key, label: buckets.labelOf(key), segments: snapshot.units.map(unit => ({ label: unit.name, color: colorOf(unit._id), value: snapshot.newBookings.filter(b => b.unitId === unit._id && buckets.keyOf(b.date) === key).length })) }))}/>
         <Legend items={unitLegend}/>
         <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">{snapshot.units.map(unit => { const codes = snapshot.newBookings.filter(b => b.unitId === unit._id).map(b => b.code); return codes.length ? <p key={unit._id}><strong style={{color:colorOf(unit._id)}}>{unit.name}</strong> ({codes.length}): <span className="text-slate-600">{codes.join(', ')}</span></p> : null; })}</div>
       </> :
       <>
         <div className="mt-4 grid gap-3 sm:grid-cols-3">{[['Tiền phòng',snapshot.kpis.roomRevenueCents,ROOM_COLOR],['Dịch vụ',snapshot.kpis.serviceRevenueCents,SERVICE_COLOR],['Tổng',snapshot.kpis.totalRevenueCents,'#10234a']].map(([name,value,color])=><div key={String(name)} className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-500">{name}</p><p className="text-lg font-extrabold" style={{color:String(color)}}>{money(Number(value))}</p></div>)}</div>
         <StackedBars format={money} empty="Chưa có doanh thu trong kỳ." columns={revenueColumns(snapshot,startDate,endDate)}/>
         <Legend items={[{label:'Phòng',color:ROOM_COLOR},{label:'Dịch vụ',color:SERVICE_COLOR}]}/>
       </>}
    </section>}
    <div className="grid gap-5 xl:grid-cols-[1.45fr_.75fr]">
      <section className="min-w-0 rounded-2xl border border-sky-100 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-extrabold text-[#10234a]">Biểu đồ doanh thu</h2><span className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">Theo ngày nhận phòng · mỗi cột 1 {buckets.unit}</span></div><StackedBars format={money} empty="Chưa có doanh thu trong kỳ" columns={revenueColumns(snapshot,startDate,endDate)}/><Legend items={[{label:'Phòng',color:ROOM_COLOR},{label:'Dịch vụ',color:SERVICE_COLOR}]}/></section>
      <section className="min-w-0 rounded-2xl border border-sky-100 bg-white p-5 shadow-sm"><h2 className="font-extrabold text-[#10234a]">Nguồn booking</h2><div className="mt-6 space-y-4">{snapshot.sourceCounts.length?snapshot.sourceCounts.map((row,index)=><div key={row.source}><div className="flex justify-between text-sm"><span className="font-semibold text-slate-600">{row.source}</span><strong>{Math.round(row.count/totalSources*100)}%</strong></div><div className="mt-2 h-2 rounded-full bg-slate-100"><div className={`h-full rounded-full ${['bg-blue-500','bg-orange-400','bg-teal-500','bg-violet-500'][index%4]}`} style={{width:`${row.count/totalSources*100}%`}}/></div></div>):<p className="text-sm text-slate-400">Chưa có booking</p>}</div></section>
    </div>
    <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]"><ConflictTable rows={snapshot.bookings.filter((row)=>row.syncConflict).slice(0,4)} /><section className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm"><img src="/song-homestay/hero.webp" alt="Sóng Homestay bên biển Mỹ Khê" className="h-36 w-full object-cover"/><div className="p-5"><h2 className="font-extrabold text-[#10234a]">Thao tác nhanh</h2><div className="mt-4 grid grid-cols-2 gap-3"><Link className="rounded-xl bg-blue-50 p-3 text-center text-sm font-bold text-blue-700" to="/admin/bookings?new=1">Thêm booking</Link><Link className="rounded-xl bg-emerald-50 p-3 text-center text-sm font-bold text-emerald-700" to="/admin/accommodations">Quản lý phòng</Link><Link className="rounded-xl bg-violet-50 p-3 text-center text-sm font-bold text-violet-700" to="/admin/ical">Đồng bộ iCal</Link></div></div></section></div>
    <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm"><h2 className="font-extrabold text-[#10234a]">Hiệu quả dịch vụ</h2><div className="mt-4 grid gap-4 md:grid-cols-3">{snapshot.serviceUsage.map((row)=><div key={row.name} className="rounded-xl bg-slate-50 p-4"><h3 className="font-bold">{row.name}</h3><p className="mt-2 text-2xl font-extrabold text-blue-700">{row.count}</p><p className="text-xs text-slate-500">{money(row.revenueCents)}</p></div>)}</div></section>
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
              Math.round(Number(priceEdits[rate.id]) * 100) !== rate.cents),
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
              Giá đang hiển thị trên trang đặt phòng; máy chủ hiện tại chưa cho chỉnh giá tại đây.
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

function StatusPill({ status }: { status: string }) { const color = statusColors[status] ?? '#475569'; return <span className="whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold" style={{ color, background: `${color}1a` }}>{STATUS_LABELS[status] ?? status}</span>; }

function Bookings({propertyId,snapshot}:{propertyId:Id<'properties'>;snapshot:Snapshot}) {
  const update=useMutation((api as any).songHomestay.updateBookingStatus);
  const [params,setParams]=useSearchParams();
  const search=params.get('q') ?? '';
  const creating=params.get('new')==='1';
  const setParam=(key:string,value:string)=>setParams(prev=>{const next=new URLSearchParams(prev); if(value) next.set(key,value); else next.delete(key); return next;},{replace:true});
  const rows=snapshot.bookings.filter((row)=>`${row.confirmationCode} ${row.guestName} ${row.unitName}`.toLowerCase().includes(search.toLowerCase()));
  async function transition(row:BookingRow,status:'confirmed'|'checked_in'|'checked_out'|'cancelled'){try{await update({propertyId,bookingId:row.bookingId,status});}catch(error){window.alert(extractErrorMessage(error));}}
  return <div className="space-y-6">
    {creating && <CreateBookingDialog propertyId={propertyId} close={()=>setParam('new','')}/>}
    <section className="rounded-2xl border border-sky-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4"><h2 className="font-extrabold text-[#10234a]">Danh sách booking</h2>
        <div className="flex flex-wrap items-center gap-2"><input className="field-input max-w-sm" placeholder="Tìm mã, khách hoặc cơ sở…" value={search} onChange={(e)=>setParam('q',e.target.value)}/><button type="button" className="btn-primary whitespace-nowrap" onClick={()=>setParam('new','1')}>+ Tạo và khóa booking</button></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[70rem] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Mã</th><th className="p-3">Khách</th><th className="p-3">Chỗ nghỉ</th><th className="p-3">Lưu trú</th><th className="p-3">Nguồn</th><th className="p-3">Tổng tiền</th><th className="p-3">Trạng thái</th><th className="p-3">Thao tác</th></tr></thead><tbody>{rows.map((row)=><tr key={row.bookingId} className="border-t border-slate-100"><td className="p-3 font-bold">{row.confirmationCode}</td><td className="p-3"><strong>{row.guestName}</strong><br/><span className="text-xs text-slate-500">{row.guestPhone}</span></td><td className="p-3">{row.unitName}</td><td className="p-3">{row.checkIn}<br/>→ {row.checkOut}</td><td className="p-3">{row.source}</td><td className="p-3 font-semibold">{formatMoney(row.totalCents,snapshot.property.currency)}</td><td className="p-3"><StatusPill status={row.status}/>{row.residenceMissing?<span className="mt-1 block w-fit rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">Thiếu khai báo {row.residenceMissing}</span>:null}</td><td className="p-3"><div className="flex gap-2">{row.status==='pending'?<button className="text-xs font-bold text-emerald-700" onClick={()=>void transition(row,'confirmed')}>Xác nhận</button>:null}{row.status==='confirmed'?<button className="text-xs font-bold text-blue-700" onClick={()=>void transition(row,'checked_in')}>Check-in</button>:null}{row.status==='checked_in'?<button className="text-xs font-bold text-violet-700" onClick={()=>void transition(row,'checked_out')}>Hoàn thành</button>:null}{['pending','confirmed'].includes(row.status)?<button className="text-xs font-bold text-red-700" onClick={()=>void transition(row,'cancelled')}>Hủy</button>:null}</div></td></tr>)}{!rows.length?<tr><td colSpan={8} className="p-8 text-center text-slate-400">Không có booking phù hợp.</td></tr>:null}</tbody></table></div>
    </section>
  </div>;
}

function CreateBookingDialog({propertyId,close}:{propertyId:Id<'properties'>;close:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  return <dialog ref={dialog} onCancel={close} aria-labelledby="create-booking-heading" className="w-[min(96vw,56rem)] rounded-2xl p-0 shadow-xl backdrop:bg-black/40">
    <div className="flex items-center justify-between border-b px-5 py-4"><h2 id="create-booking-heading" className="text-lg font-extrabold text-[#10234a]">Tạo và khóa booking</h2><button type="button" className="btn-secondary" onClick={close}>Đóng</button></div>
    <div className="max-h-[80vh] overflow-y-auto p-5"><SongHomestayManagementSection propertyId={propertyId} initialTab="booking" showTabs={false}/></div>
  </dialog>;
}

// Ten clearly distinct hues so every Sóng unit (8 today) keeps its own colour.
const unitColors = ['#1d4ed8','#7e22ce','#047857','#b45309','#be185d','#0e7490','#dc2626','#65a30d','#4338ca','#a16207'];
const statusColors: Record<string,string> = {hold:'#475569',pending:'#a16207',confirmed:'#1d4ed8',checked_in:'#047857',checked_out:'#6d28d9',external:'#0e7490',blocked:'#991b1b'};

type Popover = { booking: BookingRow; x: number; y: number };

function Calendar({snapshot,startDate,endDate,compact=false}:{snapshot:Snapshot;startDate:string;endDate:string;compact?:boolean}) {
  const [params,setParams]=useSearchParams();
  const rawStatus=params.get('status') ?? '';
  const status=!compact && statusColors[rawStatus] ? rawStatus : '';
  const [popover,setPopover]=useState<Popover|null>(null);
  const popoverRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!popover) return;
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setPopover(null);};
    const onDown=(e:MouseEvent)=>{if(!popoverRef.current?.contains(e.target as Node))setPopover(null);};
    window.addEventListener('keydown',onKey); window.addEventListener('mousedown',onDown);
    return ()=>{window.removeEventListener('keydown',onKey); window.removeEventListener('mousedown',onDown);};
  },[popover]);
  const days=Array.from({length:Math.max(1,Math.min(compact?14:31,daysBetween(startDate,endDate)))},(_,i)=>addDays(startDate,i));
  const windowEnd=addDays(days[days.length-1],1);
  const today=todayIso();
  const rows=snapshot.bookings.filter(row=>(!status || row.status===status) && row.checkIn<windowEnd && row.checkOut>days[0]);
  const colorFor=(row:BookingRow,unitIndex:number)=>compact?unitColors[unitIndex%unitColors.length]:(statusColors[row.status]??'#475569');
  const columns=`repeat(${days.length}, minmax(${days.length<=7?'7rem':'3.5rem'}, 1fr))`;
  function open(event:ReactMouseEvent,booking:BookingRow){
    const width=288; const x=Math.min(event.clientX, window.innerWidth-width-16); const y=Math.min(event.clientY+12, window.innerHeight-260);
    setPopover({booking,x:Math.max(16,x),y:Math.max(16,y)});
  }
  return <section className="card overflow-hidden p-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">Lịch phòng tổng quan</h2>
    {compact ? <Link to="/admin/calendar" className="text-blue-700">Xem toàn bộ <ArrowUpRight className="inline h-4 w-4"/></Link> :
      <select aria-label="Trạng thái booking" className="field-input w-auto" value={status} onChange={e=>setParams(prev=>{const next=new URLSearchParams(prev); if(e.target.value) next.set('status',e.target.value); else next.delete('status'); return next;},{replace:true})}>
      <option value="">Mọi trạng thái</option>{Object.keys(statusColors).map(s=><option value={s} key={s}>{STATUS_LABELS[s]}</option>)}</select>}</div>
    <div className="mb-3 flex flex-wrap gap-3 text-xs font-semibold">{compact
      ? snapshot.units.map((unit,i)=><span key={unit._id} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{background:unitColors[i%unitColors.length]}}/>{unit.name}</span>)
      : Object.entries(statusColors).map(([s,color])=><button type="button" key={s} onClick={()=>setParams(prev=>{const next=new URLSearchParams(prev); if(status===s) next.delete('status'); else next.set('status',s); return next;},{replace:true})} className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ${status===s?'ring-2 ring-offset-1':''}`} style={{color}}><span className="h-2.5 w-2.5 rounded-sm" style={{background:color}}/>{STATUS_LABELS[s]}</button>)}</div>
    <div className="overflow-x-auto"><div className="min-w-fit text-xs">
      <div className="flex border-b"><div className="w-36 shrink-0 p-2 font-bold">Căn lưu trú</div><div className="grid flex-1" style={{gridTemplateColumns:columns}}>{days.map(day=><div key={day} className={`border-l p-2 text-center font-semibold ${day===today?'bg-blue-50 text-blue-700':''}`}>{day.slice(8)}/{day.slice(5,7)}</div>)}</div></div>
      {snapshot.units.map((unit,i)=>{
        const bars=rows.filter(r=>r.unitId===unit._id).sort((a,b)=>a.checkIn.localeCompare(b.checkIn)).map(row=>({row,start:Math.max(0,daysBetween(days[0],row.checkIn)),end:Math.min(days.length,daysBetween(days[0],row.checkOut))}));
        // Overlapping stays (double bookings) go to separate lanes so neither hides the other.
        const laneEnds:number[]=[];
        const placed=bars.map(bar=>{let lane=laneEnds.findIndex(end=>end<=bar.start); if(lane<0){lane=laneEnds.length; laneEnds.push(0);} laneEnds[lane]=bar.end; return {...bar,lane};});
        const lanes=Math.max(1,laneEnds.length);
        return <div key={unit._id} className="flex border-b"><div className="w-36 shrink-0 p-2 font-bold" style={{color:unitColors[i%unitColors.length]}}>{unit.name}</div>
          <div className="grid flex-1 py-1" style={{gridTemplateColumns:columns,gridTemplateRows:`repeat(${lanes}, 2rem)`}}>
            {days.map((day,d)=><div key={day} className={`border-l ${day===today?'bg-blue-50/60':''}`} style={{gridColumn:`${d+1}`,gridRow:`1 / span ${lanes}`}}/>)}
            {placed.map(({row,start,end,lane})=><button type="button" key={row.bookingId} onClick={e=>open(e,row)} title={`${row.guestName} · ${STATUS_LABELS[row.status]??row.status}`}
              className={`z-10 mx-0.5 my-0.5 truncate px-2 text-left font-semibold text-white shadow-sm hover:brightness-110 ${row.checkIn<days[0]?'':'rounded-l'} ${row.checkOut>windowEnd?'':'rounded-r'} ${row.syncConflict?'ring-2 ring-red-500':''}`}
              style={{gridColumn:`${start+1} / ${Math.max(start+1,end)+1}`,gridRow:`${lane+1}`,background:colorFor(row,i)}}>{row.guestName}</button>)}
          </div></div>;
      })}
    </div></div>
    {popover && <div ref={popoverRef} role="dialog" aria-label={`Booking ${popover.booking.confirmationCode}`} className="fixed z-50 w-72 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-xl" style={{left:popover.x,top:popover.y}}>
      <div className="flex items-start justify-between gap-2"><div><p className="font-extrabold text-[#10234a]">{popover.booking.guestName}</p><p className="text-xs text-slate-500">{popover.booking.confirmationCode}</p></div><button type="button" aria-label="Đóng" className="text-slate-400 hover:text-slate-700" onClick={()=>setPopover(null)}>✕</button></div>
      <div className="mt-2"><StatusPill status={popover.booking.status}/></div>
      <dl className="mt-3 space-y-1 text-slate-700">
        <div><dt className="inline text-slate-500">Căn: </dt><dd className="inline font-semibold">{popover.booking.unitName}</dd></div>
        <div><dt className="inline text-slate-500">Lưu trú: </dt><dd className="inline">{popover.booking.checkIn} → {popover.booking.checkOut} ({daysBetween(popover.booking.checkIn,popover.booking.checkOut)} đêm)</dd></div>
        <div><dt className="inline text-slate-500">Khách: </dt><dd className="inline">{popover.booking.adults} người lớn, {popover.booking.children} trẻ em</dd></div>
        {popover.booking.guestPhone && <div><dt className="inline text-slate-500">Điện thoại: </dt><dd className="inline">{popover.booking.guestPhone}</dd></div>}
        <div><dt className="inline text-slate-500">Tổng tiền: </dt><dd className="inline font-semibold">{formatMoney(popover.booking.totalCents,snapshot.property.currency)}</dd></div>
      </dl>
      <Link className="mt-3 inline-block font-bold text-blue-700" to={`/admin/bookings?q=${encodeURIComponent(popover.booking.confirmationCode)}`}>Mở trong Quản lý booking ↗</Link>
    </div>}
  </section>;
}

function IcalImport({propertyId}:{propertyId:Id<'properties'>}) { const catalog=useQuery((api as any).songHomestay.managementCatalog,{propertyId}) as Catalog|undefined; const upload=useAction((api as any).icalImport.uploadManualIcs); const [unitId,setUnitId]=useState(''); const [source,setSource]=useState<'Airbnb'|'Booking.com'>('Airbnb'); const [file,setFile]=useState<File|null>(null); const [message,setMessage]=useState(''); const [working,setWorking]=useState(false); async function submit(e:FormEvent){e.preventDefault();if(!file||!unitId)return;setWorking(true);try{const result=await upload({propertyId,unitId:unitId as Id<'units'>,source,icsText:await file.text()});setMessage(`Đã nhập: ${result.inserted} mới, ${result.updated} cập nhật, ${result.removed} hủy, ${result.conflicts} xung đột.`);}catch(error){setMessage(extractErrorMessage(error));}finally{setWorking(false);}} if(!catalog)return <Spinner label="Đang tải danh sách cơ sở…"/>; return <div className="grid gap-6 xl:grid-cols-[.75fr_1.25fr]"><form onSubmit={submit} className="rounded-2xl border border-sky-100 bg-white p-6 shadow-sm"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600"><FileUp className="h-7 w-7"/></span><h2 className="mt-5 text-xl font-extrabold text-[#10234a]">Tải lên tệp .ics</h2><div className="mt-5 space-y-4"><label><span className="field-label">Cơ sở lưu trú</span><select required className="field-input" value={unitId} onChange={(e)=>setUnitId(e.target.value)}><option value="">Chọn cơ sở</option>{catalog.units.map((unit)=><option key={unit.unitId} value={unit.unitId}>{unit.name}</option>)}</select></label><label><span className="field-label">Nguồn dữ liệu</span><select className="field-input" value={source} onChange={(e)=>setSource(e.target.value as typeof source)}><option>Airbnb</option><option>Booking.com</option></select></label><label><span className="field-label">Tệp iCal (tối đa 1 MB)</span><input required accept=".ics,text/calendar" type="file" className="field-input" onChange={(e)=>setFile(e.target.files?.[0]??null)}/></label><button className="btn-primary w-full justify-center" disabled={working||!file||!unitId}>{working?<><RefreshCw className="h-4 w-4 animate-spin"/>Đang nhập…</>:<>Nhập dữ liệu iCal</>}</button>{message?<p role="status" className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{message}</p>:null}</div></form><section className="rounded-2xl border border-sky-100 bg-white p-6 shadow-sm"><h2 className="font-extrabold text-[#10234a]">Lần nhập gần nhất theo cơ sở</h2><div className="mt-4 space-y-3">{catalog.units.map((unit)=>{const raw=(unit as any).icalImports??[];return <div key={unit.unitId} className="rounded-xl border border-slate-100 p-4"><h3 className="font-bold text-slate-800">{unit.name}</h3><p className="mt-1 text-sm text-slate-500">{raw.length?`${raw.length} nguồn đã cấu hình`:'Chưa nhập tệp iCal'}</p></div>})}</div><div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">Dùng khi nền tảng không cung cấp link iCal. Đồng bộ qua iCal là một chiều và có độ trễ; hệ thống không kết nối API trực tiếp và không đẩy lịch ngược lên Airbnb/Booking.com.</div></section></div>; }
