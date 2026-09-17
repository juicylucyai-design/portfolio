import { BadRequestException } from '@nestjs/common';
import type { CarryTermsInput } from '@nksq/contracts';
import { asObject, Input, optionalString, requireNumber } from '../../common/validation';

function requireBoolean(input: Input, key: string, label: string): boolean {
  const value = input[key];
  if (typeof value !== 'boolean') throw new BadRequestException(`${label} must be true or false.`);
  return value;
}

/** Validates carry terms from a request body. Error messages use the form's field labels. */
export function parseCarryTermsInput(body: unknown): CarryTermsInput {
  const input = asObject(body, 'Carry terms');
  return {
    qualified: requireBoolean(input, 'qualified', 'Qualified'),
    originationPerson: optionalString(input, 'originationPerson', 'Origination person', 200),
    originationPct: requireNumber(input, 'originationPct', 'Origination %', { min: 0, max: 5 }),
    monitoringPerson: optionalString(input, 'monitoringPerson', 'Monitoring person', 200),
    monitoringPct: requireNumber(input, 'monitoringPct', 'Monitoring %', { min: 0, max: 5 }),
    closurePerson: optionalString(input, 'closurePerson', 'Closure person', 200),
    closurePct: requireNumber(input, 'closurePct', 'Closure %', { min: 0, max: 10 }),
  };
}

export function parseHurdleRate(body: unknown): number {
  const input = asObject(body, 'Hurdle rate');
  return requireNumber(input, 'hurdleRatePct', 'Hurdle rate', { min: 0, max: 100 });
}
