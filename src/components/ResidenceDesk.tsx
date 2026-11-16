import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { ChevronDown, Eye, EyeOff, Search } from 'lucide-react';
import type { FunctionReturnType } from 'convex/server';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { extractErrorMessage } from './ErrorMessage';
import { Spinner } from './Spinner';

type RecordRow = FunctionReturnType<
  typeof api.residence.listForProperty
>[number];

const STAY_HEADERS = ['Mã bản ghi', 'Mã Booking', 'Khách hàng', 'Quốc tịch', 'Giấy tờ', 'Cơ sở lưu trú', 'Thời gian lưu trú', 'Trạng thái', 'Thao tác'];
const LONG_STAY_HEADERS = ['Mã bản ghi', 'Khách lưu trú', 'Booking', 'Cơ sở lưu trú', 'Thời gian lưu trú', 'Trạng thái', 'Thao tác'];

function DocumentCell({ row }: { row: RecordRow }) {
  const [open, setOpen] = useState(false);
  const full = useQuery(
    api.residence.fullDocument,
    open && row.canReveal ? { id: row._id } : 'skip',
  );
  return (
    <span className="whitespace-nowrap">
      {row.documentType === 'passport' ? 'Hộ chiếu' : row.documentType.toUpperCase()} ·{' '}
      {open && row.canReveal && full ? full : row.documentNumber}
      {row.canReveal && (
        <button
          type="button"
          className="ml-2 align-middle text-slate-500 hover:text-slate-800"
          aria-label={open ? 'Ẩn số giấy tờ' : 'Hiện số giấy tờ'}
          onClick={() => setOpen(!open)}
        >
          {open ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      )}
    </span>
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
        'whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ' +
        (done ? 'bg-emerald-100 text-emerald-800' : 'bg-orange-100 text-orange-800')
      }
    >
      {label}
    </span>
  );
}

export function ResidenceDesk({
  propertyId,
}: {
  propertyId: Id<'properties'>;
}) {
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
  // Second tab: tạm trú registration for guests on long-stay bookings.
  const [longStay, setLongStay] = useState(false);
  const [form, setForm] = useState<RecordRow | 'new' | null>(null);
  const [statusRow, setStatusRow] = useState<RecordRow | null>(null);
  const [error, setError] = useState('');
  if (!rows) return <Spinner label="Đang tải danh sách lưu trú…" />;
  const shown = (debounced ? found : rows) ?? [];
  const allDeclarations = rows.filter((row) => row.registrationType === 'tam_tru');
  const declarations = shown.filter((row) => row.registrationType === 'tam_tru');
  const longStayRows = declarations.filter((row) => row.longStay);
  const needle = foldText(debounced);
  const pendingBookings = longStay
    ? []
    : (bookings?.filter(
        (b) =>
          b.adults > allDeclarations.filter((r) => r.bookingId === b.id).length &&
          (!needle || foldText(`${b.code} ${b.name} ${b.unit ?? ''}`).includes(needle)),
      ) ?? []);
  const empty = longStay
    ? !longStayRows.length
    : !declarations.length && !pendingBookings.length;
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
  return (
    <section className="card space-y-4 p-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div className="flex gap-2" role="tablist">
          {['Khai báo lưu trú', 'Tạm trú'].map((label, i) => (
            <button
              type="button"
              role="tab"
              aria-selected={longStay === Boolean(i)}
              className={longStay === Boolean(i) ? 'btn-primary' : 'btn-secondary'}
              key={label}
              onClick={() => {
                setLongStay(Boolean(i));
                setError('');
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {!longStay && (
          <button type="button" className="btn-primary" onClick={() => startForm()}>
            + Mới
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold">
          {longStay ? 'Danh sách tạm trú (booking dài hạn)' : 'Danh sách khách lưu trú'}
        </h2>
        <label className="relative w-full max-w-sm">
          <span className="sr-only">Tìm booking, tên khách hoặc số giấy tờ</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input type="search" className="field-input pl-9" placeholder="Tìm booking, tên khách, số CCCD…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>
      {debounced && found === undefined ? <p className="text-sm text-slate-500">Đang tìm…</p> : null}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="overflow-x-auto">
        <table
          className={
            'w-full text-left text-sm ' + (longStay ? 'min-w-[48rem]' : 'min-w-[65rem]')
          }
        >
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              {(longStay ? LONG_STAY_HEADERS : STAY_HEADERS).map((h) => (
                <th key={h} className="p-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {longStay
              ? longStayRows.map((row) => (
                  <tr key={row._id} className="border-t [&>td]:p-2">
                    <td className="whitespace-nowrap">{row.recordCode}</td>
                    <td>{row.fullName}</td>
                    <td>{row.confirmationCode}</td>
                    <td>{row.unitName}</td>
                    <td className="whitespace-nowrap">
                      {row.checkInDate} → {row.checkOutDate}
                    </td>
                    <td>
                      <StatusBadge
                        done={row.temporaryResidenceDeclared}
                        label={row.temporaryResidenceDeclared ? 'Đã khai báo' : 'Chưa khai báo'}
                      />
                    </td>
                    <td>
                      {row.canReveal && (
                        <button
                          type="button"
                          className="text-blue-700"
                          onClick={() => setStatusRow(row)}
                        >
                          Chỉnh sửa
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              : declarations.map((row) => {
                  const done = row.status !== 'declared';
                  return (
                    <tr key={row._id} className="border-t [&>td]:p-2">
                      <td className="whitespace-nowrap">{row.recordCode}</td>
                      <td>{row.confirmationCode}</td>
                      <td>{row.fullName}</td>
                      <td>{row.nationality}</td>
                      <td>
                        <DocumentCell row={row} />
                      </td>
                      <td>{row.unitName}</td>
                      <td className="whitespace-nowrap">
                        {row.checkInDate} → {row.checkOutDate}
                      </td>
                      <td>
                        <StatusBadge done={done} label={done ? 'Đã ghi nhận' : 'Chưa ghi nhận'} />
                      </td>
                      <td className="whitespace-nowrap">
                        {row.canReveal && (
                          <button
                            type="button"
                            className="mr-3 text-blue-700"
                            onClick={() => setForm(row)}
                          >
                            Chỉnh sửa
                          </button>
                        )}
                        {!done && (
                          <button
                            type="button"
                            className="font-bold text-blue-700"
                            onClick={() => void record(row)}
                          >
                            Ghi nhận
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
            {pendingBookings.map((b) => (
              <tr className="border-t [&>td]:p-2" key={b.id}>
                <td>—</td>
                <td>{b.code}</td>
                <td>{b.name}</td>
                <td>—</td>
                <td>—</td>
                <td>{b.unit}</td>
                <td className="whitespace-nowrap">
                  {b.start} → {b.end}
                </td>
                <td>
                  <StatusBadge done={false} label="Chưa ghi nhận" />
                </td>
                <td>
                  <button
                    type="button"
                    className="text-blue-700"
                    onClick={() => startForm(b.id)}
                  >
                    Nhập thông tin
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {empty && (
        <p className="p-4 text-center text-slate-500">
          {longStay
            ? 'Chưa có khách lưu trú dài hạn. Khách cần có bản ghi khai báo lưu trú trước.'
            : debounced ? `Không tìm thấy kết quả cho “${debounced}”.` : 'Chưa có bản ghi.'}
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
          Thời gian lưu trú: {row.checkInDate} → {row.checkOutDate}
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
  propertyId,
  rows,
  editing,
  close,
}: {
  initialBooking: string;
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
          ) : (
            <BookingPicker
              options={(options ?? []).map((b) => ({ id: b.id, label: `${b.code} · ${b.name}`, hint: `${b.unit ?? ''} · ${b.start} → ${b.end}` }))}
              value={selection}
              onChange={setSelection}
            />
          )}
        </div>
        {booking && !editing ? (
          <p className="rounded bg-blue-50 p-3 sm:col-span-2">
            Người đặt: {booking.name} · Cơ sở: {booking.unit}
            <br />
            Thời gian lưu trú: {booking.start} → {booking.end}
          </p>
        ) : editing ? (
          <p className="rounded bg-blue-50 p-3 sm:col-span-2">
            Cơ sở: {editing.unitName}
            <br />
            Thời gian lưu trú: {editing.checkInDate} → {editing.checkOutDate}
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
