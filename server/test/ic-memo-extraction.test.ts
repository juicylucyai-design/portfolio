import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IC_MEMO_SCHEMA, normaliseIcMemo } from '../src/modules/intake/ic-memo.extraction';

const answer = {
  company: {
    companyName: 'Example Robotics Pvt Ltd',
    sector: 'Industrial automation',
    geography: 'India',
    instrument: 'Preferred equity',
    dealLead: 'A. Partner',
    fiscalYearEndMonth: 3,
  },
  icCase: {
    approvedOn: '2026-08-28',
    entryPostMoneyUsd: 50_000_000,
    entryOwnershipPct: 20,
    dilutionToExitPct: 25,
    exitYear: 2031,
    exitValuationUsd: 200_000_000,
    notes: 'Series B lead.',
    tranches: [
      { amountUsd: 6_000_000, expectedDate: '2026-09-30', milestone: 'At signing' },
      { amountUsd: 4_000_000, expectedDate: '2027-06-30', milestone: 'ARR above $5M' },
    ],
  },
  statedReturns: { irrPct: 24.5, moic: 3 },
  currency: { memoCurrency: 'USD', convertedToUsd: false, fxNote: null },
  sources: [{ field: 'icCase.exitYear', page: 7, quote: 'Base case exit in FY2031' }],
  warnings: ['Used the base case.'],
};

test('keeps valid values as they are', () => {
  const result = normaliseIcMemo(answer);
  assert.equal(result.investment.companyName, 'Example Robotics Pvt Ltd');
  assert.equal(result.investment.fiscalYearEndMonth, 3);
  assert.equal(result.icCase.tranches.length, 2);
  assert.equal(result.icCase.exitValuationUsd, 200_000_000);
  assert.equal(result.statedReturns.irrPct, 24.5);
  assert.deepEqual(result.sources[0], { field: 'icCase.exitYear', page: 7, quote: 'Base case exit in FY2031' });
  assert.deepEqual(result.warnings, ['Used the base case.']);
});

test('drops out-of-range and malformed values with a warning instead of passing them on', () => {
  const result = normaliseIcMemo({
    ...answer,
    company: { ...answer.company, fiscalYearEndMonth: 13, instrument: 'Warrants' },
    icCase: {
      ...answer.icCase,
      entryOwnershipPct: 120,
      approvedOn: '2026-02-30',
      tranches: [{ amountUsd: -5, expectedDate: 'next year', milestone: null }],
    },
  });
  assert.equal(result.investment.fiscalYearEndMonth, null);
  assert.equal(result.investment.instrument, null);
  assert.equal(result.icCase.entryOwnershipPct, null);
  assert.equal(result.icCase.approvedOn, null);
  assert.equal(result.icCase.tranches.length, 0);
  assert.ok(result.warnings.some((w) => w.includes('entry ownership')));
  assert.ok(result.warnings.some((w) => w.includes('IC approval date')));
});

test('survives a completely unexpected answer', () => {
  const result = normaliseIcMemo('not json at all');
  assert.equal(result.investment.companyName, null);
  assert.deepEqual(result.icCase.tranches, []);
  assert.equal(result.currency.convertedToUsd, false);
});

test('schema requires every property and forbids extras, as structured outputs need', () => {
  const check = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const schema = node as Record<string, unknown>;
    if (schema.type === 'object') {
      assert.equal(schema.additionalProperties, false);
      assert.deepEqual([...(schema.required as string[])].sort(), Object.keys(schema.properties as object).sort());
    }
    Object.values(schema).forEach((value) => (Array.isArray(value) ? value.forEach(check) : check(value)));
  };
  check(IC_MEMO_SCHEMA);
});
