import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IC_MEMO_SCHEMA, normaliseIcMemo } from '../src/modules/intake/ic-memo.extraction';

// Shaped like Claude's structured output: every value a string, empty string when not stated.
const answer = {
  company: {
    companyName: 'Example Robotics Pvt Ltd',
    sector: 'Industrial automation',
    geography: 'India',
    instrument: 'Preferred equity',
    dealLead: 'A. Partner',
    fiscalYearEndMonth: '3',
  },
  icCase: {
    approvedOn: '2026-08-28',
    entryPostMoneyUsd: '50000000',
    entryOwnershipPct: '20',
    dilutionToExitPct: '',
    exitYear: '2031',
    exitValuationUsd: '200000000',
    notes: 'Series B lead.',
    tranches: [
      { amountUsd: '6000000', expectedDate: '2026-09-30', milestone: 'At signing' },
      { amountUsd: '4,000,000', expectedDate: '2027-06-30', milestone: 'ARR above $5M' },
    ],
    financials: [
      { year: '2027', revenueUsd: '5000000', ebitdaUsd: '-500000' },
      { year: '2028', revenueUsd: '12000000', ebitdaUsd: '2000000' },
    ],
  },
  statedReturns: { irrPct: '24.5%', moic: '3' },
  currency: { memoCurrency: 'USD', convertedToUsd: false, fxNote: '' },
  sources: [
    { field: 'icCase.exitYear', page: 7, quote: 'Base case exit in FY2031' },
    { field: 'company.sector', page: 0, quote: 'Industrial automation' },
  ],
  warnings: ['Used the base case.'],
};

test('turns string answers into numbers, dates and nulls', () => {
  const result = normaliseIcMemo(answer);
  assert.equal(result.investment.companyName, 'Example Robotics Pvt Ltd');
  assert.equal(result.investment.fiscalYearEndMonth, 3);
  assert.equal(result.icCase.entryPostMoneyUsd, 50_000_000);
  assert.equal(result.icCase.dilutionToExitPct, null);
  assert.equal(result.icCase.exitYear, 2031);
  assert.deepEqual(result.icCase.tranches.map((t) => t.amountUsd), [6_000_000, 4_000_000]);
  assert.deepEqual(result.icCase.financials, [
    { year: 2027, revenueUsd: 5_000_000, ebitdaUsd: -500_000 },
    { year: 2028, revenueUsd: 12_000_000, ebitdaUsd: 2_000_000 },
  ]);
  assert.equal(result.statedReturns.irrPct, 24.5);
  assert.equal(result.currency.fxNote, null);
  assert.deepEqual(result.sources[0], { field: 'icCase.exitYear', page: 7, quote: 'Base case exit in FY2031' });
  assert.equal(result.sources[1].page, null);
  assert.deepEqual(result.warnings, ['Used the base case.']);
});

test('still accepts plain JSON numbers', () => {
  const result = normaliseIcMemo({ ...answer, icCase: { ...answer.icCase, exitYear: 2031, entryOwnershipPct: 20 } });
  assert.equal(result.icCase.exitYear, 2031);
  assert.equal(result.icCase.entryOwnershipPct, 20);
});

test('drops out-of-range and malformed values with a warning instead of passing them on', () => {
  const result = normaliseIcMemo({
    ...answer,
    company: { ...answer.company, fiscalYearEndMonth: '13', instrument: 'Warrants' },
    icCase: {
      ...answer.icCase,
      entryOwnershipPct: '120',
      exitYear: 'FY31',
      approvedOn: '2026-02-30',
      tranches: [{ amountUsd: '-5', expectedDate: 'next year', milestone: '' }],
    },
  });
  assert.equal(result.investment.fiscalYearEndMonth, null);
  assert.equal(result.investment.instrument, null);
  assert.equal(result.icCase.entryOwnershipPct, null);
  assert.equal(result.icCase.exitYear, null);
  assert.equal(result.icCase.approvedOn, null);
  assert.equal(result.icCase.tranches.length, 0);
  assert.ok(result.warnings.some((w) => w.includes('entry ownership')));
  assert.ok(result.warnings.some((w) => w.includes('exit year')));
  assert.ok(result.warnings.some((w) => w.includes('IC approval date')));
});

test('survives a completely unexpected answer', () => {
  const result = normaliseIcMemo('not json at all');
  assert.equal(result.investment.companyName, null);
  assert.deepEqual(result.icCase.tranches, []);
  assert.equal(result.currency.convertedToUsd, false);
});

test('schema meets the structured-outputs rules the API enforces', () => {
  let unionParameters = 0;
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const schema = node as Record<string, unknown>;
    if (schema.anyOf || Array.isArray(schema.type)) unionParameters++;
    if (schema.type === 'object') {
      assert.equal(schema.additionalProperties, false);
      assert.deepEqual([...(schema.required as string[])].sort(), Object.keys(schema.properties as object).sort());
    }
    Object.values(schema).forEach((value) => (Array.isArray(value) ? value.forEach(visit) : visit(value)));
  };
  visit(IC_MEMO_SCHEMA);
  // The API rejects schemas with more than 16 union-typed (nullable) parameters. This schema uses none.
  assert.equal(unionParameters, 0);
});
