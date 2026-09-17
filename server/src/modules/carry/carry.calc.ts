import type { CarryTerms } from '@nksq/contracts';
import { roundUsd } from '../../shared/money';
import { yearsBetween } from '../../shared/returns-engine';

export interface CarryFigures {
  profitUsd: number | null;
  hurdleAmountUsd: number | null;
  carriableProfitUsd: number | null;
  originationCarryUsd: number | null;
  monitoringCarryUsd: number | null;
  closureCarryUsd: number | null;
  totalCarryUsd: number | null;
}

const NONE: CarryFigures = {
  profitUsd: null,
  hurdleAmountUsd: null,
  carriableProfitUsd: null,
  originationCarryUsd: null,
  monitoringCarryUsd: null,
  closureCarryUsd: null,
  totalCarryUsd: null,
};

/**
 * Carry for one investment: profit (proceeds less cost, floored at zero) has a hard hurdle carved out —
 * hurdleRatePct compounded annually on cost over the actual holding period (entryDate to asOfDate), with no
 * catch-up — and the three role percentages apply to what's left. A non-qualified investment, or one with
 * nothing to compute proceeds or dates from, has no carry.
 */
export function computeCarry(
  proceedsUsd: number | null,
  costUsd: number | null,
  entryDate: string | null,
  asOfDate: string | null,
  terms: Pick<CarryTerms, 'qualified' | 'originationPct' | 'monitoringPct' | 'closurePct'>,
  hurdleRatePct: number,
): CarryFigures {
  if (!terms.qualified || proceedsUsd === null || costUsd === null || entryDate === null || asOfDate === null) return NONE;

  const profitUsd = Math.max(0, roundUsd(proceedsUsd - costUsd));
  const years = Math.max(0, yearsBetween(entryDate, asOfDate));
  const hurdleAmountUsd = roundUsd(costUsd * (Math.pow(1 + hurdleRatePct / 100, years) - 1));
  const carriableProfitUsd = Math.max(0, roundUsd(profitUsd - hurdleAmountUsd));
  const originationCarryUsd = roundUsd(carriableProfitUsd * (terms.originationPct / 100));
  const monitoringCarryUsd = roundUsd(carriableProfitUsd * (terms.monitoringPct / 100));
  const closureCarryUsd = roundUsd(carriableProfitUsd * (terms.closurePct / 100));

  return {
    profitUsd,
    hurdleAmountUsd,
    carriableProfitUsd,
    originationCarryUsd,
    monitoringCarryUsd,
    closureCarryUsd,
    totalCarryUsd: roundUsd(originationCarryUsd + monitoringCarryUsd + closureCarryUsd),
  };
}
