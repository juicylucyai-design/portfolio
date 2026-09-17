import { BadRequestException } from '@nestjs/common';
import type { FinancialActualInput, FinancialPeriodType } from '@nksq/contracts';
import { asObject, optionalNumber, optionalString, requireDate, requireNumber } from '../../common/validation';

const PERIOD_TYPES: FinancialPeriodType[] = ['QUARTERLY', 'ANNUAL'];

/** Validates a financial actual from a request body. Error messages use the form's field labels. */
export function parseFinancialActualInput(body: unknown): FinancialActualInput {
  const input = asObject(body, 'Financial statement');

  const periodType = input.periodType as FinancialPeriodType;
  if (!PERIOD_TYPES.includes(periodType)) throw new BadRequestException('Choose whether this is a quarterly or annual statement.');

  const quarter = periodType === 'QUARTERLY' ? requireNumber(input, 'quarter', 'Quarter', { integer: true, min: 1, max: 4 }) : null;

  return {
    periodType,
    fiscalYear: requireNumber(input, 'fiscalYear', 'Fiscal year', { integer: true, min: 1990, max: 2200 }),
    quarter,
    periodEndDate: requireDate(input, 'periodEndDate', 'Period end date'),
    revenueUsd: optionalNumber(input, 'revenueUsd', 'Revenue', { min: 0 }),
    ebitdaUsd: optionalNumber(input, 'ebitdaUsd', 'EBITDA'),
    notes: optionalString(input, 'notes', 'Notes', 2000),
  };
}
