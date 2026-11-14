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
          Khách sử dụng dịch vụ (Live)
        </button>
      </div>
      {!live ? (
        <SongHomestayManagementSection
          propertyId={propertyId}
          initialTab="services"
          showTabs={false}
        />
      ) : (
        <div className="card p-4">
          {error && <p role="alert">{error}</p>}
          {data.rows.length === 0 && (
            <p>Chưa có khách lưu trú sử dụng dịch vụ.</p>
          )}
          {data.rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b py-3"
            >
              <p>
                <strong>{row.guest}</strong> · {row.code}
                <br />
                {row.service} × {row.quantity}
              </p>
              {row.completed ? (
                'Đã hoàn thành'
              ) : (
                <button
                  className="btn-secondary"
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
