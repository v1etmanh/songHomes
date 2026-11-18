import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { Bell, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { derivedNotifications } from '../../lib/songShift';
import { useShiftSnapshot } from './FrontDeskShift';

type Tab = 'all' | 'unread' | 'alert';
type Item = { id: string; tone: 'alert' | 'info'; title: string; detail: string; to: string; unread: boolean; alertId?: Id<'icalSyncAlerts'>; ts?: number };

const TABS: Array<[Tab, string]> = [['all', 'Tất cả'], ['unread', 'Chưa đọc'], ['alert', 'Cảnh báo']];

/**
 * Operations notifications for Sóng staff. Sync/double-booking alerts come from the
 * persisted iCal inbox (with read state); open work (website requests waiting, overdue
 * confirmations, missing residence declarations) is derived from live bookings and
 * stays until the work is done.
 */
export function SongNotificationBell({ propertyId, timezone }: { propertyId: Id<'properties'>; timezone: string }) {
  const { today, snapshot } = useShiftSnapshot(propertyId, timezone);
  const inbox = useQuery(api.icalAlerts.inbox, { propertyId });
  const markRead = useMutation(api.icalAlerts.markRead);
  const markAllRead = useMutation(api.icalAlerts.markAllRead);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('all');
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const onDown = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown); };
  }, [open]);

  const derived: Item[] = snapshot ? derivedNotifications(snapshot.bookings, today).map((item) => ({ ...item, unread: true })) : [];
  const persisted: Item[] = (inbox?.alerts ?? []).map((alert) => ({
    id: `alert:${alert._id}`,
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
  const visible = items.filter((item) => tab === 'all' || (tab === 'unread' && item.unread) || (tab === 'alert' && item.tone === 'alert'));
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
            {TABS.map(([key, label]) => <button type="button" key={key} aria-pressed={tab === key} onClick={() => setTab(key)} className={`rounded-full px-3 py-1 text-xs font-bold ${tab === key ? 'bg-[#0b2e4f] text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{label}</button>)}
            {inbox?.unread ? <button type="button" className="ml-auto text-xs font-bold text-blue-700" onClick={() => void markAllRead({ propertyId })}>Đánh dấu đã đọc</button> : null}
          </div>
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {visible.map((item) => (
              <li key={item.id}>
                <Link to={item.to} onClick={() => { setOpen(false); if (item.alertId && item.unread) void markRead({ alertId: item.alertId }); }} className="flex gap-3 px-4 py-3 text-sm hover:bg-sky-50">
                  <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${item.tone === 'alert' ? 'bg-red-500' : 'bg-sky-500'} ${item.unread ? '' : 'opacity-30'}`} />
                  <span className="min-w-0"><span className={`block ${item.unread ? 'font-bold text-[#10234a]' : 'text-slate-600'}`}>{item.title}</span><span className="block truncate text-xs text-slate-500">{item.detail}</span>{item.ts ? <span className="block text-[11px] text-slate-400">{fmt(item.ts)}</span> : null}</span>
                </Link>
              </li>
            ))}
            {!visible.length ? <li className="px-4 py-8 text-center text-sm text-slate-500">Không có thông báo nào.</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
