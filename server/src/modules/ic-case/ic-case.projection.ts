import type { IcCaseInput, IcProjection } from '@nksq/contracts';
import { roundTo, roundUsd, sumUsd } from '../../shared/money';
import { moic, xirr } from '../../shared/returns-engine';

/** Exit is assumed to happen on the last day of the exit year. */
export const exitDateFor = (exitYear: number) => `${exitYear}-12-31`;

/**
 * What the IC case projects, from its inputs alone:
 * - commitment = sum of the tranches
 * - proceeds   = exit valuation × ownership at exit
 * - ownership at exit = entry ownership − dilution to exit, in percentage points (floored at zero: dilution
 *   can't take a stake below nothing, even if someone enters a dilution figure bigger than the entry stake)
 * - IRR        = XIRR of each tranche paid on its expected date, and proceeds received at exit
 */
export function projectIcCase(input: IcCaseInput): IcProjection {
  const commitmentUsd = sumUsd(input.tranches.map((tranche) => tranche.amountUsd));
  const exitOwnershipFraction = Math.max(0, input.entryOwnershipPct - input.dilutionToExitPct) / 100;
  const projectedProceedsUsd = roundUsd(input.exitValuationUsd * exitOwnershipFraction);
  const exitDate = exitDateFor(input.exitYear);

  const irr = xirr([
    ...input.tranches.map((tranche) => ({ date: tranche.expectedDate, amount: -tranche.amountUsd })),
    { date: exitDate, amount: projectedProceedsUsd },
  ]);

  return {
    commitmentUsd,
    exitOwnershipPct: roundTo(exitOwnershipFraction * 100, 4),
    projectedProceedsUsd,
    projectedMoic: roundTo(moic(commitmentUsd, projectedProceedsUsd) ?? 0, 4),
    projectedIrr: irr === null ? null : roundTo(irr, 6),
    exitDate,
  };
}
