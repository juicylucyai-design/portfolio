import type { IcMemoExtraction } from '@nksq/contracts';
import { asRecord, createReaders, object, readSources, readWarnings, SOURCES_SCHEMA, TEXT, WARNINGS_SCHEMA } from './extraction-helpers';

// What Claude is asked to read from an IC memo, and how its answer is checked before anyone sees it.
// Bump the prompt version whenever the prompt or schema changes; it's stored with every extraction.

export const IC_MEMO_PROMPT_VERSION = 'ic-memo-2026-09-17b';

/** Keep in step with the instrument list on the New investment page. */
export const INSTRUMENTS = ['Preferred equity', 'Common equity', 'SAFE', 'Convertible note', 'Venture debt', 'Fund commitment', 'Other'];

export const IC_MEMO_SCHEMA = object({
  company: object({
    companyName: TEXT,
    sector: TEXT,
    geography: TEXT,
    instrument: { type: 'string', enum: [...INSTRUMENTS, ''] },
    dealLead: TEXT,
    fiscalYearEndMonth: TEXT,
  }),
  icCase: object({
    approvedOn: TEXT,
    entryPostMoneyUsd: TEXT,
    entryOwnershipPct: TEXT,
    dilutionToExitPct: TEXT,
    exitYear: TEXT,
    exitValuationUsd: TEXT,
    notes: TEXT,
    tranches: { type: 'array', items: object({ amountUsd: TEXT, expectedDate: TEXT, milestone: TEXT }) },
  }),
  statedReturns: object({ irrPct: TEXT, moic: TEXT }),
  currency: object({ memoCurrency: TEXT, convertedToUsd: { type: 'boolean' }, fxNote: TEXT }),
  sources: SOURCES_SCHEMA,
  warnings: WARNINGS_SCHEMA,
});

export const IC_MEMO_SYSTEM_PROMPT = `You read investment committee (IC) memos for NKSquared, a private investment firm, and extract the figures its portfolio system needs to record a new investment and its IC-approved projection.

The extracted values pre-fill a form that a person reviews before saving, so accuracy matters more than completeness. Use an empty string for anything the memo does not state or let you derive with confidence. Never invent a figure.

Format: every value is a string. Write numbers as plain digits with an optional decimal point and minus sign, no currency symbols, commas, units or percent signs (25000000, 20, 24.5). Write dates as YYYY-MM-DD. Write years and months as digits (2031, 3). In sources, use page 0 when you can't tell the page.

Currency: the portfolio system works only in US dollars.
- If the memo's amounts are in USD, use them as stated.
- If they are in another currency and the memo gives an exchange rate, convert every amount to USD with that rate, set convertedToUsd to true, and describe the rate in fxNote (for example "INR converted at 83.2 per USD, as stated on page 3").
- If there is no rate in the memo, leave the USD amount fields empty, set convertedToUsd to false, name the currency in memoCurrency, and add a warning.
- Write amounts in whole dollars: "$25M" is 25000000, "$1.2bn" is 1200000000.

Field meanings:
- company.companyName: the portfolio company's legal or trading name, not NKSquared's.
- company.instrument: the closest match to the security NKSquared is buying.
- company.dealLead: the NKSquared person leading or sponsoring the deal, if named.
- company.fiscalYearEndMonth: 1–12, only if the memo states the company's financial year end.
- icCase.approvedOn: the date of the IC meeting or approval. If only the memo's own date is given, use it and add a warning saying so.
- icCase.entryPostMoneyUsd: the company's post-money valuation at NKSquared's entry.
- icCase.entryOwnershipPct: NKSquared's fully diluted ownership at entry, as a percentage from 0 to 100.
- icCase.dilutionToExitPct: expected dilution from future rounds before exit, as a percentage from 0 to 100. If the memo gives ownership at entry and at exit instead, compute 100 × (1 − exit ÷ entry). If it says nothing about dilution, leave it empty.
- icCase.exitYear: the calendar year of the projected exit. If the memo gives a holding period instead, add it to the expected closing year.
- icCase.exitValuationUsd: the company's equity valuation at exit. If the memo only gives NKSquared's exit proceeds and ownership at exit, derive valuation = proceeds ÷ ownership at exit, and add a warning describing the derivation.
- icCase.tranches: each planned payment by NKSquared, with its amount and expected date, in order. A single upfront investment is one tranche dated at the expected closing (or the approval date if no closing date is given). Put any condition for release, such as a milestone, in milestone.
- icCase.notes: two or three sentences on the investment thesis and key conditions of approval.
- statedReturns: the projected IRR (as a percentage, e.g. 24.5) and MOIC (e.g. 3.2) exactly as the memo states them for the base case.

When the memo shows several scenarios, use the base or expected case and add a warning naming which case you used.

sources: for each value you filled in, give the field path (for example "icCase.exitYear"), the PDF page number it came from, and a short quote of at most 20 words.
warnings: anything a reviewer should double-check: assumptions, derivations, conflicting figures, or values you left empty because the memo was ambiguous.`;

export const IC_MEMO_INSTRUCTION = 'Extract the IC memo fields from this document.';

type Normalised = Omit<IcMemoExtraction, 'extractionId' | 'documentId' | 'model'>;

/** Turns Claude's answer into checked form values. */
export function normaliseIcMemo(raw: unknown): Normalised {
  const root = asRecord(raw);
  const company = asRecord(root.company);
  const ic = asRecord(root.icCase);
  const returns = asRecord(root.statedReturns);
  const currency = asRecord(root.currency);
  const warnings = readWarnings(root);
  const { text, number, date } = createReaders(warnings);

  const instrument = text(company.instrument);
  const tranches = (Array.isArray(ic.tranches) ? ic.tranches : [])
    .slice(0, 20)
    .map((item, index) => {
      const tranche = asRecord(item);
      return {
        amountUsd: number(tranche.amountUsd, `tranche ${index + 1} amount`, { above: 0 }),
        expectedDate: date(tranche.expectedDate, `tranche ${index + 1} date`),
        milestone: text(tranche.milestone, 300),
      };
    })
    .filter((t) => t.amountUsd !== null || t.expectedDate !== null || t.milestone !== null);

  return {
    investment: {
      companyName: text(company.companyName),
      sector: text(company.sector, 100),
      geography: text(company.geography, 100),
      instrument: instrument && INSTRUMENTS.includes(instrument) ? instrument : null,
      dealLead: text(company.dealLead, 100),
      fiscalYearEndMonth: number(company.fiscalYearEndMonth, 'fiscal year end month', { min: 1, max: 12, integer: true }),
    },
    icCase: {
      approvedOn: date(ic.approvedOn, 'IC approval date'),
      entryPostMoneyUsd: number(ic.entryPostMoneyUsd, 'entry post-money valuation', { above: 0 }),
      entryOwnershipPct: number(ic.entryOwnershipPct, 'entry ownership', { above: 0, max: 100 }),
      dilutionToExitPct: number(ic.dilutionToExitPct, 'dilution to exit', { min: 0, below: 100 }),
      exitYear: number(ic.exitYear, 'exit year', { min: 1990, max: 2200, integer: true }),
      exitValuationUsd: number(ic.exitValuationUsd, 'exit valuation', { min: 0 }),
      notes: text(ic.notes, 4000),
      tranches,
    },
    statedReturns: {
      irrPct: number(returns.irrPct, 'stated IRR', { min: -100, max: 10000 }),
      moic: number(returns.moic, 'stated MOIC', { min: 0, max: 1000 }),
    },
    currency: {
      memoCurrency: text(currency.memoCurrency, 20),
      convertedToUsd: currency.convertedToUsd === true,
      fxNote: text(currency.fxNote, 500),
    },
    sources: readSources(root),
    warnings,
  };
}
