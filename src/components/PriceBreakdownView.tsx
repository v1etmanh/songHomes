import type { PriceBreakdown } from '../../shared/pricing';
import { taxLabelOrDefault } from '../../shared/currency';
import { formatMoney } from '../lib/money';

/** Line-item price breakdown, shared by the unit-type preview and checkout page. */
export function PriceBreakdownView({
  price,
  nights,
  currency = 'CAD',
  taxLabel,
}: {
  price: PriceBreakdown;
  nights: number;
  currency?: string;
  taxLabel?: string | null;
}) {
  const fmt = (cents: number) => formatMoney(cents, currency);
  return (
    <dl className="space-y-1.5 text-sm">
      <Row
        label={`Tiền phòng (${nights} đêm)`}
        value={fmt(price.nightlySubtotalCents)}
      />
      {price.addOnSubtotalCents > 0 ? <Row label="Dịch vụ bổ sung" value={fmt(price.addOnSubtotalCents)} /> : null}
      {price.promoDiscountCents > 0 ? <Row label="Mã giảm giá" value={fmt(-price.promoDiscountCents)} /> : null}
      <Row label={taxLabelOrDefault(taxLabel)} value={fmt(price.gstCents)} />
      <div className="my-2 border-t border-slate-200" />
      <Row label="Tổng cộng" value={fmt(price.totalCents)} strong />
      {price.giftCertAppliedCents > 0 ? (
        <Row label="Phiếu quà tặng" value={fmt(-price.giftCertAppliedCents)} />
      ) : null}
      <Row label="Tiền cọc dự kiến" value={fmt(price.depositDueCents)} strong />
      {price.balanceDueCents > 0 ? (
        <Row label="Còn lại khi nhận phòng" value={fmt(price.balanceDueCents)} />
      ) : null}
    </dl>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${strong ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
