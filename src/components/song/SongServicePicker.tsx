import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Bike, CarFront, Check, Plus, Trash2, X, type LucideIcon } from 'lucide-react';

import { stayPerkFreeUnits } from '../../../shared/pricing';
import { formatMoney } from '../../lib/money';

export interface SongAddOn {
  addOnId: string;
  name: string;
  priceCents: number;
  unitLabel: string;
  freeFirstUnitMinNights?: number;
}

/** One picked service: the add-on quantities it adds plus a note for staff. */
export interface ServiceSelection {
  id: string;
  title: string;
  detail: string;
  lines: Array<{ addOnId: string; quantity: number }>;
}

const BIKE_MODELS = ['Honda Vision', 'Honda Air Blade', 'Honda Lead 125'];
const TRIPS = [
  { id: 'pickup', label: 'Chỉ đón sân bay (1 lượt)', pickup: 1, dropoff: 0 },
  { id: 'dropoff', label: 'Chỉ tiễn ra sân bay (1 lượt)', pickup: 0, dropoff: 1 },
  { id: 'round', label: 'Khứ hồi (Đón + Tiễn)', pickup: 1, dropoff: 1 },
] as const;
const label = 'mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500';

/** Finds Sóng's transport add-ons by name; null when the catalog lacks one. */
export function songTransport(addOns: SongAddOn[]) {
  const find = (prefix: string, seats: string) => addOns.find((a) => a.name.startsWith(prefix) && a.name.includes(seats));
  const bike = addOns.find((a) => a.name.startsWith('Thuê xe máy')) ?? null;
  const cars = (['7', '16'] as const).map((seats) => ({
    seats,
    label: `Xe ${seats} chỗ`,
    pickup: find('Đón sân bay', `${seats} chỗ`) ?? null,
    dropoff: find('Tiễn sân bay', `${seats} chỗ`) ?? null,
  })).filter((car) => car.pickup || car.dropoff);
  return { bike, cars };
}

/** Sum quantities per add-on across every selection. */
export function selectionQuantities(selections: ServiceSelection[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of selections) for (const line of s.lines) out[line.addOnId] = (out[line.addOnId] ?? 0) + line.quantity;
  return out;
}

function Modal({ title, subtitle, icon: Icon, onClose, children }: { title: string; subtitle: string; icon: LucideIcon; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  // The picker sits inside the staff manual-booking <form>. A <form> nested in the DOM
  // never got its submit handled, so "Thêm vào đơn đặt phòng" did a native GET submit
  // that reloaded the whole admin ("Checking staff access…") and lost the booking.
  // Portal the dialog to <body> so its form is never nested, and stop the synthetic
  // submit (React bubbles through portals) before it reaches the outer booking form.
  return createPortal(
    <dialog ref={ref} onCancel={onClose} onSubmit={(event) => event.stopPropagation()} aria-labelledby="service-modal-title" className="w-[min(94vw,34rem)] overflow-hidden rounded-3xl p-0 shadow-2xl backdrop:bg-[#082c4f]/60">
      <div className="flex items-start gap-3 bg-[#eef4fa] px-6 py-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-[#1565a8]"><Icon className="h-5 w-5" aria-hidden="true" /></span>
        <div className="flex-1">
          <h2 id="service-modal-title" className="font-accent text-2xl text-[#0b2e4f]">{title}</h2>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-full p-1 text-slate-500 hover:bg-white"><X className="h-5 w-5" /></button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </dialog>,
    document.body,
  );
}

function Actions({ onClose }: { onClose: () => void }) {
  return (
    <div className="mt-2 flex justify-end gap-2">
      <button type="button" className="btn-secondary" onClick={onClose}>Hủy</button>
      <button type="submit" className="btn-primary"><Check className="h-4 w-4" aria-hidden="true" /> Thêm vào đơn đặt phòng</button>
    </div>
  );
}

function BikeModal({ bike, nights, currency, onClose, onAdd }: { bike: SongAddOn; nights: number; currency: string; onClose: () => void; onAdd: (s: ServiceSelection) => void }) {
  const [model, setModel] = useState(BIKE_MODELS[0]);
  const [bikes, setBikes] = useState(1);
  const [days, setDays] = useState(Math.max(1, nights || 1));
  const [pickup, setPickup] = useState('08:30 sáng ngày nhận phòng');
  const estimate = bike.priceCents * bikes * days;
  function submit(event: FormEvent) {
    event.preventDefault();
    onAdd({ id: `bike-${Date.now()}`, title: 'Thuê xe máy', detail: `${model} · ${bikes} xe × ${days} ngày · nhận xe ${pickup}`, lines: [{ addOnId: bike.addOnId, quantity: bikes * days }] });
  }
  return (
    <Modal title="Chọn dịch vụ Thuê xe máy" subtitle="Giao xe tận homestay • Kèm 2 mũ bảo hiểm & áo mưa" icon={Bike} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className={label}>Chọn dòng xe tay ga (đồng giá {formatMoney(bike.priceCents, currency)} / ngày)</span>
          <select className="field-input" value={model} onChange={(e) => setModel(e.target.value)}>
            {BIKE_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label><span className={label}>Số lượng xe</span><input className="field-input" type="number" min={1} max={5} value={bikes} onChange={(e) => setBikes(Math.max(1, Math.min(5, Number(e.target.value) || 1)))} /></label>
        <label><span className={label}>Số ngày thuê</span><input className="field-input" type="number" min={1} max={19} value={days} onChange={(e) => setDays(Math.max(1, Math.min(19, Number(e.target.value) || 1)))} /></label>
        <label className="sm:col-span-2"><span className={label}>Thời gian nhận xe dự kiến</span><input className="field-input" value={pickup} onChange={(e) => setPickup(e.target.value)} maxLength={80} /></label>
        <div className="flex items-center justify-between rounded-2xl bg-[#eef4fa] px-5 py-4 sm:col-span-2">
          <div><p className="font-semibold text-[#0b2e4f]">Tạm tính chi phí thuê xe</p><p className="text-xs text-slate-500">Đồng giá × số xe × số ngày</p></div>
          <p className="text-2xl font-bold text-[#087795]">{formatMoney(estimate, currency)}</p>
        </div>
        <div className="sm:col-span-2"><Actions onClose={onClose} /></div>
      </form>
    </Modal>
  );
}

function AirportModal({ cars, nights, currency, onClose, onAdd }: {
  cars: ReturnType<typeof songTransport>['cars'];
  nights: number;
  currency: string;
  onClose: () => void;
  onAdd: (s: ServiceSelection) => void;
}) {
  const [seats, setSeats] = useState(cars[0].seats);
  const [trip, setTrip] = useState<(typeof TRIPS)[number]['id']>('round');
  const [when, setWhen] = useState('');
  const car = cars.find((c) => c.seats === seats) ?? cars[0];
  const tripInfo = TRIPS.find((t) => t.id === trip)!;
  // The perk is set per add-on: only the chosen car's pickup decides (same rule as createHold).
  const carFreeNights = car.pickup?.freeFirstUnitMinNights;
  const pickupFree = carFreeNights !== undefined && nights >= carFreeNights && tripInfo.pickup > 0;
  const estimate = (pickupFree ? 0 : tripInfo.pickup * (car.pickup?.priceCents ?? 0)) + tripInfo.dropoff * (car.dropoff?.priceCents ?? 0);
  const note = [
    tripInfo.pickup ? (pickupFree ? `Miễn phí chiều đón (ở từ ${carFreeNights} đêm)` : `1 lượt đón (${formatMoney(car.pickup?.priceCents ?? 0, currency)})`) : null,
    tripInfo.dropoff ? `1 lượt tiễn (${formatMoney(car.dropoff?.priceCents ?? 0, currency)})` : null,
  ].filter(Boolean).join(' + ');
  function submit(event: FormEvent) {
    event.preventDefault();
    const lines = [
      ...(tripInfo.pickup && car.pickup ? [{ addOnId: car.pickup.addOnId, quantity: 1 }] : []),
      ...(tripInfo.dropoff && car.dropoff ? [{ addOnId: car.dropoff.addOnId, quantity: 1 }] : []),
    ];
    const whenText = when ? ` · ${when.replace('T', ' ')}` : '';
    onAdd({ id: `airport-${Date.now()}`, title: 'Đưa đón sân bay', detail: `${car.label} · ${tripInfo.label}${whenText}`, lines });
  }
  return (
    <Modal title="Chọn dịch vụ Đưa đón sân bay" subtitle="Sân bay Quốc tế Đà Nẵng ↔ Sóng Homestay" icon={CarFront} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {carFreeNights !== undefined ? (
          <p className={`rounded-2xl border p-4 text-sm sm:col-span-2 ${nights >= carFreeNights ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-[#1565a8]/20 bg-[#eef4fa] text-slate-600'}`}>
            {nights >= carFreeNights
              ? <><strong>Đơn của bạn ở {nights} đêm</strong> — được miễn phí 1 lượt đón từ sân bay Đà Nẵng về homestay.</>
              : <>Đặt từ <strong>{carFreeNights} đêm</strong> để được miễn phí 1 lượt đón sân bay{nights ? ` (đơn hiện tại: ${nights} đêm)` : ''}.</>}
          </p>
        ) : null}
        <label><span className={label}>Loại xe riêng</span>
          <select className="field-input" value={seats} onChange={(e) => setSeats(e.target.value as typeof seats)}>
            {cars.map((c) => <option key={c.seats} value={c.seats}>{c.label} ({formatMoney((c.pickup ?? c.dropoff)!.priceCents, currency)} / lượt)</option>)}
          </select>
        </label>
        <label><span className={label}>Hành trình</span>
          <select className="field-input" value={trip} onChange={(e) => setTrip(e.target.value as typeof trip)}>
            {TRIPS.filter((t) => (!t.pickup || car.pickup) && (!t.dropoff || car.dropoff)).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <label className="sm:col-span-2"><span className={label}>Giờ hạ cánh / khởi hành</span><input className="field-input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
        <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#eef4fa] px-5 py-4 sm:col-span-2">
          <div><p className="font-semibold text-[#0b2e4f]">Chi phí đưa đón</p><p className="text-xs text-[#087795]">{note}</p></div>
          <p className="text-2xl font-bold text-[#087795]">{formatMoney(estimate, currency)}</p>
        </div>
        <div className="sm:col-span-2"><Actions onClose={onClose} /></div>
      </form>
    </Modal>
  );
}

/**
 * Sóng's add-on step inside the booking form: motorbike rental and airport
 * transfer are chosen through the same dialogs the Experiences page used to
 * show, but here they become real add-on lines on the hold. Prices and the
 * free-pickup perk are previews; createHold recomputes both.
 */
export function SongServicePicker({ addOns, nights, currency, selections, onChange }: {
  addOns: SongAddOn[];
  nights: number;
  currency: string;
  selections: ServiceSelection[];
  onChange: (next: ServiceSelection[]) => void;
}) {
  const [modal, setModal] = useState<'bike' | 'airport' | null>(null);
  const { bike, cars } = songTransport(addOns);
  const byId = new Map(addOns.map((a) => [a.addOnId, a]));
  const freeMinNights = cars.find((c) => c.pickup?.freeFirstUnitMinNights !== undefined)?.pickup?.freeFirstUnitMinNights;

  // Price each selection with the same perk rule the server applies to the whole booking.
  const quantities = selectionQuantities(selections);
  const lineIds = Object.keys(quantities);
  const free = stayPerkFreeUnits(lineIds.map((id) => ({ unitPriceCents: byId.get(id)?.priceCents ?? 0, quantity: quantities[id], freeFirstUnitMinNights: byId.get(id)?.freeFirstUnitMinNights })), nights);
  const freeLeft = new Map(lineIds.map((id, i) => [id, free[i]]));
  const priced = selections.map((s) => {
    let cents = 0; let freeUnits = 0;
    for (const line of s.lines) {
      const left = freeLeft.get(line.addOnId) ?? 0;
      const used = Math.min(left, line.quantity);
      freeLeft.set(line.addOnId, left - used);
      freeUnits += used;
      cents += (byId.get(line.addOnId)?.priceCents ?? 0) * (line.quantity - used);
    }
    return { ...s, cents, freeUnits };
  });

  function add(selection: ServiceSelection) {
    onChange([...selections, selection]);
    setModal(null);
  }

  if (!bike && !cars.length) return null;
  return (
    <div>
      <h2 className="text-lg font-semibold text-[#0b2e4f]">Dịch vụ bổ sung</h2>
      <p className="mt-1 text-sm text-slate-500">Thêm xe máy hoặc đưa đón sân bay vào đơn — Sóng chuẩn bị sẵn trước khi bạn đến.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {bike ? (
          <button type="button" onClick={() => setModal('bike')} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 text-left transition hover:border-[#1565a8] hover:bg-[#eef4fa]">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eef4fa] text-[#1565a8]"><Bike className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1"><span className="block font-semibold text-[#0b2e4f]">Thuê xe máy</span><span className="text-xs text-slate-500">{formatMoney(bike.priceCents, currency)} / ngày</span></span>
            <Plus className="h-4 w-4 text-[#1565a8]" />
          </button>
        ) : null}
        {cars.length ? (
          <button type="button" onClick={() => setModal('airport')} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 text-left transition hover:border-[#1565a8] hover:bg-[#eef4fa]">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eef4fa] text-[#1565a8]"><CarFront className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1"><span className="block font-semibold text-[#0b2e4f]">Đưa đón sân bay</span><span className="text-xs text-slate-500">{freeMinNights ? `Miễn phí chiều đón khi ở từ ${freeMinNights} đêm` : 'Xe riêng 7 / 16 chỗ'}</span></span>
            <Plus className="h-4 w-4 text-[#1565a8]" />
          </button>
        ) : null}
      </div>
      {priced.length ? (
        <ul className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-200">
          {priced.map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0"><p className="font-semibold text-[#0b2e4f]">{s.title}</p><p className="text-xs text-slate-500">{s.detail}</p>{s.freeUnits ? <p className="text-xs font-semibold text-emerald-700">Đã gồm 1 lượt đón miễn phí</p> : null}</div>
              <div className="flex items-center gap-2"><span className="whitespace-nowrap font-bold text-[#087795]">{s.cents ? formatMoney(s.cents, currency) : 'Miễn phí'}</span>
                <button type="button" onClick={() => onChange(selections.filter((x) => x.id !== s.id))} aria-label={`Bỏ ${s.title}`} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></div>
            </li>
          ))}
        </ul>
      ) : null}
      {modal === 'bike' && bike ? <BikeModal bike={bike} nights={nights} currency={currency} onClose={() => setModal(null)} onAdd={add} /> : null}
      {modal === 'airport' && cars.length ? <AirportModal cars={cars} nights={nights} currency={currency} onClose={() => setModal(null)} onAdd={add} /> : null}
    </div>
  );
}
