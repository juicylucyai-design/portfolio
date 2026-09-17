import type { ClosingExtraction, ExpenseCategory } from '@nksq/contracts';
import { asRecord, createReaders, object, readSources, readWarnings, SOURCES_SCHEMA, TEXT, VALUE_FORMAT_RULES, WARNINGS_SCHEMA } from './extraction-helpers';

// What Claude is asked to read from closing documents, and how its answer is checked before anyone sees it.

export const CLOSING_PROMPT_VERSION = 'closing-2026-09-17';

const EXPENSE_CATEGORIES: ExpenseCategory[] = ['LEGAL', 'DUE_DILIGENCE', 'STAMP_DUTY', 'ADVISORY', 'OTHER'];

const CLOSING_ITEM = object({
  closeDate: TEXT,
  trancheNumber: TEXT,
  securityClass: TEXT,
  sharesAllotted: TEXT,
  pricePerShareUsd: TEXT,
  amountInvestedUsd: TEXT,
  originalCurrency: TEXT,
  originalAmount: TEXT,
  originalPricePerShare: TEXT,
  fxRateUsdPerUnit: TEXT,
  postMoneyValuationUsd: TEXT,
  fullyDilutedSharesAfter: TEXT,
  ownershipPctAfter: TEXT,
  notes: TEXT,
  expenses: {
    type: 'array',
    items: object({ category: { type: 'string', enum: EXPENSE_CATEGORIES }, description: TEXT, amountUsd: TEXT }),
  },
});

export const CLOSING_SCHEMA = object({
  closings: { type: 'array', items: CLOSING_ITEM },
  sources: SOURCES_SCHEMA,
  warnings: WARNINGS_SCHEMA,
});

export const CLOSING_SYSTEM_PROMPT = `You read closing documents for NKSquared, a private investment firm: share subscription or purchase agreements, shareholders' agreements, allotment letters, board resolutions, share certificates, closing memos, funds-flow statements and wire confirmations. You extract what actually happened when NKSquared's investment closed.

These figures become the official record of the transaction and replace what the investment committee approved, so accuracy matters more than completeness. They pre-fill a form that a person reviews before saving.

One document can cover more than one IC tranche, for example a combined allotment that draws two tranches at once, days apart, in a single closing memo. Return one entry in "closings" per tranche found, in the order they appear, each with the shares and amount specific to that tranche (not the combined total). Most documents cover exactly one tranche, so most of the time "closings" has exactly one entry.

${VALUE_FORMAT_RULES}

Field meanings (all about NKSquared's own investment in this closing, not other investors'), for each entry in "closings":
- closeDate: the date the shares were allotted or the transaction completed. If only a signing date is given, use it and add a warning.
- trancheNumber: which IC tranche this entry draws (1 for the first), only if the document says so.
- securityClass: the security issued, e.g. "Series B CCPS" or "Equity shares".
- sharesAllotted: the number of shares or securities allotted to NKSquared in this tranche.
- originalCurrency: the three-letter code of the currency NKSquared paid in, e.g. USD or INR.
- originalAmount and originalPricePerShare: the amount paid and price per share in that currency.
- fxRateUsdPerUnit: US dollars per one unit of originalCurrency (for INR at 83.2 per USD, write 0.0120192). Leave empty for USD or if no rate is stated.
- amountInvestedUsd and pricePerShareUsd: the same amounts in USD. For USD deals these equal the original amounts.
- postMoneyValuationUsd: the company's post-money valuation for this round, in USD.
- fullyDilutedSharesAfter: the company's total fully diluted share count after this specific tranche.
- ownershipPctAfter: NKSquared's fully diluted ownership after this specific tranche, 0–100, cumulative with any shares already held or allotted by an earlier entry in this same document.
- expenses: transaction costs paid by NKSquared for this tranche, one line each, with category LEGAL, DUE_DILIGENCE, STAMP_DUTY (including other government duties and filing fees), ADVISORY, or OTHER, a short description, and the amount in USD. Leave out costs the company pays. If the document only gives one combined expense total for every tranche, split it across entries in proportion to each tranche's amount invested and say so in a warning.
- notes: one or two sentences on anything unusual, such as conditions subsequent or deferred consideration.

If shares × price per share differs from the amount invested by more than 1%, add a warning with both figures.

sources: give each field path as "closings[N].fieldName", N starting at 0 (for example "closings[0].sharesAllotted", "closings[1].amountInvestedUsd").`;

export const CLOSING_INSTRUCTION = 'Extract the closing details from this document.';

type Normalised = Omit<ClosingExtraction, 'extractionId' | 'documentId' | 'model'>;

export function normaliseClosing(raw: unknown): Normalised {
  const root = asRecord(raw);
  const warnings = readWarnings(root);
  const { text, number, date } = createReaders(warnings);

  const rawClosings = Array.isArray(root.closings) ? root.closings : [];
  const closings = (rawClosings.length > 0 ? rawClosings : [{}]).slice(0, 20).map((item, index) => {
    const closing = asRecord(item);
    const currency = text(closing.originalCurrency, 10)?.toUpperCase() ?? null;
    const label = rawClosings.length > 1 ? ` (tranche entry ${index + 1})` : '';
    const expenses = (Array.isArray(closing.expenses) ? closing.expenses : []).slice(0, 30).map((expenseItem, expenseIndex) => {
      const expense = asRecord(expenseItem);
      const category = EXPENSE_CATEGORIES.includes(expense.category as ExpenseCategory) ? (expense.category as ExpenseCategory) : 'OTHER';
      return {
        category,
        description: text(expense.description, 200),
        amountUsd: number(expense.amountUsd, `expense ${expenseIndex + 1} amount${label}`, { min: 0 }),
      };
    });

    return {
      closeDate: date(closing.closeDate, `close date${label}`),
      trancheNumber: number(closing.trancheNumber, `tranche number${label}`, { min: 1, max: 50, integer: true }),
      securityClass: text(closing.securityClass, 120),
      sharesAllotted: number(closing.sharesAllotted, `shares allotted${label}`, { above: 0 }),
      pricePerShareUsd: number(closing.pricePerShareUsd, `price per share${label}`, { above: 0 }),
      amountInvestedUsd: number(closing.amountInvestedUsd, `amount invested${label}`, { above: 0 }),
      originalCurrency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
      originalAmount: number(closing.originalAmount, `amount in original currency${label}`, { above: 0 }),
      originalPricePerShare: number(closing.originalPricePerShare, `price per share in original currency${label}`, { above: 0 }),
      fxRateUsdPerUnit: number(closing.fxRateUsdPerUnit, `exchange rate${label}`, { above: 0 }),
      postMoneyValuationUsd: number(closing.postMoneyValuationUsd, `post-money valuation${label}`, { above: 0 }),
      fullyDilutedSharesAfter: number(closing.fullyDilutedSharesAfter, `fully diluted shares${label}`, { above: 0 }),
      ownershipPctAfter: number(closing.ownershipPctAfter, `ownership after closing${label}`, { above: 0, max: 100 }),
      notes: text(closing.notes, 4000),
      expenses,
    };
  });

  return {
    closings,
    sources: readSources(root),
    warnings,
  };
}
