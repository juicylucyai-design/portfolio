import type { InvestmentStatus } from '@nksq/contracts';

const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usdCompactFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 2,
});

export const usd = (value: number | null | undefined) => (value == null ? '—' : usdFormatter.format(value));
export const usdCompact = (value: number | null | undefined) => (value == null ? '—' : usdCompactFormatter.format(value));

/** For rates stored as fractions (IRR 0.2572 → 25.7%). */
export const rate = (value: number | null | undefined, digits = 1) => (value == null ? '—' : `${(value * 100).toFixed(digits)}%`);

/** For percentages stored as 0–100 (ownership 20 → 20.00%). */
export const percent = (value: number | null | undefined, digits = 2) => (value == null ? '—' : `${Number(value.toFixed(digits))}%`);

export const multiple = (value: number | null | undefined) => (value == null ? '—' : `${value.toFixed(2)}×`);

export const date = (isoDate: string) =>
  new Date(`${isoDate.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const STATUS_LABELS: Record<InvestmentStatus, string> = {
  PIPELINE: 'Pipeline',
  IC_APPROVED: 'IC approved',
  PARTLY_DRAWN: 'Partly drawn',
  CLOSED: 'Closed',
  ACTIVE: 'Active',
  EXITED: 'Exited',
  WRITTEN_OFF: 'Written off',
};

/** Parses what people type into amount fields: "25,000,000", "25000000.50", "". */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[,$\s]/g, '');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export function groupDigits(text: string): string {
  const cleaned = text.replace(/[^\d.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rest.length ? `${grouped}.${rest.join('').slice(0, 2)}` : grouped;
}
