import { useState, type ReactNode } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { AlertTriangle, CheckCircle2, Clock3, Copy, ExternalLink, Inbox, Mail, PlugZap, RefreshCw, Shuffle, Unplug, Zap } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { extractErrorMessage } from './ErrorMessage';
import { Spinner } from './Spinner';
import { shortDate, shortDateTime } from '../lib/songBookingStatus';

const SYNC_INTERVAL_MS = 30 * 60 * 1000;
const PLATFORM_BY_LABEL: Record<string, 'airbnb' | 'booking'> = { Airbnb: 'airbnb', 'Booking.com': 'booking' };

function formatTime(ts: number | null | undefined): string {
  if (!ts) return '—';
  return shortDateTime(ts, 'Asia/Ho_Chi_Minh');
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

const HUB_TABS = { inbox: 'Hộp thư cảnh báo', history: 'Lịch sử đồng bộ', settings: 'Cài đặt', manual: 'Nhập tệp .ics' } as const;
type HubTab = keyof typeof HUB_TABS;

/**
 * Compact iCal hub: one summary bar, one feed table (a row per link instead of
 * a card per stay), and the secondary panels behind tabs (?tab=… keeps each
 * one deep-linkable, convention #12).
 */
export function IcalSyncHub({ propertyId, manualImport }: { propertyId: Id<'properties'>; manualImport?: ReactNode }) {
  const overview = useQuery(api.icalAlerts.feedOverview, { propertyId });
  const sim = useQuery(api.otaSimulator.status, {});
  const runs = useQuery(api.icalAlerts.listRuns, { propertyId });
  const syncAllNow = useAction(api.icalImport.syncNow);
  const syncFeed = useAction(api.icalImport.syncFeedNow);
  const connect = useMutation(api.otaSimulator.connect);
  const setListingActive = useMutation(api.otaSimulator.setListingActive);
  const { busy, message, run } = useBusy();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab') ?? '';
  const tabs = (Object.keys(HUB_TABS) as HubTab[]).filter((key) => key !== 'manual' || manualImport);
  const tab: HubTab = (tabs as string[]).includes(rawTab) ? rawTab as HubTab : 'inbox';

  if (overview === undefined || sim === undefined || runs === undefined) return <Spinner label="Đang tải trạng thái đồng bộ…" />;

  const simListings = sim.enabled ? sim.listings : [];
  const listingForUrl = (url: string) => simListings.find((l) => l.feedUrl === url);
  const totalFeeds = overview.reduce((sum, unit) => sum + unit.feeds.length, 0);
  const failing = overview.flatMap((u) => u.feeds).filter((f) => f.lastRun && !f.lastRun.ok).length;
  // Units with no simulated feed attached (added after the first connect, or whose iCal links were cleared) need a reconnect.
  const unitsWithoutSim = sim.enabled ? overview.filter((unit) => !unit.feeds.some((feed) => listingForUrl(feed.url))).length : 0;
  const nextCron = runs.lastCronAt ? runs.lastCronAt + SYNC_INTERVAL_MS : null;
  const iconButton = 'grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-[#1565a8] disabled:opacity-50';

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate-500">
            <span className="inline-flex items-center gap-1.5 font-semibold text-[#10234a]"><Clock3 className="h-4 w-4 text-[#1565a8]" />Tự động mỗi 30 phút</span>
            <span className="whitespace-nowrap">Gần nhất: <strong className="text-slate-700">{formatTime(runs.lastCronAt)}</strong></span>
            <span className="whitespace-nowrap">Kế tiếp: <strong className="text-slate-700">{nextCron ? formatTime(nextCron) : 'trong 30 phút'}</strong></span>
            <span className="whitespace-nowrap">{totalFeeds} link{failing ? <strong className="text-red-600"> · {failing} lỗi</strong> : null}</span>
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
        {sim.enabled && (!sim.connected || unitsWithoutSim > 0) ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-[#10234a]">
            <span>{sim.connected ? `Còn ${unitsWithoutSim} cơ sở chưa gắn link iCal giả lập.` : 'Chưa kết nối nền tảng giả lập.'}</span>
            <button type="button" className="btn-primary" disabled={busy !== null} onClick={() => void run('connect', async () => {
              const r = await connect({});
              return `Đã kết nối ${r.listings} link iCal giả lập. Bấm "Đồng bộ tất cả ngay" để kéo dữ liệu về.`;
            })}>{sim.connected ? 'Kết nối lại' : 'Kết nối nền tảng giả lập'}</button>
          </div>
        ) : null}
        {totalFeeds === 0 && !sim.enabled ? <p className="mt-3 text-sm text-slate-500">Chưa có link iCal nào. Thêm link .ics cho từng chỗ nghỉ trong Quản lý chỗ nghỉ để bật đồng bộ.</p> : null}
        {message ? <p role="status" className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{message}</p> : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="p-3">Chỗ nghỉ</th><th className="p-3">Kênh</th><th className="p-3">Trạng thái</th><th className="p-3">Lần cuối</th><th className="p-3">Kết quả</th><th className="p-3 text-right">Thao tác</th></tr>
            </thead>
            <tbody>
              {overview.map((unit) => {
                const feeds = unit.feeds.length ? unit.feeds : [null];
                return feeds.map((feed, index) => {
                  const first = index === 0;
                  const nameCell = first ? <td rowSpan={feeds.length} className="min-w-52 border-r border-slate-100 p-3 align-top font-bold text-[#10234a] !whitespace-normal">{unit.name}
                    {/* OpenStays → OTA: each platform pulls this link, so a new booking here blocks the night there on its next import. */}
                    <button type="button" className="mt-1 flex items-center gap-1 text-xs font-semibold text-[#1565a8] hover:underline" title={unit.exportUrl} onClick={() => void navigator.clipboard?.writeText(unit.exportUrl)}><Copy className="h-3 w-3" />Copy link iCal xuất</button>
                  </td> : null;
                  if (!feed) return <tr key={`${unit.unitId}:none`} className="border-t border-slate-100">{nameCell}<td colSpan={5} className="p-3 text-slate-400">Chưa có link iCal.</td></tr>;
                  const listing = listingForUrl(feed.url);
                  const platform = PLATFORM_BY_LABEL[feed.label];
                  const key = `${unit.unitId}:${feed.label}`;
                  const state = !feed.lastRun ? 'idle' : feed.lastRun.ok ? 'ok' : 'error';
                  return (
                    <tr key={feed.url} className={first ? 'border-t border-slate-100' : 'border-t border-slate-50'}>
                      {nameCell}
                      <td className="p-3"><span className={`rounded-md px-2 py-0.5 text-xs font-bold text-white ${platform === 'airbnb' ? 'bg-rose-500' : platform === 'booking' ? 'bg-blue-800' : 'bg-slate-500'}`}>{feed.label}</span></td>
                      <td className="p-3">
                        {state === 'ok' ? <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Đã đồng bộ</span> : null}
                        {state === 'error' ? <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600" title={feed.lastRun?.error ?? undefined}><AlertTriangle className="h-4 w-4" />Lỗi đồng bộ</span> : null}
                        {state === 'idle' ? <span className="text-xs font-bold text-slate-400">Chưa đồng bộ</span> : null}
                        {listing && !listing.active ? <span className="ml-2 text-xs font-semibold text-red-600">· link tắt</span> : null}
                      </td>
                      <td className="p-3 text-xs text-slate-500">{formatTime(feed.lastSyncedAt)}</td>
                      <td className="p-3 text-xs text-slate-600">{feed.lastRun?.ok ? <>Mới {feed.lastRun.inserted} · Cập nhật {feed.lastRun.updated} · Hủy {feed.lastRun.removed} · <span className={feed.lastRun.conflicts ? 'font-bold text-red-600' : ''}>Trùng {feed.lastRun.conflicts}</span></> : feed.lastRun ? <span className="text-red-600">{feed.lastRun.error}</span> : '—'}</td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1.5">
                          <button type="button" className={iconButton} title="Đồng bộ ngay" aria-label={`Đồng bộ ngay ${unit.name} · ${feed.label}`} disabled={busy !== null} onClick={() => void run(key, async () => {
                            const r = await syncFeed({ propertyId, unitId: unit.unitId, label: feed.label });
                            return r.ok ? `${unit.name} · ${feed.label}: mới ${r.inserted}, cập nhật ${r.updated}, hủy ${r.removed}, xung đột ${r.conflicts}.` : `${unit.name} · ${feed.label}: lỗi ${r.error}`;
                          })}><RefreshCw className={`h-4 w-4 ${busy === key ? 'animate-spin' : ''}`} /></button>
                          {listing ? <a className={iconButton} title={`Mở trên ${feed.label}`} aria-label={`Mở trên ${feed.label}`} href={`/sim/${listing.platform}?unit=${encodeURIComponent(unit.slug)}`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a> : null}
                          <button type="button" className={iconButton} title="Copy link" aria-label={`Copy link ${feed.label}`} onClick={() => void navigator.clipboard?.writeText(feed.url)}><Copy className="h-4 w-4" /></button>
                          {listing ? <button type="button" className={iconButton} title={listing.active ? 'Giả lập link lỗi' : 'Bật lại link'} aria-label={listing.active ? 'Giả lập link lỗi' : 'Bật lại link'} disabled={busy !== null} onClick={() => void run(`toggle:${listing.listingId}`, async () => {
                            await setListingActive({ listingId: listing.listingId, active: !listing.active });
                          })}>{listing.active ? <Unplug className="h-4 w-4" /> : <PlugZap className="h-4 w-4" />}</button> : null}
                        </div>
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-sky-100 bg-white shadow-sm">
        <div role="tablist" aria-label="Thông tin đồng bộ" className="flex flex-wrap gap-1 border-b border-slate-100 px-3 pt-3">
          {tabs.map((key) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setParams((prev) => { const next = new URLSearchParams(prev); if (key === 'inbox') next.delete('tab'); else next.set('tab', key); return next; }, { replace: true })} className={`-mb-px whitespace-nowrap border-b-2 px-3 pb-2.5 text-sm font-bold transition ${tab === key ? 'border-[#1565a8] text-[#0b2e4f]' : 'border-transparent text-slate-500 hover:text-[#0b2e4f]'}`}>{HUB_TABS[key]}</button>)}
        </div>
        <div className="p-4">
          {tab === 'inbox' ? <AlertInbox propertyId={propertyId} /> : null}
          {tab === 'history' ? <SyncHistory runs={runs.runs} /> : null}
          {tab === 'settings' ? <div className="grid gap-4 lg:grid-cols-2"><AlertSettings propertyId={propertyId} />{sim.enabled && sim.connected ? <SimulationControls /> : null}</div> : null}
          {tab === 'manual' ? manualImport : null}
        </div>
      </section>
    </div>
  );
}

/** Lists start collapsed to this many rows; "Xem thêm" shows the rest (WEBSITE.pdf r5). */
const COLLAPSED_ROWS = 5;

function MoreToggle({ total, open, onToggle }: { total: number; open: boolean; onToggle: () => void }) {
  if (total <= COLLAPSED_ROWS) return null;
  return (
    <div className="border-t border-slate-100 pt-3 text-center">
      <button type="button" className="text-sm font-bold text-[#1565a8] hover:underline" onClick={onToggle}>
        {open ? 'Thu gọn' : `Xem thêm (${total - COLLAPSED_ROWS})`}
      </button>
    </div>
  );
}

function SyncHistory({ runs: allRuns }: { runs: Array<{ _id: string; ts: number; unitName: string; label: string; trigger: string; ok: boolean; inserted: number; updated: number; removed: number; newConflicts?: number; error?: string }> }) {
  const [open, setOpen] = useState(false);
  const runs = open ? allRuns : allRuns.slice(0, COLLAPSED_ROWS);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr><th className="p-3">Thời gian</th><th className="p-3">Cơ sở</th><th className="p-3">Nguồn</th><th className="p-3">Kiểu</th><th className="p-3">Kết quả</th></tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r._id} className="border-t border-slate-100">
              <td className="p-3">{formatTime(r.ts)}</td>
              <td className="p-3 !whitespace-normal">{r.unitName}</td>
              <td className="p-3">{r.label}</td>
              <td className="p-3">{r.trigger === 'cron' ? 'Tự động' : 'Thủ công'}</td>
              <td className="p-3">{r.ok
                ? <span className="text-slate-700">Mới {r.inserted} · Cập nhật {r.updated} · Hủy {r.removed}{r.newConflicts ? <strong className="text-red-600"> · {r.newConflicts} xung đột mới</strong> : null}</span>
                : <span className="font-semibold text-red-600">Lỗi: {r.error}</span>}</td>
            </tr>
          ))}
          {!runs.length ? <tr><td colSpan={5} className="p-8 text-center text-slate-400">Chưa có lần đồng bộ nào.</td></tr> : null}
        </tbody>
      </table>
      <MoreToggle total={allRuns.length} open={open} onToggle={() => setOpen(!open)} />
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
  const [open, setOpen] = useState(false);
  if (inbox === undefined) return <Spinner label="Đang tải hộp thư…" />;
  const alerts = open ? inbox.alerts : inbox.alerts.slice(0, COLLAPSED_ROWS);
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <h2 className="flex items-center gap-2 font-extrabold text-[#10234a]"><Inbox className="h-5 w-5" />Hộp thư cảnh báo{inbox.unread ? <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">{inbox.unread} chưa đọc</span> : null}</h2>
        {inbox.unread ? <button type="button" className="text-sm font-bold text-blue-700" onClick={() => void markAllRead({ propertyId })}>Đánh dấu đã đọc tất cả</button> : null}
      </div>
      <p className="mb-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">Mỗi cảnh báo cũng được gửi email tới danh sách nhân viên bên cạnh. Trên bản demo, email chỉ được ghi log; nội dung dưới đây đúng là email sẽ gửi đi.</p>
      <ul className="divide-y divide-slate-100">
        {alerts.map((alert) => {
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
      <MoreToggle total={inbox.alerts.length} open={open} onToggle={() => setOpen(!open)} />
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
          {[0, 0.05, 0.1].map((value) => <option key={value} value={value}>{Math.round(value * 100)}%</option>)}
        </select>
      </label>
      {settings.lastRandomizedOn ? <p className="mt-2 text-xs text-slate-500">Lần tự sinh gần nhất: {shortDate(settings.lastRandomizedOn)}</p> : null}
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
    <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
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
