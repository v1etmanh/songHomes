import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAction, useMutation, useQuery } from 'convex/react';
import { AlertTriangle, ArrowRightLeft, CheckCircle2, ExternalLink, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { extractErrorMessage } from './ErrorMessage';
import { Spinner } from './Spinner';
import { stayRange } from '../lib/songBookingStatus';

type Side = {
  bookingId: Id<'bookings'>;
  confirmationCode: string;
  source: string;
  status: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestName: string;
  syncConflict: boolean;
};

const PLATFORM_BY_LABEL: Record<string, 'airbnb' | 'booking'> = { Airbnb: 'airbnb', 'Booking.com': 'booking' };
const MANUAL_LABEL: Record<string, string> = { zalo: 'Zalo', facebook: 'Facebook', phone: 'Phone', walk_in: 'Khác', other: 'Khác' };
const STATUS_LABEL: Record<string, string> = { hold: 'Đang giữ chỗ', pending: 'Chờ xác nhận', confirmed: 'Đã xác nhận', checked_in: 'Đang lưu trú', external: 'Từ OTA' };

function sourceLabel(source: string): string {
  if (source === 'online') return 'Website';
  if (source.startsWith('ical:')) return source.slice(5);
  if (source.startsWith('manual:')) return MANUAL_LABEL[source.slice(7)] ?? source.slice(7);
  return source;
}

function isExternal(side: Side) {
  return side.status === 'external';
}

const METHOD_LABEL: Record<string, string> = { move_unit: 'Chuyển căn', cancel_booking: 'Hủy booking', acknowledge: 'Xử lý trên OTA / bên ngoài' };
const shortDay = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;

/**
 * Double-booking alerts, Sóng style: a compact list (căn · đêm trùng · 2 booking)
 * with a "Xử lý" action per row that opens the resolution panel in place.
 * Handled conflicts move to the "Đã xử lý" tab with how and by whom.
 * With `bookingId` (front desk's per-row "Xử lý"), only that booking's panels show.
 */
export function ConflictResolver({ propertyId, bookingId }: { propertyId: Id<'properties'>; bookingId?: Id<'bookings'> }) {
  const data = useQuery(api.icalImport.dashboardForProperty, { propertyId });
  const resolved = useQuery(api.icalImport.resolvedConflicts, bookingId ? 'skip' : { propertyId });
  const sim = useQuery(api.otaSimulator.status, {});
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(null);
  if (data === undefined || sim === undefined || (!bookingId && resolved === undefined)) return <Spinner label="Đang tải cảnh báo…" />;
  if (data === null) return null;
  const listings = sim.enabled ? sim.listings : [];
  const tab = params.get('tab') === 'resolved' ? 'resolved' : 'open';
  const setTab = (next: 'open' | 'resolved') => setParams((prev) => { const p = new URLSearchParams(prev); if (next === 'open') p.delete('tab'); else p.set('tab', next); return p; }, { replace: true });

  const conflicts = bookingId ? data.conflicts.filter((c) => c.bookingA.bookingId === bookingId || c.bookingB.bookingId === bookingId) : data.conflicts;
  const card = (conflict: (typeof conflicts)[number]) => (
    <ConflictCard
      key={conflict.conflictId}
      propertyId={propertyId}
      unitId={conflict.unitId}
      unitName={conflict.unitName}
      unitSlug={conflict.unitSlug}
      overlapNights={conflict.overlapNights}
      sides={[
        { side: conflict.bookingA, freeUnits: conflict.availableUnitsForA },
        { side: conflict.bookingB, freeUnits: conflict.availableUnitsForB },
      ]}
      listings={listings}
    />
  );
  if (bookingId) return conflicts.length ? <div className="space-y-5">{conflicts.map(card)}</div> : <AllClear />;

  const rows = resolved ?? [];
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Trạng thái cảnh báo" className="inline-flex rounded-full border border-sky-100 bg-white p-1 shadow-sm">
        {([['open', `Chưa xử lý (${conflicts.length})`], ['resolved', `Đã xử lý (${rows.length})`]] as const).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${tab === key ? 'bg-[#0b2e4f] text-white' : 'text-slate-600 hover:bg-sky-50'}`}>{label}</button>
        ))}
      </div>

      {tab === 'open' ? (
        conflicts.length ? (
          <section className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm">
            <table className="w-full text-left text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Tên phòng</th><th className="p-3">Đêm trùng</th><th className="p-3">Booking</th><th className="p-3 text-right">Thao tác</th></tr></thead>
              <tbody>
                {conflicts.map((conflict) => {
                  const open = openId === conflict.conflictId;
                  return [
                    <tr key={conflict.conflictId} className="border-t border-slate-100">
                      <td className="min-w-48 p-3 font-bold text-[#10234a] !whitespace-normal">{conflict.unitName}</td>
                      <td className="p-3"><span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">{conflict.overlapNights.length} đêm · {conflict.overlapNights.map(shortDay).join(', ')}</span></td>
                      <td className="p-3 text-xs text-slate-600">{[conflict.bookingA, conflict.bookingB].map((b) => `${b.confirmationCode} (${sourceLabel(b.source)})`).join(' ↔ ')}</td>
                      <td className="p-3 text-right">
                        <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : conflict.conflictId)}
                          className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold ${open ? 'border border-slate-200 bg-white text-slate-700' : 'bg-red-600 text-white hover:bg-red-700'}`}>
                          {open ? 'Đóng' : 'Xử lý'}
                        </button>
                      </td>
                    </tr>,
                    open ? <tr key={`${conflict.conflictId}:panel`} className="bg-slate-50/60"><td colSpan={4} className="p-4 !whitespace-normal">{card(conflict)}</td></tr> : null,
                  ];
                })}
              </tbody>
            </table>
          </section>
        ) : <AllClear />
      ) : (
        <section className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Tên phòng</th><th className="p-3">Đêm trùng</th><th className="p-3">Booking</th><th className="p-3">Cách xử lý</th><th className="p-3">Người xử lý</th><th className="p-3">Thời gian</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row._id} className="border-t border-slate-100 align-top">
                    <td className="min-w-44 p-3 font-bold text-[#10234a] !whitespace-normal">{row.unitName}</td>
                    <td className="p-3">{shortDay(row.overlapStart)} → {shortDay(row.overlapEnd)}</td>
                    <td className="p-3 text-xs text-slate-600">{row.bookingCode}{row.otherBookingCode ? ` ↔ ${row.otherBookingCode}` : ''}</td>
                    <td className="min-w-56 p-3 !whitespace-normal"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{METHOD_LABEL[row.method]}</span><p className="mt-1 text-xs text-slate-600">{row.detail}{row.note ? ` — ${row.note}` : ''}</p></td>
                    <td className="p-3 font-semibold text-slate-700">{row.byName}</td>
                    <td className="p-3 text-xs text-slate-500">{new Date(row.at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  </tr>
                ))}
                {!rows.length ? <tr><td colSpan={6} className="p-8 text-center text-slate-400">Chưa có cảnh báo nào được xử lý.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function AllClear() {
  return (
    <section className="rounded-2xl border border-emerald-200 bg-white p-10 text-center shadow-sm">
      <ShieldCheck className="mx-auto h-10 w-10 text-emerald-600" />
      <h2 className="mt-3 text-lg font-extrabold text-[#10234a]">Không có booking trùng lịch</h2>
      <p className="mt-1 text-sm text-slate-500">Mọi đêm đang chỉ thuộc về một booking. Cảnh báo mới sẽ hiện ở đây sau mỗi lần đồng bộ iCal.</p>
    </section>
  );
}

function ConflictCard({ propertyId, unitId, unitName, unitSlug, overlapNights, sides, listings }: {
  propertyId: Id<'properties'>;
  unitId: Id<'units'>;
  unitName: string;
  unitSlug: string;
  overlapNights: string[];
  sides: Array<{ side: Side; freeUnits: Array<{ unitId: Id<'units'>; name: string }> }>;
  listings: Array<{ unitId: Id<'units'>; platform: 'airbnb' | 'booking'; active: boolean }>;
}) {
  const resolve = useMutation(api.icalImport.resolveConflict);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const flagged = sides.find((s) => s.side.syncConflict)?.side;
  const kept = flagged ? sides.find((s) => s.side.bookingId !== flagged.bookingId)?.side : undefined;

  async function run(task: () => Promise<unknown>, done: string) {
    setBusy(true);
    setMessage('');
    try {
      await task();
      setMessage(done);
    } catch (error) {
      setMessage(extractErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-red-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-red-50 px-5 py-4 text-red-800">
        <h2 className="flex items-center gap-2 font-extrabold"><AlertTriangle className="h-5 w-5" />{unitName}</h2>
        <span className="text-sm font-semibold">Trùng {overlapNights.length} đêm: {overlapNights.map((d) => `${d.slice(8)}/${d.slice(5, 7)}`).join(', ')}</span>
      </header>
      {flagged && kept ? (
        <p className="px-5 pt-4 text-sm text-slate-600">
          Gợi ý: giữ <strong>{kept.confirmationCode}</strong> ({sourceLabel(kept.source)}, có trước) và xử lý <strong>{flagged.confirmationCode}</strong> ({sourceLabel(flagged.source)}, đồng bộ về sau).
        </p>
      ) : null}
      <div className="grid gap-4 p-5 md:grid-cols-2">
        {sides.map(({ side, freeUnits }) => (
          <BookingSide
            key={side.bookingId}
            propertyId={propertyId}
            unitId={unitId}
            unitSlug={unitSlug}
            side={side}
            freeUnits={freeUnits}
            recommended={flagged?.bookingId === side.bookingId}
            otherId={sides.find((s) => s.side.bookingId !== side.bookingId)!.side.bookingId}
            note={note}
            listing={listings.find((l) => l.unitId === unitId && l.platform === PLATFORM_BY_LABEL[sourceLabel(side.source)])}
            busy={busy}
            run={run}
          />
        ))}
      </div>
      <div className="px-5 pb-1">
        <label className="block"><span className="field-label">Ghi chú cách xử lý (lưu vào lịch sử)</span>
          <input className="field-input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="VD: đã gọi khách, đổi sang căn khác cùng giá" /></label>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-red-100 px-5 py-3">
        <span className="text-sm text-slate-600" role="status">{message}</span>
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={() => void run(
            () => { const target = flagged ?? sides[1].side; return resolve({ bookingId: target.bookingId, resolutionType: 'acknowledge', note: note || undefined, conflictWith: sides.find((s) => s.side.bookingId !== target.bookingId)!.side.bookingId }); },
            'Đã đánh dấu đã xử lý.',
          )}
        >
          <CheckCircle2 className="h-4 w-4" />Đánh dấu đã xử lý
        </button>
      </footer>
    </article>
  );
}

function BookingSide({ propertyId, unitId, unitSlug, side, freeUnits, recommended, otherId, note, listing, busy, run }: {
  propertyId: Id<'properties'>;
  unitId: Id<'units'>;
  unitSlug: string;
  side: Side;
  freeUnits: Array<{ unitId: Id<'units'>; name: string }>;
  recommended: boolean;
  otherId: Id<'bookings'>;
  note: string;
  listing?: { platform: 'airbnb' | 'booking'; active: boolean };
  busy: boolean;
  run: (task: () => Promise<unknown>, done: string) => Promise<void>;
}) {
  const resolve = useMutation(api.icalImport.resolveConflict);
  const syncFeed = useAction(api.icalImport.syncFeedNow);
  const [target, setTarget] = useState<string>('');
  const external = isExternal(side);
  const label = sourceLabel(side.source);

  return (
    <section className={`rounded-xl border p-4 ${recommended ? 'border-orange-300 bg-orange-50/40' : 'border-slate-200'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-extrabold text-slate-900">{side.confirmationCode}</span>
        <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${external ? 'bg-slate-800 text-white' : 'bg-blue-50 text-blue-700'}`}>{label}</span>
        {recommended ? <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700">Nên xử lý</span> : null}
      </div>
      <p className="mt-2 text-sm text-slate-700">{external ? 'Khách đặt qua ' + label : side.guestName}</p>
      <p className="text-sm text-slate-500">{stayRange(side.checkIn, side.checkOut)} · {side.nights} đêm · {STATUS_LABEL[side.status] ?? side.status}</p>

      {external ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {listing ? (
            <a className="btn-secondary !px-3 !py-1.5 text-xs" href={`/sim/${listing.platform}?unit=${encodeURIComponent(unitSlug)}`} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />Xử lý trên {label}
            </a>
          ) : <span className="text-xs text-slate-500">Xử lý trên trang quản lý của {label}.</span>}
          <button
            type="button"
            className="btn-secondary !px-3 !py-1.5 text-xs"
            disabled={busy}
            onClick={() => void run(async () => {
              const r = await syncFeed({ propertyId, unitId, label });
              if (!r.ok) throw new Error(`Đồng bộ lỗi: ${r.error}`);
            }, `Đã đồng bộ lại lịch ${label}.`)}
          >
            <RefreshCw className="h-3.5 w-3.5" />Đồng bộ lại
          </button>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {freeUnits.length ? (
          <>
            <select className="field-input !w-auto !py-1.5 text-xs" value={target} onChange={(e) => setTarget(e.target.value)} aria-label={`Căn trống cho ${side.confirmationCode}`}>
              <option value="">Chọn căn còn trống…</option>
              {freeUnits.map((u) => <option key={u.unitId} value={u.unitId}>{u.name}</option>)}
            </select>
            <button
              type="button"
              className="btn-secondary !px-3 !py-1.5 text-xs"
              disabled={busy || !target}
              onClick={() => void run(
                () => resolve({ bookingId: side.bookingId, resolutionType: 'move_unit', targetUnitId: target as Id<'units'>, note: note || undefined, conflictWith: otherId }),
                `Đã chuyển ${side.confirmationCode} sang căn mới, giữ nguyên giá.`,
              )}
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />Chuyển căn
            </button>
          </>
        ) : <span className="text-xs text-slate-500">Không còn căn nào trống đủ các đêm này.</span>}
        {!external ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`Hủy booking ${side.confirmationCode}? Hãy báo khách trước khi hủy.`)) return;
              void run(() => resolve({ bookingId: side.bookingId, resolutionType: 'cancel_booking', note: note || undefined, conflictWith: otherId }), `Đã hủy ${side.confirmationCode}.`);
            }}
          >
            <XCircle className="h-3.5 w-3.5" />Hủy booking
          </button>
        ) : null}
      </div>
    </section>
  );
}
