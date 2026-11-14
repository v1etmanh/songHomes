import { useState } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { AlertTriangle, CheckCircle2, Clock3, Copy, ExternalLink, Inbox, Mail, RefreshCw, Shuffle, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { extractErrorMessage } from './ErrorMessage';
import { Spinner } from './Spinner';

const SYNC_INTERVAL_MS = 30 * 60 * 1000;
const PLATFORM_BY_LABEL: Record<string, 'airbnb' | 'booking'> = { Airbnb: 'airbnb', 'Booking.com': 'booking' };

function formatTime(ts: number | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

function useBusy() {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  async function run(key: string, task: () => Promise<string | void>) {
    setBusy(key);
    setMessage('');
    try {
      const text = await task();
      if (text) setMessage(text);
    } catch (error) {
      setMessage(extractErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }
  return { busy, message, run };
}

export function IcalSyncHub({ propertyId }: { propertyId: Id<'properties'> }) {
  const overview = useQuery(api.icalAlerts.feedOverview, { propertyId });
  const sim = useQuery(api.otaSimulator.status, {});
  const runs = useQuery(api.icalAlerts.listRuns, { propertyId });
  const syncAllNow = useAction(api.icalImport.syncNow);
  const syncFeed = useAction(api.icalImport.syncFeedNow);
  const connect = useMutation(api.otaSimulator.connect);
  const setListingActive = useMutation(api.otaSimulator.setListingActive);
  const { busy, message, run } = useBusy();

  if (overview === undefined || sim === undefined || runs === undefined) return <Spinner label="Đang tải trạng thái đồng bộ…" />;

  const simListings = sim.enabled ? sim.listings : [];
  const listingForUrl = (url: string) => simListings.find((l) => l.feedUrl === url);
  const totalFeeds = overview.reduce((sum, unit) => sum + unit.feeds.length, 0);
  const failing = overview.flatMap((u) => u.feeds).filter((f) => f.lastRun && !f.lastRun.ok).length;
  const nextCron = runs.lastCronAt ? runs.lastCronAt + SYNC_INTERVAL_MS : null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-extrabold text-[#10234a]">Đồng bộ lịch OTA qua iCal</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1"><Clock3 className="h-4 w-4" />Tự động mỗi 30 phút</span>
              <span>Lần tự động gần nhất: <strong className="text-slate-700">{formatTime(runs.lastCronAt)}</strong></span>
              <span>Lần kế tiếp dự kiến: <strong className="text-slate-700">{nextCron ? formatTime(nextCron) : 'trong vòng 30 phút'}</strong></span>
            </p>
            <p className="mt-1 text-sm text-slate-500">{totalFeeds} link iCal đang theo dõi{failing ? <span className="font-bold text-red-600"> · {failing} link đang lỗi</span> : null}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {sim.enabled ? <a className="btn-secondary" href="/sim" target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Nền tảng giả lập</a> : null}
            <button
              type="button"
              className="btn-primary"
              disabled={busy !== null || totalFeeds === 0}
              onClick={() => void run('all', async () => {
                const r = await syncAllNow({ propertyId });
                return `Đã đồng bộ ${r.feedsSynced} link (${r.failedFeeds} lỗi): mới ${r.inserted}, cập nhật ${r.updated}, hủy ${r.removed}, xung đột ${r.conflicts}.`;
              })}
            >
              <RefreshCw className={`h-4 w-4 ${busy === 'all' ? 'animate-spin' : ''}`} />Đồng bộ tất cả ngay
            </button>
          </div>
        </div>
        {sim.enabled && !sim.connected ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <span>Chưa kết nối nền tảng giả lập. Kết nối sẽ tạo link iCal Airbnb và Booking.com (mô phỏng) cho từng cơ sở.</span>
            <button type="button" className="btn-primary" disabled={busy !== null} onClick={() => void run('connect', async () => {
              const r = await connect({});
              return `Đã kết nối ${r.listings} link iCal giả lập. Bấm "Đồng bộ tất cả ngay" để kéo dữ liệu về.`;
            })}>Kết nối nền tảng giả lập</button>
          </div>
        ) : null}
        {message ? <p role="status" className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{message}</p> : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {overview.map((unit) => (
          <article key={unit.unitId} className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
            <h3 className="font-extrabold text-[#10234a]">{unit.name}</h3>
            {unit.feeds.length === 0 ? <p className="mt-3 text-sm text-slate-400">Chưa có link iCal.</p> : null}
            <div className="mt-3 space-y-3">
              {unit.feeds.map((feed) => {
                const listing = listingForUrl(feed.url);
                const platform = PLATFORM_BY_LABEL[feed.label];
                const key = `${unit.unitId}:${feed.label}`;
                const state = !feed.lastRun ? 'idle' : feed.lastRun.ok ? 'ok' : 'error';
                return (
                  <div key={feed.url} className="rounded-xl border border-slate-100 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-md px-2 py-0.5 text-xs font-bold text-white ${platform === 'airbnb' ? 'bg-rose-500' : platform === 'booking' ? 'bg-blue-800' : 'bg-slate-500'}`}>{feed.label}</span>
                        {state === 'ok' ? <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Đã đồng bộ</span> : null}
                        {state === 'error' ? <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600"><AlertTriangle className="h-4 w-4" />Lỗi đồng bộ</span> : null}
                        {state === 'idle' ? <span className="text-xs font-bold text-slate-400">Chưa đồng bộ</span> : null}
                      </div>
                      <span className="text-xs text-slate-500">{formatTime(feed.lastSyncedAt)}</span>
                    </div>
                    {feed.lastRun?.ok ? (
                      <p className="mt-2 text-xs text-slate-600">Mới {feed.lastRun.inserted} · Cập nhật {feed.lastRun.updated} · Hủy {feed.lastRun.removed} · <span className={feed.lastRun.conflicts ? 'font-bold text-red-600' : ''}>Xung đột {feed.lastRun.conflicts}</span></p>
                    ) : null}
                    {feed.lastRun && !feed.lastRun.ok ? <p className="mt-2 text-xs text-red-600">{feed.lastRun.error}</p> : null}
                    {listing && !listing.active ? <p className="mt-2 text-xs font-semibold text-amber-700">Listing giả lập đang tắt nên link trả 404.</p> : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 disabled:opacity-50" disabled={busy !== null} onClick={() => void run(key, async () => {
                        const r = await syncFeed({ propertyId, unitId: unit.unitId, label: feed.label });
                        return r.ok ? `${unit.name} · ${feed.label}: mới ${r.inserted}, cập nhật ${r.updated}, hủy ${r.removed}, xung đột ${r.conflicts}.` : `${unit.name} · ${feed.label}: lỗi ${r.error}`;
                      })}>
                        <RefreshCw className={`mr-1 inline h-3.5 w-3.5 ${busy === key ? 'animate-spin' : ''}`} />Đồng bộ ngay
                      </button>
                      {listing ? (
                        <a className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700" href={`/sim/${listing.platform}?unit=${encodeURIComponent(unit.slug)}`} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-1 inline h-3.5 w-3.5" />Mở trên {feed.label}
                        </a>
                      ) : null}
                      <button type="button" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700" onClick={() => void navigator.clipboard?.writeText(feed.url)}>
                        <Copy className="mr-1 inline h-3.5 w-3.5" />Copy link
                      </button>
                      {listing ? (
                        <button type="button" className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800" disabled={busy !== null} onClick={() => void run(`toggle:${listing.listingId}`, async () => {
                          await setListingActive({ listingId: listing.listingId, active: !listing.active });
                        })}>
                          {listing.active ? 'Giả lập link lỗi' : 'Bật lại link'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]">
        <AlertInbox propertyId={propertyId} />
        <div className="space-y-5">
          <AlertSettings propertyId={propertyId} />
          {sim.enabled && sim.connected ? <SimulationControls /> : null}
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm">
        <h2 className="p-5 font-extrabold text-[#10234a]">Lịch sử đồng bộ</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="p-3">Thời gian</th><th className="p-3">Cơ sở</th><th className="p-3">Nguồn</th><th className="p-3">Kiểu</th><th className="p-3">Kết quả</th></tr>
            </thead>
            <tbody>
              {runs.runs.map((r) => (
                <tr key={r._id} className="border-t border-slate-100">
                  <td className="p-3">{formatTime(r.ts)}</td>
                  <td className="p-3">{r.unitName}</td>
                  <td className="p-3">{r.label}</td>
                  <td className="p-3">{r.trigger === 'cron' ? 'Tự động' : 'Thủ công'}</td>
                  <td className="p-3">{r.ok
                    ? <span className="text-slate-700">Mới {r.inserted} · Cập nhật {r.updated} · Hủy {r.removed}{r.newConflicts ? <strong className="text-red-600"> · {r.newConflicts} xung đột mới</strong> : null}</span>
                    : <span className="font-semibold text-red-600">Lỗi: {r.error}</span>}</td>
                </tr>
              ))}
              {!runs.runs.length ? <tr><td colSpan={5} className="p-8 text-center text-slate-400">Chưa có lần đồng bộ nào.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const KIND_STYLE: Record<string, { label: string; className: string }> = {
  sync_failed: { label: 'Đồng bộ lỗi', className: 'bg-red-100 text-red-700' },
  sync_recovered: { label: 'Đã khôi phục', className: 'bg-emerald-100 text-emerald-700' },
  conflict: { label: 'Trùng lịch', className: 'bg-orange-100 text-orange-700' },
};

function AlertInbox({ propertyId }: { propertyId: Id<'properties'> }) {
  const inbox = useQuery(api.icalAlerts.inbox, { propertyId });
  const markRead = useMutation(api.icalAlerts.markRead);
  const markAllRead = useMutation(api.icalAlerts.markAllRead);
  if (inbox === undefined) return <Spinner label="Đang tải hộp thư…" />;
  return (
    <section className="rounded-2xl border border-sky-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <h2 className="flex items-center gap-2 font-extrabold text-[#10234a]"><Inbox className="h-5 w-5" />Hộp thư cảnh báo{inbox.unread ? <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">{inbox.unread} chưa đọc</span> : null}</h2>
        {inbox.unread ? <button type="button" className="text-sm font-bold text-blue-700" onClick={() => void markAllRead({ propertyId })}>Đánh dấu đã đọc tất cả</button> : null}
      </div>
      <p className="mx-5 mb-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">Mỗi cảnh báo cũng được gửi email tới danh sách nhân viên bên cạnh. Trên bản demo, email chỉ được ghi log; nội dung dưới đây đúng là email sẽ gửi đi.</p>
      <ul className="divide-y divide-slate-100">
        {inbox.alerts.map((alert) => {
          const style = KIND_STYLE[alert.kind];
          const unread = alert.readAt === undefined;
          return (
            <li key={alert._id} className={`p-4 ${unread ? 'bg-sky-50/50' : ''}`}>
              <details>
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${style.className}`}>{style.label}</span>
                    <span className={`text-sm ${unread ? 'font-extrabold text-slate-900' : 'font-semibold text-slate-600'}`}>{alert.subject}</span>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Mail className="h-3.5 w-3.5" />Gửi tới: {alert.recipients.join(', ') || '(chưa có email)'} · {formatTime(alert.createdAt)}</p>
                </summary>
                <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-100 bg-white p-3 font-sans text-sm text-slate-700">{alert.body}</pre>
                <div className="mt-2 flex gap-3 text-xs font-bold">
                  {alert.kind === 'conflict' ? <Link className="text-red-700" to="/admin/conflicts">Xử lý tại trang Cảnh báo</Link> : null}
                  {unread ? <button type="button" className="text-blue-700" onClick={() => void markRead({ alertId: alert._id })}>Đánh dấu đã đọc</button> : null}
                </div>
              </details>
            </li>
          );
        })}
        {!inbox.alerts.length ? <li className="p-8 text-center text-sm text-slate-400">Chưa có cảnh báo nào.</li> : null}
      </ul>
    </section>
  );
}

function AlertSettings({ propertyId }: { propertyId: Id<'properties'> }) {
  const settings = useQuery(api.icalAlerts.getSettings, { propertyId });
  if (settings === undefined) return <Spinner />;
  return <AlertSettingsForm key={settings.alertEmails.join(',') + settings.randomizerEnabled + settings.conflictRate} propertyId={propertyId} settings={settings} />;
}

function AlertSettingsForm({ propertyId, settings }: {
  propertyId: Id<'properties'>;
  settings: { alertEmails: string[]; randomizerEnabled: boolean; conflictRate: number; fallbackEmail: string; lastRandomizedOn: string | null };
}) {
  const update = useMutation(api.icalAlerts.updateSettings);
  const [emails, setEmails] = useState(settings.alertEmails.join('\n'));
  const [randomizer, setRandomizer] = useState(settings.randomizerEnabled);
  const [rate, setRate] = useState(String(settings.conflictRate));
  const { busy, message, run } = useBusy();
  return (
    <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
      <h2 className="font-extrabold text-[#10234a]">Người nhận cảnh báo</h2>
      <label className="mt-3 block">
        <span className="field-label">Email nhân viên (mỗi dòng một email)</span>
        <textarea className="field-input min-h-24" placeholder={settings.fallbackEmail} value={emails} onChange={(e) => setEmails(e.target.value)} />
      </label>
      <p className="mt-1 text-xs text-slate-500">Để trống thì gửi tới email cơ sở: {settings.fallbackEmail || '(chưa cấu hình)'}</p>
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={randomizer} onChange={(e) => setRandomizer(e.target.checked)} />
        Tự sinh thay đổi giả lập mỗi ngày (00:30)
      </label>
      <label className="mt-3 block">
        <span className="field-label">Tỉ lệ đặt phòng giả lập gây trùng lịch</span>
        <select className="field-input" value={rate} onChange={(e) => setRate(e.target.value)}>
          {[0, 0.2, 0.35, 0.5, 0.8].map((value) => <option key={value} value={value}>{Math.round(value * 100)}%</option>)}
        </select>
      </label>
      {settings.lastRandomizedOn ? <p className="mt-2 text-xs text-slate-500">Lần tự sinh gần nhất: {settings.lastRandomizedOn}</p> : null}
      <div className="mt-4 flex items-center justify-end gap-3">
        {message ? <span className="text-xs text-slate-600">{message}</span> : null}
        <button type="button" className="btn-primary" disabled={busy !== null} onClick={() => void run('save', async () => {
          await update({ propertyId, alertEmails: emails.split(/[\n,;]/), randomizerEnabled: randomizer, conflictRate: Number(rate) });
          return 'Đã lưu';
        })}>Lưu</button>
      </div>
    </section>
  );
}

function SimulationControls() {
  const randomize = useMutation(api.otaSimulator.randomizeNow);
  const reset = useMutation(api.otaSimulator.resetSimulation);
  const { busy, message, run } = useBusy();
  const describe = (t: { added: number; cancelled: number; moved: number; conflicts: number }) =>
    `Phía nền tảng: thêm ${t.added}, hủy ${t.cancelled}, dời ${t.moved}, cố ý trùng ${t.conflicts}. Bấm "Đồng bộ ngay" để kéo về.`;
  return (
    <section className="rounded-2xl border border-violet-100 bg-white p-5 shadow-sm">
      <h2 className="font-extrabold text-[#10234a]">Giả lập thay đổi trên nền tảng</h2>
      <p className="mt-1 text-xs text-slate-500">Chỉ thay đổi dữ liệu trên Airbnb/Booking.com mô phỏng. OpenStays chỉ thấy thay đổi sau khi đồng bộ, giống iCal thật.</p>
      <div className="mt-4 grid gap-2">
        <button type="button" className="btn-secondary" disabled={busy !== null} onClick={() => void run('daily', async () => describe(await randomize({ mode: 'daily' })))}>
          <Shuffle className="h-4 w-4" />Sinh thay đổi hôm nay
        </button>
        <button type="button" className="btn-secondary" disabled={busy !== null} onClick={() => void run('conflict', async () => describe(await randomize({ mode: 'conflict' })))}>
          <Zap className="h-4 w-4" />Tạo 1 xung đột
        </button>
        <button type="button" className="btn-secondary" disabled={busy !== null} onClick={() => void run('reset', async () => {
          if (!window.confirm('Xóa toàn bộ đặt phòng giả lập và tạo lại bộ mặc định?')) return;
          await reset({});
          return 'Đã đặt lại dữ liệu giả lập. Đồng bộ để OpenStays cập nhật.';
        })}>Đặt lại dữ liệu giả lập</button>
      </div>
      {message ? <p role="status" className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">{message}</p> : null}
    </section>
  );
}
