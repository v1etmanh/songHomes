import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { CheckCircle2, ClipboardList, MapPin, Trash2 } from 'lucide-react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { ErrorMessage, extractErrorMessage } from '../components/ErrorMessage';
import { Spinner } from '../components/Spinner';
import { formatDisplayDate } from '../lib/dates';

type DocumentType = 'cccd' | 'cmnd' | 'passport';
const DOCUMENT_LABELS: Record<string, string> = {
  cccd: 'Số định danh cá nhân / CCCD',
  cmnd: 'CMND',
  passport: 'Hộ chiếu',
  other: 'Giấy tờ khác',
};
const STATUS_LABELS: Record<string, string> = {
  hold: 'Đang giữ chỗ', pending: 'Chờ xác nhận', confirmed: 'Đã xác nhận', checked_in: 'Đang lưu trú',
  checked_out: 'Đã trả phòng', cancelled: 'Đã hủy', expired: 'Hết hạn',
};
const REASONS = ['Du lịch / nghỉ dưỡng', 'Công tác', 'Thăm thân', 'Khác'];

/** /tai-khoan/luu-tru[/:bookingId] — the bell's destination. */
export function GuestResidencePage() {
  const { bookingId } = useParams<{ bookingId?: string }>();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const location = useLocation();
  if (isLoading) return <Spinner label="Đang tải…" />;
  if (!isAuthenticated) return <Navigate to={`/dang-nhap?next=${encodeURIComponent(location.pathname)}`} replace />;
  return bookingId ? <SingleBooking bookingId={bookingId as Id<'bookings'>} /> : <MyBookings />;
}

function MyBookings() {
  const bookings = useQuery(api.guestAccount.myBookings, {});
  if (bookings === undefined) return <Spinner label="Đang tải đơn đặt phòng…" />;
  const needing = bookings.filter((b) => b.needsDeclaration);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-xs font-extrabold uppercase tracking-[.2em] text-[#087795]">Tài khoản</p>
        <h1 className="mt-1 text-2xl font-extrabold text-[#073b59]">Đơn đặt phòng & thông báo lưu trú</h1>
        <p className="mt-1 text-sm text-slate-500">Theo quy định, mỗi khách người lớn cần khai báo lưu trú trước khi nhận phòng.</p>
      </header>
      {needing.map((booking) => <BookingDeclaration key={booking.bookingId} bookingId={booking.bookingId} />)}
      <section className="card p-5">
        <h2 className="font-bold text-slate-900">Tất cả đơn của tôi</h2>
        <ul className="mt-3 divide-y divide-slate-100">
          {bookings.map((b) => (
            <li key={b.bookingId} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div>
                <p className="font-semibold text-slate-900">{b.unitName} · <span className="font-mono">{b.confirmationCode}</span></p>
                <p className="text-slate-500">{formatDisplayDate(b.checkIn)} → {formatDisplayDate(b.checkOut)} · {STATUS_LABELS[b.status] ?? b.status}</p>
              </div>
              {b.progress.required > 0 ? (
                b.progress.missing > 0
                  ? <Link to={`/tai-khoan/luu-tru/${b.bookingId}`} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">Thiếu {b.progress.missing} tờ khai</Link>
                  : <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Đã khai báo đủ</span>
              ) : null}
            </li>
          ))}
          {!bookings.length ? <li className="py-6 text-center text-sm text-slate-400">Bạn chưa có đơn đặt phòng nào. <Link className="font-semibold text-[#087795] underline" to="/p/song-homestay/stays">Đặt phòng ngay</Link></li> : null}
        </ul>
      </section>
    </div>
  );
}

function SingleBooking({ bookingId }: { bookingId: Id<'bookings'> }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to="/tai-khoan/luu-tru" className="text-sm font-semibold text-[#087795]">← Tất cả đơn của tôi</Link>
      <BookingDeclaration bookingId={bookingId} />
    </div>
  );
}

function BookingDeclaration({ bookingId }: { bookingId: Id<'bookings'> }) {
  const data = useQuery(api.residence.listForMyBooking, { bookingId });
  const remove = useMutation(api.residence.removeForMyBooking);
  const [error, setError] = useState<string | null>(null);
  if (data === undefined) return <Spinner label="Đang tải tờ khai…" />;
  const { progress } = data;
  const done = progress.required > 0 && progress.missing === 0;
  const percent = progress.required ? Math.min(100, Math.round((progress.declared / progress.required) * 100)) : 100;
  const canDeclare = ['hold', 'pending', 'confirmed', 'checked_in'].includes(data.status)
    && data.registrations.length < data.adults + data.children;

  return (
    <section className={`card overflow-hidden ${done ? '' : 'border-amber-300'}`}>
      <div className={`px-5 py-4 ${done ? 'bg-emerald-50' : 'bg-amber-50'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-extrabold text-[#073b59]"><ClipboardList className="h-5 w-5" />Thông báo lưu trú · <span className="font-mono">{data.confirmationCode}</span></h2>
          <span className={`text-sm font-bold ${done ? 'text-emerald-700' : 'text-amber-800'}`}>{progress.declared}/{progress.required} người lớn đã khai</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-white"><div className={`h-full rounded-full ${done ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${percent}%` }} /></div>
        {!done ? <p className="mt-2 text-sm text-amber-900">Bắt buộc: khai báo đủ {progress.missing} người lớn còn lại trước khi nhận phòng. Lễ tân sẽ không thể check-in khi còn thiếu tờ khai.</p> : null}
      </div>
      <dl className="grid gap-3 px-5 py-4 text-sm sm:grid-cols-3">
        <div><dt className="text-slate-500">Chỗ nghỉ</dt><dd className="font-semibold text-slate-900">{data.unitName}</dd></div>
        <div><dt className="text-slate-500">Thời gian lưu trú</dt><dd className="font-semibold text-slate-900">{formatDisplayDate(data.checkIn)} → {formatDisplayDate(data.checkOut)}</dd></div>
        <div><dt className="text-slate-500">Trạng thái đơn</dt><dd className="font-semibold text-slate-900">{STATUS_LABELS[data.status] ?? data.status}</dd></div>
        <div className="sm:col-span-3"><dt className="flex items-center gap-1 text-slate-500"><MapPin className="h-4 w-4" />Địa chỉ lưu trú</dt><dd className="font-semibold text-slate-900">{data.stayAddress || '—'}</dd></div>
      </dl>

      {data.registrations.length ? (
        <ul className="mx-5 mb-4 divide-y divide-slate-100 rounded-xl border border-slate-100">
          {data.registrations.map((row, index) => (
            <li key={row._id} className="flex flex-wrap items-start justify-between gap-3 p-3 text-sm">
              <div>
                <p className="font-semibold text-slate-900">{index + 1}. {row.fullName}</p>
                <p className="text-slate-500">{DOCUMENT_LABELS[row.documentType]}: <span className="font-mono">{row.documentNumber}</span> · Lý do: {row.reason || '—'}</p>
                <p className="text-slate-500">{formatDisplayDate(row.checkInDate)} → {formatDisplayDate(row.checkOutDate)}</p>
              </div>
              {row.status === 'declared' ? (
                <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-red-700" onClick={() => {
                  if (!window.confirm(`Xóa tờ khai của ${row.fullName}?`)) return;
                  setError(null);
                  remove({ bookingId, registrationId: row._id }).catch((e) => setError(extractErrorMessage(e)));
                }}><Trash2 className="h-3.5 w-3.5" />Xóa</button>
              ) : <span className="text-xs font-bold text-emerald-700">Cơ sở đã ghi nhận</span>}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <div className="mx-5 mb-4"><ErrorMessage message={error} /></div> : null}
      {canDeclare ? (
        <DeclarationForm
          key={data.registrations.length}
          bookingId={bookingId}
          checkIn={data.checkIn}
          checkOut={data.checkOut}
          defaultFullName={data.registrations.length === 0 ? data.defaultFullName : ''}
          personNumber={data.registrations.length + 1}
        />
      ) : null}
    </section>
  );
}

function DeclarationForm({ bookingId, checkIn, checkOut, defaultFullName, personNumber }: {
  bookingId: Id<'bookings'>; checkIn: string; checkOut: string; defaultFullName: string; personNumber: number;
}) {
  const register = useMutation(api.residence.registerForMyBooking);
  const [fullName, setFullName] = useState(defaultFullName);
  const [documentType, setDocumentType] = useState<DocumentType>('cccd');
  const [documentNumber, setDocumentNumber] = useState('');
  const [nationality, setNationality] = useState('Việt Nam');
  const [reasonChoice, setReasonChoice] = useState(REASONS[0]);
  const [reasonOther, setReasonOther] = useState('');
  const [from, setFrom] = useState(checkIn);
  const [to, setTo] = useState(checkOut);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register({
        bookingId,
        fullName,
        documentType,
        documentNumber,
        nationality: documentType === 'passport' ? nationality : 'Việt Nam',
        reason: reasonChoice === 'Khác' ? reasonOther : reasonChoice,
        checkInDate: from,
        checkOutDate: to,
        consent,
      });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 border-t border-slate-100 bg-slate-50/60 px-5 py-5">
      <h3 className="font-bold text-slate-900">Khai báo cho khách thứ {personNumber}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2"><span className="field-label">Họ và tên (như trên giấy tờ)</span><input className="field-input" value={fullName} onChange={(e) => setFullName(e.target.value)} required /></label>
        <label className="block"><span className="field-label">Loại giấy tờ</span>
          <select className="field-input" value={documentType} onChange={(e) => setDocumentType(e.target.value as DocumentType)}>
            <option value="cccd">{DOCUMENT_LABELS.cccd}</option>
            <option value="cmnd">{DOCUMENT_LABELS.cmnd}</option>
            <option value="passport">{DOCUMENT_LABELS.passport}</option>
          </select>
        </label>
        <label className="block"><span className="field-label">Số {DOCUMENT_LABELS[documentType].toLowerCase()}</span>
          <input className="field-input font-mono" value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} inputMode={documentType === 'passport' ? 'text' : 'numeric'} placeholder={documentType === 'cccd' ? '12 chữ số' : documentType === 'cmnd' ? '9 hoặc 12 chữ số' : 'VD: C1234567'} required />
        </label>
        {documentType === 'passport' ? <label className="block"><span className="field-label">Quốc tịch</span><input className="field-input" value={nationality} onChange={(e) => setNationality(e.target.value)} required /></label> : null}
        <label className="block"><span className="field-label">Lý do lưu trú</span>
          <select className="field-input" value={reasonChoice} onChange={(e) => setReasonChoice(e.target.value)}>
            {REASONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        {reasonChoice === 'Khác' ? <label className="block"><span className="field-label">Lý do khác</span><input className="field-input" value={reasonOther} onChange={(e) => setReasonOther(e.target.value)} required /></label> : null}
        <label className="block"><span className="field-label">Lưu trú từ ngày</span><input className="field-input" type="date" min={checkIn} max={checkOut} value={from} onChange={(e) => setFrom(e.target.value)} required /></label>
        <label className="block"><span className="field-label">Đến ngày</span><input className="field-input" type="date" min={checkIn} max={checkOut} value={to} onChange={(e) => setTo(e.target.value)} required /></label>
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-600">
        <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        Tôi đồng ý để cơ sở lưu trú lưu và dùng thông tin này để thông báo lưu trú với cơ quan công an theo quy định. Dữ liệu được xóa sau 180 ngày.
      </label>
      {error ? <ErrorMessage message={error} /> : null}
      <button type="submit" className="btn-primary" disabled={submitting || !consent}>{submitting ? 'Đang gửi…' : 'Gửi tờ khai'}</button>
    </form>
  );
}
