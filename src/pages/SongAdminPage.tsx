import { useEffect, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { AlertTriangle, CalendarDays, CircleDollarSign, Eye, FileUp, Hotel, Pencil, Plus, RefreshCw, Save, Search, Upload, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { addDays } from '../../shared/pricing';
import { useAdminProperty } from '../components/AdminShell';
import { extractErrorMessage } from '../components/ErrorMessage';
import { ConflictResolver } from '../components/ConflictResolver';
import { FrontDeskShift } from '../components/song/FrontDeskShift';
import { IcalSyncHub } from '../components/IcalSyncHub';
import { SongHomestayManagementSection } from '../components/SongHomestayManagementSection';
import { Spinner } from '../components/Spinner';
import { ResidenceDesk } from '../components/ResidenceDesk';
import { ServicesDesk } from '../components/ServicesDesk';
import { addMonths, startOfMonth, startOfWeek, startOfYear } from 'date-fns';
import { todayIso, dateToIso, isoToDate, daysBetween, isIsoDate } from '../lib/dates';
import { formatMoney } from '../lib/money';
import type { BookingRow, Snapshot } from '../lib/songAdminTypes';
import { SOURCE_LABELS, STATUS_LABELS, MANAGEMENT_STATUSES, calendarStatus, managementStatus, shortDateTime, sourceLabel, stayRange, type CalendarStatus, type ManagementStatus, type SourceLabel } from '../lib/songBookingStatus';

export type SongAdminSection = 'dashboard'|'accommodations'|'bookings'|'calendar'|'ical'|'services'|'conflicts'|'residence';

type Catalog = { property: { currency: string }; unitTypes: Accommodation[]; units: Array<{ unitId: Id<'units'>; unitTypeId: Id<'unitTypes'>; name: string; status: string }>; addOns: Array<{ addOnId: Id<'addOns'>; name: string; priceCents: number; unitLabel: string; active: boolean }> };
type Accommodation = { longStay: boolean; monthlyPriceCents: number | null; rates?: Array<{id:Id<'ratePlans'>; name:string; cents:number}>; unitTypeId: Id<'unitTypes'>; name: string; slug: string; description: string; photoUrls: string[]; maxOccupancy: number|null; capacityKnown: boolean; address?: string; accommodationType?: string; bedrooms?: number; bathrooms?: number; areaSqm?: number; highlights: string[]; amenities: string[]; comingSoon: boolean };

// Page titles only: no "Sóng Homestay" eyebrow and no subtitle line (feedback WEBSITE (4).pdf).
const SECTION_TITLES: Record<SongAdminSection,string> = {
  dashboard:'Dashboard tổng quan', accommodations:'Quản lý chỗ nghỉ', bookings:'Danh sách booking', calendar:'Lịch phòng tổng quan', ical:'Đồng bộ dữ liệu iCal', services:'Dịch vụ bổ sung', conflicts:'Cảnh báo trùng booking', residence:'Khai báo lưu trú',
};

const PERIOD_LABELS: Record<string,string> = { day:'Ngày', week:'Tuần', month:'Tháng', quarter:'Quý', year:'Năm', custom:'Tùy chọn' };
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
  const defaultEnd=addDays(today,365);
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
  // Owners and managers keep the analytics dashboard and switch to the front-desk view from the top bar; front desk always lands on the shift.
  const canSwitchView = section === 'dashboard' && ['owner', 'manager'].includes(property.role);
  const deskView = section === 'dashboard' && (property.role === 'front_desk' || (canSwitchView && params.get('view') === 'desk'));
  const title = deskView ? `Công việc vận hành ca ngày ${today.slice(8)}/${today.slice(5,7)}/${today.slice(0,4)}` : SECTION_TITLES[section];
  if (property.slug !== 'song-homestay') return <div className="card p-8"><h1 className="text-xl font-semibold">Màn hình dành riêng cho Sóng Homestay</h1><p className="mt-2 text-stone-600">Hãy chọn property Sóng Homestay ở thanh trên cùng.</p></div>;
  return <div className="space-y-6">
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-extrabold text-[#10234a]">{title}</h1>{filtered && !deskView && <PeriodFilter periods={allowedPeriods} selected={selected} anchor={anchor} customStart={customStart} customEnd={customEnd} today={today} update={update}/>}</div>
    {deskView ? <FrontDeskShift propertyId={property.propertyId} timezone={property.timezone} /> : snapshot === undefined ? <Spinner label="Đang tổng hợp dữ liệu Sóng Homestay…" /> : section==='dashboard' ? <Dashboard snapshot={snapshot} metric={metric} setMetric={setMetric} startDate={startDate} endDate={endDate} /> : section==='accommodations' ? <Accommodations propertyId={property.propertyId} /> : section==='bookings' ? <Bookings propertyId={property.propertyId} snapshot={snapshot} /> : section==='calendar' ? <Calendar snapshot={snapshot} startDate={startDate} endDate={endDate} /> : section==='ical' ? <IcalSyncHub propertyId={property.propertyId} manualImport={<IcalImport propertyId={property.propertyId} />} /> : section==='services' ? <ServicesDesk propertyId={property.propertyId} startDate={startDate} endDate={endDate} currency={snapshot.property.currency}/> : section==='conflicts' ? <ConflictResolver propertyId={property.propertyId} /> : <ResidenceDesk propertyId={property.propertyId} timezone={property.timezone} />}
  </div>;
}

/**
 * Period picker as one compact control: a period dropdown plus its date
 * input(s). Fixed-height, right-aligned and non-wrapping, so switching to
 * "Tùy chọn" adds a second date field without moving anything else on the page.
 */
function PeriodFilter({ periods, selected, anchor, customStart, customEnd, today, update }: { periods: string[]; selected: string; anchor: string; customStart: string; customEnd: string; today: string; update: (patch: Record<string,string>) => void }) {
  const field = 'h-8 w-[9.5rem] shrink-0 rounded-lg border-0 bg-slate-50 px-2 text-sm text-[#10234a]';
  return <div className="ml-auto flex h-11 shrink-0 flex-nowrap items-center gap-2 rounded-xl border border-sky-100 bg-white px-2 shadow-sm">
    <CalendarDays className="h-4 w-4 shrink-0 text-[#1565a8]" aria-hidden="true"/>
    <select aria-label="Kỳ hiển thị" className="h-8 shrink-0 cursor-pointer rounded-lg border-0 bg-slate-50 pl-2 pr-8 text-sm font-semibold text-[#10234a]" value={selected} onChange={e=>update({ period: e.target.value })}>
      {periods.map(value => <option key={value} value={value}>{PERIOD_LABELS[value]}</option>)}
    </select>
    {selected==='custom' ? <>
      <input aria-label="Từ ngày" className={field} type="date" value={customStart} max={customEnd} onChange={e=>{if(e.target.value && e.target.value<=customEnd)update({ from: e.target.value })}}/>
      <span className="text-slate-400" aria-hidden="true">→</span>
      <input aria-label="Đến ngày" className={field} type="date" min={customStart} value={customEnd} onChange={e=>{if(e.target.value>=customStart)update({ to: e.target.value })}}/>
    </> : <input aria-label="Ngày trong kỳ" className={field} type="date" value={anchor} onChange={e=>{if(e.target.value)update({ date: e.target.value === today ? '' : e.target.value })}}/>}
  </div>;
}

/** KPI cards share the white card style of the rest of the page; only the icon chip carries a colour. */
function KpiCard({ label, value, detail, tone, icon: Icon, active, onClick }: { label:string; value:string; detail:string; tone:string; icon:typeof Hotel; active:boolean; onClick:()=>void }) { return <button type="button" aria-expanded={active} onClick={onClick} className={`relative overflow-hidden rounded-2xl border border-sky-100 bg-white p-5 text-left shadow-sm transition hover:shadow-md ${active ? 'ring-2 ring-[#1565a8]' : ''}`}><div className="flex items-start gap-3"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="h-6 w-6" /></span><div className="min-w-0"><p className="text-sm font-bold text-slate-600">{label}</p><p className="mt-1 text-2xl font-extrabold text-[#10234a]">{value}</p><p className="mt-1 text-xs font-semibold text-slate-500">{detail}</p></div></div><span className="mt-3 block text-xs font-bold text-[#1565a8]">{active ? 'Đang xem chi tiết · bấm để đóng' : 'Xem chi tiết ↗'}</span></button>; }

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

/** Bars carry no printed totals (they collided on dense ranges); hovering or clicking a column shows its figures. */
function StackedBars({ columns, format, empty }: { columns: Column[]; format: (value: number) => string; empty: string }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const active = hovered ?? pinned;
  const max = Math.max(0, ...columns.map(column => column.segments.reduce((sum, s) => sum + s.value, 0)));
  if (!max) return <p className="grid h-56 place-items-center text-sm text-slate-400">{empty}</p>;
  return <div className="mt-4 flex h-64 items-end gap-2 overflow-x-auto border-b border-l border-slate-200 px-2 pt-6" onMouseLeave={() => setHovered(null)}>
    {columns.map(column => { const total = column.segments.reduce((sum, s) => sum + s.value, 0); const isActive = active === column.key && total > 0; return <button type="button" key={column.key} aria-label={`${column.label}: ${format(total)}`} aria-pressed={pinned === column.key} onMouseEnter={() => setHovered(column.key)} onFocus={() => setHovered(column.key)} onBlur={() => setHovered(null)} onClick={() => setPinned(pinned === column.key ? null : column.key)} className={`relative flex h-full ${columns.length > 16 ? "min-w-7" : "min-w-12"} flex-1 cursor-pointer flex-col items-center justify-end gap-1 rounded-md outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-300`}>
      {isActive ? <span role="tooltip" className="absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-lg bg-[#10234a] px-2.5 py-1.5 text-left text-[11px] font-semibold leading-4 text-white shadow-lg" style={{ bottom: `${(total / max) * 190 + 22}px` }}>
        <span className="block">{column.label}: {format(total)}</span>
        {column.segments.filter(s => s.value).map(s => <span key={s.label} className="block font-normal text-white/80">{s.label}: {format(s.value)}</span>)}
      </span> : null}
      <div className={`flex w-full max-w-12 flex-col-reverse overflow-hidden rounded-t-md transition ${active && !isActive ? 'opacity-50' : ''}`} style={{ height: `${(total / max) * 190}px` }}>
        {column.segments.map(s => s.value ? <div key={s.label} style={{ background: s.color, height: `${(s.value / total) * 100}%` }} /> : null)}
      </div>
      <span className="whitespace-nowrap text-[10px] text-slate-500">{column.label}</span>
    </button>; })}
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

// One colour per source, no yellow/beige (brand palette rule).
const SOURCE_COLORS: Record<SourceLabel, string> = { 'Booking.com': '#1d4ed8', Airbnb: '#e11d48', Zalo: '#0ea5e9', Phone: '#7c3aed', Facebook: '#2563eb', Website: '#0d9488', 'Khác': '#64748b' };

function Dashboard({snapshot, metric, setMetric, startDate, endDate}: {snapshot:Snapshot; metric:string; setMetric:(metric:string)=>void; startDate:string; endDate:string}) {
  const currency = snapshot.property.currency;
  const money = (cents: number) => formatMoney(cents, currency);
  const colorOf = (unitId: Id<'units'>) => unitColors[Math.max(0, snapshot.units.findIndex(u => u._id === unitId)) % unitColors.length];
  const toggle = (key: string) => setMetric(metric === key ? '' : key);
  const periodNights = daysBetween(startDate, endDate);
  const conflicts = snapshot.bookings.filter((row)=>row.syncConflict);
  const owner = snapshot.canSeeRevenue;
  // Only the owner sees revenue (WEBSITE.pdf r5): other roles get three cards and no revenue detail.
  const shown = owner ? metric : metric === 'revenue' ? '' : metric;
  const revenueRows = snapshot.bookings.filter(row => row.revenueRecognised).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  const activeUnits = snapshot.units.filter(u => u.status === 'active');
  // Revenue per unit (room part in the unit's colour, services in cyan), biggest first.
  const revenueByUnit = [...revenueRows.reduce((map, row) => {
    const entry = map.get(row.unitId) ?? { unitId: row.unitId, name: row.unitName, total: 0, service: 0, count: 0 };
    entry.total += row.totalCents; entry.service += row.serviceCents; entry.count += 1;
    return map.set(row.unitId, entry);
  }, new Map<Id<'units'>, { unitId: Id<'units'>; name: string; total: number; service: number; count: number }>()).values()].sort((a, b) => b.total - a.total);
  const maxUnitRevenue = Math.max(1, ...revenueByUnit.map(row => row.total));
  return <>
    <div className={`grid gap-4 sm:grid-cols-2 ${owner ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
      {owner ? <KpiCard active={shown==='revenue'} onClick={()=>toggle('revenue')} label={METRICS.revenue} value={money(snapshot.kpis.totalRevenueCents)} detail={`${revenueRows.length} booking đã xác nhận`} tone="bg-blue-50 text-blue-600" icon={CircleDollarSign}/> : null}
      <KpiCard active={shown==='occupancy'} onClick={()=>toggle('occupancy')} label={METRICS.occupancy} value={`${snapshot.kpis.occupancyPercent}%`} detail={`${snapshot.units.filter(u=>u.status==='active').length} cơ sở đang theo dõi`} tone="bg-teal-50 text-teal-600" icon={Hotel}/>
      <KpiCard active={shown==='bookings'} onClick={()=>toggle('bookings')} label={METRICS.bookings} value={String(snapshot.kpis.totalBookings)} detail={`${snapshot.kpis.pendingBookings} chờ xác nhận · không tính đơn hủy`} tone="bg-violet-50 text-violet-600" icon={CalendarDays}/>
      <KpiCard active={shown==='conflicts'} onClick={()=>toggle('conflicts')} label={METRICS.conflicts} value={String(snapshot.kpis.conflictCount)} detail={snapshot.kpis.conflictCount?'Cần xử lý ngay':'Lịch đang an toàn'} tone="bg-red-50 text-red-600" icon={AlertTriangle}/>
    </div>
    {/* Revenue opens a chart, occupancy per-unit bars; new bookings and conflicts open tables. The overview returns when closed. */}
    {shown ? <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm" aria-label={`${METRICS[shown]} · Chi tiết`}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-extrabold text-[#10234a]">{METRICS[shown]} · Chi tiết <span className="whitespace-nowrap text-xs font-semibold text-slate-500">({stayRange(startDate, addDays(endDate,-1))})</span></h2><button type="button" className="btn-secondary" onClick={()=>setMetric('')}>Đóng</button></div>
      {shown==='conflicts' ? <div className="mt-4"><ConflictTable rows={conflicts} bare/><Link className="mt-3 inline-block text-sm font-bold text-[#1565a8]" to="/admin/conflicts">Mở trang xử lý trùng lịch ↗</Link></div> :
       shown==='occupancy' ? <>
         <div className="mt-4 space-y-3">{activeUnits.map(unit => {
           const nights = snapshot.occupancyByUnit.find(row => row.unitId === unit._id)?.nights ?? 0;
           const percent = periodNights ? Math.round(nights / periodNights * 100) : 0;
           return <div key={unit._id}><div className="flex justify-between gap-3 text-sm"><span className="font-semibold" style={{color: colorOf(unit._id)}}>{unit.name}</span><span className="whitespace-nowrap"><strong>{percent}%</strong> · {nights}/{periodNights} đêm</span></div><div className="mt-1 h-3 rounded-full bg-slate-100"><div className="h-full rounded-full transition-all" style={{width: `${percent}%`, background: colorOf(unit._id)}}/></div></div>;
         })}</div>
       </> :
       shown==='bookings' ? <>
         <p className="mt-1 text-xs text-slate-500">Mỗi đơn tạo trong kỳ tính 1 lần (không tính theo đêm hay số khách), mọi kênh; không tính đơn đã hủy, hết hạn hoặc khóa phòng.</p>
         <DetailTable headers={['Ngày tạo','Mã booking','Khách hàng','Chỗ nghỉ','Lưu trú','Kênh','Dịch vụ','Trạng thái']} empty="Không có booking mới trong kỳ." rows={[...snapshot.newBookings].sort((a,b)=>b.date.localeCompare(a.date)).map(row=>({ key: row.bookingId, cells: [
           `${row.date.slice(8)}/${row.date.slice(5,7)}`, <strong key="c" className="text-[#10234a]">{row.code}</strong>, row.guestName, row.unitName, stayRange(row.checkIn,row.checkOut), sourceLabel(row.source), row.hasServices ? 'Có' : '—', STATUS_LABELS[managementStatus(row)] ?? row.status,
         ] }))}/>
       </> :
       <>
         <div className="mt-4 grid gap-3 sm:grid-cols-3">{[['Tiền phòng',snapshot.kpis.roomRevenueCents,ROOM_COLOR],['Dịch vụ',snapshot.kpis.serviceRevenueCents,SERVICE_COLOR],['Tổng',snapshot.kpis.totalRevenueCents,'#10234a']].map(([name,value,color])=><div key={String(name)} className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-500">{name}</p><p className="text-lg font-extrabold" style={{color:String(color)}}>{money(Number(value))}</p></div>)}</div>
         <p className="mt-2 text-xs text-slate-500">Booking được cộng vào doanh thu ngay khi đã xác nhận, theo ngày nhận phòng trong kỳ.</p>
         <StackedBars format={money} empty="Chưa có doanh thu trong kỳ." columns={revenueColumns(snapshot, startDate, endDate)}/>
         <Legend items={[{label:'Phòng',color:ROOM_COLOR},{label:'Dịch vụ',color:SERVICE_COLOR}]}/>
         <h3 className="mt-6 text-sm font-extrabold text-[#10234a]">Doanh thu theo căn</h3>
         {revenueByUnit.length ? <div className="mt-3 space-y-3">{revenueByUnit.map(row => <div key={row.unitId}>
           <div className="flex justify-between gap-3 text-sm"><span className="font-semibold" style={{color: colorOf(row.unitId)}}>{row.name}</span><span className="whitespace-nowrap"><strong className="text-[#10234a]">{money(row.total)}</strong> <span className="text-xs text-slate-400">· {row.count} booking</span></span></div>
           <div className="mt-1 flex h-3 overflow-hidden rounded-full bg-slate-100" title={`Phòng ${money(row.total - row.service)} · Dịch vụ ${money(row.service)}`}>
             <div style={{width: `${(row.total - row.service) / maxUnitRevenue * 100}%`, background: colorOf(row.unitId)}}/>
             <div style={{width: `${row.service / maxUnitRevenue * 100}%`, background: SERVICE_COLOR}}/>
           </div>
         </div>)}</div> : <p className="mt-3 text-sm text-slate-400">Chưa có booking đã xác nhận trong kỳ.</p>}
       </>}
    </section> : <>
    <div className={`grid gap-5 ${owner ? 'xl:grid-cols-[1.25fr_1fr]' : ''}`}>
      {owner ? <section className="min-w-0 rounded-2xl border border-sky-100 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-extrabold text-[#10234a]">Biểu đồ doanh thu</h2><span className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">Booking đã xác nhận · theo ngày nhận phòng</span></div><StackedBars format={money} empty="Chưa có doanh thu trong kỳ" columns={revenueColumns(snapshot,startDate,endDate)}/><Legend items={[{label:'Phòng',color:ROOM_COLOR},{label:'Dịch vụ',color:SERVICE_COLOR}]}/></section> : null}
      <ChannelReport report={snapshot.channelReport} />
    </div>
    <div className="grid items-start gap-5 xl:grid-cols-[1.45fr_1fr]">
      <ConflictTable rows={conflicts.slice(0,6)} />
      <ConflictChart stats={snapshot.conflictStats} />
    </div>
    <ServicePie usage={snapshot.serviceUsage} money={owner ? money : null} />
    </>}
  </>;
}

/** Plain white table used by every KPI detail. Cells never wrap except the stay name. */
function DetailTable({ headers, rows, empty }: { headers: string[]; rows: Array<{ key: string; cells: React.ReactNode[] }>; empty: string }) {
  return <div className="mt-4 overflow-x-auto rounded-xl border border-sky-100"><table className="w-full text-left text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
    <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{headers.map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead>
    <tbody>{rows.map(row=><tr key={row.key} className="border-t border-slate-100">{row.cells.map((cell,i)=><td key={i} className="p-3">{cell}</td>)}</tr>)}
      {!rows.length ? <tr><td colSpan={headers.length} className="p-8 text-center text-slate-400">{empty}</td></tr> : null}</tbody>
  </table></div>;
}

/** Bookings per channel for bookings created in the period, the direct-website share, and how many direct bookers added a service. */
function ChannelReport({ report }: { report: Snapshot['channelReport'] }) {
  const totals = new Map<SourceLabel, number>(SOURCE_LABELS.map(label => [label, 0]));
  for (const row of report.channels) { const label = sourceLabel(row.source); totals.set(label, (totals.get(label) ?? 0) + row.count); }
  const total = report.total || 1;
  const pct = (n: number, of: number) => of ? `${Math.round(n / of * 1000) / 10}%` : '0%';
  return <section className="min-w-0 rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div><h2 className="font-extrabold text-[#10234a]">Báo cáo booking theo kênh</h2><p className="text-xs text-slate-500">Booking tạo trong kỳ theo kênh đặt</p></div><p className="text-right text-xs text-slate-500">Tổng booking<br/><strong className="text-lg text-[#10234a]">{report.total} đơn</strong></p></div>
    <div className="mt-4 space-y-3">{SOURCE_LABELS.filter(label => (totals.get(label) ?? 0) > 0 || label === 'Website').map(label=>{ const count = totals.get(label) ?? 0; return <div key={label}><div className="flex justify-between text-sm"><span className="font-semibold text-slate-600">{label === 'Website' ? 'Website trực tiếp (Sóng Homestay)' : label}</span><span className="whitespace-nowrap"><strong className="text-[#10234a]">{count} đơn</strong> <span className="text-xs text-slate-400">({pct(count, report.total)})</span></span></div><div className="mt-1.5 h-2 rounded-full bg-slate-100"><div className="h-full rounded-full" style={{width:`${count/total*100}%`,background:SOURCE_COLORS[label]}}/></div></div>; })}</div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-3"><p className="text-xs font-semibold text-slate-500">Đặt trực tiếp Website</p><p className="text-lg font-extrabold text-[#1565a8]">{report.direct} đơn ({pct(report.direct, report.total)})</p></div>
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3"><p className="text-xs font-semibold text-slate-500">Khách Website dùng dịch vụ bổ sung</p><p className="text-lg font-extrabold text-emerald-700">{report.directWithServices} đơn ({pct(report.directWithServices, report.direct)})</p></div>
    </div>
  </section>;
}

/**
 * Donut of the add-on services (motorbike rental, airport transfer; tours are not counted).
 * Slice size = number of bookings that used the service; clicking a slice or its legend row
 * shows that service's bookings, quantity, revenue (owner only) and share.
 */
function ServicePie({ usage, money }: { usage: Snapshot['serviceUsage']; money: ((cents: number) => string) | null }) {
  const colors = ['#1565a8', '#0d9488'];
  const units = ['ngày xe', 'lượt'];
  const rows = usage.map((row, index) => ({ ...row, color: colors[index % colors.length], unit: units[index] ?? 'lần' }));
  const total = rows.reduce((sum, row) => sum + row.bookings, 0);
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenueCents, 0);
  const [picked, setPicked] = useState<string | null>(null);
  const active = rows.find(row => row.name === picked) ?? [...rows].sort((a, b) => b.bookings - a.bookings)[0];
  const radius = 70; const circumference = 2 * Math.PI * radius;
  const share = (n: number) => total ? Math.round(n / total * 1000) / 10 : 0;
  let offset = 0;
  return <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-extrabold text-[#10234a]">Hiệu quả dịch vụ bổ sung</h2><p className="text-xs text-slate-500">Booking đã xác nhận trong kỳ · không tính tour · bấm vào từng phần để xem chi tiết</p></div>{money ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Doanh thu DV: {money(totalRevenue)}</span> : null}</div>
    <div className="mt-4 grid items-center gap-6 md:grid-cols-[auto_1fr_minmax(15rem,.9fr)]">
      <svg viewBox="0 0 200 200" className="mx-auto h-48 w-48" role="img" aria-label="Tỷ trọng số lần đặt theo dịch vụ">
        <circle cx="100" cy="100" r={radius} fill="none" stroke="#eef2f7" strokeWidth="34"/>
        {total ? rows.map(row => { const length = row.bookings / total * circumference; const slice = <circle key={row.name} cx="100" cy="100" r={radius} fill="none" stroke={row.color} strokeWidth={active?.name === row.name ? 40 : 32} strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} transform="rotate(-90 100 100)" className="cursor-pointer transition-[stroke-width]" onClick={() => setPicked(row.name)}><title>{`${row.name}: ${row.bookings} lần đặt (${share(row.bookings)}%)`}</title></circle>; offset += length; return row.bookings ? slice : null; }) : null}
        <text x="100" y="96" textAnchor="middle" className="fill-[#10234a] text-[26px] font-extrabold">{total}</text>
        <text x="100" y="118" textAnchor="middle" className="fill-slate-500 text-[11px] font-semibold">lần đặt</text>
      </svg>
      <ul className="space-y-1.5">{rows.map(row => <li key={row.name}><button type="button" aria-pressed={active?.name === row.name} onClick={() => setPicked(row.name)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${active?.name === row.name ? 'bg-sky-50 ring-1 ring-sky-200' : 'hover:bg-slate-50'}`}><span className="h-3 w-3 shrink-0 rounded-full" style={{ background: row.color }}/><span className="min-w-0 flex-1 font-semibold text-slate-700">{row.name}</span><span className="whitespace-nowrap text-xs font-bold text-slate-500">{row.bookings} lần · {share(row.bookings)}%</span></button></li>)}</ul>
      {active ? <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-5" aria-live="polite">
        <p className="flex items-start gap-2 text-sm font-bold text-slate-600"><span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: active.color }}/>{active.name}</p>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div><p className="text-xs font-semibold text-slate-500">Số lần đặt</p><p className="text-3xl font-extrabold text-[#10234a]">{active.bookings}</p></div>
          <div><p className="text-xs font-semibold text-slate-500">Tỷ trọng</p><p className="text-3xl font-extrabold text-[#10234a]">{share(active.bookings)}%</p></div>
        </div>
        <p className="mt-4 text-xs font-semibold text-slate-500">Số lượng</p><p className="text-lg font-extrabold text-[#10234a]">{active.units} {active.unit}{active.freeUnits ? <span className="ml-2 text-xs font-semibold text-emerald-700">({active.freeUnits} lượt đón miễn phí)</span> : null}</p>
        {money ? <><p className="mt-3 text-xs font-semibold text-slate-500">Giá trị</p><p className="whitespace-nowrap text-2xl font-extrabold text-[#1565a8]">{money(active.revenueCents)}</p><p className="text-xs text-slate-500">{totalRevenue ? Math.round(active.revenueCents / totalRevenue * 1000) / 10 : 0}% doanh thu dịch vụ</p></> : null}
      </div> : null}
    </div>
    {!total ? <p className="mt-2 text-sm text-slate-400">Chưa có booking đã xác nhận dùng dịch vụ trong kỳ.</p> : null}
  </section>;
}

/** Double bookings in the period: confirmed bookings vs unconfirmed requests, each stacked open (red) / handled (green). */
function ConflictChart({ stats }: { stats: Snapshot['conflictStats'] }) {
  const open = stats.confirmed.open + stats.pending.open;
  const resolved = stats.confirmed.resolved + stats.pending.resolved;
  const columns: Column[] = [
    { key: 'confirmed', label: 'Đã xác nhận', segments: [{ label: 'Chưa xử lý', color: '#dc2626', value: stats.confirmed.open }, { label: 'Đã xử lý', color: '#059669', value: stats.confirmed.resolved }] },
    { key: 'pending', label: 'Chưa xác nhận', segments: [{ label: 'Chưa xử lý', color: '#dc2626', value: stats.pending.open }, { label: 'Đã xử lý', color: '#059669', value: stats.pending.resolved }] },
  ];
  return <section className="min-w-0 rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div><h2 className="font-extrabold text-[#10234a]">Số lần trùng lịch</h2><p className="text-xs text-slate-500">Booking đã xác nhận và chưa xác nhận trong kỳ</p></div><p className="text-right text-xs text-slate-500">Tổng<br/><strong className="text-lg text-[#10234a]">{open + resolved} lần</strong></p></div>
    <div className="mt-3 grid grid-cols-2 gap-3">
      <div className="rounded-xl border border-red-100 bg-red-50/60 p-3"><p className="text-xs font-semibold text-slate-500">Chưa xử lý</p><p className="text-xl font-extrabold text-red-700">{open}</p></div>
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3"><p className="text-xs font-semibold text-slate-500">Đã xử lý</p><p className="text-xl font-extrabold text-emerald-700">{resolved}</p></div>
    </div>
    <StackedBars format={(v) => `${v} lần`} empty="Không có lần trùng lịch nào trong kỳ." columns={columns}/>
    <Legend items={[{ label: 'Chưa xử lý', color: '#dc2626' }, { label: 'Đã xử lý', color: '#059669' }]}/>
  </section>;
}

/** Double-booking table: white card like the others; red is kept to the title strip. Cells never wrap, except the stay name. */
function ConflictTable({ rows, bare = false }: { rows: BookingRow[]; bare?: boolean }) {
  const table = <div className="overflow-x-auto"><table className="w-full text-left text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Mã booking</th><th className="p-3">Chỗ nghỉ</th><th className="p-3">Nguồn</th><th className="p-3">Thời gian</th><th className="p-3">Trạng thái</th></tr></thead><tbody>{rows.map((row)=><tr key={row.bookingId} className="border-t border-slate-100"><td className="p-3 font-bold text-[#10234a]">{row.confirmationCode}</td><td className="min-w-48 p-3 !whitespace-normal">{row.unitName}</td><td className="p-3">{sourceLabel(row.source)}</td><td className="p-3">{stayRange(row.checkIn, row.checkOut)}</td><td className="p-3"><span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">Chưa xử lý</span></td></tr>)}{!rows.length?<tr><td colSpan={5} className="p-8 text-center text-slate-400">Không có cảnh báo trùng lịch.</td></tr>:null}</tbody></table></div>;
  if (bare) return <div className="overflow-hidden rounded-xl border border-sky-100">{table}</div>;
  return <section className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm"><div className="flex items-center justify-between gap-2 border-b border-red-100 bg-red-50 px-5 py-3.5 text-red-700"><h2 className="flex items-center gap-2 font-extrabold"><AlertTriangle className="h-5 w-5"/>Cảnh báo Double Booking ({rows.length})</h2><Link className="whitespace-nowrap text-xs font-bold text-red-700 hover:underline" to="/admin/conflicts">Xử lý ↗</Link></div>{table}</section>;
}

function Accommodations({ propertyId }: { propertyId: Id<'properties'> }) {
  const catalog = useQuery(api.songHomestay.managementCatalog, { propertyId });
  const [params, setParams] = useSearchParams();
  // Open editor lives in the URL (?edit=<slug> | ?edit=new) so it is deep-linkable (convention #12).
  const editing = params.get('edit');
  const setEditing = (value: string | null) => setParams((prev) => { const next = new URLSearchParams(prev); if (value) next.set('edit', value); else next.delete('edit'); return next; }, { replace: true });
  if (!catalog) return <Spinner label="Đang tải danh sách cơ sở…" />;
  const currency = catalog.property.currency;
  const stays = catalog.unitTypes.filter((item) => !item.comingSoon || item.rates?.length);
  const current = editing && editing !== 'new' ? catalog.unitTypes.find((item) => item.slug === editing) : undefined;
  return (
    <section className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <h2 className="font-extrabold text-[#10234a]">Danh sách chỗ nghỉ ({stays.length})</h2>
        <button type="button" className="btn-primary" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Thêm căn</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[60rem] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr className="[&>th]:whitespace-nowrap"><th className="p-3">Chỗ nghỉ</th><th className="p-3">Loại hình</th><th className="p-3">Địa chỉ</th><th className="p-3">PN / PT</th><th className="p-3">Sức chứa</th><th className="p-3">Giá</th><th className="p-3">Trạng thái</th><th className="p-3">Thao tác</th></tr>
          </thead>
          <tbody>
            {stays.map((item) => {
              const nightly = item.rates?.[0]?.cents;
              return (
                <tr key={item.unitTypeId} className="border-t border-slate-100 align-middle">
                  <td className="p-3"><div className="flex items-center gap-3"><img src={item.photoUrls[0] ?? '/song-homestay/hero.webp'} alt="" className="h-12 w-16 shrink-0 rounded-lg object-cover" /><span className="font-semibold text-[#10234a]">{item.name}</span></div></td>
                  <td className="whitespace-nowrap p-3">{item.accommodationType ?? '—'}{item.longStay ? <span className="ml-2 rounded-full bg-[#e3eefa] px-2 py-0.5 text-xs font-semibold text-[#1565a8]">Dài hạn</span> : null}</td>
                  <td className="p-3 text-slate-600">{item.address ?? '—'}</td>
                  <td className="whitespace-nowrap p-3">{item.bedrooms ?? '—'} / {item.bathrooms ?? '—'}</td>
                  <td className="whitespace-nowrap p-3">{item.maxOccupancy ? `${item.maxOccupancy} khách` : 'Chưa rõ'}</td>
                  <td className="whitespace-nowrap p-3 font-semibold">{item.longStay && item.monthlyPriceCents ? `${formatMoney(item.monthlyPriceCents, currency)}/tháng` : nightly != null ? `${formatMoney(nightly, currency)}/đêm` : '—'}</td>
                  <td className="whitespace-nowrap p-3">{item.comingSoon ? <span className="inline-flex whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">Tạm dừng</span> : <span className="inline-flex whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Đang hoạt động</span>}</td>
                  <td className="whitespace-nowrap p-3"><button type="button" className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-sky-200 bg-white px-3.5 py-1.5 text-xs font-bold text-[#1565a8] transition hover:bg-sky-50" onClick={() => setEditing(item.slug)}><Pencil className="h-3.5 w-3.5" aria-hidden="true" />Chỉnh sửa</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editing === 'new' ? <AccommodationDialog title="Thêm căn mới" close={() => setEditing(null)}><NewAccommodation propertyId={propertyId} done={() => setEditing(null)} /></AccommodationDialog> : null}
      {current ? <AccommodationDialog title={`Chỉnh sửa · ${current.name}`} close={() => setEditing(null)}><AccommodationEditor key={current.unitTypeId} propertyId={propertyId} item={current} done={() => setEditing(null)} /></AccommodationDialog> : null}
    </section>
  );
}

function AccommodationDialog({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} onCancel={close} aria-labelledby="accommodation-dialog-title" className="w-[min(96vw,52rem)] rounded-2xl p-0 shadow-2xl backdrop:bg-black/40">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4">
        <h2 id="accommodation-dialog-title" className="text-lg font-extrabold text-[#10234a]">{title}</h2>
        <button type="button" aria-label="Đóng" className="rounded-full p-1 text-slate-500 hover:bg-slate-100" onClick={close}><X className="h-5 w-5" /></button>
      </div>
      {children}
    </dialog>
  );
}

/** Photo list editor: upload to Convex storage, reorder cover, remove, or paste a URL. */
function PhotoManager({ propertyId, photos, onChange }: { propertyId: Id<'properties'>; photos: string[]; onChange: (next: string[]) => void }) {
  const generate = useMutation(api.songHomestay.generatePhotoUploadUrl);
  const resolve = useMutation(api.songHomestay.photoUrl);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [link, setLink] = useState('');
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError('');
    const added: string[] = [];
    try {
      for (const [index, file] of [...files].entries()) {
        setBusy(`Đang tải ảnh ${index + 1}/${files.length}…`);
        const uploadUrl = await generate({ propertyId });
        const response = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
        if (!response.ok) throw new Error('Tải ảnh lên thất bại.');
        const { storageId } = (await response.json()) as { storageId: Id<'_storage'> };
        added.push(await resolve({ propertyId, storageId }));
      }
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      if (added.length) onChange([...photos, ...added]);
      setBusy('');
    }
  }
  return (
    <div className="sm:col-span-2">
      <span className="field-label">Hình ảnh (ảnh đầu tiên là ảnh bìa)</span>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {photos.map((url, index) => (
          <figure key={url + index} className="group relative overflow-hidden rounded-lg border border-slate-200">
            <img src={url} alt={`Ảnh ${index + 1}`} className="aspect-[4/3] w-full object-cover" />
            {index === 0 ? <span className="absolute left-1 top-1 rounded bg-[#0b2e4f] px-1.5 py-0.5 text-[10px] font-bold text-white">Ảnh bìa</span> : null}
            <div className="absolute inset-x-1 bottom-1 flex justify-end gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
              {index > 0 ? <button type="button" className="rounded bg-white/95 px-1.5 py-0.5 text-[10px] font-bold text-[#1565a8]" onClick={() => onChange([url, ...photos.filter((_, i) => i !== index)])}>Đặt bìa</button> : null}
              <button type="button" aria-label={`Xóa ảnh ${index + 1}`} className="rounded bg-white/95 px-1.5 py-0.5 text-[10px] font-bold text-red-700" onClick={() => onChange(photos.filter((_, i) => i !== index))}>Xóa</button>
            </div>
          </figure>
        ))}
        <label className="grid aspect-[4/3] cursor-pointer place-items-center rounded-lg border-2 border-dashed border-slate-300 text-center text-xs font-semibold text-slate-500 hover:border-[#1565a8] hover:text-[#1565a8]">
          <span><Upload className="mx-auto mb-1 h-5 w-5" />Tải ảnh lên</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" disabled={Boolean(busy)} onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
        </label>
      </div>
      <div className="mt-2 flex gap-2">
        <input className="field-input" placeholder="Hoặc dán đường dẫn ảnh (https://… hoặc /song-homestay/…)" value={link} onChange={(e) => setLink(e.target.value)} />
        <button type="button" className="btn-secondary whitespace-nowrap" disabled={!link.trim()} onClick={() => { onChange([...photos, link.trim()]); setLink(''); }}>Thêm</button>
      </div>
      {busy ? <p className="mt-1 text-xs text-slate-500">{busy}</p> : null}
      {error ? <p role="alert" className="mt-1 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}

function NewAccommodation({ propertyId, done }: { propertyId: Id<'properties'>; done: () => void }) {
  const create = useMutation(api.songHomestay.createAccommodation);
  const [form, setForm] = useState({ name: '', accommodationType: 'Nhà nguyên căn', address: '', description: '', bedrooms: '2', bathrooms: '2', maxOccupancy: '4', areaSqm: '', price: '', longStay: false });
  const [photos, setPhotos] = useState<string[]>([]);
  const [state, setState] = useState('');
  const set = (key: keyof typeof form, value: string | boolean) => setForm((prev) => ({ ...prev, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    setState('Đang lưu…');
    try {
      const price = Math.round(Number(form.price) * 100);
      if (!Number.isSafeInteger(price) || price <= 0) throw new Error('Giá không hợp lệ.');
      await create({
        propertyId, name: form.name, accommodationType: form.accommodationType, address: form.address, description: form.description,
        bedrooms: Number(form.bedrooms), bathrooms: Number(form.bathrooms), maxOccupancy: Number(form.maxOccupancy),
        areaSqm: form.areaSqm ? Number(form.areaSqm) : undefined,
        nightlyCents: form.longStay ? Math.round(price / 30 / 100) * 100 : price,
        longStay: form.longStay, monthlyPriceCents: form.longStay ? price : undefined, photoUrls: photos,
      });
      done();
    } catch (e) {
      setState(extractErrorMessage(e));
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-3 p-5 sm:grid-cols-2">
      <label className="sm:col-span-2"><span className="field-label">Tên cơ sở</span><input required className="field-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="VD: Sóng Garden House - Chế Lan Viên" /></label>
      <label><span className="field-label">Loại hình</span><select className="field-input" value={form.accommodationType} onChange={(e) => set('accommodationType', e.target.value)}><option>Nhà nguyên căn</option><option>Căn hộ</option><option>Biệt thự</option></select></label>
      <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#1565a8]" checked={form.longStay} onChange={(e) => set('longStay', e.target.checked)} /> Cho thuê dài hạn (tính giá theo tháng)</label>
      <label className="sm:col-span-2"><span className="field-label">Địa chỉ</span><input className="field-input" value={form.address} onChange={(e) => set('address', e.target.value)} /></label>
      <label><span className="field-label">Phòng ngủ</span><input type="number" min={0} className="field-input" value={form.bedrooms} onChange={(e) => set('bedrooms', e.target.value)} /></label>
      <label><span className="field-label">Phòng tắm</span><input type="number" min={0} className="field-input" value={form.bathrooms} onChange={(e) => set('bathrooms', e.target.value)} /></label>
      <label><span className="field-label">Sức chứa (khách)</span><input type="number" min={1} required className="field-input" value={form.maxOccupancy} onChange={(e) => set('maxOccupancy', e.target.value)} /></label>
      <label><span className="field-label">Diện tích m²</span><input type="number" min={0} className="field-input" value={form.areaSqm} onChange={(e) => set('areaSqm', e.target.value)} /></label>
      <label className="sm:col-span-2"><span className="field-label">{form.longStay ? 'Giá thuê / tháng (VND)' : 'Giá phòng / đêm (VND)'}</span><input type="number" min={1} required className="field-input" value={form.price} onChange={(e) => set('price', e.target.value)} /></label>
      <label className="sm:col-span-2"><span className="field-label">Mô tả</span><textarea className="field-input min-h-24" value={form.description} onChange={(e) => set('description', e.target.value)} /></label>
      <PhotoManager propertyId={propertyId} photos={photos} onChange={setPhotos} />
      <div className="flex items-center justify-end gap-3 sm:col-span-2"><span className="text-xs text-slate-500">{state}</span><button type="button" className="btn-secondary" onClick={done}>Hủy</button><button className="btn-primary"><Save className="h-4 w-4" /> Thêm căn</button></div>
    </form>
  );
}

function AccommodationEditor({
  propertyId,
  item,
  done,
}: {
  propertyId: Id<'properties'>;
  item: Accommodation;
  done: () => void;
}) {
  const update = useMutation(api.songHomestay.updateAccommodation);
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({});
  const rates = item.rates ?? [];
  const [draft, setDraft] = useState({
    ...item,
    maxOccupancy: item.maxOccupancy?.toString() ?? '',
    highlights: item.highlights.join(', '),
    amenities: item.amenities.join(', '),
    monthly: item.monthlyPriceCents ? String(item.monthlyPriceCents / 100) : '',
  });
  const [photos, setPhotos] = useState(item.photoUrls);
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
      const monthly = draft.longStay && draft.monthly ? Math.round(Number(draft.monthly) * 100) : 0;
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
        photoUrls: photos,
        comingSoon: draft.comingSoon,
        longStay: draft.longStay,
        monthlyPriceCents: monthly,
      });
      done();
    } catch (e) {
      setState(extractErrorMessage(e));
    }
  }
  return (
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
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[#1565a8]" checked={draft.longStay} onChange={(e) => setDraft({ ...draft, longStay: e.target.checked })} />
          Cho thuê dài hạn
        </label>
        {rates.length ? (
          rates.map((rate) => (
            <label key={rate.id}>
              <span className="field-label">
                Giá / đêm (VND) · {rate.name}
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
        ) : (
          <p className="text-sm text-slate-500">Chưa có bảng giá đang hoạt động.</p>
        )}
        {draft.longStay ? (
          <label>
            <span className="field-label">Giá thuê / tháng (VND, hiển thị)</span>
            <input className="field-input" type="number" min="0" value={draft.monthly} onChange={(e) => setDraft({ ...draft, monthly: e.target.value })} />
          </label>
        ) : null}
        <label className="sm:col-span-2">
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
          <span className="field-label">Tiện nghi (phân cách bằng dấu phẩy)</span>
          <input
            className="field-input"
            value={draft.amenities}
            onChange={(e) => setDraft({ ...draft, amenities: e.target.value })}
          />
        </label>
        <PhotoManager propertyId={propertyId} photos={photos} onChange={setPhotos} />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[#1565a8]"
            checked={draft.comingSoon}
            onChange={(e) =>
              setDraft({ ...draft, comingSoon: e.target.checked })
            }
          />{' '}
          Tạm dừng nhận booking
        </label>
        <div className="flex items-center justify-end gap-3">
          <span className="text-xs text-slate-500">{state}</span>
          <button type="button" className="btn-secondary" onClick={done}>Hủy</button>
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
  );
}

function StatusPill({ status }: { status: CalendarStatus }) { const color = statusColors[status] ?? '#475569'; return <span className="whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold" style={{ color, background: `${color}1a` }}>{STATUS_LABELS[status]}</span>; }

const BOOKING_SORTS = { newest: 'Mới nhất (vừa tạo)', checkin: 'Ngày check-in gần nhất' } as const;
type BookingSort = keyof typeof BOOKING_SORTS;

function Bookings({propertyId,snapshot}:{propertyId:Id<'properties'>;snapshot:Snapshot}) {
  const { property } = useAdminProperty();
  const update=useMutation((api as any).songHomestay.updateBookingStatus);
  const [params,setParams]=useSearchParams();
  const [toast,setToast]=useState('');
  const search=params.get('q') ?? '';
  const creating=params.get('new')==='1';
  const rawStatus=params.get('status') ?? '';
  const statusFilter=(MANAGEMENT_STATUSES as string[]).includes(rawStatus) ? rawStatus as ManagementStatus : '';
  const sort: BookingSort = params.get('sort')==='checkin' ? 'checkin' : 'newest';
  const just=params.get('just') ?? '';
  const detailCode=params.get('booking') ?? '';
  const setParam=(key:string,value:string)=>setParams(prev=>{const next=new URLSearchParams(prev); if(value) next.set(key,value); else next.delete(key); return next;},{replace:true});
  useEffect(()=>{ if(!toast) return; const timer=window.setTimeout(()=>setToast(''),7000); return ()=>window.clearTimeout(timer); },[toast]);
  const needle=search.toLowerCase();
  const rows=snapshot.bookings
    .filter(row=>row.status!=='blocked')
    .filter(row=>`${row.confirmationCode} ${row.guestName} ${row.unitName}`.toLowerCase().includes(needle))
    .filter(row=>!statusFilter || managementStatus(row)===statusFilter)
    .sort((a,b)=>{
      // The booking staff just created always sits on the first line, whatever the sort.
      if((a.confirmationCode===just)!==(b.confirmationCode===just)) return a.confirmationCode===just ? -1 : 1;
      return sort==='checkin' ? a.checkIn.localeCompare(b.checkIn) : b.createdAt-a.createdAt;
    });
  const detail=detailCode ? snapshot.bookings.find(row=>row.confirmationCode===detailCode) : undefined;
  async function transition(row:BookingRow,status:'confirmed'|'checked_in'|'checked_out'|'cancelled'){try{await update({propertyId,bookingId:row.bookingId,status});}catch(error){window.alert(extractErrorMessage(error));}}
  const pill='whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold transition';
  function actionsFor(row:BookingRow){return <div className="flex flex-nowrap gap-1.5">{row.status==='pending'?<button type="button" className={`${pill} bg-[#0b2e4f] text-white hover:bg-[#1565a8]`} onClick={()=>void transition(row,'confirmed')}>Xác nhận</button>:null}{row.status==='confirmed'?<button type="button" className={`${pill} bg-[#0b2e4f] text-white hover:bg-[#1565a8]`} onClick={()=>void transition(row,'checked_in')}>Check-in</button>:null}{row.status==='checked_in'?<button type="button" className={`${pill} bg-teal-700 text-white hover:bg-teal-800`} onClick={()=>void transition(row,'checked_out')}>Hoàn thành</button>:null}{['pending','confirmed'].includes(row.status)?<button type="button" className={`${pill} border border-red-200 bg-white text-red-700 hover:bg-red-50`} onClick={()=>void transition(row,'cancelled')}>Hủy</button>:null}</div>;}
  const tab=(active:boolean)=>`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition ${active?'bg-white text-[#0b2e4f] shadow-sm':'text-slate-500 hover:text-[#0b2e4f]'}`;
  return <div className="space-y-6">
    {creating && <CreateBookingDialog propertyId={propertyId} close={()=>setParam('new','')} onCreated={(code)=>{setParams(prev=>{const next=new URLSearchParams(prev); next.delete('new'); next.delete('status'); next.delete('q'); next.set('just',code); return next;},{replace:true}); setToast(`Đã tạo booking ${code}. Lịch phòng đã được khóa và đơn nằm ở dòng đầu tiên.`);}}/>}
    {detail && <BookingDetailDialog row={detail} currency={snapshot.property.currency} timezone={property.timezone} actions={actionsFor(detail)} close={()=>setParam('booking','')}/>}
    <section className="rounded-2xl border border-sky-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <div role="group" aria-label="Lọc theo trạng thái" className="flex shrink-0 gap-1 rounded-xl bg-slate-100 p-1">
          <button type="button" aria-pressed={!statusFilter} className={tab(!statusFilter)} onClick={()=>setParam('status','')}>Tất cả</button>
          {MANAGEMENT_STATUSES.map(value=><button type="button" key={value} aria-pressed={statusFilter===value} className={tab(statusFilter===value)} onClick={()=>setParam('status',statusFilter===value?'':value)}>{STATUS_LABELS[value]}</button>)}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="relative"><span className="sr-only">Tìm booking</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true"/><input type="search" className="field-input w-64 pl-9" placeholder="Tìm mã, khách hoặc cơ sở…" value={search} onChange={(e)=>setParam('q',e.target.value)}/></label>
          <select aria-label="Sắp xếp booking" className="field-input w-auto" value={sort} onChange={(e)=>setParam('sort',e.target.value==='newest'?'':e.target.value)}>{(Object.keys(BOOKING_SORTS) as BookingSort[]).map(key=><option key={key} value={key}>{BOOKING_SORTS[key]}</option>)}</select>
          <button type="button" className="btn-primary whitespace-nowrap" onClick={()=>setParam('new','1')}><Plus className="h-4 w-4" aria-hidden="true"/>Tạo và khóa booking</button>
        </div>
      </div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Mã</th><th className="p-3">Khách</th><th className="p-3">Chỗ nghỉ</th><th className="p-3">Lưu trú</th><th className="p-3">Nguồn</th><th className="p-3">Tổng tiền</th><th className="p-3">Trạng thái</th><th className="p-3">Thao tác</th></tr></thead><tbody>{rows.map((row)=>{
        const fresh=row.confirmationCode===just;
        return <tr key={row.bookingId} aria-current={fresh?'true':undefined} className={`border-t border-slate-100 ${fresh?'bg-sky-50 shadow-[inset_4px_0_0_#1565a8]':''}`}>
          <td className="p-3 font-bold">{row.confirmationCode}{fresh?<span className="ml-2 rounded-full bg-[#1565a8] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">Vừa tạo</span>:null}</td>
          <td className="p-3"><strong>{row.guestName}</strong><br/><span className="text-xs text-slate-500">{row.guestPhone}</span></td><td className="min-w-48 p-3 !whitespace-normal">{row.unitName}</td><td className="p-3">{stayRange(row.checkIn, row.checkOut)}</td><td className="p-3">{sourceLabel(row.source)}</td><td className="p-3 font-semibold">{formatMoney(row.totalCents,snapshot.property.currency)}</td>
          <td className="p-3"><StatusPill status={managementStatus(row)}/>{fresh?<span className="mt-1 block w-fit rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold text-[#1565a8]">Mới tạo · Đã khóa</span>:null}{row.residenceMissing?<span className="mt-1 block w-fit rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-800">Thiếu khai báo {row.residenceMissing}</span>:null}</td>
          <td className="p-3"><div className="flex items-center gap-3"><button type="button" aria-label={`Xem chi tiết booking ${row.confirmationCode}`} title="Xem chi tiết" className="grid h-8 w-8 place-items-center rounded-full text-[#1565a8] hover:bg-sky-50" onClick={()=>setParam('booking',row.confirmationCode)}><Eye className="h-4 w-4" aria-hidden="true"/></button>{actionsFor(row)}</div></td></tr>;
      })}{!rows.length?<tr><td colSpan={8} className="p-8 text-center text-slate-400">Không có booking phù hợp.</td></tr>:null}</tbody></table></div>
    </section>
    {toast && <div role="status" aria-live="polite" className="fixed inset-x-4 bottom-6 z-50 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-2xl bg-[#0b2e4f] px-5 py-3 text-sm font-semibold text-white shadow-2xl"><span>{toast}</span><button type="button" aria-label="Đóng thông báo" className="text-white/70 hover:text-white" onClick={()=>setToast('')}><X className="h-4 w-4"/></button></div>}
  </div>;
}

function BookingDetailDialog({row,currency,timezone,actions,close}:{row:BookingRow;currency:string;timezone:string;actions:React.ReactNode;close:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  const nights=daysBetween(row.checkIn,row.checkOut);
  const created=shortDateTime(row.createdAt,timezone);
  const guests=`${row.adults} người lớn${row.children?`, ${row.children} trẻ em`:''}${row.infants?`, ${row.infants} em bé`:''}${row.pets?`, ${row.pets} thú cưng`:''}`;
  const items:Array<[string,React.ReactNode]>=[['Khách',<strong key="g">{row.guestName}</strong>],['Điện thoại',row.guestPhone||'-'],['Email',row.guestEmail||'-'],['Chỗ nghỉ',row.unitName],['Lưu trú',`${stayRange(row.checkIn,row.checkOut)} (${nights} đêm)`],['Số khách',guests],['Nguồn',sourceLabel(row.source)],['Dịch vụ kèm',formatMoney(row.serviceCents,currency)],['Tổng tiền',<strong key="t">{formatMoney(row.totalCents,currency)}</strong>],['Tạo lúc',created]];
  return <dialog ref={dialog} onCancel={close} onClick={e=>{if(e.target===dialog.current)close();}} aria-labelledby="booking-detail-heading" className="w-[min(96vw,34rem)] rounded-2xl p-0 shadow-xl backdrop:bg-black/40">
    <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 id="booking-detail-heading" className="text-lg font-extrabold text-[#10234a]">Booking {row.confirmationCode}</h2><div className="mt-1"><StatusPill status={managementStatus(row)}/></div></div><button type="button" className="btn-secondary" onClick={close}>Đóng</button></div>
    <dl className="space-y-2 p-5 text-sm">{items.map(([label,value])=><div key={label} className="grid grid-cols-[8rem_1fr] gap-3"><dt className="text-slate-500">{label}</dt><dd className="text-slate-800">{value}</dd></div>)}</dl>
    {row.residenceMissing?<p className="mx-5 mb-4 rounded-xl bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800">Còn {row.residenceMissing} khách chưa khai báo tạm trú.</p>:null}
    <div className="flex items-center justify-between gap-3 border-t px-5 py-4">{actions}<Link className="text-sm font-bold text-blue-700" to={`/admin/calendar?date=${row.checkIn}&period=week`}>Xem trên lịch ↗</Link></div>
  </dialog>;
}

function CreateBookingDialog({propertyId,close,onCreated}:{propertyId:Id<'properties'>;close:()=>void;onCreated:(confirmationCode:string)=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  return <dialog ref={dialog} onCancel={close} aria-labelledby="create-booking-heading" className="w-[min(96vw,56rem)] rounded-2xl p-0 shadow-xl backdrop:bg-black/40">
    <div className="flex items-center justify-between border-b px-5 py-4"><h2 id="create-booking-heading" className="text-lg font-extrabold text-[#10234a]">Tạo và khóa booking</h2><button type="button" className="btn-secondary" onClick={close}>Đóng</button></div>
    <div className="max-h-[80vh] overflow-y-auto p-5"><SongHomestayManagementSection propertyId={propertyId} initialTab="booking" showTabs={false} onBookingCreated={onCreated}/></div>
  </dialog>;
}

// Ten clearly distinct hues so every Sóng unit (8 today) keeps its own colour.
const unitColors = ['#1d4ed8','#7e22ce','#047857','#b45309','#be185d','#0e7490','#dc2626','#65a30d','#4338ca','#a16207'];
// A blocked night draws like any occupied night: the grey "Khóa phòng" colour and legend entry are gone.
const statusColors: Record<CalendarStatus,string> = {pending:'#e11d48',confirmed:'#1d4ed8',completed:'#6d28d9',cancelled:'#991b1b',blocked:'#1d4ed8'};
// Bars show the guest's name; an OTA import without a name falls back to its channel.
const barLabel = (row: BookingRow) => row.guestName && row.guestName !== 'Khách OTA' ? row.guestName : sourceLabel(row.source);
/** Confirmed stays (incl. OTA imports, which arrive confirmed); pending requests, cancellations and blocks are not drawn. */
const CALENDAR_STATUSES = new Set(['confirmed', 'checked_in', 'checked_out', 'external']);

type Popover = { booking: BookingRow; x: number; y: number };

function Calendar({snapshot,startDate,endDate}:{snapshot:Snapshot;startDate:string;endDate:string}) {
  const [popover,setPopover]=useState<Popover|null>(null);
  const popoverRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!popover) return;
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setPopover(null);};
    const onDown=(e:MouseEvent)=>{if(!popoverRef.current?.contains(e.target as Node))setPopover(null);};
    window.addEventListener('keydown',onKey); window.addEventListener('mousedown',onDown);
    return ()=>{window.removeEventListener('keydown',onKey); window.removeEventListener('mousedown',onDown);};
  },[popover]);
  const days=Array.from({length:Math.max(1,Math.min(31,daysBetween(startDate,endDate)))},(_,i)=>addDays(startDate,i));
  const windowEnd=addDays(days[days.length-1],1);
  const {property}=useAdminProperty();
  const today=todayIso(property.timezone);
  // Only confirmed stays are drawn (WEBSITE.pdf r5); each bar takes its unit's colour, like the unit name.
  const rows=snapshot.bookings.filter(row=>CALENDAR_STATUSES.has(row.status) && row.checkIn<windowEnd && row.checkOut>days[0]);
  const unitIndex=new Map(snapshot.units.map((unit,i)=>[unit._id,i]));
  const colorFor=(row:BookingRow)=>unitColors[(unitIndex.get(row.unitId) ?? 0)%unitColors.length];
  const columns=`repeat(${days.length}, minmax(${days.length<=7?'7rem':'3.5rem'}, 1fr))`;
  function open(event:ReactMouseEvent,booking:BookingRow){
    const width=288; const x=Math.min(event.clientX, window.innerWidth-width-16); const y=Math.min(event.clientY+12, window.innerHeight-260);
    setPopover({booking,x:Math.max(16,x),y:Math.max(16,y)});
  }
  return <section className="card overflow-hidden p-4">
    <div className="mb-3 flex flex-wrap items-center gap-3 text-xs font-semibold"><span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[#1565a8]"><span className="h-2.5 w-2.5 rounded-sm bg-[#1565a8]"/>Đã xác nhận ({rows.length})</span><span className="text-slate-500">Màu booking trùng màu tên từng căn homestay</span></div>
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
            {placed.map(({row,start,end,lane})=><button type="button" key={row.bookingId} onClick={e=>open(e,row)} title={`${barLabel(row)} · ${row.confirmationCode} · ${stayRange(row.checkIn,row.checkOut)}`}
              className={`z-10 mx-0.5 my-0.5 truncate px-2 text-left font-semibold text-white shadow-sm hover:brightness-110 ${row.checkIn<days[0]?'':'rounded-l'} ${row.checkOut>windowEnd?'':'rounded-r'} ${row.syncConflict?'ring-2 ring-red-500':''}`}
              style={{gridColumn:`${start+1} / ${Math.max(start+1,end)+1}`,gridRow:`${lane+1}`,background:colorFor(row)}}>{barLabel(row)}</button>)}
          </div></div>;
      })}
    </div></div>
    {popover && <div ref={popoverRef} role="dialog" aria-label={`Booking ${popover.booking.confirmationCode}`} className="fixed z-50 w-72 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-xl" style={{left:popover.x,top:popover.y}}>
      <div className="flex items-start justify-between gap-2"><div><p className="font-extrabold text-[#10234a]">{barLabel(popover.booking)}</p><p className="text-xs text-slate-500">{popover.booking.confirmationCode}</p></div><button type="button" aria-label="Đóng" className="text-slate-400 hover:text-slate-700" onClick={()=>setPopover(null)}>✕</button></div>
      <div className="mt-2"><StatusPill status={calendarStatus(popover.booking,today)}/></div>
      <dl className="mt-3 space-y-1 text-slate-700">
        <div><dt className="inline text-slate-500">Căn: </dt><dd className="inline font-semibold">{popover.booking.unitName}</dd></div>
        <div><dt className="inline text-slate-500">Nguồn: </dt><dd className="inline">{sourceLabel(popover.booking.source)}</dd></div>
        <div><dt className="inline text-slate-500">Lưu trú: </dt><dd className="inline">{stayRange(popover.booking.checkIn, popover.booking.checkOut)} ({daysBetween(popover.booking.checkIn,popover.booking.checkOut)} đêm)</dd></div>
        <div><dt className="inline text-slate-500">Khách: </dt><dd className="inline">{popover.booking.adults} người lớn, {popover.booking.children} trẻ em{popover.booking.infants ? `, ${popover.booking.infants} em bé` : ''}{popover.booking.pets ? `, ${popover.booking.pets} thú cưng` : ''}</dd></div>
        {popover.booking.guestPhone && <div><dt className="inline text-slate-500">Điện thoại: </dt><dd className="inline">{popover.booking.guestPhone}</dd></div>}
        <div><dt className="inline text-slate-500">Tổng tiền: </dt><dd className="inline font-semibold">{formatMoney(popover.booking.totalCents,snapshot.property.currency)}</dd></div>
      </dl>
      <Link className="mt-3 inline-block font-bold text-blue-700" to={`/admin/bookings?q=${encodeURIComponent(popover.booking.confirmationCode)}`}>Mở trong Danh sách booking ↗</Link>
    </div>}
  </section>;
}

function IcalImport({propertyId}:{propertyId:Id<'properties'>}) { const catalog=useQuery((api as any).songHomestay.managementCatalog,{propertyId}) as Catalog|undefined; const upload=useAction((api as any).icalImport.uploadManualIcs); const [unitId,setUnitId]=useState(''); const [source,setSource]=useState<'Airbnb'|'Booking.com'>('Airbnb'); const [file,setFile]=useState<File|null>(null); const [message,setMessage]=useState(''); const [working,setWorking]=useState(false); async function submit(e:FormEvent){e.preventDefault();if(!file||!unitId)return;setWorking(true);try{const result=await upload({propertyId,unitId:unitId as Id<'units'>,source,icsText:await file.text()});setMessage(`Đã nhập: ${result.inserted} mới, ${result.updated} cập nhật, ${result.removed} hủy, ${result.conflicts} xung đột.`);}catch(error){setMessage(extractErrorMessage(error));}finally{setWorking(false);}} if(!catalog)return <Spinner label="Đang tải danh sách cơ sở…"/>; return <div className="grid gap-6 xl:grid-cols-[.75fr_1.25fr]"><form onSubmit={submit} className="rounded-2xl border border-sky-100 bg-white p-6 shadow-sm"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600"><FileUp className="h-7 w-7"/></span><h2 className="mt-5 text-xl font-extrabold text-[#10234a]">Tải lên tệp .ics</h2><div className="mt-5 space-y-4"><label><span className="field-label">Cơ sở lưu trú</span><select required className="field-input" value={unitId} onChange={(e)=>setUnitId(e.target.value)}><option value="">Chọn cơ sở</option>{catalog.units.map((unit)=><option key={unit.unitId} value={unit.unitId}>{unit.name}</option>)}</select></label><label><span className="field-label">Nguồn dữ liệu</span><select className="field-input" value={source} onChange={(e)=>setSource(e.target.value as typeof source)}><option>Airbnb</option><option>Booking.com</option></select></label><label><span className="field-label">Tệp iCal (tối đa 1 MB)</span><input required accept=".ics,text/calendar" type="file" className="field-input" onChange={(e)=>setFile(e.target.files?.[0]??null)}/></label><button className="btn-primary w-full justify-center" disabled={working||!file||!unitId}>{working?<><RefreshCw className="h-4 w-4 animate-spin"/>Đang nhập…</>:<>Nhập dữ liệu iCal</>}</button>{message?<p role="status" className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{message}</p>:null}</div></form><section className="rounded-2xl border border-sky-100 bg-white p-6 shadow-sm"><h2 className="font-extrabold text-[#10234a]">Lần nhập gần nhất theo cơ sở</h2><div className="mt-4 space-y-3">{catalog.units.map((unit)=>{const raw=(unit as any).icalImports??[];return <div key={unit.unitId} className="rounded-xl border border-slate-100 p-4"><h3 className="font-bold text-slate-800">{unit.name}</h3><p className="mt-1 text-sm text-slate-500">{raw.length?`${raw.length} nguồn đã cấu hình`:'Chưa nhập tệp iCal'}</p></div>})}</div><div className="mt-6 rounded-xl border border-sky-100 bg-sky-50 p-4 text-sm leading-6 text-[#10234a]">Dùng khi nền tảng không cung cấp link iCal. Đồng bộ qua iCal là một chiều và có độ trễ; hệ thống không kết nối API trực tiếp và không đẩy lịch ngược lên Airbnb/Booking.com.</div></section></div>; }
