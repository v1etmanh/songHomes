import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Minus, Plus } from 'lucide-react';

export interface GuestFormValue {
  name: string;
  email: string;
  phone: string;
  marketingOptIn: boolean;
  /** 13 and over. */
  adults: number;
  /** Ages 2–12. */
  children: number;
  /** Under 2; not counted toward the stay's capacity. */
  infants: number;
  pets: number;
}

export interface GuestFormProps {
  value: GuestFormValue;
  onChange: (value: GuestFormValue) => void;
  maxOccupancy: number;
  /** Signed-in bookings use the account email; the server ignores any other. */
  emailLocked?: boolean;
}

const MAX_INFANTS = 5;
const MAX_PETS = 5;

export function guestSummary(value: Pick<GuestFormValue, 'adults' | 'children' | 'infants' | 'pets'>) {
  const parts = [`${value.adults + value.children} khách`];
  if (value.infants) parts.push(`${value.infants} em bé`);
  if (value.pets) parts.push(`${value.pets} thú cưng`);
  return parts.join(', ');
}

function Stepper({ label, hint, value, min, max, onChange }: { label: string; hint: string; value: number; min: number; max: number; onChange: (next: number) => void }) {
  const button = 'grid h-9 w-9 place-items-center rounded-full border border-slate-300 text-slate-700 transition hover:border-[#0b2e4f] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-slate-300';
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-4 last:border-b-0">
      <div>
        <p className="font-semibold text-[#0b2e4f]">{label}</p>
        <p className="text-sm text-slate-500">{hint}</p>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" className={button} disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Bớt ${label.toLowerCase()}`}><Minus className="h-4 w-4" /></button>
        <span className="w-5 text-center font-semibold tabular-nums" aria-live="polite">{value}</span>
        <button type="button" className={button} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`Thêm ${label.toLowerCase()}`}><Plus className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

/** "Khách" dropdown: adults 13+, children 2–12, infants under 2 and pets, with capacity enforced on adults + children + infants (every infant takes a seat). */
export function GuestPicker({ value, onChange, maxOccupancy }: { value: Pick<GuestFormValue, 'adults' | 'children' | 'infants' | 'pets'>; onChange: (next: Pick<GuestFormValue, 'adults' | 'children' | 'infants' | 'pets'>) => void; maxOccupancy: number }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, [open]);
  const seated = value.adults + value.children + value.infants;
  return (
    <div ref={root} className="relative">
      <span className="field-label">Khách</span>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="field-input flex items-center justify-between text-left">
        <span>{guestSummary(value)}</span>
        <ChevronDown className={`h-4 w-4 text-slate-500 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-2 rounded-2xl border border-slate-200 bg-white px-5 py-1 shadow-xl">
          <Stepper label="Người lớn" hint="Từ 13 tuổi trở lên" value={value.adults} min={1} max={value.adults + Math.max(0, maxOccupancy - seated)} onChange={(adults) => onChange({ ...value, adults })} />
          <Stepper label="Trẻ em" hint="Độ tuổi 2-12" value={value.children} min={0} max={value.children + Math.max(0, maxOccupancy - seated)} onChange={(children) => onChange({ ...value, children })} />
          <Stepper label="Em bé" hint="Dưới 2 tuổi" value={value.infants} min={0} max={Math.min(MAX_INFANTS, value.infants + Math.max(0, maxOccupancy - seated))} onChange={(infants) => onChange({ ...value, infants })} />
          <Stepper label="Thú cưng" hint="Vui lòng báo trước cho Sóng" value={value.pets} min={0} max={MAX_PETS} onChange={(pets) => onChange({ ...value, pets })} />
          <p className="py-3 text-xs leading-5 text-slate-500">Chỗ ở này cho tối đa {maxOccupancy} khách, bao gồm em bé. Mang theo thú cưng cần được Sóng xác nhận trước.</p>
        </div>
      ) : null}
    </div>
  );
}

/** Guest contact + party-size form used on the unit-type booking page. */
export function GuestForm({ value, onChange, maxOccupancy, emailLocked = false }: GuestFormProps) {
  const set = <K extends keyof GuestFormValue>(key: K, v: GuestFormValue[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="space-y-4">
      <div>
        <label className="field-label" htmlFor="guest-name">
          Họ và tên
        </label>
        <input
          id="guest-name"
          className="field-input"
          type="text"
          required
          value={value.name}
          onChange={(e) => set('name', e.target.value)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="guest-email">
            Email
          </label>
          <input
            id="guest-email"
            className="field-input"
            type="email"
            required
            readOnly={emailLocked}
            title={emailLocked ? 'Email của tài khoản đang đăng nhập' : undefined}
            value={value.email}
            onChange={(e) => set('email', e.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="guest-phone">
            Số điện thoại
          </label>
          <input
            id="guest-phone"
            className="field-input"
            type="tel"
            required
            value={value.phone}
            onChange={(e) => set('phone', e.target.value)}
          />
        </div>
      </div>
      <GuestPicker value={value} maxOccupancy={maxOccupancy} onChange={(party) => onChange({ ...value, ...party })} />
      <label className="flex items-start gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={value.marketingOptIn}
          onChange={(e) => set('marketingOptIn', e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#1565a8]"
        />
        <span>
          Tôi đồng ý nhận tin và ưu đãi từ Sóng Homestay.
          <span className="mt-1 block text-xs text-slate-500">
            Bạn có thể bỏ chọn; lựa chọn này không ảnh hưởng đến việc đặt phòng.
          </span>
        </span>
      </label>
    </div>
  );
}
