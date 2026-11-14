import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { CheckCircle2, FileCheck2, Plus, ShieldCheck, Trash2, UserCheck } from 'lucide-react';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { extractErrorMessage } from './ErrorMessage';

interface ResidenceRow {
  _id: Id<'residenceRegistrations'>;
  fullName: string;
  documentType: 'cccd' | 'cmnd' | 'passport' | 'other';
  documentNumber: string;
  nationality: string;
  dateOfBirth?: string;
  phone?: string;
  permanentAddress?: string;
  registrationType: 'tam_tru' | 'tam_vang';
  checkInDate: string;
  checkOutDate: string;
  reason?: string;
  status: 'declared' | 'verified';
  createdAt: number;
}

interface GuestResidencePayload {
  bookingId: Id<'bookings'>;
  confirmationCode: string;
  defaultCheckIn: string;
  defaultCheckOut: string;
  defaultFullName: string;
  defaultPhone: string;
  registrations: ResidenceRow[];
}

const DOC_TYPE_LABELS: Record<ResidenceRow['documentType'], string> = {
  cccd: 'CCCD / CMND',
  cmnd: 'CMND',
  passport: 'Hộ chiếu (Passport)',
  other: 'Giấy tờ khác',
};

export function ResidenceRegistrationSection({
  confirmationCode,
  email,
  defaultCheckIn,
  defaultCheckOut,
  disabled = false,
}: {
  confirmationCode: string;
  email: string;
  defaultCheckIn: string;
  defaultCheckOut: string;
  disabled?: boolean;
}) {
  const validEmail = email.trim().includes('@');
  const data = useQuery(
    (api as any).residence.listForGuest,
    validEmail ? { confirmationCode, email: email.trim() } : 'skip',
  ) as GuestResidencePayload | undefined;

  const registerForGuest = useMutation((api as any).residence.registerForGuest);
  const removeForGuest = useMutation((api as any).residence.removeForGuest);

  const [registrationType, setRegistrationType] = useState<'tam_tru' | 'tam_vang'>('tam_tru');
  const [fullName, setFullName] = useState('');
  const [documentType, setDocumentType] = useState<'cccd' | 'passport' | 'other'>('cccd');
  const [documentNumber, setDocumentNumber] = useState('');
  const [nationality, setNationality] = useState('Việt Nam');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [phone, setPhone] = useState('');
  const [permanentAddress, setPermanentAddress] = useState('');
  const [checkInDate, setCheckInDate] = useState(defaultCheckIn);
  const [checkOutDate, setCheckOutDate] = useState(defaultCheckOut);
  const [reason, setReason] = useState('Lưu trú du lịch / nghỉ dưỡng tại Sóng Homestay');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [prefilledOnce, setPrefilledOnce] = useState(false);

  useEffect(() => {
    setCheckInDate(defaultCheckIn);
    setCheckOutDate(defaultCheckOut);
  }, [defaultCheckIn, defaultCheckOut]);

  useEffect(() => {
    if (data && !prefilledOnce && data.registrations.length === 0) {
      setFullName(data.defaultFullName || '');
      setPhone(data.defaultPhone || '');
      setPrefilledOnce(true);
    }
  }, [data, prefilledOnce]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validEmail || submitting || disabled) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      await registerForGuest({
        confirmationCode,
        email: email.trim(),
        fullName: fullName.trim(),
        documentType,
        documentNumber: documentNumber.trim(),
        nationality: nationality.trim() || 'Việt Nam',
        dateOfBirth: dateOfBirth.trim() || undefined,
        phone: phone.trim() || undefined,
        permanentAddress: permanentAddress.trim() || undefined,
        registrationType,
        checkInDate,
        checkOutDate,
        reason: reason.trim() || undefined,
        consent,
      });
      setDocumentNumber('');
      setConsent(false);
      setFeedback({
        kind: 'ok',
        text:
          registrationType === 'tam_tru'
            ? 'Đã gửi khai báo đăng ký tạm trú thành công!'
            : 'Đã gửi khai báo đăng ký tạm vắng thành công!',
      });
    } catch (err) {
      setFeedback({ kind: 'err', text: extractErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(registrationId: Id<'residenceRegistrations'>) {
    if (!validEmail || removingId) return;
    setRemovingId(registrationId);
    setFeedback(null);
    try {
      await removeForGuest({
        confirmationCode,
        email: email.trim(),
        registrationId,
      });
      setFeedback({ kind: 'ok', text: 'Đã xóa bản khai báo.' });
    } catch (err) {
      setFeedback({ kind: 'err', text: extractErrorMessage(err) });
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <section
      className="mt-6 border-t border-stone-200 pt-6"
      aria-labelledby="residence-registration-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="residence-registration-heading"
            className="flex items-center gap-2 text-base font-semibold text-stone-900"
          >
            <FileCheck2 className="h-5 w-5 text-emerald-700" aria-hidden="true" />
            Cung cấp thông tin lưu trú / tạm vắng
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            Cung cấp thông tin giấy tờ tùy thân (CCCD / Hộ chiếu) để Sóng Homestay hỗ trợ thủ tục trên kênh chính thức.
            Biểu mẫu này không kết nối trực tiếp cơ quan quản lý cư trú.
          </p>
        </div>
        {data?.registrations ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
            Đã khai báo: {data.registrations.length} khách
          </span>
        ) : null}
      </div>

      {!validEmail ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Vui lòng nhập đúng <strong>Email đặt phòng (Booking email)</strong> ở ô phía trên để mở biểu mẫu khai báo
          tạm trú / tạm vắng và xem danh sách khách đã đăng ký.
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {data === undefined ? (
            <p className="text-sm text-stone-500">Đang tải thông tin khai báo lưu trú…</p>
          ) : (
            <>
              {data.registrations.length > 0 ? (
                <div className="space-y-3" data-testid="residence-registration-list">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Danh sách tờ khai đã gửi ({data.registrations.length})
                  </h3>
                  {data.registrations.map((item) => (
                    <div
                      key={item._id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50/80 p-3.5 text-sm"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-stone-900">{item.fullName}</span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              item.registrationType === 'tam_tru'
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {item.registrationType === 'tam_tru' ? 'Đăng ký Tạm trú' : 'Đăng ký Tạm vắng'}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              item.status === 'verified'
                                ? 'bg-sky-100 text-sky-900'
                                : 'bg-stone-200 text-stone-700'
                            }`}
                          >
                            {item.status === 'verified' ? (
                              <>
                                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                Đã xác nhận
                              </>
                            ) : (
                              <>
                                <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                Đã tiếp nhận
                              </>
                            )}
                          </span>
                        </div>
                        <p className="text-xs text-stone-600">
                          {DOC_TYPE_LABELS[item.documentType]}: <strong className="font-mono">{item.documentNumber}</strong> · Quốc
                          tịch: {item.nationality}
                          {item.phone ? ` · SĐT: ${item.phone}` : ''}
                        </p>
                        <p className="text-xs text-stone-500">
                          Thời gian: <strong>{item.checkInDate}</strong> → <strong>{item.checkOutDate}</strong>
                          {item.permanentAddress ? ` · Đ/c thường trú: ${item.permanentAddress}` : ''}
                          {item.reason ? ` · Ghi chú: ${item.reason}` : ''}
                        </p>
                      </div>
                      {item.status !== 'verified' && !disabled ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                          disabled={removingId === item._id}
                          onClick={() => void handleRemove(item._id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          {removingId === item._id ? 'Đang xóa…' : 'Xóa'}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-4 text-sm text-stone-600">
                  Chưa có tờ khai tạm trú / tạm vắng nào cho mã đặt phòng này. Vui lòng điền thông tin bên dưới.
                </p>
              )}

              {!disabled ? (
                <form
                  onSubmit={(e) => void handleSubmit(e)}
                  className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
                  data-testid="residence-registration-form"
                >
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-stone-900">Thêm tờ khai mới</h3>
                    <div className="inline-flex rounded-lg border border-stone-200 bg-stone-100 p-0.5 text-xs font-semibold">
                      <button
                        type="button"
                        className={`rounded-md px-3 py-1.5 transition ${
                          registrationType === 'tam_tru'
                            ? 'bg-emerald-700 text-white shadow-sm'
                            : 'text-stone-700 hover:text-stone-900'
                        }`}
                        onClick={() => {
                          setRegistrationType('tam_tru');
                          if (reason.includes('Tạm vắng')) {
                            setReason('Lưu trú du lịch / nghỉ dưỡng tại Sóng Homestay');
                          }
                        }}
                      >
                        Đăng ký Tạm trú
                      </button>
                      <button
                        type="button"
                        className={`rounded-md px-3 py-1.5 transition ${
                          registrationType === 'tam_vang'
                            ? 'bg-amber-600 text-white shadow-sm'
                            : 'text-stone-700 hover:text-stone-900'
                        }`}
                        onClick={() => {
                          setRegistrationType('tam_vang');
                          if (reason.includes('Lưu trú')) {
                            setReason('Tạm vắng khỏi nơi lưu trú trong thời gian đặt phòng');
                          }
                        }}
                      >
                        Đăng ký Tạm vắng
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="field-label" htmlFor="res-fullname">
                        Họ và tên khách (trên giấy tờ) *
                      </label>
                      <input
                        id="res-fullname"
                        type="text"
                        className="field-input"
                        placeholder="Nguyễn Văn A"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor="res-doctype">
                        Loại giấy tờ tùy thân *
                      </label>
                      <select
                        id="res-doctype"
                        className="field-input"
                        value={documentType}
                        onChange={(e) => setDocumentType(e.target.value as 'cccd' | 'passport' | 'other')}
                      >
                        <option value="cccd">Căn cước công dân (CCCD / CMND)</option>
                        <option value="passport">Hộ chiếu (Passport)</option>
                        <option value="other">Giấy tờ tùy thân khác</option>
                      </select>
                    </div>

                    <div>
                      <label className="field-label" htmlFor="res-docnum">
                        Số CCCD / Hộ chiếu *
                      </label>
                      <input
                        id="res-docnum"
                        type="text"
                        className="field-input font-mono"
                        placeholder="048099001234"
                        value={documentNumber}
                        onChange={(e) => setDocumentNumber(e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor="res-nationality">
                        Quốc tịch
                      </label>
                      <input
                        id="res-nationality"
                        type="text"
                        className="field-input"
                        placeholder="Việt Nam"
                        value={nationality}
                        onChange={(e) => setNationality(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor="res-dob">
                        Ngày sinh
                      </label>
                      <input
                        id="res-dob"
                        type="date"
                        className="field-input"
                        value={dateOfBirth}
                        onChange={(e) => setDateOfBirth(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor="res-phone">
                        Số điện thoại liên hệ
                      </label>
                      <input
                        id="res-phone"
                        type="tel"
                        className="field-input"
                        placeholder="0905 123 456"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor="res-checkin">
                        {registrationType === 'tam_tru' ? 'Tạm trú từ ngày *' : 'Tạm vắng từ ngày *'}
                      </label>
                      <input
                        id="res-checkin"
                        type="date"
                        className="field-input"
                        value={checkInDate}
                        onChange={(e) => setCheckInDate(e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor="res-checkout">
                        {registrationType === 'tam_tru' ? 'Đến ngày *' : 'Dự kiến quay lại ngày *'}
                      </label>
                      <input
                        id="res-checkout"
                        type="date"
                        className="field-input"
                        value={checkOutDate}
                        onChange={(e) => setCheckOutDate(e.target.value)}
                        required
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="field-label" htmlFor="res-address">
                        Địa chỉ thường trú (Tỉnh/Thành, Quận/Huyện)
                      </label>
                      <input
                        id="res-address"
                        type="text"
                        className="field-input"
                        placeholder="Số 12 Lê Duẩn, Hải Châu, Đà Nẵng"
                        value={permanentAddress}
                        onChange={(e) => setPermanentAddress(e.target.value)}
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="field-label" htmlFor="res-reason">
                        Lý do / Ghi chú khai báo
                      </label>
                      <input
                        id="res-reason"
                        type="text"
                        className="field-input"
                        placeholder="Lưu trú du lịch / công tác..."
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </div>
                  </div>

                  {feedback ? (
                    <div
                      className={`mt-3 flex items-center gap-2 rounded-lg p-3 text-sm ${
                        feedback.kind === 'ok'
                          ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                          : 'border border-red-200 bg-red-50 text-red-800'
                      }`}
                      role="status"
                    >
                      {feedback.kind === 'ok' ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                      ) : null}
                      <span>{feedback.text}</span>
                    </div>
                  ) : null}

                  <label className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                    <input type="checkbox" className="mt-0.5" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                    <span>Tôi đồng ý cho Sóng Homestay lưu và xử lý thông tin trên để hỗ trợ khai báo lưu trú. Dữ liệu dự kiến được lưu tối đa 180 ngày và không đưa vào nguồn iCal.</span>
                  </label>

                  <div className="mt-4 flex justify-end">
                    <button
                      type="submit"
                      className="btn-primary inline-flex items-center gap-1.5"
                      disabled={submitting || !fullName.trim() || !documentNumber.trim() || !consent}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      {submitting
                        ? 'Đang gửi tờ khai…'
                        : registrationType === 'tam_tru'
                          ? 'Gửi đăng ký Tạm trú'
                          : 'Gửi đăng ký Tạm vắng'}
                    </button>
                  </div>
                </form>
              ) : null}
            </>
          )}
        </div>
      )}
    </section>
  );
}

