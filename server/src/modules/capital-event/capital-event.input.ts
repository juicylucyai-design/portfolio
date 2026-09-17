import { BadRequestException } from '@nestjs/common';
import type { CapitalEventInput, CapitalEventType } from '@nksq/contracts';
import { asObject, Input, optionalString, requireDate, requireNumber } from '../../common/validation';

export const CAPITAL_EVENT_TYPES: CapitalEventType[] = ['SECONDARY_TRANSACTION', 'VALUATION_MARK', 'DIVIDEND', 'CAPITAL_CALL', 'TENDER_OFFER', 'OTHER'];

function optionalNumber(input: Input, key: string, label: string, options: { greaterThan?: number } = {}): number | null {
  const raw = input[key];
  if (raw === null || raw === undefined || raw === '') return null;
  return requireNumber(input, key, label, options);
}

function optionalDate(input: Input, key: string, label: string): string | null {
  const raw = input[key];
  if (raw === null || raw === undefined || raw === '') return null;
  return requireDate(input, key, label);
}

/** Validates a capital event from a request body. Error messages use the form's field labels. */
export function parseCapitalEventInput(body: unknown): CapitalEventInput {
  const input = asObject(body, 'Capital event');

  const eventType = input.eventType as CapitalEventType;
  if (!CAPITAL_EVENT_TYPES.includes(eventType)) throw new BadRequestException('Choose an event type.');

  return {
    eventType,
    eventDate: requireDate(input, 'eventDate', 'Event date'),
    sellingParty: optionalString(input, 'sellingParty', 'Selling party', 200),
    buyingParty: optionalString(input, 'buyingParty', 'Buying party', 200),
    securityClass: optionalString(input, 'securityClass', 'Security', 120),
    shares: optionalNumber(input, 'shares', 'Shares', { greaterThan: 0 }),
    pricePerShareUsd: optionalNumber(input, 'pricePerShareUsd', 'Price per share', { greaterThan: 0 }),
    totalConsiderationUsd: optionalNumber(input, 'totalConsiderationUsd', 'Total consideration', { greaterThan: 0 }),
    impliedValuationUsd: optionalNumber(input, 'impliedValuationUsd', 'Implied valuation', { greaterThan: 0 }),
    deadlineDate: optionalDate(input, 'deadlineDate', 'Deadline'),
    notes: optionalString(input, 'notes', 'Notes', 4000),
  };
}
