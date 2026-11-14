import { useState } from 'react';
import { useAction, useConvex, useMutation, useQuery } from 'convex/react';
import {
  AlertTriangle,
  ArrowRightLeft,
  CalendarCheck,
  CheckCircle2,
  Download,
  FileCheck2,
  Link2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { ErrorMessage, extractErrorMessage } from './ErrorMessage';
import { formatDisplayDate } from '../lib/dates';

type Props = {
  propertyId: Id<'properties'>;
  onJumpToDate?: (isoDate: string) => void;
};

type ConflictBookingSide = {
  bookingId: Id<'bookings'>;
  confirmationCode: string;
  source: string;
  status: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestName: string;
  syncConflict: boolean;
  totalCents?: number;
  notes: Array<{ ts: number; text: string; by: string }>;
};

type AvailableUnitOption = {
  unitId: Id<'units'>;
  name: string;
  slug: string;
};

type ConflictItem = {
  conflictId: string;
  unitId: Id<'units'>;
  unitName: string;
  unitSlug: string;
  overlapStart: string;
  overlapEnd: string;
  overlapNights: string[];
  bookingA: ConflictBookingSide;
  bookingB: ConflictBookingSide;
  availableUnitsForA: AvailableUnitOption[];
  availableUnitsForB: AvailableUnitOption[];
};

type DashboardData = {
  property: {
    propertyId: Id<'properties'>;
    name: string;
    slug: string;
    currency: string;
  };
  units: Array<{
    unitId: Id<'units'>;
    name: string;
    slug: string;
    status: string;
    icalExportToken: string;
    icalImports: Array<{
      label: string;
      url: string;
      lastSyncedAt?: number;
      lastStatus?: string;
    }>;
  }>;
  externalBookings: Array<{
    bookingId: Id<'bookings'>;
    unitId: Id<'units'>;
    unitName: string;
    confirmationCode: string;
    source: string;
    checkIn: string;
    checkOut: string;
    nights: number;
    syncConflict: boolean;
    guestName: string;
  }>;
  conflicts: ConflictItem[];
};

type ResidenceRecord = {
  _id: Id<'residenceRegistrations'>;
  propertyId: Id<'properties'>;
  bookingId: Id<'bookings'>;
  unitName: string;
  confirmationCode: string;
  bookingStatus: string;
  fullName: string;
  documentType: 'cccd' | 'cmnd' | 'passport' | 'other';
  canReveal: boolean;
  documentNumber: string;
  nationality: string;
  dateOfBirth?: string;
  phone?: string;
  permanentAddress?: string;
  registrationType: 'tam_tru' | 'tam_vang';
  checkInDate: string;
  checkOutDate: string;
  reason?: string;
  status: 'declared' | 'verified';
  submittedBy: 'guest' | 'staff';
  createdAt: number;
  updatedAt: number;
};

export function SongHomestayAdminPanel({ propertyId, onJumpToDate }: Props) {
  const dashboard = useQuery(
    (api as any).icalImport.dashboardForProperty,
    { propertyId },
  ) as DashboardData | null | undefined;
  const residenceList = useQuery(
    (api as any).residence.listForProperty,
    { propertyId },
  ) as ResidenceRecord[] | undefined;

  const syncNow = useAction((api as any).icalImport.syncNow);
  const applyScenario = useMutation((api as any).icalImport.applyDemoScenario);
  const resolveConflict = useMutation((api as any).icalImport.resolveConflict);
  const configureUnitFeeds = useMutation((api as any).icalImport.configureUnitFeeds);
  const verifyRegistration = useMutation((api as any).residence.verifyRegistration);

  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'conflicts' | 'feeds' | 'residence'>('conflicts');
  const [selectedMoveUnits, setSelectedMoveUnits] = useState<Record<string, string>>({});
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [draftFeeds, setDraftFeeds] = useState<Array<{ label: string; url: string }>>([]);

  const phongAUnit =
    dashboard?.units.find((u) => u.slug.startsWith('phong-a') || u.name.includes('Phòng A')) ??
    dashboard?.units[0];

  async function handleSyncNow() {
    setSyncing(true);
    setError(null);
    setSyncStatus(null);
    try {
      const result = await syncNow({ propertyId });
      const timeStr = new Date(result.syncedAt).toLocaleTimeString('vi-VN');
      setSyncStatus(
        `Đồng bộ lúc ${timeStr}: Quét ${result.syncedUnits} căn · Thành công ${result.feedsSynced} nguồn .ics · Lỗi ${result.failedFeeds} nguồn · Thêm mới ${result.inserted} · Cập nhật ${result.updated} · Phát hiện ${result.conflicts} xung đột Double Booking.`,
      );
      if (result.conflicts > 0 && onJumpToDate) {
        onJumpToDate('2026-09-18');
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSyncing(false);
    }
  }

  async function handleRunScenario(
    scenario: 'conflict_partial' | 'conflict_exact' | 'boundary_safe' | 'no_overlap',
    label: string,
  ) {
    if (!phongAUnit) {
      setError('Không tìm thấy Phòng A để áp dụng kịch bản.');
      return;
    }
    setSyncing(true);
    setError(null);
    setSyncStatus(null);
    try {
      await applyScenario({ unitId: phongAUnit.unitId, scenario });
      const result = await syncNow({ propertyId });
      setSyncStatus(
        `Đã nạp kịch bản "${label}" trên ${phongAUnit.name}: Thêm ${result.inserted} lịch OTA · Xung đột Double Booking: ${result.conflicts}.`,
      );
      setActiveTab('conflicts');
      onJumpToDate?.('2026-09-18');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSyncing(false);
    }
  }

  async function handleResolve(
    bookingId: Id<'bookings'>,
    resolutionType: 'move_unit' | 'cancel_booking' | 'acknowledge',
    targetUnitId?: string,
  ) {
    setResolvingId(String(bookingId));
    setError(null);
    try {
      await resolveConflict({
        bookingId,
        resolutionType,
        targetUnitId: targetUnitId ? (targetUnitId as Id<'units'>) : undefined,
        note:
          resolutionType === 'move_unit'
            ? 'Chuyển phòng xử lý xung đột Double Booking (giữ nguyên giá gốc - BRULE06)'
            : resolutionType === 'cancel_booking'
              ? 'Hủy đơn trùng lịch OTA'
              : 'Đã xác nhận xử lý thủ công trên OTA',
      });
      setSyncStatus('Đã xử lý xung đột Double Booking thành công và cập nhật lại lịch trống.');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setResolvingId(null);
    }
  }

  function startEditingFeeds(unit: NonNullable<DashboardData['units']>[number]) {
    setEditingUnitId(String(unit.unitId));
    setDraftFeeds(
      unit.icalImports.length > 0
        ? unit.icalImports.map((f) => ({ label: f.label, url: f.url }))
        : [
            { label: 'Airbnb', url: '/mock-ical/airbnb-phong-a.ics' },
            { label: 'Booking.com', url: '/mock-ical/booking-phong-a.ics' },
          ],
    );
  }

  async function saveUnitFeeds(unitId: Id<'units'>) {
    setError(null);
    try {
      const cleaned = draftFeeds.filter((f) => f.label.trim() && f.url.trim());
      await configureUnitFeeds({ unitId, imports: cleaned });
      setEditingUnitId(null);
      setSyncStatus('Đã lưu cấu hình nguồn iCal (.ics). Bấm "Đồng bộ ngay" để nạp lịch mới.');
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  const conflictCount = dashboard?.conflicts.length ?? 0;
  const totalConfiguredFeeds =
    dashboard?.units.reduce((sum, u) => sum + u.icalImports.length, 0) ?? 0;
  const residenceCount = residenceList?.length ?? 0;

  const client = useConvex();
  async function exportResidenceCsv() {
    if (!residenceList?.length) return;
    const safe = (value: unknown) => {
      let raw = String(value ?? '');
      if (/^[=+\-@]/.test(raw)) raw = `'${raw}`;
      return `"${raw.replaceAll('"', '""')}"`;
    };
    const header = ['Mã booking', 'Căn', 'Họ tên', 'Loại giấy tờ', 'Số giấy tờ', 'Quốc tịch', 'Ngày sinh', 'SĐT', 'Địa chỉ', 'Loại đăng ký', 'Từ ngày', 'Đến ngày', 'Trạng thái'];
    const records = await client.query(api.residence.listForProperty,{propertyId,exportFull:true});
    const rows = records.map((row) => [row.confirmationCode, row.unitName, row.fullName, row.documentType, row.documentNumber, row.nationality, row.dateOfBirth, row.phone, row.permanentAddress, row.registrationType, row.checkInDate, row.checkOutDate, row.status]);
    const csv = `\uFEFF${[header, ...rows].map((row) => row.map(safe).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `song-homestay-luu-tru-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section
      className="card overflow-hidden border-2 border-emerald-700/20 bg-gradient-to-br from-white via-stone-50 to-emerald-50/30 p-5 shadow-sm"
      aria-label="Trung tâm đồng bộ iCal & Tạm trú Sóng Homestay"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Sóng Homestay — Đồng bộ đa kênh OTA &amp; Nghiệp vụ Lưu trú
            </span>
            {conflictCount > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800">
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                {conflictCount} Cảnh báo Double Booking!
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-stone-200 px-3 py-1 text-xs font-medium text-stone-700">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                0 Xung đột lịch
              </span>
            )}
          </div>
          <h2 className="mt-2 text-lg font-semibold text-stone-950">
            Đồng bộ lịch iCal (Airbnb / Booking.com) &amp; Kiểm soát Double Booking
          </h2>
          <p className="mt-0.5 text-xs text-stone-600">
            Đọc trực tiếp các nguồn <code className="rounded bg-stone-200/70 px-1 py-0.5">.ics</code>, tự động phát hiện giao thoa khoảng ngày giữa các kênh OTA và đơn nội bộ theo quy tắc{' '}
            <code className="rounded bg-stone-200/70 px-1 py-0.5">startA &lt; endB &amp;&amp; startB &lt; endA</code>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-2 shadow-sm"
            disabled={syncing}
            onClick={() => void handleSyncNow()}
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
            {syncing ? 'Đang đồng bộ iCal…' : 'Đồng bộ ngay'}
          </button>
          {onJumpToDate ? (
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() => onJumpToDate('2026-09-18')}
            >
              <CalendarCheck className="h-4 w-4 text-emerald-700" aria-hidden="true" />
              Xem lịch Tháng 09/2026
            </button>
          ) : null}
        </div>
      </div>

      {/* 1-click Demo Scenarios */}
      <div className="mt-4 rounded-xl border border-stone-200 bg-white/90 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
            Kịch bản kiểm thử nhanh trên Phòng A (.ics tĩnh):
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={syncing}
              onClick={() => void handleRunScenario('conflict_partial', 'Trùng 1 phần (20-23/09 vs 22-24/09)')}
              className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-900 transition hover:bg-red-100 disabled:opacity-50"
            >
              1. Trùng 1 phần (Airbnb 20–23/09 vs Booking 22–24/09)
            </button>
            <button
              type="button"
              disabled={syncing}
              onClick={() => void handleRunScenario('conflict_exact', 'Trùng hoàn toàn (20-23/09 vs 20-23/09)')}
              className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:opacity-50"
            >
              2. Trùng hoàn toàn (20–23/09)
            </button>
            <button
              type="button"
              disabled={syncing}
              onClick={() => void handleRunScenario('boundary_safe', 'Giáp biên an toàn (20-23/09 & 23-25/09)')}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100 disabled:opacity-50"
            >
              3. Giáp biên Check-out = Check-in (20–23 &amp; 23–25/09)
            </button>
            <button
              type="button"
              disabled={syncing}
              onClick={() => void handleRunScenario('no_overlap', 'Không trùng (20-23/09 & 25-28/09)')}
              className="rounded-lg border border-stone-200 bg-stone-100 px-2.5 py-1.5 text-xs font-semibold text-stone-800 transition hover:bg-stone-200 disabled:opacity-50"
            >
              4. Không trùng lịch (20–23 &amp; 25–28/09)
            </button>
          </div>
        </div>
      </div>

      {syncStatus ? (
        <div
          role="status"
          className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-950"
        >
          <span>{syncStatus}</span>
          <button
            type="button"
            className="text-emerald-700 underline"
            onClick={() => setSyncStatus(null)}
          >
            Đóng
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="mt-3">
          <ErrorMessage message={error} />
        </div>
      ) : null}

      {/* Navigation Tabs */}
      <div className="mt-4 flex flex-wrap gap-2 border-b border-stone-200 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('conflicts')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            activeTab === 'conflicts'
              ? 'bg-stone-900 text-white'
              : 'bg-white text-stone-700 hover:bg-stone-100'
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          Cảnh báo Double Booking ({conflictCount})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('feeds')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            activeTab === 'feeds'
              ? 'bg-stone-900 text-white'
              : 'bg-white text-stone-700 hover:bg-stone-100'
          }`}
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          Nguồn iCal (.ics) theo căn ({totalConfiguredFeeds})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('residence')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            activeTab === 'residence'
              ? 'bg-stone-900 text-white'
              : 'bg-white text-stone-700 hover:bg-stone-100'
          }`}
        >
          <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
          Khai báo Tạm trú / Tạm vắng ({residenceCount})
        </button>
      </div>

      {/* TAB 1: DOUBLE BOOKING CONFLICTS */}
      {activeTab === 'conflicts' ? (
        <div className="mt-4 space-y-3">
          {dashboard === undefined ? (
            <p className="text-xs text-stone-500">Đang kiểm tra trạng thái đồng bộ…</p>
          ) : !dashboard || dashboard.conflicts.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-950">
              <p className="font-semibold">
                Không có xung đột Double Booking nào trên toàn bộ {dashboard?.units.length ?? 0} căn.
              </p>
              <p className="mt-1 text-xs text-emerald-800">
                Hiện có {dashboard?.externalBookings.length ?? 0} lượt đặt phòng ngoại tuyến (OTA iCal) đang hoạt động bình thường. Bạn có thể bấm nút{' '}
                <strong>&ldquo;Đồng bộ ngay&rdquo;</strong> hoặc chọn kịch bản{' '}
                <strong>&ldquo;1. Trùng 1 phần (Airbnb 20–23/09 vs Booking 22–24/09)&rdquo;</strong> ở trên để kiểm thử phát hiện Double Booking.
              </p>
            </div>
          ) : (
            dashboard.conflicts.map((conflict) => {
              const sides: Array<{
                sideKey: 'A' | 'B';
                booking: ConflictBookingSide;
                availableUnits: AvailableUnitOption[];
              }> = [
                {
                  sideKey: 'A',
                  booking: conflict.bookingA,
                  availableUnits: conflict.availableUnitsForA,
                },
                {
                  sideKey: 'B',
                  booking: conflict.bookingB,
                  availableUnits: conflict.availableUnitsForB,
                },
              ];

              return (
                <div
                  key={conflict.conflictId}
                  className="rounded-xl border-2 border-red-300 bg-red-50/90 p-4 shadow-sm"
                  role="alert"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-red-700 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-white">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                        PHÁT HIỆN DOUBLE BOOKING (TRÙNG LỊCH GIỮA CÁC KÊNH)
                      </span>
                      <h3 className="mt-2 text-base font-bold text-red-950">
                        Căn bị trùng: {conflict.unitName}
                      </h3>
                      <p className="mt-1 text-xs font-medium text-red-900">
                        Khoảng ngày giao thoa: <strong>{conflict.overlapStart}</strong> →{' '}
                        <strong>{conflict.overlapEnd}</strong> ({conflict.overlapNights.length} đêm:{' '}
                        {conflict.overlapNights.map((n) => formatDisplayDate(n)).join(', ')})
                      </p>
                    </div>
                    {onJumpToDate ? (
                      <button
                        type="button"
                        className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-900 hover:bg-red-100"
                        onClick={() => onJumpToDate(conflict.overlapStart)}
                      >
                        Nhảy tới ngày trùng trên Lịch
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {sides.map(({ booking, availableUnits }) => {
                      const selectedTargetUnit =
                        selectedMoveUnits[String(booking.bookingId)] ??
                        (availableUnits[0] ? String(availableUnits[0].unitId) : '');
                      const isWorking = resolvingId === String(booking.bookingId);

                      return (
                        <div
                          key={String(booking.bookingId)}
                          className="rounded-xl border border-red-200 bg-white p-3.5 shadow-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="rounded-md bg-stone-900 px-2 py-0.5 text-xs font-semibold text-white">
                              Nguồn: {booking.source.replace('ical:', 'OTA iCal: ')}
                            </span>
                            <span className="font-mono text-xs font-semibold text-stone-600">
                              #{booking.confirmationCode}
                            </span>
                          </div>
                          <p className="mt-2 text-sm font-semibold text-stone-900">
                            {booking.guestName}
                          </p>
                          <p className="mt-1 text-xs text-stone-600">
                            Nhận phòng: <strong>{formatDisplayDate(booking.checkIn)}</strong> ({booking.checkIn}) → Trả phòng:{' '}
                            <strong>{formatDisplayDate(booking.checkOut)}</strong> ({booking.checkOut}) · {booking.nights} đêm
                          </p>

                          <div className="mt-3 space-y-2 border-t border-stone-100 pt-3">
                            <p className="text-xs font-semibold text-stone-700">
                              Hướng xử lý cho đơn này (US13 / BRULE06):
                            </p>
                            {availableUnits.length > 0 ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <select
                                  className="field-input flex-1 py-1.5 text-xs"
                                  aria-label="Chọn căn trống để chuyển"
                                  value={selectedTargetUnit}
                                  onChange={(e) =>
                                    setSelectedMoveUnits((prev) => ({
                                      ...prev,
                                      [String(booking.bookingId)]: e.target.value,
                                    }))
                                  }
                                >
                                  {availableUnits.map((u) => (
                                    <option key={String(u.unitId)} value={String(u.unitId)}>
                                      Chuyển sang: {u.name} (còn trống)
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  disabled={isWorking || !selectedTargetUnit}
                                  onClick={() =>
                                    void handleResolve(
                                      booking.bookingId,
                                      'move_unit',
                                      selectedTargetUnit,
                                    )
                                  }
                                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                                >
                                  <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
                                  Đổi căn (giữ giá gốc)
                                </button>
                              </div>
                            ) : (
                              <p className="text-xs text-amber-800">
                                Không còn căn trống nào khác trong khoảng ngày này.
                              </p>
                            )}

                            <div className="flex flex-wrap gap-2 pt-1">
                              <button
                                type="button"
                                disabled={isWorking}
                                onClick={() =>
                                  void handleResolve(booking.bookingId, 'cancel_booking')
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
                              >
                                <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                Hủy đơn này &amp; mở lại lịch
                              </button>
                              <button
                                type="button"
                                disabled={isWorking}
                                onClick={() =>
                                  void handleResolve(booking.bookingId, 'acknowledge')
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-200 disabled:opacity-50"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                                Đã xử lý trên OTA
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : null}

      {/* TAB 2: ICAL FEEDS PER UNIT */}
      {activeTab === 'feeds' ? (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-stone-600">
            Cấu hình các đường dẫn <code className="rounded bg-stone-200 px-1">.ics</code> từ Airbnb, Booking.com, Agoda cho từng căn trong 8 căn của Sóng Homestay.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {dashboard?.units.map((unit) => {
              const isEditing = editingUnitId === String(unit.unitId);
              return (
                <div
                  key={String(unit.unitId)}
                  className="rounded-xl border border-stone-200 bg-white p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-stone-900">{unit.name}</h3>
                    {!isEditing ? (
                      <button
                        type="button"
                        className="text-xs font-semibold text-emerald-700 hover:underline"
                        onClick={() => startEditingFeeds(unit)}
                      >
                        Cấu hình .ics ({unit.icalImports.length})
                      </button>
                    ) : null}
                  </div>

                  {!isEditing ? (
                    unit.icalImports.length === 0 ? (
                      <p className="mt-1.5 text-xs text-stone-400">Chưa gắn link iCal (.ics)</p>
                    ) : (
                      <ul className="mt-2 space-y-1 text-xs text-stone-600">
                        {unit.icalImports.map((f, idx) => (
                          <li
                            key={`${f.label}-${idx}`}
                            className="flex items-center justify-between gap-2 rounded bg-stone-50 px-2 py-1"
                          >
                            <span className="font-semibold text-stone-800">{f.label}:</span>
                            <span className="truncate font-mono text-[11px] text-stone-600">
                              {f.url}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : (
                    <div className="mt-3 space-y-2">
                      {draftFeeds.map((feed, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            className="field-input w-28 py-1 text-xs"
                            placeholder="Kênh (Airbnb)"
                            value={feed.label}
                            onChange={(e) => {
                              const next = [...draftFeeds];
                              next[idx] = { ...next[idx], label: e.target.value };
                              setDraftFeeds(next);
                            }}
                          />
                          <input
                            type="text"
                            className="field-input flex-1 py-1 font-mono text-xs"
                            placeholder="/mock-ical/airbnb-phong-a.ics"
                            value={feed.url}
                            onChange={(e) => {
                              const next = [...draftFeeds];
                              next[idx] = { ...next[idx], url: e.target.value };
                              setDraftFeeds(next);
                            }}
                          />
                          <button
                            type="button"
                            className="text-red-600 hover:text-red-800"
                            aria-label="Xóa dòng"
                            onClick={() =>
                              setDraftFeeds(draftFeeds.filter((_, i) => i !== idx))
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <button
                          type="button"
                          className="text-xs font-semibold text-emerald-700 hover:underline"
                          onClick={() =>
                            setDraftFeeds([...draftFeeds, { label: 'OTA', url: '' }])
                          }
                        >
                          + Thêm link .ics
                        </button>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="btn-secondary py-1 text-xs"
                            onClick={() => setEditingUnitId(null)}
                          >
                            Hủy
                          </button>
                          <button
                            type="button"
                            className="btn-primary py-1 text-xs"
                            onClick={() => void saveUnitFeeds(unit.unitId)}
                          >
                            Lưu nguồn iCal
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* TAB 3: RESIDENCE REGISTRATIONS */}
      {activeTab === 'residence' ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-stone-600">Danh sách thông tin lưu trú do khách gửi. Chỉ sử dụng để hỗ trợ quy trình khai báo thủ công.</p>
            <button type="button" className="btn-secondary py-1.5 text-xs" disabled={!residenceList?.[0]?.canReveal} onClick={()=>void exportResidenceCsv().catch(e=>setError(extractErrorMessage(e)))}><Download className="h-3.5 w-3.5" /> Xuất CSV khai báo</button>
          </div>
          {residenceList === undefined ? (
            <p className="text-xs text-stone-500">Đang tải danh sách khai báo tạm trú…</p>
          ) : residenceList.length === 0 ? (
            <div className="rounded-xl border border-stone-200 bg-white p-4 text-xs text-stone-600">
              Chưa có tờ khai tạm trú nào. Khách hàng có thể mở trang <strong>Manage Booking</strong>, nhập email đặt phòng và điền biểu mẫu <strong>Đăng ký tạm trú / tạm vắng</strong>.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {residenceList.map((reg) => (
                <div
                  key={String(reg._id)}
                  className="rounded-xl border border-stone-200 bg-white p-3.5 text-xs shadow-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-stone-900">
                        {reg.fullName}{' '}
                        <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-700">
                          {reg.registrationType === 'tam_tru' ? 'Tạm trú' : 'Tạm vắng'}
                        </span>
                      </p>
                      <p className="text-stone-500">
                        Mã đặt phòng: <span className="font-mono font-semibold">{reg.confirmationCode}</span> · Căn: <strong>{reg.unitName}</strong>
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 font-semibold ${
                        reg.status === 'verified'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {reg.status === 'verified' ? 'Đã duyệt' : 'Chờ duyệt'}
                    </span>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-1.5 text-stone-600">
                    <div>
                      <dt className="text-stone-400">Giấy tờ ({reg.documentType.toUpperCase()})</dt>
                      <dd className="font-mono font-semibold text-stone-800" title="Số đầy đủ chỉ có trong tệp CSV được xuất có chủ đích">••••••{reg.documentNumber.slice(-4)}</dd>
                    </div>
                    <div>
                      <dt className="text-stone-400">Ngày sinh / Quốc tịch</dt>
                      <dd>
                        {reg.dateOfBirth || '—'} · {reg.nationality}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-stone-400">Số điện thoại</dt>
                      <dd>{reg.phone || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-stone-400">Thời gian khai báo</dt>
                      <dd>
                        {reg.checkInDate} → {reg.checkOutDate}
                      </dd>
                    </div>
                    {reg.permanentAddress ? (
                      <div className="col-span-2">
                        <dt className="text-stone-400">Địa chỉ thường trú</dt>
                        <dd>{reg.permanentAddress}</dd>
                      </div>
                    ) : null}
                  </dl>
                  <div className="mt-3 flex justify-end gap-2 border-t border-stone-100 pt-2">
                    {reg.status !== 'verified' ? (
                      <button
                        type="button"
                        className="rounded-lg bg-emerald-700 px-3 py-1 font-semibold text-white hover:bg-emerald-800"
                        onClick={() =>
                          void verifyRegistration({
                            registrationId: reg._id,
                            status: 'verified',
                          })
                        }
                      >
                        Xác nhận thông tin tạm trú
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="rounded-lg border border-stone-200 px-2.5 py-1 text-stone-600 hover:bg-stone-100"
                        onClick={() =>
                          void verifyRegistration({
                            registrationId: reg._id,
                            status: 'declared',
                          })
                        }
                      >
                        Đặt lại chờ duyệt
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
