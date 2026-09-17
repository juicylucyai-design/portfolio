import type { ExpectationStatus, FinancialActual, IcFinancialInput, YearComparison } from '@nksq/contracts';
import { roundUsd, sumUsd } from '../../shared/money';

/**
 * Lines up the IC memo's year-by-year projection against whatever has actually been reported, one row per
 * year that has either a projection or an actual. An annual statement is used as-is; without one, the
 * quarters reported so far are summed and compared pro-rata against the full-year projection.
 *
 * A year that had already fully closed before `entryDate` (NKSquared's first closing, or the IC approval if
 * there's no closing yet) isn't a projection at all — it's the memo's record of what the company already did.
 * Those years are shown as the actual outright, with nothing to compare against.
 *
 * Every statement ever uploaded is kept (see FinancialActualService.record), so a period can have more than
 * one row here — a restated quarter, or a quarterly figure later joined by the annual one. Only the most
 * recently uploaded row for each exact period feeds the comparison; the rest stay on file as history.
 */
export function compareFinancials(financials: IcFinancialInput[], allActuals: FinancialActual[], entryDate: string | null): YearComparison[] {
  const actuals = latestPerPeriod(allActuals);
  const years = new Set<number>([...financials.map((f) => f.year), ...actuals.map((a) => a.fiscalYear)]);

  return [...years]
    .sort((a, b) => a - b)
    .map((year) => {
      const projected = financials.find((f) => f.year === year) ?? null;
      const yearActuals = actuals.filter((a) => a.fiscalYear === year);
      const annual = yearActuals.find((a) => a.periodType === 'ANNUAL') ?? null;
      const quarters = yearActuals.filter((a) => a.periodType === 'QUARTERLY');

      const isHistorical = entryDate !== null && `${year}-12-31` < entryDate;
      const quartersReported = annual ? 0 : quarters.length;
      const actualRevenueUsd = annual ? annual.revenueUsd : sumOrNull(quarters.map((q) => q.revenueUsd)) ?? (isHistorical ? projected?.revenueUsd ?? null : null);
      const actualEbitdaUsd = annual ? annual.ebitdaUsd : sumOrNull(quarters.map((q) => q.ebitdaUsd)) ?? (isHistorical ? projected?.ebitdaUsd ?? null : null);

      // A historical year's "projection" is just what already happened, so it isn't shown as one, and there's
      // nothing to grade it against.
      if (isHistorical && quartersReported === 0) {
        return { year, projectedRevenueUsd: null, projectedEbitdaUsd: null, actualRevenueUsd, actualEbitdaUsd, quartersReported: 0, revenueStatus: null, ebitdaStatus: null };
      }

      return {
        year,
        projectedRevenueUsd: projected?.revenueUsd ?? null,
        projectedEbitdaUsd: projected?.ebitdaUsd ?? null,
        actualRevenueUsd,
        actualEbitdaUsd,
        quartersReported,
        revenueStatus: statusOf(actualRevenueUsd, expectedFor(projected?.revenueUsd ?? null, quartersReported)),
        ebitdaStatus: statusOf(actualEbitdaUsd, expectedFor(projected?.ebitdaUsd ?? null, quartersReported)),
      };
    });
}

/** The full-year projection, pro-rated to however many quarters have been reported (or as-is for an annual actual). */
function expectedFor(projectedFullYear: number | null, quartersReported: number): number | null {
  if (projectedFullYear === null) return null;
  if (quartersReported === 0) return projectedFullYear;
  return roundUsd(projectedFullYear * (quartersReported / 4));
}

/** Within 5% of what was expected counts as meeting it; a $1 floor keeps a near-zero expectation from being noise. */
function statusOf(actual: number | null, expected: number | null): ExpectationStatus | null {
  if (actual === null || expected === null) return null;
  const threshold = Math.max(Math.abs(expected) * 0.05, 1);
  const diff = actual - expected;
  if (diff > threshold) return 'BEATING';
  if (diff < -threshold) return 'BELOW';
  return 'MEETING';
}

function sumOrNull(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length === 0 ? null : sumUsd(present);
}

/** Keeps only the most recently uploaded statement for each exact period (period type, fiscal year, quarter). */
function latestPerPeriod(actuals: FinancialActual[]): FinancialActual[] {
  const latest = new Map<string, FinancialActual>();
  for (const actual of actuals) {
    const key = `${actual.periodType}:${actual.fiscalYear}:${actual.quarter ?? 0}`;
    const current = latest.get(key);
    if (!current || actual.createdAt > current.createdAt) latest.set(key, actual);
  }
  return [...latest.values()];
}
