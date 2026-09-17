import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countUnionFields } from '../src/modules/intake/extraction-helpers';
import { FINANCIAL_STATEMENT_SCHEMA, normaliseFinancialStatement } from '../src/modules/intake/financial-statement.extraction';

test('reads a quarterly statement answer into checked values', () => {
  const result = normaliseFinancialStatement({
    statement: {
      periodType: 'QUARTERLY',
      fiscalYear: '2027',
      quarter: '2',
      periodEndDate: '2027-06-30',
      revenueUsd: '2,500,000',
      ebitdaUsd: '-150000',
    },
    sources: [],
    warnings: [],
  });
  assert.equal(result.statement.periodType, 'QUARTERLY');
  assert.equal(result.statement.fiscalYear, 2027);
  assert.equal(result.statement.quarter, 2);
  assert.equal(result.statement.periodEndDate, '2027-06-30');
  assert.equal(result.statement.revenueUsd, 2_500_000);
  assert.equal(result.statement.ebitdaUsd, -150_000);
});

test('an annual statement drops any stray quarter number', () => {
  const result = normaliseFinancialStatement({
    statement: { periodType: 'ANNUAL', fiscalYear: '2027', quarter: '3', periodEndDate: '2027-12-31', revenueUsd: '10000000', ebitdaUsd: '1000000' },
    sources: [],
    warnings: [],
  });
  assert.equal(result.statement.periodType, 'ANNUAL');
  assert.equal(result.statement.quarter, null);
});

test('an unknown period type is dropped with a warning', () => {
  const result = normaliseFinancialStatement({
    statement: { periodType: 'MONTHLY', fiscalYear: '2027', quarter: '', periodEndDate: '2027-01-31', revenueUsd: '', ebitdaUsd: '' },
    sources: [],
    warnings: [],
  });
  assert.equal(result.statement.periodType, null);
  assert.ok(result.warnings.some((w) => w.includes('period type')));
});

test('financial statement schema stays within the API limit on nullable fields', () => {
  assert.equal(countUnionFields(FINANCIAL_STATEMENT_SCHEMA), 0);
});
