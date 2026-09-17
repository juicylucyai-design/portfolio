import { BadRequestException } from '@nestjs/common';
import type { IcCaseInput, IcTrancheInput } from '@nksq/contracts';
import { asObject, optionalString, requireArray, requireDate, requireNumber } from '../../common/validation';

const MAX_TRANCHES = 20;

/** Validates an IC case from a request body. Error messages use the form's field labels. */
export function parseIcCaseInput(body: unknown): IcCaseInput {
  const input = asObject(body, 'IC case');
  const trancheInputs = requireArray(input, 'tranches', 'tranche');
  if (trancheInputs.length > MAX_TRANCHES) throw new BadRequestException(`An IC case can have at most ${MAX_TRANCHES} tranches.`);

  const tranches: IcTrancheInput[] = trancheInputs.map((raw, index) => {
    const tranche = asObject(raw, `Tranche ${index + 1}`);
    return {
      amountUsd: requireNumber(tranche, 'amountUsd', `Tranche ${index + 1} amount`, { greaterThan: 0 }),
      expectedDate: requireDate(tranche, 'expectedDate', `Tranche ${index + 1} expected date`),
      milestone: optionalString(tranche, 'milestone', `Tranche ${index + 1} milestone`, 300),
    };
  });

  return {
    approvedOn: requireDate(input, 'approvedOn', 'IC approval date'),
    entryPostMoneyUsd: requireNumber(input, 'entryPostMoneyUsd', 'Entry post-money valuation', { greaterThan: 0 }),
    entryOwnershipPct: requireNumber(input, 'entryOwnershipPct', 'Entry ownership', { greaterThan: 0, max: 100 }),
    dilutionToExitPct: requireNumber(input, 'dilutionToExitPct', 'Dilution to exit', { min: 0, lessThan: 100 }),
    exitYear: requireNumber(input, 'exitYear', 'Exit year', { integer: true, min: 1990, max: 2200 }),
    exitValuationUsd: requireNumber(input, 'exitValuationUsd', 'Exit valuation', { min: 0 }),
    notes: optionalString(input, 'notes', 'Notes', 4000),
    tranches,
  };
}
