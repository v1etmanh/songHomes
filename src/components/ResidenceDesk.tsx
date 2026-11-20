import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { CheckCircle2, ChevronDown, FilePlus2, Mail, Pencil, Phone, Plus, Search, UserCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
import type { FunctionReturnType } from 'convex/server';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { extractErrorMessage } from './ErrorMessage';
import { Spinner } from './Spinner';
import { daysBetween, todayIso } from '../lib/dates';
import { stayRange } from '../lib/songBookingStatus';

type RecordRow = FunctionReturnType<
  typeof api.residence.listForProperty
>[number];

const STAY_HEADERS = ['Mã bản ghi', 'Mã booking', 'Khách hàng', 'Liên hệ', 'Giấy tờ', 'Cơ sở lưu trú', 'Thời gian lưu trú', 'Trạng thái', 'Thao tác'];
const LONG_STAY_HEADERS = ['Mã bản ghi', 'Khách lưu trú', 'Liên hệ', 'Booking', 'Cơ sở lưu trú', 'Thời gian lưu trú', 'Trạng thái', 'Thao tác'];

function DocumentCell({ row }: { row: RecordRow }) {
  const label = row.documentType === 'passport' ? 'Hộ chiếu' : row.documentType.toUpperCase();
  return <span className="whitespace-nowrap">{label} · <span className={row.canReveal ? 'font-mono font-semibold text-slate-800' : ''}>{row.documentNumber}</span></span>;
}

/** Everything the guest entered, for staff to file the declaration (shown under the row). */
function RecordDetails({ row }: { row: RecordRow }) {
  const items: Array<[string, string | undefined]> = [
    ['Họ và tên', row.fullName], ['Quốc tịch', row.nationality], ['Ngày sinh', row.dateOfBirth ? stayDate(row.dateOfBirth) : undefined],
    ['Giới tính', row.gender], ['Loại giấy tờ', row.documentType === 'passport' ? 'Hộ chiếu' : row.documentType.toUpperCase()], ['Số giấy tờ', row.documentNumber],
    ['Số điện thoại', row.contactPhone], ['Email', row.contactEmail], ['Địa chỉ thường trú', row.permanentAddress],
    ['Lý do lưu trú', row.reason], ['Thời gian lưu trú', stayRange(row.checkInDate, row.checkOutDate)], ['Địa chỉ lưu trú', row.stayAddress],
  ];
  return (
    <dl className="grid gap-x-6 gap-y-2 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([label, value]) => <div key={label}><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="whitespace-normal font-semibold text-[#10234a]">{value || 'Khách chưa nhập'}</dd></div>)}
      {row.notes ? <div className="sm:col-span-2 lg:col-span-3"><dt className="text-xs font-semibold text-slate-500">Ghi chú</dt><dd className="whitespace-normal text-slate-700">{row.notes}</dd></div> : null}
    </dl>
  );
}

function stayDate(iso: string) {
  const day = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : iso;
}

/** The guest declared in person at the desk: mark the booking declared without re-typing it (WEBSITE r6). */
function DeclaredInPersonButton({ bookingId, code, name }: { bookingId: string; code: string; name: string }) {
  const mark = useMutation(api.residence.markDeclaredInPerson);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [requestId] = useState(() => `in-person-${bookingId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  return (
    <>
      <button type="button" disabled={busy} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60"
        onClick={() => {
          if (!window.confirm(`Xác nhận khách ${name} (${code}) đã khai báo lưu trú trực tiếp tại quầy?`)) return;
          setBusy(true); setError('');
          mark({ bookingId: bookingId as Id<'bookings'>, requestId }).catch((e) => { setError(extractErrorMessage(e)); setBusy(false); });
        }}>
        <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />{busy ? 'Đang lưu…' : 'Đã khai báo'}
      </button>
      {error ? <span role="alert" className="block text-xs text-red-700">{error}</span> : null}
    </>
  );
}

function foldText(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().trim();
}

type PickerOption = { id: string; label: string; hint: string };

/** Type-to-filter booking picker: matches code, guest name, unit and dates. */
function BookingPicker({ options, value, onChange }: { options: PickerOption[]; value: string; onChange: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value);
  const needle = foldText(query);
  const matches = options.filter((o) => !needle || foldText(`${o.label} ${o.hint}`).includes(needle)).slice(0, 50);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  function choose(option: PickerOption) {
    onChange(option.id);
    setQuery('');
    setOpen(false);
  }
  return (
    <div ref={root} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls="booking-picker-list"
          aria-labelledby="booking-picker-label"
          aria-autocomplete="list"
          className="field-input pl-9 pr-9"
          placeholder={selected ? selected.label : 'Gõ mã booking, tên khách hoặc cơ sở…'}
          value={open ? query : selected?.label ?? ''}
          onFocus={() => { setOpen(true); setActive(0); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, matches.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
            else if (e.key === 'Enter' && open && matches[active]) { e.preventDefault(); choose(matches[active]); }
            else if (e.key === 'Escape') { setOpen(false); }
          }}
        />
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      </div>
      {open ? (
        <ul id="booking-picker-list" role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
          {matches.map((option, index) => (
            <li
              key={option.id}
              role="option"
              aria-selected={option.id === value}
              onMouseDown={(e) => { e.preventDefault(); choose(option); }}
              onMouseEnter={() => setActive(index)}
              className={`cursor-pointer px-3 py-2 text-sm ${index === active ? 'bg-[#e8f1fb]' : ''}`}
            >
              <span className="block font-semibold text-slate-900">{option.label}</span>
              <span className="block text-xs text-slate-500">{option.hint}</span>
            </li>
          ))}
          {!matches.length ? <li className="px-3 py-2 text-sm text-slate-500">Không có booking phù hợp.</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

function StatusBadge({ done, label }: { done: boolean; label: string }) {
  return (
    <span
      className={
        'inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ' +
        (done ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')
      }
    >
      {label}
    </span>
  );
}

/** Days from today until check-in decide how urgent a missing declaration is. */
const URGENT_DAYS = 3;
const FILTERS = { urgent: 'Cần khai báo ngay', pending: 'Chưa ghi nhận', done: 'Đã ghi nhận', all: 'Tất cả' } as const;
type Filter = keyof typeof FILTERS;

function urgencyLabel(start: string, end: string, today: string): { label: string; urgent: boolean } {
  if (start <= today && end > today) return { label: 'Đang lưu trú', urgent: true };
  if (end <= today) return { label: 'Đã trả phòng', urgent: false };
  const days = daysBetween(today, start);
  if (days === 0) return { label: 'Nhận phòng hôm nay', urgent: true };
  if (days === 1) return { label: 'Nhận phòng ngày mai', urgent: true };
  return { label: `Còn ${days} ngày`, urgent: days <= URGENT_DAYS };
}

function Contact({ phone, email }: { phone?: string; email?: string }) {
  if (!phone && !email) return <span className="text-slate-400">—</span>;
  return (
    <span className="flex flex-col text-xs leading-5">
      {phone ? <a className="inline-flex items-center gap-1 font-semibold text-[#10234a] hover:text-[#1565a8]" href={`tel:${phone.replace(/\s/g, '')}`}><Phone className="h-3.5 w-3.5" aria-hidden="true" />{phone}</a> : null}
      {email ? <a className="inline-flex items-center gap-1 text-slate-500 hover:text-[#1565a8]" href={`mailto:${email}`}><Mail className="h-3.5 w-3.5" aria-hidden="true" />{email}</a> : null}
    </span>
  );
}

const primaryAction = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[#0b2e4f] px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-[#1565a8]';
const secondaryAction = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-sky-200 bg-white px-3.5 py-1.5 text-xs font-bold text-[#1565a8] transition hover:bg-sky-50';

export function ResidenceDesk({
  propertyId,
  timezone = 'Asia/Ho_Chi_Minh',
}: {
  propertyId: Id<'properties'>;
  timezone?: string;
}) {
  const today = todayIso(timezone);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  // Unfiltered rows drive "who still needs a declaration"; the searched rows drive the table.
  const rows = useQuery(api.residence.listForProperty, { propertyId });
  const found = useQuery(api.residence.listForProperty, debounced ? { propertyId, search: debounced } : 'skip');
  const bookings = useQuery(api.residence.bookingOptions, { propertyId });
  const [initialBooking, setInitialBooking] = useState('');
  const verify = useMutation(api.residence.verifyRegistration);
  // Second tab: tạm trú registration for guests staying 30+ nights. Tab and filter live in the URL (convention #12).
  const [params, setParams] = useSearchParams();
  const longStay = params.get('tab') === 'tam-tru';
  const rawFilter = params.get('filter') ?? '';
  const filter: Filter = rawFilter in FILTERS ? rawFilter as Filter : 'urgent';
  const setParam = (key: string, value: string) => setParams((prev) => { const next = new URLSearchParams(prev); if (value) next.set(key, value); else next.delete(key); return next; }, { replace: true });
  const [form, setForm] = useState<RecordRow | 'new' | null>(null);
  const [statusRow, setStatusRow] = useState<RecordRow | null>(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!rows) return <Spinner label="Đang tải danh sách lưu trú…" />;
  const shown = (debounced ? found : rows) ?? [];
  const allDeclarations = rows.filter((row) => row.registrationType === 'tam_tru');
  const declarations = shown.filter((row) => row.registrationType === 'tam_tru');
  const longStayRows = declarations.filter((row) => row.longStay);
  const needle = foldText(debounced);
  // Bookings still missing a declaration, nearest check-in first.
  const pendingBookings = (bookings ?? [])
    .filter((b) => b.status !== 'external' && !b.declaredInPersonAt && b.adults > allDeclarations.filter((r) => r.bookingId === b.id).length)
    .filter((b) => !needle || foldText(`${b.code} ${b.name} ${b.unit ?? ''}`).includes(needle))
    .map((b) => ({ ...b, due: urgencyLabel(b.start, b.end, today) }))
    .sort((a, b) => Number(b.due.urgent) - Number(a.due.urgent) || a.start.localeCompare(b.start));
  const urgentCount = pendingBookings.filter((b) => b.due.urgent).length + declarations.filter((r) => r.status === 'declared' && urgencyLabel(r.bookingCheckIn ?? r.checkInDate.slice(0, 10), r.checkOutDate.slice(0, 10), today).urgent).length;
  const recordRows = declarations
    .filter((row) => {
      const done = row.status !== 'declared';
      if (filter === 'done') return done;
      if (filter === 'pending') return !done;
      if (filter === 'urgent') return !done && urgencyLabel(row.bookingCheckIn ?? row.checkInDate.slice(0, 10), row.checkOutDate.slice(0, 10), today).urgent;
      return true;
    });
  const bookingRows = filter === 'done' ? [] : filter === 'urgent' ? pendingBookings.filter((b) => b.due.urgent) : pendingBookings;
  const inPersonRows = filter === 'done' || filter === 'all'
    ? (bookings ?? []).filter((b) => b.declaredInPersonAt && (!needle || foldText(`${b.code} ${b.name} ${b.unit ?? ''}`).includes(needle))).sort((a, b) => (b.declaredInPersonAt ?? 0) - (a.declaredInPersonAt ?? 0))
    : [];
  const canReveal = rows.some((row) => row.canReveal) || (bookings ?? []).some((b) => b.phone || b.email);
  const empty = longStay ? !longStayRows.length : !recordRows.length && !bookingRows.length && !inPersonRows.length;
  function startForm(id = '') {
    setInitialBooking(id);
    setForm('new');
  }
  async function record(row: RecordRow) {
    try {
      await verify({ registrationId: row._id, status: 'verified' });
      setError('');
    } catch (e) {
      setError(extractErrorMessage(e));
    }
  }
  const chip = (active: boolean) => `whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition ${active ? 'bg-white text-[#0b2e4f] shadow-sm' : 'text-slate-500 hover:text-[#0b2e4f]'}`;
  return (
    <section className="card space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2" role="tablist">
          {['Khai báo lưu trú', 'Tạm trú (trên 30 ngày)'].map((label, i) => (
            <button
              type="button"
              role="tab"
              aria-selected={longStay === Boolean(i)}
              className={longStay === Boolean(i) ? 'btn-primary' : 'btn-secondary'}
              key={label}
              onClick={() => {
                setParam('tab', i ? 'tam-tru' : '');
                setError('');
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">Tìm booking, tên khách hoặc số giấy tờ</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input type="search" className="field-input w-72 pl-9" placeholder="Tìm booking, tên khách, số CCCD…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          {!longStay && (
            <button type="button" className="btn-primary whitespace-nowrap" onClick={() => startForm()}>
              <Plus className="h-4 w-4" aria-hidden="true" />Khai báo mới
            </button>
          )}
        </div>
      </div>
      {!longStay ? (
        <div role="group" aria-label="Lọc khai báo" className="flex w-fit flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          {(Object.keys(FILTERS) as Filter[]).map((key) => (
            <button key={key} type="button" aria-pressed={filter === key} className={chip(filter === key)} onClick={() => setParam('filter', key === 'urgent' ? '' : key)}>
              {FILTERS[key]}{key === 'urgent' && urgentCount ? <span className="ml-1.5 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] text-white">{urgentCount}</span> : null}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">Tạm trú áp dụng cho khách đặt phòng ở trên 30 ngày.</p>
      )}
      {!canReveal && !longStay ? <p className="rounded-xl bg-sky-50 px-4 py-2.5 text-sm text-[#10234a]">Số giấy tờ và liên hệ đang được che. <Link className="font-bold text-[#1565a8] underline" to="/admin/login">Đăng nhập tài khoản nhân viên</Link> để xem đầy đủ thông tin khai báo.</p> : null}
      {debounced && found === undefined ? <p className="text-sm text-slate-500">Đang tìm…</p> : null}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              {(longStay ? LONG_STAY_HEADERS : STAY_HEADERS).map((h) => (
                <th key={h} className="p-2.5">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {longStay
              ? longStayRows.map((row) => (
                  <tr key={row._id} className="border-t [&>td]:p-2.5">
                    <td>{row.recordCode}</td>
                    <td className="font-semibold text-[#10234a]">{row.fullName}</td>
                    <td><Contact phone={row.contactPhone} email={row.contactEmail} /></td>
                    <td>{row.confirmationCode}</td>
                    <td className="min-w-44 !whitespace-normal">{row.unitName}</td>
                    <td>{stayRange(row.checkInDate, row.checkOutDate)}</td>
                    <td>
                      <StatusBadge
                        done={row.temporaryResidenceDeclared}
                        label={row.temporaryResidenceDeclared ? 'Đã khai báo' : 'Chưa khai báo'}
                      />
                    </td>
                    <td>
                      {row.canReveal && (
                        <span className="inline-flex gap-1.5">
                          {!row.temporaryResidenceDeclared ? <MarkDeclaredButton registrationId={row._id} /> : null}
                          <button type="button" className={secondaryAction} onClick={() => setStatusRow(row)}>
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />Cập nhật
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              : <>
                {bookingRows.map((b) => (
                  <tr className={`border-t [&>td]:p-2.5 ${b.due.urgent ? 'bg-rose-50/40' : ''}`} key={b.id}>
                    <td className="text-slate-400">—</td>
                    <td className="font-semibold">{b.code}</td>
                    <td className="font-semibold text-[#10234a]">{b.name}</td>
                    <td><Contact phone={b.phone} email={b.email} /></td>
                    <td className="text-slate-400">—</td>
                    <td className="min-w-44 !whitespace-normal">{b.unit}</td>
                    <td>{stayRange(b.start, b.end)}<span className={`mt-1 block w-fit rounded-full px-2 py-0.5 text-[11px] font-bold ${b.due.urgent ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{b.due.label}</span></td>
                    <td><StatusBadge done={false} label="Chưa khai báo" /></td>
                    <td>
                      <div className="flex gap-1.5">
                        <button type="button" className={primaryAction} onClick={() => startForm(b.id)}>
                          <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />Nhập thông tin
                        </button>
                        <DeclaredInPersonButton bookingId={b.id} code={b.code} name={b.name} />
                      </div>
                    </td>
                  </tr>
                ))}
                {inPersonRows.map((b) => (
                  <tr className="border-t [&>td]:p-2.5" key={`in-person:${b.id}`}>
                    <td className="text-slate-400">—</td>
                    <td className="font-semibold">{b.code}</td>
                    <td className="font-semibold text-[#10234a]">{b.name}<span className="block text-xs font-normal text-slate-500">{b.adults} người lớn</span></td>
                    <td><Contact phone={b.phone} email={b.email} /></td>
                    <td className="text-xs text-slate-600">Khai báo tại quầy</td>
                    <td className="min-w-44 !whitespace-normal">{b.unit}</td>
                    <td>{stayRange(b.start, b.end)}</td>
                    <td><StatusBadge done label="Đã ghi nhận" /></td>
                    <td className="text-xs text-slate-500">{b.declaredInPersonBy}{b.declaredInPersonAt ? <span className="block">{new Date(b.declaredInPersonAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span> : null}</td>
                  </tr>
                ))}
                {recordRows.map((row) => {
                  const done = row.status !== 'declared';
                  const open = expanded === row._id;
                  return [
                    <tr key={row._id} className="border-t [&>td]:p-2.5">
                      <td>{row.recordCode}</td>
                      <td className="font-semibold">{row.confirmationCode}</td>
                      <td className="font-semibold text-[#10234a]">{row.fullName}<span className="block text-xs font-normal text-slate-500">{row.nationality}</span></td>
                      <td><Contact phone={row.contactPhone} email={row.contactEmail} /></td>
                      <td><DocumentCell row={row} /></td>
                      <td className="min-w-44 !whitespace-normal">{row.unitName}</td>
                      <td>{stayRange(row.checkInDate, row.checkOutDate)}</td>
                      <td><StatusBadge done={done} label={done ? 'Đã ghi nhận' : 'Chưa ghi nhận'} /></td>
                      <td>
                        <div className="flex gap-1.5">
                          {!done && (
                            <button type="button" className={primaryAction} onClick={() => void record(row)}>
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Ghi nhận
                            </button>
                          )}
                          {row.canReveal && (
                            <button type="button" className={secondaryAction} aria-expanded={open} onClick={() => setExpanded(open ? null : row._id)}>
                              <ChevronDown className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />{open ? 'Thu gọn' : 'Chi tiết'}
                            </button>
                          )}
                          {row.canReveal && (
                            <button type="button" className={secondaryAction} onClick={() => setForm(row)}>
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />Sửa
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>,
                    open ? <tr key={`${row._id}:details`} className="[&>td]:px-2.5 [&>td]:pb-3"><td colSpan={9} className="!whitespace-normal"><RecordDetails row={row} /></td></tr> : null,
                  ];
                })}
              </>}
          </tbody>
        </table>
      </div>
      {empty && (
        <p className="p-4 text-center text-slate-500">
          {longStay
            ? 'Chưa có khách lưu trú trên 30 ngày. Khách cần có bản ghi khai báo lưu trú trước.'
            : debounced ? `Không tìm thấy kết quả cho “${debounced}”.` : filter === 'urgent' ? 'Không có booking nào cần khai báo gấp.' : 'Chưa có bản ghi.'}
        </p>
      )}
      {form && (
        <RegistrationForm
          initialBooking={initialBooking}
          propertyId={propertyId}
          rows={rows}
          editing={form === 'new' ? null : form}
          close={() => setForm(null)}
        />
      )}
      {statusRow && (
        <TemporaryResidenceForm row={statusRow} close={() => setStatusRow(null)} />
      )}
    </section>
  );
}

/** The declaration form for one booking, opened straight from the front-desk shift. */
export function ResidenceRegistrationDialog({ propertyId, bookingId, close }: { propertyId: Id<'properties'>; bookingId: Id<'bookings'>; close: () => void }) {
  const rows = useQuery(api.residence.listForProperty, { propertyId });
  if (!rows) return null;
  return <RegistrationForm initialBooking={bookingId} lockBooking propertyId={propertyId} rows={rows} editing={null} close={close} />;
}

/** Tạm trú status for a long-stay guest: filed with the authorities or not yet. */
function TemporaryResidenceForm({
  row,
  close,
}: {
  row: RecordRow;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const save = useMutation(api.residence.setTemporaryResidenceDeclared);
  const [declared, setDeclared] = useState(row.temporaryResidenceDeclared);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await save({ registrationId: row._id, declared });
      close();
    } catch (err) {
      setError(extractErrorMessage(err));
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="temporary-residence-heading"
      onCancel={close}
      className="w-[min(94vw,32rem)] rounded-2xl p-5 shadow-xl backdrop:bg-black/40"
    >
      <form onSubmit={submit} className="grid gap-3">
        <h2 id="temporary-residence-heading" className="text-xl font-bold">
          Chỉnh sửa tạm trú
        </h2>
        <p className="rounded bg-blue-50 p-3 text-sm">
          Mã bản ghi · {row.recordCode}
          <br />
          Khách lưu trú: {row.fullName} · Booking {row.confirmationCode}
          <br />
          Cơ sở: {row.unitName}
          <br />
          Thời gian lưu trú: {stayRange(row.checkInDate, row.checkOutDate)}
        </p>
        <label>
          Trạng thái
          <select
            className="field-input"
            value={declared ? 'declared' : 'pending'}
            onChange={(e) => setDeclared(e.target.value === 'declared')}
          >
            <option value="pending">Chưa khai báo</option>
            <option value="declared">Đã khai báo</option>
          </select>
        </label>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={close}>
            Đóng
          </button>
          <button className="btn-primary" disabled={busy}>
            {busy ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function RegistrationForm({
  initialBooking,
  lockBooking = false,
  propertyId,
  rows,
  editing,
  close,
}: {
  initialBooking: string;
  lockBooking?: boolean;
  propertyId: Id<'properties'>;
  rows: RecordRow[];
  editing: RecordRow | null;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const options = useQuery(api.residence.bookingOptions, { propertyId });
  const register = useMutation(api.residence.staffRegister);
  const updateRegistration = useMutation(api.residence.staffUpdateRegistration);
  const [selection, setSelection] = useState<string>(
    editing ? editing.bookingId : initialBooking,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const booking = options?.find((b) => b.id === selection);
  const residents = rows.filter((row) => row.registrationType === 'tam_tru');
  // The booker's name is only a sensible default for the first adult declared on a booking.
  const defaultName = editing
    ? editing.fullName
    : booking && !residents.some((r) => r.bookingId === booking.id)
      ? booking.name
      : '';
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const data = new FormData(e.currentTarget);
    const field = (name: string) => String(data.get(name) ?? '').trim();
    const person = {
      fullName: field('fullName'),
      nationality: field('nationality'),
      documentType: field('documentType') as 'cccd' | 'passport',
      documentNumber: field('number'),
      dateOfBirth: field('birth'),
      gender: field('gender'),
      permanentAddress: field('address'),
      notes: field('notes'),
    };
    setBusy(true);
    try {
      if (editing)
        await updateRegistration({ registrationId: editing._id, ...person });
      else if (booking) await register({ bookingId: booking.id, ...person });
      close();
    } catch (err) {
      setError(extractErrorMessage(err));
      setBusy(false);
    }
  }
  const input = (
    label: string,
    name: string,
    type = 'text',
    initial = '',
    required = true,
  ) => (
    <label>
      {label}
      <input
        name={name}
        type={type}
        className="field-input"
        required={required}
        defaultValue={initial}
      />
    </label>
  );
  return (
    <dialog
      ref={dialog}
      aria-labelledby="registration-heading"
      onCancel={close}
      className="w-[min(94vw,40rem)] rounded-2xl p-5 shadow-xl backdrop:bg-black/40"
    >
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <h2
          id="registration-heading"
          className="text-xl font-bold sm:col-span-2"
        >
          {editing ? 'Chỉnh sửa khai báo lưu trú' : 'Khai báo lưu trú mới'}
        </h2>
        <p className="text-sm sm:col-span-2">
          Mã bản ghi · {editing?.recordCode ?? 'Tự động tạo khi lưu'}
        </p>
        <div className="sm:col-span-2">
          <span id="booking-picker-label">Mã Booking</span>
          {editing ? (
            <input className="field-input" disabled value={`${editing.confirmationCode} · ${editing.fullName}`} aria-labelledby="booking-picker-label" />
          ) : lockBooking ? (
            <input className="field-input" disabled value={booking ? `${booking.code} · ${booking.name}` : 'Đang tải booking…'} aria-labelledby="booking-picker-label" />
          ) : (
            <BookingPicker
              options={(options ?? []).map((b) => ({ id: b.id, label: `${b.code} · ${b.name}`, hint: `${b.unit ?? ''} · ${stayRange(b.start, b.end)}` }))}
              value={selection}
              onChange={setSelection}
            />
          )}
        </div>
        {booking && !editing ? (
          <p className="rounded bg-blue-50 p-3 sm:col-span-2">
            Người đặt: {booking.name} · Cơ sở: {booking.unit}
            <br />
            Thời gian lưu trú: {stayRange(booking.start, booking.end)}{booking.phone || booking.email ? <><br />Liên hệ: {[booking.phone, booking.email].filter(Boolean).join(' · ')}</> : null}
          </p>
        ) : editing ? (
          <p className="rounded bg-blue-50 p-3 sm:col-span-2">
            Cơ sở: {editing.unitName}
            <br />
            Thời gian lưu trú: {stayRange(editing.checkInDate, editing.checkOutDate)}
          </p>
        ) : null}
        <label className="sm:col-span-2" key={'name-' + selection}>
          Họ tên khách
          <input
            name="fullName"
            className="field-input"
            required
            minLength={2}
            maxLength={100}
            defaultValue={defaultName}
          />
        </label>
        {input('Quốc tịch', 'nationality', 'text', editing?.nationality ?? 'Việt Nam')}
        <label>
          Loại giấy tờ
          <select
            className="field-input"
            name="documentType"
            defaultValue={editing?.documentType === 'passport' ? 'passport' : 'cccd'}
          >
            <option value="cccd">CCCD</option>
            <option value="passport">Hộ chiếu</option>
          </select>
        </label>
        <label>
          Số giấy tờ
          <input
            name="number"
            className="field-input"
            required={!editing}
            placeholder={editing ? `${editing.documentNumber} — để trống nếu giữ nguyên` : undefined}
          />
        </label>
        {input('Ngày sinh', 'birth', 'date', editing?.dateOfBirth ?? '')}
        <label>
          Giới tính
          <select
            required
            className="field-input"
            name="gender"
            defaultValue={editing?.gender ?? ''}
          >
            <option value="">Chọn giới tính</option>
            <option>Nam</option>
            <option>Nữ</option>
            <option>Khác</option>
          </select>
        </label>
        {input('Địa chỉ thường trú', 'address', 'text', editing?.permanentAddress ?? '')}
        {input('Ghi chú', 'notes', 'text', editing?.notes, false)}
        {error && (
          <p role="alert" className="text-red-700 sm:col-span-2">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn-secondary" onClick={close}>
            Đóng
          </button>
          <button className="btn-primary" disabled={busy || !selection}>
            {busy ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** One click once the tạm trú has been filed with the authorities (WEBSITE.pdf r5). */
function MarkDeclaredButton({ registrationId }: { registrationId: Id<'residenceRegistrations'> }) {
  const save = useMutation(api.residence.setTemporaryResidenceDeclared);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <button type="button" disabled={busy} title={error || undefined} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[#0b2e4f] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#1565a8] disabled:opacity-60"
        onClick={() => { setBusy(true); setError(''); save({ registrationId, declared: true }).catch((e) => { setError(extractErrorMessage(e)); setBusy(false); }); }}>
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />{busy ? 'Đang lưu…' : 'Đã khai báo'}
      </button>
      {error ? <span role="alert" className="text-xs text-red-700">{error}</span> : null}
    </>
  );
}
