import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Circle, Eye, FileText, Filter, Globe, LogIn, LogOut, NotebookPen, Plus, RefreshCw, Wrench } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { addDays, enumerateNights } from '../../../shared/pricing';
import { todayIso } from '../../lib/dates';
import { formatMoney } from '../../lib/money';
import type { BookingRow, Snapshot } from '../../lib/songAdminTypes';
import { isOverduePending, shortDateTime, sourceLabel, stayRange } from '../../lib/songBookingStatus';
import { shiftOverview } from '../../lib/songShift';
import { ConflictResolver } from '../ConflictResolver';
import { extractErrorMessage } from '../ErrorMessage';
import { ResidenceRegistrationDialog } from '../ResidenceDesk';
import { Spinner } from '../Spinner';
import { useStaffGate } from '../../lib/useStaff';

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

const PANELS = { in: 'Check-in hôm nay', out: 'Check-out hôm nay', conflicts: 'Cảnh báo trùng lịch', web: 'Đơn website chờ' } as const;
type Panel = keyof typeof PANELS;

function SummaryCard({ label, value, detail, icon, tone, active, onClick }: { label: string; value: number; detail: string; icon: ReactNode; tone: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-expanded={active} onClick={onClick} className={`${card} p-5 text-left transition hover:shadow-md ${active ? 'ring-2 ring-[#1565a8]' : ''}`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone}`}>{icon}</span>
        <div className="min-w-0"><p className="text-sm font-bold text-slate-600">{label}</p><p className="mt-1 text-2xl font-extrabold text-[#10234a]">{value}</p><p className="mt-1 text-xs font-semibold text-slate-500">{detail}</p></div>
      </div>
      <span className="mt-3 block text-xs font-bold text-[#1565a8]">{active ? 'Đang xem chi tiết · bấm để đóng' : 'Xem chi tiết ↗'}</span>
    </button>
  );
}

export function FrontDeskShift({ propertyId, timezone }: { propertyId: Id<'properties'>; timezone: string }) {
  const { today, snapshot } = useShiftSnapshot(propertyId, timezone);
  const services = useQuery((api as any).songHomestay.shiftServices, { propertyId, date: today }) as ServiceLine[] | undefined;
  const runs = useQuery(api.icalAlerts.listRuns, { propertyId });
  const syncNow = useAction(api.icalImport.syncNow);
  const update = useMutation((api as any).songHomestay.updateBookingStatus);
  const finishService = useMutation((api as any).songHomestay.finishService);
  // The open card lives in the URL (?panel=in|out|conflicts|web) so it is deep-linkable (convention #12).
  const [params, setParams] = useSearchParams();
  const rawPanel = params.get('panel') ?? '';
  const panel: Panel | '' = rawPanel in PANELS ? rawPanel as Panel : '';
  const setPanel = (value: Panel | '') => setParams((prev) => { const next = new URLSearchParams(prev); if (value) next.set('panel', value); else next.delete('panel'); return next; }, { replace: true });
  const [syncing, setSyncing] = useState(false);
  const [busyCode, setBusyCode] = useState('');
  const [message, setMessage] = useState('');
  const [rowError, setRowError] = useState<{ code: string; text: string } | null>(null);
  const [conflictFor, setConflictFor] = useState<BookingRow | null>(null);
  const [declareFor, setDeclareFor] = useState<BookingRow | null>(null);
  const [noteFor, setNoteFor] = useState<BookingRow | null>(null);
  const [detailFor, setDetailFor] = useState<BookingRow | null>(null);
  const staff = useStaffGate();
  // "Chưa khai báo" filter lives in the URL with the panel (convention #12).
  const onlyUndeclared = params.get('undeclared') === '1';
  const setOnlyUndeclared = (value: boolean) => setParams((prev) => { const next = new URLSearchParams(prev); if (value) next.set('undeclared', '1'); else next.delete('undeclared'); return next; }, { replace: true });

  if (snapshot === undefined || services === undefined) return <Spinner label="Đang tổng hợp công việc trong ca…" />;
  const shift = shiftOverview(snapshot.bookings, today);
  const servicesByCode = new Map<string, ServiceLine[]>();
  for (const line of services) servicesByCode.set(line.code, [...(servicesByCode.get(line.code) ?? []), line]);
  const pendingServices = services.filter((line) => !line.completed);
  const lastSync = runs?.runs[0]?.ts;

  async function transition(row: BookingRow, status: RowStatus) {
    setRowError(null);
    try { await update({ propertyId, bookingId: row.bookingId, status }); }
    catch (error) { setRowError({ code: row.confirmationCode, text: extractErrorMessage(error) }); }
  }
  async function declineWeb(row: BookingRow) {
    if (!window.confirm(`Từ chối đơn ${row.confirmationCode} của ${row.guestName}? Lịch phòng sẽ được giải phóng cho khách khác.`)) return;
    await transition(row, 'cancelled');
  }
  /** "Chuẩn bị dịch vụ" marks every open service on that booking as done. */
  async function prepareServices(row: BookingRow, lines: ServiceLine[]) {
    setRowError(null); setBusyCode(row.confirmationCode);
    try { for (const line of lines.filter((l) => !l.completed)) await finishService({ propertyId, lineId: line.lineId }); }
    catch (error) { setRowError({ code: row.confirmationCode, text: extractErrorMessage(error) }); }
    finally { setBusyCode(''); }
  }
  async function sync() {
    setSyncing(true); setMessage('');
    try {
      const result = await syncNow({ propertyId });
      setMessage(`Đã đồng bộ ${result.feedsSynced} lịch: thêm ${result.inserted}, cập nhật ${result.updated}, gỡ ${result.removed}${result.failedFeeds ? `, ${result.failedFeeds} lịch lỗi` : ''}.`);
    } catch (error) { setMessage(extractErrorMessage(error)); }
    finally { setSyncing(false); }
  }

  const checklist: Array<{ label: string; open: number; to?: string; onClick?: () => void }> = [
    { label: 'Khai báo tạm trú cho khách đang ở', open: shift.residenceMissing.length, to: '/admin/residence' },
    { label: 'Chuẩn bị dịch vụ bổ sung cho khách đến hôm nay', open: pendingServices.length, onClick: () => setPanel('in') },
    { label: 'Xác nhận hoặc từ chối đơn website', open: shift.webPending.length, onClick: () => setPanel('web') },
    { label: 'Xử lý cảnh báo trùng lịch', open: shift.conflicts.length, onClick: () => setPanel('conflicts') },
  ];

  function guestRow(row: BookingRow, kind: 'in' | 'out') {
    const lines = servicesByCode.get(row.confirmationCode) ?? [];
    const openLines = lines.filter((line) => !line.completed);
    const error = rowError?.code === row.confirmationCode ? rowError.text : '';
    return (
      <li key={`${kind}:${row.bookingId}`} className="space-y-2 px-5 py-3.5 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2"><strong className="text-[#10234a]">{row.guestName}</strong><span className="text-xs text-slate-500">{row.guestPhone}</span></div>
          <span className="text-right text-xs font-bold text-slate-600">{row.unitName}</span>
        </div>
        <p className="text-xs text-slate-500">{row.confirmationCode} · {guestCount(row)} · {stayRange(row.checkIn, row.checkOut)}</p>
        {lastNote(row) ? <p className="text-xs text-slate-600"><NotebookPen className="mr-1 inline h-3 w-3" />{lastNote(row)}</p> : null}
        {lines.length ? <p className="text-xs font-semibold text-slate-600">Dịch vụ: {lines.map((line) => `${line.name}${line.quantity > 1 ? ` ×${line.quantity}` : ''}${line.completed ? ' (xong)' : ''}`).join(' · ')}</p> : null}
        <div className="flex flex-wrap gap-2">
          {kind === 'in' && row.status === 'pending' ? <button type="button" className={`${actionButton} bg-[#0b2e4f] text-white hover:bg-[#1565a8]`} onClick={() => void transition(row, 'confirmed')}><CheckCircle2 className="h-3.5 w-3.5" />Xác nhận đơn</button> : null}
          {kind === 'in' && row.status === 'confirmed' ? <button type="button" className={`${actionButton} bg-[#0b2e4f] text-white hover:bg-[#1565a8]`} onClick={() => void transition(row, 'checked_in')}><LogIn className="h-3.5 w-3.5" />Xác nhận nhận phòng</button> : null}
          {kind === 'out' && row.status === 'checked_in' ? <button type="button" className={`${actionButton} bg-teal-700 text-white hover:bg-teal-800`} onClick={() => void transition(row, 'checked_out')}><LogOut className="h-3.5 w-3.5" />Xác nhận trả phòng</button> : null}
          {kind === 'in' && row.status === 'checked_in' ? <span className={`${actionButton} bg-emerald-50 text-emerald-700`}><CheckCircle2 className="h-3.5 w-3.5" />Đã nhận phòng</span> : null}
          {kind === 'out' && row.status === 'checked_out' ? <span className={`${actionButton} bg-emerald-50 text-emerald-700`}><CheckCircle2 className="h-3.5 w-3.5" />Đã trả phòng</span> : null}
          {kind === 'out' && row.status === 'confirmed' ? <span className={`${actionButton} bg-slate-100 text-slate-600`}>Chưa nhận phòng</span> : null}
          {(row.residenceMissing ?? 0) > 0 ? <button type="button" className={`${actionButton} border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100`} title="Khách vẫn được nhận phòng; lễ tân hỗ trợ khai báo" onClick={() => setDeclareFor(row)}><FileText className="h-3.5 w-3.5" />Chưa khai báo · hỗ trợ khai ({row.residenceMissing})</button> : kind === 'in' && row.adults > 0 ? <span className={`${actionButton} bg-emerald-50 text-emerald-700`}><CheckCircle2 className="h-3.5 w-3.5" />Đã khai báo tạm trú</span> : null}
          <button type="button" className={`${actionButton} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`} onClick={() => setNoteFor(row)}><NotebookPen className="h-3.5 w-3.5" />Ghi chú</button>
          <button type="button" className={`${actionButton} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`} onClick={() => setDetailFor(row)}><Eye className="h-3.5 w-3.5" />Xem chi tiết</button>
          {openLines.length ? <button type="button" disabled={busyCode === row.confirmationCode} className={`${actionButton} border border-teal-200 bg-white text-teal-800 hover:bg-teal-50`} onClick={() => void prepareServices(row, lines)}><Wrench className="h-3.5 w-3.5" />{busyCode === row.confirmationCode ? 'Đang cập nhật…' : 'Chuẩn bị dịch vụ'}</button> : lines.length ? <span className={`${actionButton} bg-emerald-50 text-emerald-700`}><CheckCircle2 className="h-3.5 w-3.5" />Đã xong dịch vụ</span> : null}
        </div>
        {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p> : null}
      </li>
    );
  }

  const arrivals = onlyUndeclared ? shift.arrivals.filter((row) => (row.residenceMissing ?? 0) > 0) : shift.arrivals;
  const panelBody = panel === 'in' || panel === 'out' ? (
    <>
      {panel === 'in' ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-2.5 text-xs">
          <Filter className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          <button type="button" aria-pressed={!onlyUndeclared} onClick={() => setOnlyUndeclared(false)} className={`rounded-full px-3 py-1 font-bold ${!onlyUndeclared ? 'bg-[#0b2e4f] text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Tất cả ({shift.arrivals.length})</button>
          <button type="button" aria-pressed={onlyUndeclared} onClick={() => setOnlyUndeclared(true)} className={`rounded-full px-3 py-1 font-bold ${onlyUndeclared ? 'bg-amber-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Chưa khai báo tạm trú ({shift.arrivals.filter((row) => (row.residenceMissing ?? 0) > 0).length})</button>
        </div>
      ) : null}
      <ul className="divide-y divide-slate-100">
        {(panel === 'in' ? arrivals : shift.departures).map((row) => guestRow(row, panel))}
        {!(panel === 'in' ? arrivals : shift.departures).length ? <li className="px-5 py-8 text-center text-sm text-slate-500">{panel === 'in' ? (onlyUndeclared ? 'Mọi khách hôm nay đã khai báo.' : 'Hôm nay không có khách nhận phòng.') : 'Hôm nay không có khách trả phòng.'}</li> : null}
      </ul>
    </>
  ) : panel === 'conflicts' ? (
    shift.conflicts.length ? (
      <ul className="divide-y divide-slate-100">
        {conflictPairs(shift.conflicts, snapshot.bookings).map(({ key, flagged, other, nights }) => (
          <li key={key} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
            <div className="min-w-0 space-y-0.5">
              <p className="font-bold text-[#10234a]">{flagged.unitName}</p>
              <p className="text-xs text-slate-600">{side(flagged)}{other ? <> <strong className="text-slate-800">trùng với</strong> {side(other)}</> : null}</p>
              {nights.length ? <p className="text-xs font-extrabold text-red-600">Trùng đêm: {nights.map(shortYear).join(', ')}</p> : null}
            </div>
            <button type="button" className={`${actionButton} bg-red-600 text-white hover:bg-red-700`} onClick={() => setConflictFor(flagged)}>Xử lý</button>
          </li>
        ))}
      </ul>
    ) : <p className="px-5 py-8 text-center text-sm text-slate-500">Không có booking trùng lịch.</p>
  ) : panel === 'web' ? (
    <ul className="divide-y divide-slate-100">
      {shift.webPending.map((row) => {
        const error = rowError?.code === row.confirmationCode ? rowError.text : '';
        return (
          <li key={row.bookingId} className="space-y-2 px-5 py-3 text-sm">
            <div className="flex items-start justify-between gap-2"><div><p className="font-bold text-[#10234a]">{row.guestName}</p><p className="text-xs text-slate-500">{row.confirmationCode} · {row.guestPhone || row.guestEmail}</p></div><strong className="whitespace-nowrap text-[#10234a]">{formatMoney(row.totalCents, snapshot.property.currency)}</strong></div>
            <p className="text-xs text-slate-500">{row.unitName} · {stayRange(row.checkIn, row.checkOut)}{isOverduePending(row, today) ? ' · đã quá ngày nhận phòng' : ''}</p>
            {/* Party size + services right under the stay, so the desk can match the total and prepare (WEBSITE (2).pdf r7). */}
            <p className="text-xs font-semibold text-slate-700">{partyLine(row)} · {servicesLine(row)}</p>
            <div className="flex gap-2">
              <button type="button" className={`${actionButton} border border-red-200 bg-white text-red-700 hover:bg-red-50`} onClick={() => void declineWeb(row)}>Từ chối</button>
              <button type="button" className={`${actionButton} bg-[#0b2e4f] text-white hover:bg-[#1565a8]`} onClick={() => void transition(row, 'confirmed')}>Xác nhận</button>
            </div>
            {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p> : null}
          </li>
        );
      })}
      {!shift.webPending.length ? <li className="px-5 py-8 text-center text-sm text-slate-500">Không có đơn website nào đang chờ.</li> : null}
    </ul>
  ) : null;

  return (
    <div className="space-y-5">
      {conflictFor && <Modal title={`Xử lý trùng lịch · ${conflictFor.confirmationCode}`} onClose={() => setConflictFor(null)}><ConflictResolver propertyId={propertyId} bookingId={conflictFor.bookingId} /></Modal>}
      {declareFor && <ResidenceRegistrationDialog propertyId={propertyId} bookingId={declareFor.bookingId} close={() => setDeclareFor(null)} />}
      {noteFor && <Modal title={`Ghi chú lễ tân · ${noteFor.confirmationCode}`} onClose={() => setNoteFor(null)}><NoteForm propertyId={propertyId} row={noteFor} done={() => setNoteFor(null)} /></Modal>}
      {detailFor && <Modal title={`Chi tiết booking · ${detailFor.confirmationCode}`} onClose={() => setDetailFor(null)}><BookingDetail row={detailFor} lines={servicesByCode.get(detailFor.confirmationCode) ?? []} timezone={timezone} /></Modal>}

      <p className="text-sm font-semibold text-slate-600">Chào {staff.status === 'staff' ? staff.name : 'bạn'}, chúc bạn một ngày làm việc tốt lành!</p>

      <section className={`${card} flex flex-wrap items-center justify-between gap-3 px-5 py-3.5`} aria-label="Tác vụ nhanh">
        <p className="text-sm font-semibold text-slate-500">{lastSync ? <>Đồng bộ iCal gần nhất: <strong className="text-[#10234a]">{shortDateTime(lastSync, timezone)}</strong></> : 'Chưa có lần đồng bộ iCal nào.'}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => void sync()} disabled={syncing}><RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />Đồng bộ ngay</button>
          <Link to="/admin/bookings?new=1" className="btn-primary inline-flex items-center gap-2"><Plus className="h-4 w-4" aria-hidden="true" />Tạo booking mới</Link>
        </div>
        {message ? <p role="status" aria-live="polite" className="w-full rounded-xl bg-sky-50 px-4 py-2 text-sm font-semibold text-[#1565a8]">{message}</p> : null}
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label={PANELS.in} value={shift.arrivals.length} detail={`${shift.arrivals.filter((r) => r.status === 'checked_in').length} đã nhận phòng`} icon={<LogIn className="h-6 w-6" />} tone="bg-blue-50 text-blue-600" active={panel === 'in'} onClick={() => setPanel(panel === 'in' ? '' : 'in')} />
        <SummaryCard label={PANELS.out} value={shift.departures.length} detail={`${shift.departures.filter((r) => r.status === 'checked_out').length} đã trả phòng`} icon={<LogOut className="h-6 w-6" />} tone="bg-teal-50 text-teal-600" active={panel === 'out'} onClick={() => setPanel(panel === 'out' ? '' : 'out')} />
        <SummaryCard label={PANELS.conflicts} value={shift.conflicts.length} detail={shift.conflicts.length ? 'Cần xử lý ngay' : 'Lịch đang an toàn'} icon={<AlertTriangle className="h-6 w-6" />} tone="bg-red-50 text-red-600" active={panel === 'conflicts'} onClick={() => setPanel(panel === 'conflicts' ? '' : 'conflicts')} />
        <SummaryCard label={PANELS.web} value={shift.webPending.length} detail={shift.webPending.length ? 'Chờ lễ tân duyệt' : 'Không có đơn chờ'} icon={<Globe className="h-6 w-6" />} tone="bg-violet-50 text-violet-600" active={panel === 'web'} onClick={() => setPanel(panel === 'web' ? '' : 'web')} />
      </div>

      {panel ? (
        <section className={card} aria-label={`${PANELS[panel]} · Chi tiết`}>
          <div className={`flex items-center justify-between gap-3 rounded-t-2xl border-b px-5 py-3.5 ${panel === 'conflicts' ? 'border-red-100 bg-red-50 text-red-700' : 'border-slate-100 text-[#10234a]'}`}>
            <h2 className="font-extrabold">{PANELS[panel]} · Chi tiết</h2>
            <button type="button" className="btn-secondary" onClick={() => setPanel('')}>Đóng</button>
          </div>
          {panelBody}
        </section>
      ) : null}
        <section className={card} aria-label="Checklist công việc trong ca">
          <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-3.5 text-[#10234a]"><ClipboardCheck className="h-5 w-5" aria-hidden="true" /><h2 className="font-extrabold">Checklist công việc trong ca</h2></div>
          <ul className="divide-y divide-slate-100">
            {checklist.map((item) => {
              const done = item.open === 0;
              const body = <><span className="flex items-center gap-2">{done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Circle className="h-4 w-4 text-slate-300" aria-hidden="true" />}<span className={done ? 'text-slate-400 line-through' : 'font-semibold text-[#10234a]'}>{item.label}</span></span><span className={`whitespace-nowrap text-xs font-bold ${done ? 'text-emerald-700' : 'text-[#1565a8]'}`}>{done ? 'Xong' : `Còn ${item.open}`}</span></>;
              return <li key={item.label}>{item.to && !done ? <Link to={item.to} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-sky-50">{body}</Link> : item.onClick && !done ? <button type="button" onClick={item.onClick} className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left text-sm hover:bg-sky-50">{body}</button> : <div className="flex items-center justify-between gap-3 px-5 py-3 text-sm">{body}</div>}</li>;
            })}
          </ul>
        </section>
    </div>
  );
}

function guestCount(row: BookingRow): string {
  const total = row.adults + row.children + (row.infants ?? 0);
  // OTA iCal imports carry no party size.
  if (!total) return 'Số khách chưa rõ (OTA)';
  const parts = [`${row.adults} người lớn`, row.children ? `${row.children} trẻ em` : '', row.infants ? `${row.infants} em bé` : ''].filter(Boolean).join(', ');
  return `${total} khách (${parts})`;
}

/** dd/mm/yy, as the front desk reads dates. */
const shortYear = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
const side = (row: BookingRow) => `${row.confirmationCode} · ${sourceLabel(row.source)} (${shortYear(row.checkIn)} → ${shortYear(row.checkOut)})`;

/**
 * One line per clashing pair: the flagged booking, the booking it overlaps on
 * the same unit, and every shared night (half-open [checkIn, checkOut)).
 */
function conflictPairs(flaggedRows: BookingRow[], all: BookingRow[]) {
  const live = all.filter((row) => !['cancelled', 'expired', 'blocked', 'checked_out'].includes(row.status));
  const seen = new Set<string>();
  const out: Array<{ key: string; flagged: BookingRow; other: BookingRow | null; nights: string[] }> = [];
  for (const flagged of flaggedRows) {
    const others = live.filter((row) => row.bookingId !== flagged.bookingId && row.unitId === flagged.unitId && row.checkIn < flagged.checkOut && flagged.checkIn < row.checkOut);
    if (!others.length) { out.push({ key: String(flagged.bookingId), flagged, other: null, nights: [] }); continue; }
    for (const other of others) {
      const key = [String(flagged.bookingId), String(other.bookingId)].sort().join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      const start = flagged.checkIn > other.checkIn ? flagged.checkIn : other.checkIn;
      const end = flagged.checkOut < other.checkOut ? flagged.checkOut : other.checkOut;
      out.push({ key, flagged, other, nights: enumerateNights(start, end) });
    }
  }
  return out;
}

/** "4 người lớn, 1 trẻ em" — the party as booked. */
function partyLine(row: BookingRow): string {
  return [`${row.adults} người lớn`, row.children ? `${row.children} trẻ em` : '', row.infants ? `${row.infants} em bé` : '', row.pets ? `${row.pets} thú cưng` : ''].filter(Boolean).join(', ');
}

/** "Dịch vụ: Đón sân bay (Xe riêng 7 chỗ) ×1 (miễn phí 1)" or "Không có dịch vụ bổ sung". */
function servicesLine(row: BookingRow): string {
  const lines = row.services ?? [];
  if (!lines.length) return 'Không có dịch vụ bổ sung';
  return `Dịch vụ: ${lines.map((line) => `${line.name} ×${line.quantity}${line.free ? ` (miễn phí ${line.free})` : ''}`).join(', ')}`;
}

/** Latest front-desk note, shown under the guest line. */
function lastNote(row: BookingRow): string {
  const notes = (row.notes ?? []).filter((note) => note.by.startsWith('Lễ tân'));
  return notes.length ? notes[notes.length - 1].text : '';
}

function NoteForm({ propertyId, row, done }: { propertyId: Id<'properties'>; row: BookingRow; done: () => void }) {
  const add = useMutation((api as any).songHomestay.addFrontDeskNote);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // One request id per opened form: a double click or retry never writes twice.
  const [requestId] = useState(() => `note-${row.bookingId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const notes = (row.notes ?? []).filter((note) => note.by.startsWith('Lễ tân') || note.by === 'Khách (dịch vụ)');
  return (
    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); setBusy(true); setError(''); add({ propertyId, bookingId: row.bookingId, text, requestId }).then(done).catch((e: unknown) => { setError(extractErrorMessage(e)); setBusy(false); }); }}>
      <p className="text-sm text-slate-600">{row.guestName} · {row.unitName} · {stayRange(row.checkIn, row.checkOut)}</p>
      <label className="block"><span className="field-label">Nội dung ghi chú</span>
        <textarea className="field-input min-h-24" required maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="VD: khách hạ cánh 14:30, gửi hành lý lúc 11:00…" /></label>
      {notes.length ? <ul className="space-y-1 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">{notes.map((note) => <li key={note.ts}><strong>{note.by}:</strong> {note.text}</li>)}</ul> : null}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={done}>Hủy</button><button className="btn-primary" disabled={busy || !text.trim()}>{busy ? 'Đang lưu…' : 'Lưu ghi chú'}</button></div>
    </form>
  );
}

function BookingDetail({ row, lines, timezone }: { row: BookingRow; lines: ServiceLine[]; timezone: string }) {
  const notes = (row.notes ?? []).filter((note) => !note.text.startsWith('Cập nhật trạng thái'));
  return (
    <div className="space-y-4 text-sm">
      <dl className="grid gap-3 sm:grid-cols-2">
        {[
          ['Khách hàng', row.guestName], ['Số điện thoại', row.guestPhone || '—'], ['Email', row.guestEmail || '—'], ['Chỗ nghỉ', row.unitName],
          ['Lưu trú', stayRange(row.checkIn, row.checkOut)], ['Số khách', guestCount(row)], ['Kênh', sourceLabel(row.source)],
          ['Khai báo tạm trú', (row.residenceMissing ?? 0) > 0 ? `Còn thiếu ${row.residenceMissing} người lớn` : 'Đã đủ'],
        ].map(([label, value]) => <div key={label}><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="font-semibold text-[#10234a]">{value}</dd></div>)}
      </dl>
      <div><h3 className="font-bold text-[#10234a]">Dịch vụ đã thuê</h3>
        {lines.length || row.services?.length ? <ul className="mt-1 list-disc pl-5 text-slate-700">{(row.services ?? lines.map((l) => ({ name: l.name, quantity: l.quantity, free: 0, completed: l.completed }))).map((line, i) => <li key={i}>{line.name}{line.quantity > 1 ? ` ×${line.quantity}` : ''}{line.free ? ' (1 lượt miễn phí)' : ''}{line.completed ? ' — đã chuẩn bị' : ''}</li>)}</ul> : <p className="mt-1 text-slate-500">Không thuê dịch vụ.</p>}
      </div>
      <div><h3 className="font-bold text-[#10234a]">Ghi chú</h3>
        {notes.length ? <ul className="mt-1 space-y-1">{notes.map((note) => <li key={note.ts} className="rounded-lg bg-slate-50 px-3 py-2"><span className="text-xs text-slate-500">{shortDateTime(note.ts, timezone)} · {note.by}</span><br />{note.text}</li>)}</ul> : <p className="mt-1 text-slate-500">Chưa có ghi chú.</p>}
      </div>
    </div>
  );
}
