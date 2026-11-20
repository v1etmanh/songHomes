import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { CalendarDays, CheckCircle2, Phone } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { addDays } from '../../shared/pricing';
import { stayRange } from '../lib/songBookingStatus';
import { formatMoney } from '../lib/money';
import { extractErrorMessage } from './ErrorMessage';
import { Spinner } from './Spinner';
import { SongHomestayManagementSection } from './SongHomestayManagementSection';

const SERVICE_FILTERS = { open: 'Chưa chuẩn bị', done: 'Đã xong', all: 'Tất cả' } as const;
type ServiceFilter = keyof typeof SERVICE_FILTERS;

/** "Hôm nay", "Ngày mai" or "Thứ … dd/mm" for a property-local ISO date. */
function dayHeading(day: string, today: string): string {
  if (day === today) return 'Hôm nay';
  if (day === addDays(today, 1)) return 'Ngày mai';
  return `${day < today ? 'Đã qua · ' : ''}${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
}

export function ServicesDesk({
  propertyId,
  startDate,
  endDate,
  currency,
}: {
  propertyId: Id<'properties'>;
  startDate: string;
  endDate: string;
  currency: string;
}) {
  const data = useQuery(api.songHomestay.serviceOverview, {
    propertyId,
    startDate,
    endDate,
  });
  const finish = useMutation(api.songHomestay.finishService);
  // Tab and filter live in the URL so each view is deep-linkable (convention #12).
  const [params, setParams] = useSearchParams();
  const live = params.get('tab') !== 'catalog';
  const rawFilter = params.get('svc') ?? '';
  const filter: ServiceFilter = rawFilter in SERVICE_FILTERS ? (rawFilter as ServiceFilter) : 'open';
  const setParam = (key: string, value: string) => setParams((prev) => { const next = new URLSearchParams(prev); if (value) next.set(key, value); else next.delete(key); return next; }, { replace: true });
  const [error, setError] = useState('');
  if (!data) return <Spinner label="Đang tải dịch vụ…" />;
  const rows = data.rows.filter((row) => filter === 'all' || (filter === 'done' ? row.completed : !row.completed));
  const days = [...new Set(rows.map((row) => row.checkIn))];
  const openCount = data.rows.filter((row) => !row.completed).length;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {Object.entries({
          'Dịch vụ đang cung cấp': data.active,
          'Dịch vụ cần chuẩn bị': openCount,
          'Doanh thu dịch vụ trong kỳ': formatMoney(data.revenue, currency),
        }).map(([label, value]) => (
          <div className="card p-4" key={label}>
            <p className="field-label">{label}</p>
            <strong className="text-xl">{value}</strong>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className={live ? 'btn-secondary' : 'btn-primary'} onClick={() => setParam('tab', 'catalog')}>
          Danh mục dịch vụ
        </button>
        <button className={live ? 'btn-primary' : 'btn-secondary'} onClick={() => setParam('tab', '')}>
          <CalendarDays className="h-4 w-4" aria-hidden="true" />Lịch dịch vụ
        </button>
      </div>
      {!live ? (
        <SongHomestayManagementSection propertyId={propertyId} initialTab="services" showTabs={false} />
      ) : (
        <section className="card space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">Mọi dịch vụ của booking <strong>đã xác nhận</strong> và khách đang ở, xếp theo ngày nhận phòng để lễ tân chuẩn bị trước.</p>
            <div role="group" aria-label="Lọc dịch vụ" className="flex w-fit gap-1 rounded-xl bg-slate-100 p-1">
              {(Object.keys(SERVICE_FILTERS) as ServiceFilter[]).map((key) => (
                <button key={key} type="button" aria-pressed={filter === key} onClick={() => setParam('svc', key === 'open' ? '' : key)}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition ${filter === key ? 'bg-white text-[#0b2e4f] shadow-sm' : 'text-slate-500 hover:text-[#0b2e4f]'}`}>
                  {SERVICE_FILTERS[key]}{key === 'open' && openCount ? <span className="ml-1.5 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] text-white">{openCount}</span> : null}
                </button>
              ))}
            </div>
          </div>
          {error && <p role="alert" className="text-red-700">{error}</p>}
          {days.map((day) => (
            <div key={day} className="overflow-hidden rounded-2xl border border-sky-100">
              <h3 className={`flex items-center gap-2 px-4 py-2.5 text-sm font-extrabold ${day === data.today ? 'bg-[#0b2e4f] text-white' : 'bg-sky-50 text-[#10234a]'}`}>
                <CalendarDays className="h-4 w-4" aria-hidden="true" />{dayHeading(day, data.today)}
                <span className="font-semibold opacity-80">· {rows.filter((row) => row.checkIn === day).length} dịch vụ</span>
              </h3>
              <ul className="divide-y divide-slate-100">
                {rows.filter((row) => row.checkIn === day).map((row) => (
                  <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-[#10234a]">{row.service} <span className="font-semibold text-slate-600">· {row.quantity} {row.unitLabel}</span>{row.freeQuantity ? <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">{row.freeQuantity} lượt miễn phí</span> : null}</p>
                      <p className="text-xs text-slate-600">{row.guest}{row.phone ? <> · <Phone className="inline h-3 w-3" aria-hidden="true" /> {row.phone}</> : null} · {row.code} · {row.unit} · {stayRange(row.checkIn, row.checkOut)}{row.bookingStatus === 'checked_in' ? ' · đang lưu trú' : ''}</p>
                      {row.serviceNote ? <p className="mt-1 text-xs text-slate-700">Ghi chú: {row.serviceNote}</p> : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="whitespace-nowrap font-semibold">{row.amountCents ? formatMoney(row.amountCents, currency) : 'Miễn phí'}</span>
                      {row.completed ? (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600"><CheckCircle2 className="h-3.5 w-3.5" />Đã chuẩn bị</span>
                      ) : (
                        <button type="button" className="whitespace-nowrap rounded-full bg-[#0b2e4f] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#1565a8]"
                          onClick={async () => {
                            try { await finish({ propertyId, lineId: row.id }); setError(''); }
                            catch (e) { setError(extractErrorMessage(e)); }
                          }}>
                          Đánh dấu đã chuẩn bị
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!days.length ? <p className="p-8 text-center text-slate-400">{filter === 'open' ? 'Không còn dịch vụ nào cần chuẩn bị.' : 'Chưa có dịch vụ nào.'}</p> : null}
        </section>
      )}
    </div>
  );
}
