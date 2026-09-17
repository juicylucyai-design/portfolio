import type { CapitalEventExtraction, CapitalEventType } from '@nksq/contracts';
import { asRecord, createReaders, object, readSources, readWarnings, SOURCES_SCHEMA, TEXT, VALUE_FORMAT_RULES, WARNINGS_SCHEMA } from './extraction-helpers';

// What Claude is asked to read from capital-event sources (mostly emails from the portfolio company: ROFR
// notices, secondary-transaction notices, valuation updates), and how its answer is checked before anyone sees it.

export const CAPITAL_EVENT_PROMPT_VERSION = 'capital-event-2026-09-17';

const CAPITAL_EVENT_TYPES: CapitalEventType[] = ['SECONDARY_TRANSACTION', 'VALUATION_MARK', 'DIVIDEND', 'CAPITAL_CALL', 'TENDER_OFFER', 'OTHER'];

export const CAPITAL_EVENT_SCHEMA = object({
  capitalEvent: object({
    eventType: { type: 'string', enum: CAPITAL_EVENT_TYPES },
    eventDate: TEXT,
    sellingParty: TEXT,
    buyingParty: TEXT,
    securityClass: TEXT,
    shares: TEXT,
    pricePerShareUsd: TEXT,
    totalConsiderationUsd: TEXT,
    impliedValuationUsd: TEXT,
    deadlineDate: TEXT,
    notes: TEXT,
  }),
  sources: SOURCES_SCHEMA,
  warnings: WARNINGS_SCHEMA,
});

export const CAPITAL_EVENT_SYSTEM_PROMPT = `You read notices about things that happen to a company NKSquared, a private investment firm, has already invested in: secondary share transactions between other parties, ROFR (right of first refusal) notices, valuation updates, dividends or distributions, capital calls, and tender offers. Most often this is an email from the portfolio company or its counsel. You extract what the notice says happened or is proposed, for NKSquared's records.

This pre-fills a form that a person reviews before saving, and it becomes evidence attached to the investment, so accuracy matters more than completeness.

${VALUE_FORMAT_RULES}

Field meanings:
- capitalEvent.eventType: SECONDARY_TRANSACTION for a share sale between other parties (including a ROFR notice about one); VALUATION_MARK for a notice that only updates the company's valuation with no transaction; DIVIDEND for a cash or share distribution to shareholders; CAPITAL_CALL for a request to fund a further tranche or commitment; TENDER_OFFER for a company-run buyback or tender; OTHER if none of these fit.
- capitalEvent.eventDate: the date the notice was sent or the transaction is dated. Use the email's date if no other date is stated.
- capitalEvent.sellingParty and capitalEvent.buyingParty: the named parties to the transaction, if any (not NKSquared unless NKSquared itself is buying or selling).
- capitalEvent.securityClass: the security involved, e.g. "Series A Preferred Shares".
- capitalEvent.shares: the number of shares in the transaction.
- capitalEvent.pricePerShareUsd and capitalEvent.totalConsiderationUsd: the price and total amount, in USD (convert if another currency is stated and a rate is given; otherwise leave empty and add a warning).
- capitalEvent.impliedValuationUsd: the company's implied equity valuation stated in the notice, in USD, if any.
- capitalEvent.deadlineDate: a response deadline stated in the notice (e.g. a ROFR exercise window), if any.
- capitalEvent.notes: one or two sentences summarising the notice for someone who won't read the full email — what it is, who it's from, and anything unusual.`;

export const CAPITAL_EVENT_INSTRUCTION = 'Extract the capital event details from this document.';

type Normalised = Omit<CapitalEventExtraction, 'extractionId' | 'documentId' | 'model'>;

export function normaliseCapitalEvent(raw: unknown): Normalised {
  const root = asRecord(raw);
  const event = asRecord(root.capitalEvent);
  const warnings = readWarnings(root);
  const { text, number, date } = createReaders(warnings);

  const eventType = CAPITAL_EVENT_TYPES.includes(event.eventType as CapitalEventType) ? (event.eventType as CapitalEventType) : null;
  if (!eventType) warnings.push(`Ignored event type (${String(event.eventType)}) because it is not one of the known types.`);

  return {
    capitalEvent: {
      eventType,
      eventDate: date(event.eventDate, 'event date'),
      sellingParty: text(event.sellingParty, 200),
      buyingParty: text(event.buyingParty, 200),
      securityClass: text(event.securityClass, 120),
      shares: number(event.shares, 'shares', { above: 0 }),
      pricePerShareUsd: number(event.pricePerShareUsd, 'price per share', { above: 0 }),
      totalConsiderationUsd: number(event.totalConsiderationUsd, 'total consideration', { above: 0 }),
      impliedValuationUsd: number(event.impliedValuationUsd, 'implied valuation', { above: 0 }),
      deadlineDate: date(event.deadlineDate, 'deadline'),
      notes: text(event.notes, 4000),
    },
    sources: readSources(root),
    warnings,
  };
}
