import type { ClosingExtraction, ExpenseCategory } from '@nksq/contracts';
import { asRecord, createReaders, object, readSources, readWarnings, SOURCES_SCHEMA, TEXT, VALUE_FORMAT_RULES, WARNINGS_SCHEMA } from './extraction-helpers';

// What Claude is asked to read from closing documents, and how its answer is checked before anyone sees it.

export const CLOSING_PROMPT_VERSION = 'closing-2026-09-17';

const EXPENSE_CATEGORIES: ExpenseCategory[] = ['LEGAL', 'DUE_DILIGENCE', 'STAMP_DUTY', 'ADVISORY', 'OTHER'];

export const CLOSING_SCHEMA = object({
  closing: object({
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
  }),
  sources: SOURCES_SCHEMA,
  warnings: WARNINGS_SCHEMA,
});

export const CLOSING_SYSTEM_PROMPT = `You read closing documents for NKSquared, a private investment firm: share subscription or purchase agreements, shareholders' agreements, allotment letters, board resolutions, share certificates, closing memos, funds-flow statements and wire confirmations. You extract what actually happened when NKSquared's investment closed.

These figures become the official record of the transaction and replace what the investment committee approved, so accuracy matters more than completeness. They pre-fill a form that a person reviews before saving.

${VALUE_FORMAT_RULES}

Field meanings (all about NKSquared's own investment in this closing, not other investors'):
- closing.closeDate: the date the shares were allotted or the transaction completed. If only a signing date is given, use it and add a warning.
- closing.trancheNumber: which tranche of a staged investment this is (1 for the first), only if the document says so.
- closing.securityClass: the security issued, e.g. "Series B CCPS" or "Equity shares".
- closing.sharesAllotted: the number of shares or securities allotted to NKSquared in this closing.
- closing.originalCurrency: the three-letter code of the currency NKSquared paid in, e.g. USD or INR.
- closing.originalAmount and closing.originalPricePerShare: the amount paid and price per share in that currency.
- closing.fxRateUsdPerUnit: US dollars per one unit of originalCurrency (for INR at 83.2 per USD, write 0.0120192). Leave empty for USD or if no rate is stated.
- closing.amountInvestedUsd and closing.pricePerShareUsd: the same amounts in USD. For USD deals these equal the original amounts.
- closing.postMoneyValuationUsd: the company's post-money valuation for this round, in USD.
- closing.fullyDilutedSharesAfter: the company's total fully diluted share count after this closing.
- closing.ownershipPctAfter: NKSquared's fully diluted ownership after this closing, 0–100, including any shares it already held. If it isn't stated but both share counts are, compute it and add a warning saying so.
- closing.expenses: transaction costs paid by NKSquared, one line each, with category LEGAL, DUE_DILIGENCE, STAMP_DUTY (including other government duties and filing fees), ADVISORY, or OTHER, a short description, and the amount in USD. Leave out costs the company pays.
- closing.notes: one or two sentences on anything unusual, such as conditions subsequent or deferred consideration.

If shares × price per share differs from the amount invested by more than 1%, add a warning with both figures.`;

export const CLOSING_INSTRUCTION = 'Extract the closing details from this document.';

type Normalised = Omit<ClosingExtraction, 'extractionId' | 'documentId' | 'model'>;

export function normaliseClosing(raw: unknown): Normalised {
  const root = asRecord(raw);
  const closing = asRecord(root.closing);
  const warnings = readWarnings(root);
  const { text, number, date } = createReaders(warnings);

  const currency = text(closing.originalCurrency, 10)?.toUpperCase() ?? null;
  const expenses = (Array.isArray(closing.expenses) ? closing.expenses : []).slice(0, 30).map((item, index) => {
    const expense = asRecord(item);
    const category = EXPENSE_CATEGORIES.includes(expense.category as ExpenseCategory) ? (expense.category as ExpenseCategory) : 'OTHER';
    return {
      category,
      description: text(expense.description, 200),
      amountUsd: number(expense.amountUsd, `expense ${index + 1} amount`, { min: 0 }),
    };
  });

  return {
    closing: {
      closeDate: date(closing.closeDate, 'close date'),
      trancheNumber: number(closing.trancheNumber, 'tranche number', { min: 1, max: 50, integer: true }),
      securityClass: text(closing.securityClass, 120),
      sharesAllotted: number(closing.sharesAllotted, 'shares allotted', { above: 0 }),
      pricePerShareUsd: number(closing.pricePerShareUsd, 'price per share', { above: 0 }),
      amountInvestedUsd: number(closing.amountInvestedUsd, 'amount invested', { above: 0 }),
      originalCurrency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
      originalAmount: number(closing.originalAmount, 'amount in original currency', { above: 0 }),
      originalPricePerShare: number(closing.originalPricePerShare, 'price per share in original currency', { above: 0 }),
      fxRateUsdPerUnit: number(closing.fxRateUsdPerUnit, 'exchange rate', { above: 0 }),
      postMoneyValuationUsd: number(closing.postMoneyValuationUsd, 'post-money valuation', { above: 0 }),
      fullyDilutedSharesAfter: number(closing.fullyDilutedSharesAfter, 'fully diluted shares', { above: 0 }),
      ownershipPctAfter: number(closing.ownershipPctAfter, 'ownership after closing', { above: 0, max: 100 }),
      notes: text(closing.notes, 4000),
      expenses,
    },
    sources: readSources(root),
    warnings,
  };
}
