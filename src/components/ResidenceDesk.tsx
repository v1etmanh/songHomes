import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { Eye, EyeOff } from 'lucide-react';
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
  const rows = useQuery(api.residence.listForProperty, { propertyId });
  const bookings = useQuery(api.residence.bookingOptions, { propertyId });
  const [initialBooking, setInitialBooking] = useState('');
  const verify = useMutation(api.residence.verifyRegistration);
  // Second tab: tạm trú registration for guests on long-stay bookings.
  const [longStay, setLongStay] = useState(false);
  const [form, setForm] = useState<RecordRow | 'new' | null>(null);
  const [statusRow, setStatusRow] = useState<RecordRow | null>(null);
  const [error, setError] = useState('');
  if (!rows) return <Spinner label="Đang tải danh sách lưu trú…" />;
  const declarations = rows.filter((row) => row.registrationType === 'tam_tru');
  const longStayRows = declarations.filter((row) => row.longStay);
  const pendingBookings = longStay
    ? []
    : (bookings?.filter(
        (b) => b.adults > declarations.filter((r) => r.bookingId === b.id).length,
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
      <h2 className="font-bold">
        {longStay ? 'Danh sách tạm trú (booking dài hạn)' : 'Danh sách khách lưu trú'}
      </h2>
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
            : 'Chưa có bản ghi.'}
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
        <label className="sm:col-span-2">
          Mã Booking
          <select
            className="field-input"
            required
            disabled={Boolean(editing)}
            value={selection}
            onChange={(e) => setSelection(e.target.value)}
          >
            <option value="">Chọn booking</option>
            {editing ? (
              <option value={selection}>
                {editing.confirmationCode} · {editing.fullName}
              </option>
            ) : (
              options?.map((b) => (
                <option value={b.id} key={b.id}>
                  {b.code} · {b.name}
                </option>
              ))
            )}
          </select>
        </label>
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
