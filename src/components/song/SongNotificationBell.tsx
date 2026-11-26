import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { Bell, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { derivedNotifications } from '../../lib/songShift';
import type { BookingRow } from '../../lib/songAdminTypes';
import { todayIso } from '../../lib/dates';

type Tab = 'todo' | 'alerts' | 'read';
type Item = { id: string; kind: 'todo' | 'alert'; tone: 'alert' | 'info'; title: string; detail: string; to: string; unread: boolean; alertId?: Id<'icalSyncAlerts'>; ts?: number };

/**
 * Three disjoint lists: open work that stays until it is done, unread system
 * alerts (iCal errors, double bookings, recoveries), and alerts already read.
 */
const TABS: Array<[Tab, string]> = [['todo', 'Việc cần làm'], ['alerts', 'Cảnh báo mới'], ['read', 'Đã đọc']];

/**
 * Operations notifications for Sóng staff. Sync/double-booking alerts come from the
 * persisted iCal inbox (with read state); open work (website requests waiting, overdue
 * confirmations, missing residence declarations) is derived from live bookings and
 * stays until the work is done.
 */
export function SongNotificationBell({ propertyId, timezone }: { propertyId: Id<'properties'>; timezone: string }) {
  const today = todayIso(timezone);
  // A narrow query (pending requests + today's in-house stays), not the full admin snapshot:
  // the bell sits on every admin page, so it must not re-read the booking book on each iCal sync.
  const rows = useQuery((api as any).songHomestay.bellItems, { propertyId, today }) as BookingRow[] | undefined;
  const inbox = useQuery(api.icalAlerts.inbox, { propertyId });
  const markRead = useMutation(api.icalAlerts.markRead);
  const markAllRead = useMutation(api.icalAlerts.markAllRead);
  const [open, setOpen] = useState(false);
  const [chosenTab, setTab] = useState<Tab | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const onDown = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown); };
  }, [open]);

  const derived: Item[] = rows ? derivedNotifications(rows, today).map((item) => ({ ...item, kind: 'todo' as const, unread: true })) : [];
  const persisted: Item[] = (inbox?.alerts ?? []).map((alert) => ({
    id: `alert:${alert._id}`,
    kind: 'alert' as const,
    tone: alert.kind === 'sync_recovered' ? 'info' : 'alert',
    title: alert.subject,
    detail: alert.unitName ? `${alert.unitName}${alert.label ? ` · ${alert.label}` : ''}` : alert.body.slice(0, 90),
    to: alert.kind === 'conflict' ? '/admin/conflicts' : '/admin/ical',
    unread: alert.readAt === undefined,
    alertId: alert._id,
    ts: alert.createdAt,
  }));
  const items = [...derived, ...persisted];
  const unreadCount = items.filter((item) => item.unread).length;
  const lists: Record<Tab, Item[]> = {
    todo: derived,
    alerts: persisted.filter((item) => item.unread),
    read: persisted.filter((item) => !item.unread),
  };
  // Open on the first list that has something, unless staff picked a tab.
  const tab: Tab = chosenTab ?? (lists.todo.length ? 'todo' : 'alerts');
  const visible = lists[tab];
  const empty: Record<Tab, string> = { todo: 'Không còn việc nào cần làm.', alerts: 'Không có cảnh báo mới.', read: 'Chưa có cảnh báo nào đã đọc.' };
  const fmt = (ts: number) => new Intl.DateTimeFormat('vi-VN', { timeZone: timezone, dateStyle: 'short', timeStyle: 'short' }).format(ts);

  return (
    <div ref={root} className="relative">
      <button type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={unreadCount ? `Thông báo vận hành, ${unreadCount} chưa xử lý` : 'Thông báo vận hành'} onClick={() => setOpen((value) => !value)} className="relative grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-[#10234a] hover:bg-slate-50">
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount ? <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-extrabold text-white">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
      </button>
      {open ? (
        <div role="dialog" aria-label="Thông báo vận hành" className="absolute right-0 z-50 mt-2 w-[min(92vw,24rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2"><h2 className="font-extrabold text-[#10234a]">Thông báo vận hành</h2>{unreadCount ? <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-extrabold text-white">{unreadCount} mới</span> : null}</div>
            <button type="button" aria-label="Đóng" className="text-slate-400 hover:text-slate-700" onClick={() => setOpen(false)}><X className="h-4 w-4" /></button>
          </div>
          <div role="group" aria-label="Lọc thông báo" className="flex gap-2 border-b px-4 py-2">
            {TABS.map(([key, label]) => <button type="button" key={key} aria-pressed={tab === key} onClick={() => setTab(key)} className={`rounded-full px-3 py-1 text-xs font-bold ${tab === key ? 'bg-[#0b2e4f] text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{label}{key !== 'read' && lists[key].length ? ` (${lists[key].length})` : ''}</button>)}
          </div>
          {tab === 'todo' && lists.todo.length ? <p className="border-b bg-slate-50 px-4 py-2 text-xs text-slate-500">Mục ở đây tự mất khi đã xử lý xong (xác nhận đơn, khai báo tạm trú…).</p> : null}
          {tab === 'alerts' && lists.alerts.length ? <div className="flex items-center justify-between gap-2 border-b bg-slate-50 px-4 py-2 text-xs text-slate-500"><span>Bấm vào cảnh báo để mở và đánh dấu đã đọc.</span><button type="button" className="whitespace-nowrap font-bold text-blue-700 hover:underline" onClick={() => void markAllRead({ propertyId })}>Đọc hết</button></div> : null}
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {visible.map((item) => (
              <li key={item.id}>
                <Link to={item.to} onClick={() => { setOpen(false); if (item.alertId && item.unread) void markRead({ alertId: item.alertId }); }} className="flex gap-3 px-4 py-3 text-sm hover:bg-sky-50">
                  <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${item.tone === 'alert' ? 'bg-red-500' : 'bg-sky-500'} ${item.unread ? '' : 'opacity-30'}`} />
                  <span className="min-w-0"><span className={`block ${item.unread ? 'font-bold text-[#10234a]' : 'text-slate-600'}`}>{item.title}</span><span className="block truncate text-xs text-slate-500">{item.detail}</span>{item.ts ? <span className="block text-[11px] text-slate-400">{fmt(item.ts)}</span> : null}</span>
                </Link>
              </li>
            ))}
            {!visible.length ? <li className="px-4 py-8 text-center text-sm text-slate-500">{empty[tab]}</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
