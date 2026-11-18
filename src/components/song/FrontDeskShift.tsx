import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Circle, LogIn, LogOut, Plus, RefreshCw, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { addDays } from '../../../shared/pricing';
import { todayIso } from '../../lib/dates';
import { formatMoney } from '../../lib/money';
import type { BookingRow, Snapshot } from '../../lib/songAdminTypes';
import { isOverduePending } from '../../lib/songBookingStatus';
import { shiftOverview } from '../../lib/songShift';
import { ConflictResolver } from '../ConflictResolver';
import { extractErrorMessage } from '../ErrorMessage';
import { ResidenceDesk } from '../ResidenceDesk';
import { Spinner } from '../Spinner';

/** One snapshot window shared by the shift dashboard and the notification bell (identical args = one subscription). */
export function useShiftSnapshot(propertyId: Id<'properties'>, timezone: string) {
  const today = todayIso(timezone);
  const snapshot = useQuery((api as any).songHomestay.adminSnapshot, { propertyId, startDate: addDays(today, -1), endDate: addDays(today, 365) }) as Snapshot | undefined;
  return { today, snapshot };
}

type ServiceLine = { lineId: string; code: string; name: string; quantity: number; completed: boolean };
type RowStatus = 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled';

const card = 'rounded-2xl border border-sky-100 bg-white shadow-sm';
const actionButton = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition disabled:opacity-60';

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} onCancel={onClose} aria-labelledby="shift-modal-title" className="w-[min(96vw,64rem)] rounded-2xl p-0 shadow-xl backdrop:bg-black/40">
      <div className="flex items-center justify-between border-b px-5 py-4"><h2 id="shift-modal-title" className="text-lg font-extrabold text-[#10234a]">{title}</h2><button type="button" className="btn-secondary" onClick={onClose}>Đóng</button></div>
      <div className="max-h-[80vh] overflow-y-auto p-5">{children}</div>
    </dialog>
  );
}

function SectionHeader({ icon, title, hint, count, tone = 'sky' }: { icon: ReactNode; title: string; hint: string; count?: number; tone?: 'sky' | 'red' }) {
  return (
    <div className={`flex items-start justify-between gap-3 rounded-t-2xl px-5 py-4 ${tone === 'red' ? 'bg-red-50 text-red-800' : 'bg-sky-50/60 text-[#10234a]'}`}>
      <div className="flex items-start gap-2.5"><span className="mt-0.5">{icon}</span><div><h2 className="font-extrabold">{title}</h2><p className="text-xs font-medium text-slate-500">{hint}</p></div></div>
      {count !== undefined ? <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${tone === 'red' ? 'bg-red-100 text-red-700' : 'bg-white text-[#1565a8]'}`}>{count}</span> : null}
    </div>
  );
}

function SummaryCard({ label, value, detail, done }: { label: string; value: number; detail: string; done?: boolean }) {
  return (
    <div className={`${card} p-4`}>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-extrabold text-[#10234a]">{value}</p>
      <p className={`mt-1 text-xs font-semibold ${done ? 'text-emerald-700' : 'text-slate-500'}`}>{detail}</p>
    </div>
  );
}

export function FrontDeskShift({ propertyId, timezone }: { propertyId: Id<'properties'>; timezone: string }) {
  const { today, snapshot } = useShiftSnapshot(propertyId, timezone);
  const services = useQuery((api as any).songHomestay.shiftServices, { propertyId, date: today }) as ServiceLine[] | undefined;
  const runs = useQuery(api.icalAlerts.listRuns, { propertyId });
  const syncNow = useAction(api.icalImport.syncNow);
  const update = useMutation((api as any).songHomestay.updateBookingStatus);
  const [tab, setTab] = useState<'all' | 'in' | 'out'>('all');
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [rowError, setRowError] = useState<{ code: string; text: string } | null>(null);
  const [modal, setModal] = useState<'conflicts' | 'residence' | null>(null);

  if (snapshot === undefined || services === undefined) return <Spinner label="Đang tổng hợp công việc trong ca…" />;
  const shift = shiftOverview(snapshot.bookings, today);
  const servicesByCode = new Map<string, ServiceLine[]>();
  for (const line of services) servicesByCode.set(line.code, [...(servicesByCode.get(line.code) ?? []), line]);
  const pendingServices = services.filter((line) => !line.completed);
  const lastSync = runs?.runs[0]?.ts;
  const fmtTime = (ts: number) => new Intl.DateTimeFormat('vi-VN', { timeZone: timezone, dateStyle: 'short', timeStyle: 'short' }).format(ts);

  async function transition(row: BookingRow, status: RowStatus) {
    setRowError(null);
    try { await update({ propertyId, bookingId: row.bookingId, status }); }
    catch (error) { setRowError({ code: row.confirmationCode, text: extractErrorMessage(error) }); }
  }
  async function declineWeb(row: BookingRow) {
    if (!window.confirm(`Từ chối đơn ${row.confirmationCode} của ${row.guestName}? Lịch phòng sẽ được giải phóng cho khách khác.`)) return;
    await transition(row, 'cancelled');
  }
  async function sync() {
    setSyncing(true); setMessage('');
    try {
      const result = await syncNow({ propertyId });
      setMessage(`Đã đồng bộ ${result.feedsSynced} lịch: thêm ${result.inserted}, cập nhật ${result.updated}, gỡ ${result.removed}${result.failedFeeds ? `, ${result.failedFeeds} lịch lỗi` : ''}.`);
    } catch (error) { setMessage(extractErrorMessage(error)); }
    finally { setSyncing(false); }
  }

  const dayRows = [
    ...shift.arrivals.map((row) => ({ row, kind: 'in' as const })),
    ...shift.departures.map((row) => ({ row, kind: 'out' as const })),
  ].filter((entry) => tab === 'all' || entry.kind === tab);
  const checklist: Array<{ label: string; open: number; to?: string; onClick?: () => void }> = [
    { label: 'Khai báo tạm trú cho khách đang ở', open: shift.residenceMissing.length, onClick: () => setModal('residence') },
    { label: 'Chuẩn bị dịch vụ bổ sung cho khách đến hôm nay', open: pendingServices.length, to: '/admin/services' },
    { label: 'Xác nhận hoặc từ chối đơn website', open: shift.webPending.length },
    { label: 'Xử lý cảnh báo trùng lịch', open: shift.conflicts.length, onClick: () => setModal('conflicts') },
  ];

  return (
    <div className="space-y-5">
      {modal === 'conflicts' && <Modal title="Xử lý trùng lịch" onClose={() => setModal(null)}><ConflictResolver propertyId={propertyId} /></Modal>}
      {modal === 'residence' && <Modal title="Khai báo tạm trú" onClose={() => setModal(null)}><ResidenceDesk propertyId={propertyId} /></Modal>}

      <section className={`${card} flex flex-wrap items-center justify-between gap-4 p-5`} aria-label="Tác vụ nhanh">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.2em] text-[#328ee0]">Ca trực hôm nay · {today}</p>
          <p className="mt-1 text-sm text-slate-500">Mở màn hình này đầu ca để thấy ngay phòng đến/đi, trùng lịch và đơn cần duyệt.</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">{lastSync ? `Đồng bộ iCal gần nhất: ${fmtTime(lastSync)}` : 'Chưa có lần đồng bộ iCal nào.'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => void sync()} disabled={syncing}><RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />Đồng bộ ngay</button>
          <Link to="/admin/bookings?new=1" className="btn-primary inline-flex items-center gap-2"><Plus className="h-4 w-4" aria-hidden="true" />Tạo booking mới</Link>
        </div>
        {message ? <p role="status" aria-live="polite" className="w-full rounded-xl bg-sky-50 px-4 py-2 text-sm font-semibold text-[#1565a8]">{message}</p> : null}
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Check-in hôm nay" value={shift.arrivals.length} detail={`${shift.arrivals.filter((r) => r.status === 'checked_in').length} đã nhận phòng`} />
        <SummaryCard label="Check-out hôm nay" value={shift.departures.length} detail={`${shift.departures.filter((r) => r.status === 'checked_out').length} đã trả phòng`} />
        <SummaryCard label="Cảnh báo trùng lịch" value={shift.conflicts.length} detail={shift.conflicts.length ? 'Cần xử lý ngay' : 'Lịch đang an toàn'} done={!shift.conflicts.length} />
        <SummaryCard label="Đơn website chờ" value={shift.webPending.length} detail={shift.webPending.length ? 'Chờ lễ tân duyệt' : 'Không có đơn chờ'} done={!shift.webPending.length} />
      </div>

      <section className={card} aria-label="Cảnh báo Double Booking">
        <SectionHeader tone="red" icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />} title="Cảnh báo Double Booking cần xử lý ngay" hint="Hệ thống tự phát hiện trùng ngày lưu trú giữa các kênh." count={shift.conflicts.length} />
        {shift.conflicts.length ? (
          <ul className="divide-y divide-red-100">
            {shift.conflicts.map((row) => (
              <li key={row.bookingId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div><p className="font-bold text-[#10234a]">{row.unitName}</p><p className="text-xs text-slate-500">{row.confirmationCode} · {row.guestName} · {row.checkIn} → {row.checkOut}</p></div>
                <button type="button" className={`${actionButton} bg-red-600 text-white hover:bg-red-700`} onClick={() => setModal('conflicts')}>Xử lý</button>
              </li>
            ))}
          </ul>
        ) : <p className="px-5 py-6 text-center text-sm text-slate-500">Không có booking trùng lịch.</p>}
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[1.4fr_1fr]">
        <section className={card} aria-label="Check-in và check-out trong ngày">
          <SectionHeader icon={<ClipboardCheck className="h-5 w-5" aria-hidden="true" />} title="Check-in / Check-out trong ngày" hint="Thao tác trực tiếp trên từng dòng." />
          <div role="group" aria-label="Lọc khách đến và đi" className="flex gap-2 px-5 pt-4">
            {([['all', `Tất cả (${shift.arrivals.length + shift.departures.length})`], ['in', `Check-in (${shift.arrivals.length})`], ['out', `Check-out (${shift.departures.length})`]] as const).map(([key, label]) => (
              <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${tab === key ? 'border-[#1565a8] bg-[#1565a8] text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{label}</button>
            ))}
          </div>
          <ul className="mt-3 divide-y divide-slate-100">
            {dayRows.map(({ row, kind }) => {
              const lines = servicesByCode.get(row.confirmationCode) ?? [];
              const error = rowError?.code === row.confirmationCode ? rowError.text : '';
              return (
                <li key={`${kind}:${row.bookingId}`} className="space-y-2 px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${kind === 'in' ? 'bg-sky-100 text-[#1565a8]' : 'bg-teal-100 text-teal-800'}`}>{kind === 'in' ? 'Check-in' : 'Check-out'}</span><strong className="text-[#10234a]">{row.guestName}</strong><span className="text-xs text-slate-500">{row.guestPhone}</span></div>
                    <span className="text-right text-xs font-bold text-slate-600">{row.unitName}</span>
                  </div>
                  <p className="text-xs text-slate-500">{row.confirmationCode} · {row.adults} người lớn{row.children ? `, ${row.children} trẻ em` : ''} · {row.checkIn} → {row.checkOut}</p>
                  {lines.length ? <p className="text-xs font-semibold text-slate-600">Dịch vụ: {lines.map((line) => `${line.name}${line.quantity > 1 ? ` ×${line.quantity}` : ''}${line.completed ? ' (xong)' : ''}`).join(' · ')}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    {kind === 'in' && row.status === 'pending' ? <button type="button" className={`${actionButton} bg-emerald-600 text-white hover:bg-emerald-700`} onClick={() => void transition(row, 'confirmed')}><CheckCircle2 className="h-3.5 w-3.5" />Xác nhận đơn</button> : null}
                    {kind === 'in' && row.status === 'confirmed' ? <button type="button" className={`${actionButton} bg-[#0b2e4f] text-white hover:bg-[#1565a8]`} onClick={() => void transition(row, 'checked_in')}><LogIn className="h-3.5 w-3.5" />Xác nhận nhận phòng</button> : null}
                    {kind === 'out' && row.status === 'checked_in' ? <button type="button" className={`${actionButton} bg-teal-700 text-white hover:bg-teal-800`} onClick={() => void transition(row, 'checked_out')}><LogOut className="h-3.5 w-3.5" />Xác nhận trả phòng</button> : null}
                    {kind === 'in' && row.status === 'checked_in' ? <span className={`${actionButton} bg-emerald-50 text-emerald-700`}><CheckCircle2 className="h-3.5 w-3.5" />Đã nhận phòng</span> : null}
                    {kind === 'out' && row.status === 'checked_out' ? <span className={`${actionButton} bg-emerald-50 text-emerald-700`}><CheckCircle2 className="h-3.5 w-3.5" />Đã trả phòng</span> : null}
                    {kind === 'out' && row.status === 'confirmed' ? <span className={`${actionButton} bg-slate-100 text-slate-600`}>Chưa nhận phòng</span> : null}
                    {(row.residenceMissing ?? 0) > 0 ? <button type="button" className={`${actionButton} border border-sky-200 bg-white text-[#1565a8] hover:bg-sky-50`} onClick={() => setModal('residence')}>Khai báo tạm trú ({row.residenceMissing})</button> : null}
                    {lines.some((line) => !line.completed) ? <Link to="/admin/services" className={`${actionButton} border border-teal-200 bg-white text-teal-800 hover:bg-teal-50`}><Wrench className="h-3.5 w-3.5" />Chuẩn bị dịch vụ</Link> : null}
                  </div>
                  {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p> : null}
                </li>
              );
            })}
            {!dayRows.length ? <li className="px-5 py-8 text-center text-sm text-slate-500">Hôm nay không có khách đến hoặc đi.</li> : null}
          </ul>
        </section>

        <div className="space-y-5">
          <section className={card} aria-label="Đơn website chờ xác nhận">
            <SectionHeader icon={<ClipboardCheck className="h-5 w-5" aria-hidden="true" />} title="Đơn Website chờ xác nhận" hint="Liên hệ khách xác nhận thủ công rồi duyệt hoặc từ chối." count={shift.webPending.length} />
            <ul className="divide-y divide-slate-100">
              {shift.webPending.map((row) => {
                const error = rowError?.code === row.confirmationCode ? rowError.text : '';
                return (
                  <li key={row.bookingId} className="space-y-2 px-5 py-3 text-sm">
                    <div className="flex items-start justify-between gap-2"><div><p className="font-bold text-[#10234a]">{row.guestName}</p><p className="text-xs text-slate-500">{row.confirmationCode} · {row.guestPhone || row.guestEmail}</p></div><strong className="text-[#10234a]">{formatMoney(row.totalCents, snapshot.property.currency)}</strong></div>
                    <p className="text-xs text-slate-500">{row.unitName} · {row.checkIn} → {row.checkOut}{isOverduePending(row, today) ? ' · đã quá ngày nhận phòng' : ''}</p>
                    <div className="flex gap-2">
                      <button type="button" className={`${actionButton} border border-red-200 bg-white text-red-700 hover:bg-red-50`} onClick={() => void declineWeb(row)}>Từ chối</button>
                      <button type="button" className={`${actionButton} bg-emerald-600 text-white hover:bg-emerald-700`} onClick={() => void transition(row, 'confirmed')}>Xác nhận</button>
                    </div>
                    {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p> : null}
                  </li>
                );
              })}
              {!shift.webPending.length ? <li className="px-5 py-8 text-center text-sm text-slate-500">Không có đơn website nào đang chờ.</li> : null}
            </ul>
          </section>

          <section className={card} aria-label="Checklist công việc trong ca">
            <SectionHeader icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />} title="Checklist công việc trong ca" hint="Tự cập nhật theo dữ liệu thật, không cần tick tay." />
            <ul className="divide-y divide-slate-100">
              {checklist.map((item) => {
                const done = item.open === 0;
                const body = <><span className="flex items-center gap-2">{done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Circle className="h-4 w-4 text-slate-300" aria-hidden="true" />}<span className={done ? 'text-slate-400 line-through' : 'font-semibold text-[#10234a]'}>{item.label}</span></span><span className={`text-xs font-bold ${done ? 'text-emerald-700' : 'text-[#1565a8]'}`}>{done ? 'Xong' : `Còn ${item.open}`}</span></>;
                return <li key={item.label}>{item.to && !done ? <Link to={item.to} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-sky-50">{body}</Link> : item.onClick && !done ? <button type="button" onClick={item.onClick} className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left text-sm hover:bg-sky-50">{body}</button> : <div className="flex items-center justify-between gap-3 px-5 py-3 text-sm">{body}</div>}</li>;
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
