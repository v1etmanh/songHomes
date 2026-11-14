import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { BedDouble, ConciergeBell, Plus, Save, Users } from 'lucide-react';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { formatMoney } from '../lib/money';
import { ErrorMessage, extractErrorMessage } from './ErrorMessage';

type Catalog = {
  property: { propertyId: Id<'properties'>; name: string; slug: string; currency: string };
  unitTypes: Array<{ unitTypeId: Id<'unitTypes'>; name: string; maxOccupancy: number }>;
  units: Array<{
    unitId: Id<'units'>;
    unitTypeId: Id<'unitTypes'>;
    name: string;
    slug: string;
    status: 'active' | 'coming_soon' | 'offline';
    sortOrder: number;
  }>;
  addOns: Array<{
    addOnId: Id<'addOns'>;
    name: string;
    priceCents: number;
    unitLabel: string;
    taxable: boolean;
    active: boolean;
    sortOrder: number;
  }>;
};

const sourceLabels = {
  zalo: 'Zalo',
  facebook: 'Facebook',
  phone: 'Điện thoại',
  walk_in: 'Khách vãng lai',
  other: 'Nguồn khác',
} as const;

export function SongHomestayManagementSection({ propertyId, initialTab = 'booking', showTabs = true }: { propertyId: Id<'properties'>; initialTab?: 'booking' | 'units' | 'services'; showTabs?: boolean }) {
  const catalog = useQuery((api as any).songHomestay.managementCatalog, { propertyId }) as Catalog | undefined;
  const since = useMemo(() => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - 30);
    return date.toISOString().slice(0, 10);
  }, []);
  const kpis = useQuery((api as any).songHomestay.kpiSummary, { propertyId, since }) as {
    totalBookings: number;
    directBookings: number;
    manualBookings: number;
    otaBookings: number;
    directSharePercent: number;
    directWithServices: number;
    serviceAttachPercent: number;
    activeConflicts: number;
    averageResolutionMinutes: number | null;
    configuredFeeds: number;
    failedFeeds: number;
    lastSyncAt: number | null;
  } | undefined;
  const createManualBooking = useMutation((api as any).songHomestay.createManualBooking);
  const createUnit = useMutation((api as any).songHomestay.createUnit);
  const updateUnit = useMutation((api as any).songHomestay.updateUnit);
  const createAddOn = useMutation((api as any).songHomestay.createAddOn);
  const updateAddOn = useMutation((api as any).songHomestay.updateAddOn);

  const [tab, setTab] = useState<'booking' | 'units' | 'services'>(initialTab);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [working, setWorking] = useState(false);
  const [unitId, setUnitId] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [source, setSource] = useState<keyof typeof sourceLabels>('zalo');
  const [note, setNote] = useState('');
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitSlug, setNewUnitSlug] = useState('');
  const [newUnitTypeId, setNewUnitTypeId] = useState('');
  const [newServiceName, setNewServiceName] = useState('');
  const [newServicePrice, setNewServicePrice] = useState('');
  const [newServiceUnit, setNewServiceUnit] = useState('lần');

  const selectedUnit = useMemo(
    () => catalog?.units.find((unit) => String(unit.unitId) === unitId),
    [catalog, unitId],
  );
  const selectedType = catalog?.unitTypes.find((type) => type.unitTypeId === selectedUnit?.unitTypeId);

  async function submitManualBooking(event: FormEvent) {
    event.preventDefault();
    if (!unitId) return;
    setWorking(true);
    setFeedback(null);
    try {
      const result = await createManualBooking({
        propertyId,
        unitId: unitId as Id<'units'>,
        checkIn,
        checkOut,
        guestName,
        guestPhone,
        guestEmail: guestEmail.trim() || undefined,
        adults,
        children,
        source,
        note: note.trim() || undefined,
      });
      setFeedback({ kind: 'ok', text: `Đã tạo booking ${result.confirmationCode} từ ${sourceLabels[source]}. Lịch phòng đã được khóa ngay.` });
      setGuestName('');
      setGuestPhone('');
      setGuestEmail('');
      setNote('');
    } catch (error) {
      setFeedback({ kind: 'error', text: extractErrorMessage(error) });
    } finally {
      setWorking(false);
    }
  }

  async function run(action: () => Promise<unknown>, success: string) {
    setWorking(true);
    setFeedback(null);
    try {
      await action();
      setFeedback({ kind: 'ok', text: success });
    } catch (error) {
      setFeedback({ kind: 'error', text: extractErrorMessage(error) });
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="card overflow-hidden border-2 border-sky-700/20 p-5" aria-label="Quản lý vận hành Sóng Homestay">
      {/* Embedded in an admin page that already shows its own title: keep only a screen-reader heading. */}
      {!showTabs ? <h2 className="sr-only">Booking thủ công, căn lưu trú và dịch vụ</h2> : <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Sóng Homestay</p>
          <h2 className="mt-1 text-xl font-semibold text-stone-950">Booking thủ công, căn lưu trú và dịch vụ</h2>
          <p className="mt-1 text-sm text-stone-600">Nhập booking từ Zalo/Facebook và quản lý danh mục vận hành trên cùng hệ thống.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={tab === 'booking' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('booking')}><Users className="h-4 w-4" /> Booking ngoài</button>
          <button type="button" className={tab === 'units' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('units')}><BedDouble className="h-4 w-4" /> Căn ({catalog?.units.length ?? 0})</button>
          <button type="button" className={tab === 'services' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('services')}><ConciergeBell className="h-4 w-4" /> Dịch vụ ({catalog?.addOns.length ?? 0})</button>
        </div>
      </div>}

      {showTabs && <div className={`${showTabs ? 'mt-4 ' : ''}grid gap-2 sm:grid-cols-2 xl:grid-cols-6`} aria-label="KPI 30 ngày">
        <Kpi label="Booking 30 ngày" value={kpis?.totalBookings ?? '…'} detail={`${kpis?.directBookings ?? 0} web · ${kpis?.manualBookings ?? 0} thủ công · ${kpis?.otaBookings ?? 0} OTA`} />
        <Kpi label="Tỷ lệ booking web" value={kpis ? `${kpis.directSharePercent}%` : '…'} detail="Mục tiêu O5: 10%" />
        <Kpi label="Web kèm dịch vụ" value={kpis ? `${kpis.serviceAttachPercent}%` : '…'} detail={`${kpis?.directWithServices ?? 0} booking · O6: 20%`} />
        <Kpi label="Xung đột đang mở" value={kpis?.activeConflicts ?? '…'} detail="Mục tiêu O1: 0" />
        <Kpi label="TG xử lý TB" value={kpis?.averageResolutionMinutes === null ? 'Chưa có' : kpis ? `${kpis.averageResolutionMinutes} phút` : '…'} detail="Mục tiêu O3: <15 phút" />
        <Kpi label="Đồng bộ iCal" value={kpis ? `${kpis.configuredFeeds - kpis.failedFeeds}/${kpis.configuredFeeds}` : '…'} detail={kpis?.lastSyncAt ? new Date(kpis.lastSyncAt).toLocaleString('vi-VN') : 'Chưa đồng bộ'} />
      </div>}

      {feedback ? (
        <div className="mt-4" role="status">
          {feedback.kind === 'error' ? <ErrorMessage message={feedback.text} /> : <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">{feedback.text}</p>}
        </div>
      ) : null}

      {tab === 'booking' ? (
        <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={submitManualBooking}>
          <label><span className="field-label">Căn lưu trú *</span><select className="field-input" required value={unitId} onChange={(event) => setUnitId(event.target.value)}><option value="">Chọn căn đang hoạt động</option>{catalog?.units.filter((unit) => unit.status === 'active').map((unit) => <option key={unit.unitId} value={unit.unitId}>{unit.name}</option>)}</select></label>
          <label><span className="field-label">Nguồn booking *</span><select className="field-input" value={source} onChange={(event) => setSource(event.target.value as keyof typeof sourceLabels)}>{Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span className="field-label">Ngày nhận phòng *</span><input className="field-input" type="date" required value={checkIn} onChange={(event) => setCheckIn(event.target.value)} /></label>
          <label><span className="field-label">Ngày trả phòng *</span><input className="field-input" type="date" required min={checkIn || undefined} value={checkOut} onChange={(event) => setCheckOut(event.target.value)} /></label>
          <label><span className="field-label">Tên khách *</span><input className="field-input" required value={guestName} onChange={(event) => setGuestName(event.target.value)} /></label>
          <label><span className="field-label">Số điện thoại *</span><input className="field-input" required value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} /></label>
          <label><span className="field-label">Email (không bắt buộc)</span><input className="field-input" type="email" value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} /></label>
          <div className="grid grid-cols-2 gap-3"><label><span className="field-label">Người lớn</span><input className="field-input" type="number" min={1} max={selectedType?.maxOccupancy ?? 20} value={adults} onChange={(event) => setAdults(Number(event.target.value))} /></label><label><span className="field-label">Trẻ em</span><input className="field-input" type="number" min={0} max={20} value={children} onChange={(event) => setChildren(Number(event.target.value))} /></label></div>
          <label className="md:col-span-2"><span className="field-label">Ghi chú</span><textarea className="field-input min-h-20" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ví dụ: đã nhận cọc qua chuyển khoản" /></label>
          <div className="md:col-span-2"><button className="btn-primary" type="submit" disabled={working || !unitId || !checkIn || !checkOut}>{working ? 'Đang kiểm tra lịch…' : 'Tạo booking và khóa lịch'}</button></div>
        </form>
      ) : null}

      {tab === 'units' ? (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 rounded-xl border border-stone-200 bg-stone-50 p-4 md:grid-cols-[1fr_1fr_1fr_auto]">
            <label><span className="field-label">Tên căn mới</span><input className="field-input" value={newUnitName} onChange={(event) => setNewUnitName(event.target.value)} /></label>
            <label><span className="field-label">Mã URL</span><input className="field-input" value={newUnitSlug} onChange={(event) => setNewUnitSlug(event.target.value)} placeholder="can-i-can-ho-2pn" /></label>
            <label><span className="field-label">Loại phòng</span><select className="field-input" value={newUnitTypeId} onChange={(event) => setNewUnitTypeId(event.target.value)}><option value="">Chọn loại</option>{catalog?.unitTypes.map((type) => <option key={type.unitTypeId} value={type.unitTypeId}>{type.name}</option>)}</select></label>
            <button type="button" className="btn-primary self-end" disabled={working || !newUnitName || !newUnitSlug || !newUnitTypeId} onClick={() => void run(async () => { await createUnit({ propertyId, unitTypeId: newUnitTypeId as Id<'unitTypes'>, name: newUnitName, slug: newUnitSlug }); setNewUnitName(''); setNewUnitSlug(''); }, 'Đã thêm căn mới.')}><Plus className="h-4 w-4" /> Thêm căn</button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {catalog?.units.map((unit) => <UnitEditor key={unit.unitId} unit={unit} disabled={working} onSave={(name, status) => run(() => updateUnit({ propertyId, unitId: unit.unitId, name, status }), `Đã cập nhật ${name}.`)} />)}
          </div>
        </div>
      ) : null}

      {tab === 'services' ? (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 rounded-xl border border-stone-200 bg-stone-50 p-4 md:grid-cols-[1.5fr_1fr_1fr_auto]">
            <label><span className="field-label">Tên dịch vụ mới</span><input className="field-input" value={newServiceName} onChange={(event) => setNewServiceName(event.target.value)} /></label>
            <label><span className="field-label">Giá (VND)</span><input className="field-input" type="number" min={0} value={newServicePrice} onChange={(event) => setNewServicePrice(event.target.value)} /></label>
            <label><span className="field-label">Đơn vị</span><input className="field-input" value={newServiceUnit} onChange={(event) => setNewServiceUnit(event.target.value)} /></label>
            <button type="button" className="btn-primary self-end" disabled={working || !newServiceName || !newServicePrice || !newServiceUnit} onClick={() => void run(async () => { await createAddOn({ propertyId, name: newServiceName, priceCents: Math.round(Number(newServicePrice) * 100), unitLabel: newServiceUnit, taxable: false }); setNewServiceName(''); setNewServicePrice(''); }, 'Đã thêm dịch vụ mới.')}><Plus className="h-4 w-4" /> Thêm dịch vụ</button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {catalog?.addOns.map((service) => <ServiceEditor key={service.addOnId} service={service} currency={catalog.property.currency} disabled={working} onSave={(values) => run(() => updateAddOn({ propertyId, addOnId: service.addOnId, ...values }), `Đã cập nhật ${values.name}.`)} />)}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Kpi({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <div className="rounded-xl border border-stone-200 bg-stone-50 p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{label}</p><p className="mt-1 text-xl font-bold text-stone-950">{value}</p><p className="mt-1 text-[11px] text-stone-500">{detail}</p></div>;
}

function UnitEditor({ unit, disabled, onSave }: { unit: Catalog['units'][number]; disabled: boolean; onSave: (name: string, status: Catalog['units'][number]['status']) => Promise<unknown> }) {
  const [name, setName] = useState(unit.name);
  const [status, setStatus] = useState(unit.status);
  return <div className="rounded-xl border border-stone-200 p-4"><p className="text-xs text-stone-500">/{unit.slug}</p><label className="mt-2 block"><span className="field-label">Tên căn</span><input className="field-input" value={name} onChange={(event) => setName(event.target.value)} /></label><label className="mt-3 block"><span className="field-label">Trạng thái</span><select className="field-input" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="active">Đang kinh doanh</option><option value="coming_soon">Sắp mở</option><option value="offline">Ngừng kinh doanh</option></select></label><button type="button" className="btn-secondary mt-3" disabled={disabled || !name.trim()} onClick={() => void onSave(name, status)}><Save className="h-4 w-4" /> Lưu</button></div>;
}

function ServiceEditor({ service, currency, disabled, onSave }: { service: Catalog['addOns'][number]; currency: string; disabled: boolean; onSave: (values: { name: string; priceCents: number; unitLabel: string; taxable: boolean; active: boolean }) => Promise<unknown> }) {
  const [name, setName] = useState(service.name);
  const [price, setPrice] = useState(String(service.priceCents / 100));
  const [unitLabel, setUnitLabel] = useState(service.unitLabel);
  const [taxable, setTaxable] = useState(service.taxable);
  const [active, setActive] = useState(service.active);
  return <div className="rounded-xl border border-stone-200 p-4"><p className="text-xs font-semibold text-emerald-700">{service.active ? 'Đang cung cấp' : 'Tạm ngưng'} · {formatMoney(service.priceCents, currency)} / {service.unitLabel}</p><label className="mt-2 block"><span className="field-label">Tên dịch vụ</span><input className="field-input" value={name} onChange={(event) => setName(event.target.value)} /></label><div className="mt-3 grid grid-cols-2 gap-3"><label><span className="field-label">Giá (VND)</span><input className="field-input" type="number" min={0} value={price} onChange={(event) => setPrice(event.target.value)} /></label><label><span className="field-label">Đơn vị</span><input className="field-input" value={unitLabel} onChange={(event) => setUnitLabel(event.target.value)} /></label></div><div className="mt-3 flex flex-wrap gap-4 text-sm"><label><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Đang bán</label><label><input type="checkbox" checked={taxable} onChange={(event) => setTaxable(event.target.checked)} /> Tính thuế</label></div><button type="button" className="btn-secondary mt-3" disabled={disabled || !name.trim() || !unitLabel.trim()} onClick={() => void onSave({ name, priceCents: Math.round(Number(price) * 100), unitLabel, taxable, active })}><Save className="h-4 w-4" /> Lưu</button></div>;
}
