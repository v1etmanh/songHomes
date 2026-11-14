import { useState } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { AlertTriangle, ArrowRightLeft, CheckCircle2, ExternalLink, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { extractErrorMessage } from './ErrorMessage';
import { Spinner } from './Spinner';

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
const MANUAL_LABEL: Record<string, string> = { zalo: 'Zalo', facebook: 'Facebook', phone: 'Điện thoại', walk_in: 'Khách trực tiếp', other: 'Khác' };
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

/** Double-booking resolution: both sides of every overlap, with the actions each side allows. */
export function ConflictResolver({ propertyId }: { propertyId: Id<'properties'> }) {
  const data = useQuery(api.icalImport.dashboardForProperty, { propertyId });
  const sim = useQuery(api.otaSimulator.status, {});
  if (data === undefined || sim === undefined) return <Spinner label="Đang tải cảnh báo…" />;
  if (data === null) return null;
  const listings = sim.enabled ? sim.listings : [];

  if (!data.conflicts.length) {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-white p-10 text-center shadow-sm">
        <ShieldCheck className="mx-auto h-10 w-10 text-emerald-600" />
        <h2 className="mt-3 text-lg font-extrabold text-[#10234a]">Không có booking trùng lịch</h2>
        <p className="mt-1 text-sm text-slate-500">Mọi đêm đang chỉ thuộc về một booking. Cảnh báo mới sẽ hiện ở đây sau mỗi lần đồng bộ iCal.</p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-sky-100 bg-white p-5 text-sm leading-6 text-slate-600 shadow-sm">
        <h2 className="font-extrabold text-[#10234a]">Cách xử lý</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Chọn booking được giữ: thường là bên đặt trước (không bị gắn cờ) hoặc bên đã thanh toán.</li>
          <li>Booking nội bộ (Website, Zalo, điện thoại…): <strong>chuyển sang căn còn trống</strong> hoặc <strong>hủy</strong> ngay tại đây.</li>
          <li>Booking từ Airbnb/Booking.com: OpenStays không sửa được bên đó. Đổi ngày, chuyển chỗ hoặc hủy trên nền tảng, rồi bấm <strong>Đồng bộ lại</strong>; cảnh báo tự biến mất khi hết trùng. Nếu đã sắp xếp cho khách OTA ở căn khác, dùng <strong>Chuyển căn</strong>.</li>
          <li><strong>Đánh dấu đã xử lý</strong> chỉ tắt cảnh báo khi đã giải quyết bên ngoài và đang chờ lần đồng bộ sau.</li>
        </ol>
      </section>
      {data.conflicts.map((conflict) => (
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
      ))}
    </div>
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
            listing={listings.find((l) => l.unitId === unitId && l.platform === PLATFORM_BY_LABEL[sourceLabel(side.source)])}
            busy={busy}
            run={run}
          />
        ))}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-red-100 px-5 py-3">
        <span className="text-sm text-slate-600" role="status">{message}</span>
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={() => void run(
            () => resolve({ bookingId: (flagged ?? sides[1].side).bookingId, resolutionType: 'acknowledge' }),
            'Đã đánh dấu đã xử lý.',
          )}
        >
          <CheckCircle2 className="h-4 w-4" />Đánh dấu đã xử lý
        </button>
      </footer>
    </article>
  );
}

function BookingSide({ propertyId, unitId, unitSlug, side, freeUnits, recommended, listing, busy, run }: {
  propertyId: Id<'properties'>;
  unitId: Id<'units'>;
  unitSlug: string;
  side: Side;
  freeUnits: Array<{ unitId: Id<'units'>; name: string }>;
  recommended: boolean;
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
      <p className="text-sm text-slate-500">{side.checkIn} → {side.checkOut} · {side.nights} đêm · {STATUS_LABEL[side.status] ?? side.status}</p>

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
                () => resolve({ bookingId: side.bookingId, resolutionType: 'move_unit', targetUnitId: target as Id<'units'> }),
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
              void run(() => resolve({ bookingId: side.bookingId, resolutionType: 'cancel_booking' }), `Đã hủy ${side.confirmationCode}.`);
            }}
          >
            <XCircle className="h-3.5 w-3.5" />Hủy booking
          </button>
        ) : null}
      </div>
    </section>
  );
}
