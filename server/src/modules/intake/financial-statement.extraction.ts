import type { FinancialPeriodType, FinancialStatementExtraction } from '@nksq/contracts';
import { asRecord, createReaders, object, readSources, readWarnings, SOURCES_SCHEMA, TEXT, VALUE_FORMAT_RULES, WARNINGS_SCHEMA } from './extraction-helpers';

// What Claude is asked to read from a portfolio company's quarterly or annual financial statement, and how
// its answer is checked before anyone sees it. Read alongside the IC memo's projections (see ic-memo.extraction.ts).

export const FINANCIAL_STATEMENT_PROMPT_VERSION = 'financial-statement-2026-09-17a';

const PERIOD_TYPES: FinancialPeriodType[] = ['QUARTERLY', 'ANNUAL'];

export const FINANCIAL_STATEMENT_SCHEMA = object({
  statement: object({
    periodType: { type: 'string', enum: [...PERIOD_TYPES, ''] },
    fiscalYear: TEXT,
    quarter: TEXT,
    periodEndDate: TEXT,
    revenueUsd: TEXT,
    ebitdaUsd: TEXT,
  }),
  sources: SOURCES_SCHEMA,
  warnings: WARNINGS_SCHEMA,
});

export const FINANCIAL_STATEMENT_SYSTEM_PROMPT = `You read a portfolio company's quarterly or annual financial statement for NKSquared, a private investment firm, and extract the period it covers along with total revenue and EBITDA (or the closest equivalent the statement reports, such as operating profit before depreciation and amortisation).

This pre-fills a form that a person reviews before saving, so accuracy matters more than completeness.

${VALUE_FORMAT_RULES}

Field meanings:
- statement.periodType: QUARTERLY for a single quarter's results, ANNUAL for a full fiscal year (including a year-to-date statement that covers the whole year, or an audited annual report).
- statement.fiscalYear: the fiscal year the statement covers (the year it ends in, e.g. a quarter ending March 2027 in a fiscal year starting April is FY2027 if that is how the company labels it — use the company's own fiscal year label when stated).
- statement.quarter: 1, 2, 3 or 4 for a QUARTERLY statement (the company's own fiscal quarter numbering); leave empty for an ANNUAL statement.
- statement.periodEndDate: the last day of the period covered.
- statement.revenueUsd: total revenue for the period, in USD.
- statement.ebitdaUsd: EBITDA for the period, in USD. If the statement doesn't label a figure "EBITDA", use operating profit/loss before depreciation and amortisation if that can be derived, and add a warning explaining the derivation. EBITDA can be negative.`;

export const FINANCIAL_STATEMENT_INSTRUCTION = 'Extract the financial statement fields from this document.';

type Normalised = Omit<FinancialStatementExtraction, 'extractionId' | 'documentId' | 'model'>;

export function normaliseFinancialStatement(raw: unknown): Normalised {
  const root = asRecord(raw);
  const statement = asRecord(root.statement);
  const warnings = readWarnings(root);
  const { text, number, date } = createReaders(warnings);

  const periodTypeRaw = text(statement.periodType);
  const periodType = periodTypeRaw && PERIOD_TYPES.includes(periodTypeRaw as FinancialPeriodType) ? (periodTypeRaw as FinancialPeriodType) : null;
  if (periodTypeRaw && !periodType) warnings.push(`Ignored period type (${periodTypeRaw}) because it is not QUARTERLY or ANNUAL.`);

  const quarter = number(statement.quarter, 'quarter', { min: 1, max: 4, integer: true });

  return {
    statement: {
      periodType,
      fiscalYear: number(statement.fiscalYear, 'fiscal year', { min: 1990, max: 2200, integer: true }),
      quarter: periodType === 'ANNUAL' ? null : quarter,
      periodEndDate: date(statement.periodEndDate, 'period end date'),
      revenueUsd: number(statement.revenueUsd, 'revenue', { min: 0 }),
      ebitdaUsd: number(statement.ebitdaUsd, 'EBITDA', { min: -1e15, max: 1e15 }),
    },
    sources: readSources(root),
    warnings,
  };
}
