// Returns Engine: pure functions, no database, no HTTP.
// XIRR follows Excel's convention (actual days / 365), so results can be checked against the IC model.

export interface CashFlow {
  /** YYYY-MM-DD */
  date: string;
  /** Negative = money invested, positive = money returned. */
  amount: number;
}

const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

/** Actual days / 365 between two YYYY-MM-DD dates, same day-count convention as xirr(). */
export function yearsBetween(start: string, end: string): number {
  return (dayNumber(end) - dayNumber(start)) / 365;
}

/** Present value of the flows at `rate`, discounted to the first flow's date. */
export function npv(rate: number, flows: CashFlow[]): number {
  const start = Math.min(...flows.map((flow) => dayNumber(flow.date)));
  return flows.reduce((total, flow) => total + flow.amount / Math.pow(1 + rate, (dayNumber(flow.date) - start) / 365), 0);
}

/**
 * Annualised internal rate of return for irregularly dated cash flows.
 * Returns null when it isn't defined: no money in, no money out, or no rate between -99% and 1,000,000%.
 */
export function xirr(flows: CashFlow[]): number | null {
  const nonZero = flows.filter((flow) => flow.amount !== 0);
  if (!nonZero.some((flow) => flow.amount < 0) || !nonZero.some((flow) => flow.amount > 0)) return null;

  // Bisection: slower than Newton's method but never diverges, and these inputs are tiny.
  let low = -0.99;
  let high = 1;
  let npvLow = npv(low, nonZero);
  let npvHigh = npv(high, nonZero);
  while (Math.sign(npvLow) === Math.sign(npvHigh)) {
    if (high > 1e4) return null;
    low = high;
    npvLow = npvHigh;
    high *= 2;
    npvHigh = npv(high, nonZero);
  }

  for (let i = 0; i < 300; i++) {
    const mid = (low + high) / 2;
    const npvMid = npv(mid, nonZero);
    if (npvMid === 0 || (high - low) / 2 < 1e-12) return mid;
    if (Math.sign(npvMid) === Math.sign(npvLow)) {
      low = mid;
      npvLow = npvMid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

/** Multiple on invested capital. Null when nothing was invested. */
export function moic(investedUsd: number, valueUsd: number): number | null {
  return investedUsd > 0 ? valueUsd / investedUsd : null;
}
