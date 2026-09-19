import type { IcCaseSummary, Position } from '@nksq/contracts';
import { roundTo, roundUsd, sumUsd } from '../../shared/money';
import { moic, xirr } from '../../shared/returns-engine';

/** The parts of a closing a position needs. */
export interface ClosingFigures {
  closingNumber: number;
  closeDate: string;
  /** Which IC tranche this closing drew, or null if it wasn't linked to one. */
  icTrancheNumber: number | null;
  sharesAllotted: number;
  amountInvestedUsd: number;
  expensesTotalUsd: number;
  ownershipPctAfter: number;
  /** The company's post-money valuation at this closing, if stated. */
  postMoneyValuationUsd?: number | null;
}

/** The parts of a capital event a position needs. Only priced events (with an implied valuation) matter here. */
export interface CapitalEventFigures {
  eventDate: string;
  impliedValuationUsd: number | null;
}

/**
 * Builds the current position for one investment.
 * - With closings, the closings are the record: cost is what was actually paid (including expenses), ownership is
 *   the latest closing's, and IRR uses each closing's actual date. The IC approval only supplies exit assumptions
 *   (exit year, exit valuation, dilution to exit).
 * - With no closing yet, the position is the IC approval as approved.
 * - A priced capital event (e.g. a secondary transaction) more recent than the latest closing marks the current
 *   valuation instead, since it's the newer evidence of what the company is worth.
 */
/** Tranches with no closing yet referencing them, i.e. what's left to draw. A tranche drawn for less (or more)
 *  than its approved amount still counts as drawn — the discount or premium isn't "still owed". */
function undrawnTranchesUsd(closings: ClosingFigures[], ic: IcCaseSummary): number {
  const drawn = new Set(closings.map((c) => c.icTrancheNumber).filter((n): n is number => n !== null));
  return sumUsd(ic.tranches.filter((t) => !drawn.has(t.trancheNumber)).map((t) => t.amountUsd));
}

export function computePosition(
  investmentId: number,
  closings: ClosingFigures[],
  ic: IcCaseSummary | null,
  capitalEvents: CapitalEventFigures[] = [],
): Position {
  const position = computeFromClosingsAndIc(investmentId, closings, ic);

  const pricedEvents = capitalEvents.filter((e): e is CapitalEventFigures & { impliedValuationUsd: number } => e.impliedValuationUsd !== null);
  if (pricedEvents.length === 0) return position;
  const latestEvent = [...pricedEvents].sort((a, b) => a.eventDate.localeCompare(b.eventDate)).at(-1)!;
  if (latestEvent.eventDate > (position.lastCloseDate ?? '')) {
    return { ...position, currentValuationUsd: latestEvent.impliedValuationUsd };
  }
  return position;
}

function computeFromClosingsAndIc(investmentId: number, closings: ClosingFigures[], ic: IcCaseSummary | null): Position {
  const notes: string[] = [];
  const base: Position = {
    investmentId,
    basis: 'NONE',
    closingCount: closings.length,
    lastCloseDate: null,
    investedUsd: null,
    expensesUsd: null,
    costUsd: null,
    sharesHeld: null,
    ownershipPct: null,
    entryValuationUsd: null,
    currentValuationUsd: null,
    icVersion: ic?.version ?? null,
    icCommitmentUsd: ic?.commitmentUsd ?? null,
    undrawnCommitmentUsd: null,
    exitYear: ic?.exitYear ?? null,
    exitValuationUsd: ic?.exitValuationUsd ?? null,
    dilutionToExitPct: ic?.dilutionToExitPct ?? null,
    projectedProceedsUsd: null,
    projectedMoic: null,
    projectedIrr: null,
    notes,
  };

  if (closings.length === 0) {
    if (!ic) return base;
    return {
      ...base,
      basis: 'IC',
      costUsd: ic.commitmentUsd,
      ownershipPct: ic.entryOwnershipPct,
      entryValuationUsd: ic.entryPostMoneyUsd,
      currentValuationUsd: ic.entryPostMoneyUsd,
      undrawnCommitmentUsd: undrawnTranchesUsd(closings, ic),
      projectedProceedsUsd: ic.projectedProceedsUsd,
      projectedMoic: ic.projectedMoic,
      projectedIrr: ic.projectedIrr,
    };
  }

  const ordered = [...closings].sort((a, b) => a.closeDate.localeCompare(b.closeDate) || a.closingNumber - b.closingNumber);
  const investedUsd = sumUsd(ordered.map((c) => c.amountInvestedUsd));
  const expensesUsd = sumUsd(ordered.map((c) => c.expensesTotalUsd));
  const costUsd = sumUsd([investedUsd, expensesUsd]);
  const latest = ordered[ordered.length - 1];

  const position: Position = {
    ...base,
    basis: 'CLOSING',
    lastCloseDate: latest.closeDate,
    investedUsd,
    expensesUsd,
    costUsd,
    sharesHeld: roundTo(ordered.reduce((sum, c) => sum + c.sharesAllotted, 0), 4),
    ownershipPct: latest.ownershipPctAfter,
    entryValuationUsd: ordered[0].postMoneyValuationUsd ?? ic?.entryPostMoneyUsd ?? null,
    currentValuationUsd: latest.postMoneyValuationUsd ?? ic?.entryPostMoneyUsd ?? null,
    undrawnCommitmentUsd: ic ? undrawnTranchesUsd(ordered, ic) : null,
  };

  if (!ic) {
    notes.push('No IC approval recorded, so there are no exit assumptions to project returns from.');
    return position;
  }

  const proceeds = roundUsd(ic.exitValuationUsd * (Math.max(0, latest.ownershipPctAfter - ic.dilutionToExitPct) / 100));
  const exitDate = `${ic.exitYear}-12-31`;
  position.projectedProceedsUsd = proceeds;
  position.projectedMoic = roundTo(moic(costUsd, proceeds) ?? 0, 4);

  if (exitDate <= latest.closeDate) {
    notes.push(`IC exit year ${ic.exitYear} is not after the latest closing, so IRR can't be projected. Record a revised IC with a later exit.`);
  } else {
    const irr = xirr([
      ...ordered.map((c) => ({ date: c.closeDate, amount: -sumUsd([c.amountInvestedUsd, c.expensesTotalUsd]) })),
      { date: exitDate, amount: proceeds },
    ]);
    position.projectedIrr = irr === null ? null : roundTo(irr, 6);
  }
  return position;
}
