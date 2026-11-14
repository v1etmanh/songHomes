import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { ArrowLeft, ArrowRight, CalendarPlus, Copy, RefreshCw, Shuffle, Zap } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { addDays } from '../../shared/pricing';
import { extractErrorMessage } from '../components/ErrorMessage';
import { Spinner } from '../components/Spinner';

type Platform = 'airbnb' | 'booking';

const THEME: Record<Platform, { name: string; tagline: string; header: string; accent: string; soft: string; bar: string }> = {
  airbnb: {
    name: 'Airbnb',
    tagline: 'Trang quản lý chủ nhà (mô phỏng)',
    header: 'bg-white border-b border-rose-100',
    accent: 'bg-rose-500 hover:bg-rose-600 text-white',
    soft: 'bg-rose-50 text-rose-700',
    bar: 'bg-rose-400',
  },
  booking: {
    name: 'Booking.com',
    tagline: 'Extranet chỗ nghỉ (mô phỏng)',
    header: 'bg-blue-900 text-white',
    accent: 'bg-blue-700 hover:bg-blue-800 text-white',
    soft: 'bg-blue-50 text-blue-800',
    bar: 'bg-blue-600',
  },
};

function SimulatorBadge() {
  return <span className="rounded-full bg-amber-300 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-amber-950">Mô phỏng · không phải trang thật</span>;
}

/** /sim — explains the iCal flow and links the two simulated platforms. */
export function OtaSimulatorLanding() {
  const status = useQuery(api.otaSimulator.status, {});
  const connect = useMutation(api.otaSimulator.connect);
  const [message, setMessage] = useState('');
  if (status === undefined) return <div className="p-8"><Spinner label="Đang tải…" /></div>;
  if (!status.enabled) return <Disabled />;
  const steps = [
    ['1', 'Nền tảng phát link iCal', 'Mỗi phòng trên Airbnb và Booking.com có một link .ics liệt kê các ngày đã bị đặt.'],
    ['2', 'OpenStays kéo lịch về', 'Tự động mỗi 30 phút, hoặc ngay khi nhân viên bấm "Đồng bộ ngay".'],
    ['3', 'Phát hiện trùng lịch', 'Đêm đã có booking nội bộ hoặc kênh khác sẽ được gắn cờ, không ghi đè.'],
    ['4', 'Báo nhân viên', 'Cảnh báo vào hộp thư trong app và email của nhân viên.'],
  ];
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-5 py-10">
        <SimulatorBadge />
        <h1 className="mt-4 text-3xl font-extrabold text-[#10234a]">Trạm mô phỏng nền tảng đặt phòng</h1>
        <p className="mt-2 max-w-3xl text-slate-600">Hai nền tảng dưới đây chạy ngay trong hệ thống để trình diễn đồng bộ lịch qua iCal cho {status.connected ? `${status.listings.length / 2} cơ sở Sóng Homestay` : 'Sóng Homestay'}. Thêm, hủy hoặc dời đặt phòng ở đây, rồi sang OpenStays đồng bộ để xem lịch cập nhật và cảnh báo trùng.</p>
        <ol className="mt-8 grid gap-4 md:grid-cols-4">
          {steps.map(([n, title, text]) => (
            <li key={n} className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[#10234a] text-sm font-bold text-white">{n}</span>
              <h2 className="mt-3 font-bold text-[#10234a]">{title}</h2>
              <p className="mt-1 text-sm text-slate-600">{text}</p>
            </li>
          ))}
        </ol>
        {!status.connected ? (
          <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-amber-900">Chưa kết nối. Kết nối sẽ tạo listing cho từng cơ sở trên hai nền tảng và gắn link iCal vào OpenStays.</p>
            <button type="button" className="btn-primary mt-3" onClick={() => void connect({}).then(() => setMessage('Đã kết nối.')).catch((e) => setMessage(extractErrorMessage(e)))}>Kết nối nền tảng giả lập</button>
            {message ? <p className="mt-2 text-sm">{message}</p> : null}
          </div>
        ) : (
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {(Object.keys(THEME) as Platform[]).map((platform) => (
              <Link key={platform} to={`/sim/${platform}`} className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <span className={`inline-block rounded-lg px-3 py-1 text-sm font-extrabold ${THEME[platform].soft}`}>{THEME[platform].name}</span>
                <p className="mt-3 text-lg font-bold text-slate-800">{THEME[platform].tagline}</p>
                <p className="mt-1 text-sm text-slate-500">{status.listings.filter((l) => l.platform === platform).length} listing · mỗi listing một link iCal</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-[#10234a]">Mở trang quản lý <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
              </Link>
            ))}
          </div>
        )}
        <Link to="/admin/ical" className="btn-secondary mt-8">Sang OpenStays · Đồng bộ iCal</Link>
      </div>
    </div>
  );
}

function Disabled() {
  return (
    <div className="mx-auto max-w-xl p-10 text-center">
      <h1 className="text-xl font-bold text-[#10234a]">Trạm mô phỏng đang tắt</h1>
      <p className="mt-2 text-slate-600">Chỉ bật trên bản demo (DEMO_MODE hoặc ALLOW_OTA_SIMULATOR).</p>
    </div>
  );
}

/** /sim/:platform — host dashboard of one simulated platform. */
export function OtaSimulatorPlatformPage() {
  const params = useParams();
  const platform: Platform = params.platform === 'booking' ? 'booking' : 'airbnb';
  const [search] = useSearchParams();
  const focusSlug = search.get('unit');
  const status = useQuery(api.otaSimulator.status, {});
  const view = useQuery(api.otaSimulator.platformView, status?.enabled ? { platform } : 'skip');
  const randomize = useMutation(api.otaSimulator.randomizeNow);
  const [message, setMessage] = useState('');
  const theme = THEME[platform];

  useEffect(() => {
    if (focusSlug && view) document.getElementById(`listing-${focusSlug}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focusSlug, view]);

  if (status === undefined) return <div className="p-8"><Spinner label="Đang tải…" /></div>;
  if (!status.enabled) return <Disabled />;
  if (view === undefined) return <div className="p-8"><Spinner label={`Đang tải ${theme.name}…`} /></div>;

  async function churn(mode: 'daily' | 'conflict') {
    setMessage('');
    try {
      const t = await randomize({ mode });
      setMessage(`Đã thêm ${t.added}, hủy ${t.cancelled}, dời ${t.moved} đặt phòng (${t.conflicts} cố ý trùng lịch) trên cả hai nền tảng. Sang OpenStays bấm "Đồng bộ ngay" để kéo về.`);
    } catch (error) {
      setMessage(extractErrorMessage(error));
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className={theme.header}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <Link to="/sim" className="rounded-full p-2 hover:bg-black/5" aria-label="Về trạm mô phỏng"><ArrowLeft className="h-5 w-5" /></Link>
            <div>
              <p className="text-xl font-extrabold">{theme.name}</p>
              <p className="text-xs opacity-80">{theme.tagline}</p>
            </div>
            <SimulatorBadge />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm" onClick={() => void churn('daily')}><Shuffle className="h-4 w-4" />Sinh thay đổi ngẫu nhiên</button>
            <button type="button" className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm" onClick={() => void churn('conflict')}><Zap className="h-4 w-4" />Tạo xung đột</button>
            <Link to="/admin/ical" className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${theme.accent}`}><RefreshCw className="h-4 w-4" />Sang OpenStays đồng bộ ngay</Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-5 px-5 py-6">
        {message ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</p> : null}
        {!view.connected ? <p className="rounded-xl bg-amber-50 p-4 text-amber-900">Chưa kết nối. <Link className="font-bold underline" to="/sim">Về trạm mô phỏng</Link> để kết nối.</p> : null}
        {view.listings.map((listing) => (
          <ListingCard key={listing.listingId} listing={listing} today={view.today} platform={platform} focused={listing.unitSlug === focusSlug} />
        ))}
      </main>
    </div>
  );
}

type ListingView = {
  listingId: Id<'otaSimListings'>;
  active: boolean;
  unitName: string;
  unitSlug: string;
  photoUrl: string | null;
  feedUrl: string;
  reservations: Array<{ reservationId: Id<'otaSimReservations'>; uid: string; checkIn: string; checkOut: string; guestLabel: string; status: 'active' | 'cancelled'; origin: string }>;
};

function ListingCard({ listing, today, platform, focused }: { listing: ListingView; today: string; platform: Platform; focused: boolean }) {
  const theme = THEME[platform];
  const add = useMutation(api.otaSimulator.addReservation);
  const cancel = useMutation(api.otaSimulator.cancelReservation);
  const move = useMutation(api.otaSimulator.moveReservation);
  const toggle = useMutation(api.otaSimulator.setListingActive);
  const [checkIn, setCheckIn] = useState(addDays(today, 3));
  const [checkOut, setCheckOut] = useState(addDays(today, 5));
  const [guest, setGuest] = useState('');
  const [message, setMessage] = useState('');
  const active = listing.reservations.filter((r) => r.status === 'active');
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, i));

  async function attempt(task: () => Promise<unknown>, ok?: string) {
    setMessage('');
    try {
      await task();
      if (ok) setMessage(ok);
    } catch (error) {
      setMessage(extractErrorMessage(error));
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await attempt(() => add({ listingId: listing.listingId, checkIn, checkOut, guestLabel: guest || undefined }), 'Đã thêm đặt phòng. Link iCal đã cập nhật.');
    setGuest('');
  }

  return (
    <article id={`listing-${listing.unitSlug}`} className={`scroll-mt-28 overflow-hidden rounded-2xl border bg-white shadow-sm ${focused ? 'border-amber-400 ring-4 ring-amber-200' : 'border-slate-200'}`}>
      <div className="grid gap-0 md:grid-cols-[14rem_minmax(0,1fr)]">
        {listing.photoUrl ? <img src={listing.photoUrl} alt={listing.unitName} className="h-full max-h-56 w-full object-cover" /> : <div className="bg-slate-100" />}
        <div className="min-w-0 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">{listing.unitName}</h2>
              <p className={`mt-1 text-xs font-bold ${listing.active ? 'text-emerald-700' : 'text-red-600'}`}>{listing.active ? 'Đang hiển thị' : 'Đã tạm ẩn — link iCal trả lỗi 404'}</p>
            </div>
            <button type="button" className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold" onClick={() => void attempt(() => toggle({ listingId: listing.listingId, active: !listing.active }))}>
              {listing.active ? 'Tạm ẩn listing' : 'Hiển thị lại'}
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 p-2 text-xs">
            <span className="font-bold text-slate-600">Link iCal xuất:</span>
            <code className="min-w-0 flex-1 truncate text-slate-700">{listing.feedUrl}</code>
            <button type="button" className="rounded-md bg-white px-2 py-1 font-semibold shadow-sm" onClick={() => void navigator.clipboard?.writeText(listing.feedUrl)}><Copy className="inline h-3.5 w-3.5" /> Copy</button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <div className="grid min-w-[40rem] grid-cols-[repeat(30,minmax(0,1fr))] gap-0.5">
              {days.map((day) => {
                const booked = active.find((r) => r.checkIn <= day && r.checkOut > day);
                return (
                  <div key={day} title={booked ? `${booked.guestLabel} · ${booked.checkIn} → ${booked.checkOut}` : `${day} trống`} className="text-center">
                    <div className={`h-7 rounded ${booked ? theme.bar : 'bg-slate-100'}`} />
                    <span className="text-[10px] text-slate-500">{day.slice(8)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <ul className="mt-4 space-y-2">
            {listing.reservations.map((r) => (
              <li key={r.reservationId} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${r.status === 'cancelled' ? 'border-slate-100 text-slate-400 line-through' : 'border-slate-200'}`}>
                <span><strong>{r.guestLabel}</strong> · {r.checkIn} → {r.checkOut}{r.origin === 'random' ? <span className="ml-2 rounded bg-violet-50 px-1.5 text-xs text-violet-700 no-underline">ngẫu nhiên</span> : null}</span>
                {r.status === 'active' ? (
                  <span className="flex gap-2 text-xs font-bold">
                    <button type="button" className="text-slate-600" onClick={() => void attempt(() => move({ reservationId: r.reservationId, checkIn: addDays(r.checkIn, -1), checkOut: addDays(r.checkOut, -1) }))}>← Dời 1 ngày</button>
                    <button type="button" className="text-slate-600" onClick={() => void attempt(() => move({ reservationId: r.reservationId, checkIn: addDays(r.checkIn, 1), checkOut: addDays(r.checkOut, 1) }))}>Dời 1 ngày →</button>
                    <button type="button" className="text-red-600" onClick={() => void attempt(() => cancel({ reservationId: r.reservationId }))}>Hủy</button>
                  </span>
                ) : <span className="text-xs">Đã hủy</span>}
              </li>
            ))}
            {!listing.reservations.length ? <li className="text-sm text-slate-400">Chưa có đặt phòng.</li> : null}
          </ul>

          <form onSubmit={submit} className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.4fr_auto]">
            <label><span className="field-label">Nhận phòng</span><input type="date" className="field-input" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} required /></label>
            <label><span className="field-label">Trả phòng</span><input type="date" className="field-input" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} required /></label>
            <label><span className="field-label">Tên khách (tuỳ chọn)</span><input className="field-input" value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="Khách ngẫu nhiên" /></label>
            <button type="submit" className={`self-end rounded-lg px-4 py-2 text-sm font-bold ${theme.accent}`}><CalendarPlus className="mr-1 inline h-4 w-4" />Thêm</button>
          </form>
          {message ? <p role="status" className="mt-2 text-sm text-slate-600">{message}</p> : null}
        </div>
      </div>
    </article>
  );
}
