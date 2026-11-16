import { formatMoney } from './money';

type Priced = { fromPriceCents: number | null; longStay?: boolean; monthlyPriceCents?: number | null };

/** "1.000.000 ₫ / đêm" for nightly stays, "25.000.000 ₫ / tháng" for long-term rentals. */
export function stayPrice(stay: Priced, currency: string): { amount: string; period: string } | null {
  if (stay.longStay && stay.monthlyPriceCents) return { amount: formatMoney(stay.monthlyPriceCents, currency), period: 'tháng' };
  if (stay.fromPriceCents) return { amount: formatMoney(stay.fromPriceCents, currency), period: 'đêm' };
  return null;
}
