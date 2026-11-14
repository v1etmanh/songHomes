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
const AWAY_HEADERS = ['Mã bản ghi', 'Khách lưu trú', 'Booking', 'Cơ sở lưu trú', 'Bắt đầu vắng mặt', 'Dự kiến quay lại', 'Lý do', 'Trạng thái', 'Ghi chú', 'Thao tác'];

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
  const returned = useMutation(api.residence.updateAbsenceStatus);
  const [away, setAway] = useState(false);
  const [form, setForm] = useState<RecordRow | 'new' | null>(null);
  const [error, setError] = useState('');
  if (!rows) return <Spinner label="Đang tải danh sách lưu trú…" />;
  const visible = rows.filter(
    (row) => row.registrationType === (away ? 'tam_vang' : 'tam_tru'),
  );
  const pendingBookings = away
    ? []
    : (bookings?.filter(
        (b) =>
          b.adults >
          rows.filter(
            (r) => r.bookingId === b.id && r.registrationType === 'tam_tru',
          ).length,
      ) ?? []);
  function startForm(id = '') {
    setInitialBooking(id);
    setForm('new');
  }
  async function change(row: RecordRow) {
    try {
      if (away)
        await returned({ registrationId: row._id, absenceStatus: 'returned' });
      else await verify({ registrationId: row._id, status: 'verified' });
      setError('');
    } catch (e) {
      setError(extractErrorMessage(e));
    }
  }
  return (
    <section className="card space-y-4 p-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div className="flex gap-2" role="tablist">
          {['Đăng ký Tạm trú', 'Quản lý Tạm vắng'].map((label, i) => (
            <button
              type="button"
              role="tab"
              aria-selected={away === Boolean(i)}
              className={away === Boolean(i) ? 'btn-primary' : 'btn-secondary'}
              key={label}
              onClick={() => {
                setAway(Boolean(i));
                setError('');
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="btn-primary" onClick={() => startForm()}>
          {away ? '+ Thêm bản ghi tạm vắng' : '+ Nhập thông tin tạm trú'}
        </button>
      </div>
      <h2 className="font-bold">
        {away ? 'Danh sách bản ghi tạm vắng' : 'Danh sách khách lưu trú'}
      </h2>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[65rem] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              {(away ? AWAY_HEADERS : STAY_HEADERS).map((h) => (
                <th key={h} className="p-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const done = away
                ? row.absenceStatus === 'returned'
                : row.status !== 'declared';
              const edit = (away || row.canReveal) && (
                <button
                  type="button"
                  className="mr-3 text-blue-700"
                  onClick={() => setForm(row)}
                >
                  Chỉnh sửa
                </button>
              );
              const action = !done && (
                <button
                  type="button"
                  className="font-bold text-blue-700"
                  onClick={() => void change(row)}
                >
                  {away ? 'Đã quay lại' : 'Ghi nhận'}
                </button>
              );
              return away ? (
                <tr key={row._id} className="border-t [&>td]:p-2">
                  <td className="whitespace-nowrap">{row.recordCode}</td>
                  <td>{row.fullName}</td>
                  <td>{row.confirmationCode}</td>
                  <td>{row.unitName}</td>
                  <td>{row.checkInDate.replace('T', ' ')}</td>
                  <td>{row.checkOutDate.replace('T', ' ')}</td>
                  <td>{row.reason}</td>
                  <td>
                    <StatusBadge done={done} label={done ? 'Đã quay lại' : 'Đang vắng mặt'} />
                  </td>
                  <td>{row.notes}</td>
                  <td className="whitespace-nowrap">
                    {edit}
                    {action}
                  </td>
                </tr>
              ) : (
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
                    {edit}
                    {action}
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
      {!visible.length && !pendingBookings.length && (
        <p className="p-4 text-center text-slate-500">Chưa có bản ghi.</p>
      )}
      {form && (
        <RegistrationForm
          initialBooking={initialBooking}
          propertyId={propertyId}
          rows={rows}
          away={away}
          editing={form === 'new' ? null : form}
          close={() => setForm(null)}
        />
      )}
    </section>
  );
}

function RegistrationForm({
  initialBooking,
  propertyId,
  rows,
  away,
  editing,
  close,
}: {
  initialBooking: string;
  propertyId: Id<'properties'>;
  rows: RecordRow[];
  away: boolean;
  editing: RecordRow | null;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const options = useQuery(
    api.residence.bookingOptions,
    away ? 'skip' : { propertyId },
  );
  const register = useMutation(api.residence.staffRegister);
  const updateRegistration = useMutation(api.residence.staffUpdateRegistration);
  const absence = useMutation(api.residence.saveAbsence);
  const [selection, setSelection] = useState<string>(
    editing
      ? away
        ? (editing.residentId ?? editing._id)
        : editing.bookingId
      : initialBooking,
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
  const timestamp = (s?: string) => (s?.length === 10 ? s + 'T00:00' : s);
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
      if (away)
        await absence({
          residentId: selection as Id<'residenceRegistrations'>,
          id: editing?._id,
          start: field('start'),
          end: field('end'),
          reason: field('reason'),
          notes: field('notes'),
        });
      else if (editing)
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
          {away
            ? 'Thông tin tạm vắng'
            : editing
              ? 'Chỉnh sửa thông tin tạm trú'
              : 'Nhập thông tin tạm trú'}
        </h2>
        <p className="text-sm sm:col-span-2">
          Mã bản ghi · {editing?.recordCode ?? 'Tự động tạo khi lưu'}
        </p>
        <label className="sm:col-span-2">
          {away ? 'Khách đã đăng ký tạm trú' : 'Mã Booking'}
          <select
            className="field-input"
            required
            disabled={Boolean(editing)}
            value={selection}
            onChange={(e) => setSelection(e.target.value)}
          >
            <option value="">Chọn {away ? 'khách' : 'booking'}</option>
            {editing ? (
              <option value={selection}>
                {editing.confirmationCode} · {editing.fullName}
              </option>
            ) : away ? (
              residents.map((r) => (
                <option value={r._id} key={r._id}>
                  {r.fullName} · {r.confirmationCode} · {r.unitName}
                </option>
              ))
            ) : (
              options?.map((b) => (
                <option value={b.id} key={b.id}>
                  {b.code} · {b.name}
                </option>
              ))
            )}
          </select>
        </label>
        {away ? (
          <>
            {input(
              'Bắt đầu vắng mặt',
              'start',
              'datetime-local',
              timestamp(editing?.checkInDate),
            )}
            {input(
              'Dự kiến quay lại',
              'end',
              'datetime-local',
              timestamp(editing?.checkOutDate),
            )}
            {input('Lý do', 'reason', 'text', editing?.reason, false)}
          </>
        ) : (
          <>
            {booking ? (
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
          </>
        )}
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
