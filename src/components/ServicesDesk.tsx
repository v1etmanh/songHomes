import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { formatMoney } from '../lib/money';
import { extractErrorMessage } from './ErrorMessage';
import { Spinner } from './Spinner';
import { SongHomestayManagementSection } from './SongHomestayManagementSection';

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
  const [live, setLive] = useState(false);
  const [error, setError] = useState('');
  if (!data) return <Spinner label="Đang tải dịch vụ…" />;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {Object.entries({
          'Dịch vụ đang cung cấp': data.active + ' / ' + data.total,
          'Khách đang phục vụ': data.customers,
          'Doanh thu dịch vụ trong kỳ': formatMoney(data.revenue, currency),
        }).map(([label, value]) => (
          <div className="card p-4" key={label}>
            <p className="field-label">{label}</p>
            <strong className="text-xl">{value}</strong>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className={live ? 'btn-secondary' : 'btn-primary'}
          onClick={() => setLive(false)}
        >
          Danh mục dịch vụ
        </button>
        <button
          className={live ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setLive(true)}
        >
          Khách đang sử dụng dịch vụ (Live)
        </button>
      </div>
      {!live ? (
        <SongHomestayManagementSection
          propertyId={propertyId}
          initialTab="services"
          showTabs={false}
        />
      ) : (
        <div className="card overflow-hidden p-0">
          {error && (
            <p role="alert" className="p-4 text-red-700">
              {error}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  {['Khách', 'Mã booking', 'Căn', 'Lưu trú', 'Dịch vụ', 'Số lượng', 'Thành tiền', 'Trạng thái', 'Thao tác'].map((h) => (
                    <th key={h} className="p-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 [&>td]:p-3">
                    <td className="font-semibold">{row.guest}</td>
                    <td>{row.code}</td>
                    <td>{row.unit}</td>
                    <td className="whitespace-nowrap">
                      {row.checkIn} → {row.checkOut}
                    </td>
                    <td>{row.service}</td>
                    <td>
                      {row.quantity} {row.unitLabel}
                    </td>
                    <td className="font-semibold">
                      {formatMoney(row.amountCents, currency)}
                    </td>
                    <td>
                      <span
                        className={
                          'whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ' +
                          (row.completed
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-emerald-100 text-emerald-800')
                        }
                      >
                        {row.completed ? 'Đã hoàn thành' : 'Đang phục vụ'}
                      </span>
                    </td>
                    <td>
                      {!row.completed && (
                        <button
                          type="button"
                          className="whitespace-nowrap font-bold text-blue-700"
                          onClick={async () => {
                            try {
                              await finish({ propertyId, lineId: row.id });
                              setError('');
                            } catch (e) {
                              setError(extractErrorMessage(e));
                            }
                          }}
                        >
                          Đánh dấu hoàn thành
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-400">
                      Chưa có khách lưu trú sử dụng dịch vụ.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
