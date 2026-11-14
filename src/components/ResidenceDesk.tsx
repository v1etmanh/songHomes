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

function DocumentCell({ row }: { row: RecordRow }) {
  const [open, setOpen] = useState(false);
  const full = useQuery(
    api.residence.fullDocument,
    open && row.canReveal ? { id: row._id } : 'skip',
  );
  return (
    <>
      {row.documentType.toUpperCase()} ·{' '}
      {open && row.canReveal && full ? full : row.documentNumber}
      {row.canReveal && (
        <button
          className="ml-2 align-middle"
          aria-label={open ? 'Ẩn số giấy tờ' : 'Hiện số giấy tờ'}
          onClick={() => setOpen(!open)}
        >
          {open ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      )}
    </>
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
      else
        await verify({
          registrationId: row._id,
          status: row.status === 'verified' ? 'completed' : 'verified',
        });
      setError('');
    } catch (e) {
      setError(extractErrorMessage(e));
    }
  }
  return (
    <section className="card space-y-4 p-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div className="flex gap-2">
          {['Đăng ký Tạm trú', 'Quản lý Tạm vắng'].map((label, i) => (
            <button
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
        <button className="btn-primary" onClick={() => startForm()}>
          {away ? '+ Thêm bản ghi tạm vắng' : '+ Nhập thông tin tạm trú'}
        </button>
      </div>
      <h2 className="font-bold">
        {away ? 'Danh sách bản ghi tạm vắng' : 'Danh sách khách lưu trú'}
      </h2>
      {error && <p role="alert">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[65rem] text-left text-sm">
          <thead>
            <tr>
              {[
                'Mã bản ghi',
                'Booking',
                'Khách',
                ...(away ? [] : ['Quốc tịch', 'Giấy tờ']),
                'Cơ sở',
                ...(away
                  ? ['Bắt đầu vắng', 'Dự kiến quay lại', 'Lý do', 'Ghi chú']
                  : ['Thời gian lưu trú']),
                'Trạng thái',
                'Thao tác',
              ].map((h) => (
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
              return (
                <tr key={row._id} className="border-t [&>td]:p-2">
                  <td className="max-w-36 break-all">{row.recordCode}</td>
                  <td>{row.confirmationCode}</td>
                  <td>{row.fullName}</td>
                  {!away && (
                    <>
                      <td>{row.nationality}</td>
                      <td>
                        <DocumentCell row={row} />
                      </td>
                    </>
                  )}
                  <td>{row.unitName}</td>
                  {away ? (
                    <>
                      <td>{row.checkInDate.replace('T', ' ')}</td>
                      <td>{row.checkOutDate.replace('T', ' ')}</td>
                      <td>{row.reason}</td>
                      <td>{row.notes}</td>
                    </>
                  ) : (
                    <td>
                      {row.checkInDate} → {row.checkOutDate}
                    </td>
                  )}
                  <td>
                    <span
                      className={
                        'rounded px-2 py-1 ' +
                        (done
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-orange-100 text-orange-800')
                      }
                    >
                      {away
                        ? done
                          ? 'Đã quay lại'
                          : 'Đang vắng mặt'
                        : row.status === 'completed'
                          ? 'Hoàn tất'
                          : done
                            ? 'Đã ghi nhận'
                            : 'Chưa ghi nhận'}
                    </span>
                  </td>
                  <td>
                    {away && (
                      <button
                        className="mr-3 text-blue-700"
                        onClick={() => setForm(row)}
                      >
                        Chỉnh sửa
                      </button>
                    )}
                    {(away ? !done : row.status !== 'completed') && (
                      <button
                        className="font-bold text-blue-700"
                        onClick={() => void change(row)}
                      >
                        {away ? 'Đã quay lại' : done ? 'Hoàn tất' : 'Ghi nhận'}
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
                <td>
                  {b.start} → {b.end}
                </td>
                <td>
                  <span className="rounded bg-orange-100 px-2 py-1 text-orange-800">
                    Chưa nhập đủ thông tin
                  </span>
                </td>
                <td>
                  <button
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
  const absence = useMutation(api.residence.saveAbsence);
  const [selection, setSelection] = useState<string>(
    editing?.residentId ?? editing?._id ?? initialBooking,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const booking = options?.find((b) => b.id === selection);
  const residents = rows.filter((row) => row.registrationType === 'tam_tru');
  const timestamp = (s?: string) => (s?.length === 10 ? s + 'T00:00' : s);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const data = new FormData(e.currentTarget);
    const field = (name: string) => String(data.get(name) ?? '').trim();
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
      else if (booking)
        await register({
          bookingId: booking.id,
          nationality: field('nationality'),
          documentType: field('documentType') as 'cccd' | 'passport',
          documentNumber: field('number'),
          dateOfBirth: field('birth'),
          gender: field('gender'),
          permanentAddress: field('address'),
          notes: field('notes'),
        });
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
          {away ? 'Thông tin tạm vắng' : 'Nhập thông tin tạm trú'}
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
                {editing.fullName} · {editing.confirmationCode}
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
            {booking && (
              <p className="rounded bg-blue-50 p-3 sm:col-span-2">
                {booking.name} · {booking.unit}
                <br />
                {booking.start} → {booking.end}
              </p>
            )}
            {input('Quốc tịch', 'nationality', 'text', 'Việt Nam')}
            <label>
              Loại giấy tờ
              <select className="field-input" name="documentType">
                <option value="cccd">CCCD</option>
                <option value="passport">Hộ chiếu</option>
              </select>
            </label>
            {input('Số giấy tờ', 'number')}
            {input('Ngày sinh', 'birth', 'date')}
            <label>
              Giới tính
              <select required className="field-input" name="gender">
                <option value="">Chọn giới tính</option>
                <option>Nam</option>
                <option>Nữ</option>
                <option>Khác</option>
              </select>
            </label>
            {input('Địa chỉ thường trú', 'address')}
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
