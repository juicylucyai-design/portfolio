import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FinancialActual } from '@nksq/contracts';
import { compareFinancials } from '../src/modules/financial-actual/financial-comparison';

const actual = (over: Partial<FinancialActual>): FinancialActual => ({
  id: 1,
  investmentId: 1,
  periodType: 'ANNUAL',
  fiscalYear: 2027,
  quarter: null,
  periodEndDate: '2027-12-31',
  revenueUsd: null,
  ebitdaUsd: null,
  notes: null,
  createdBy: null,
  createdAt: '2027-01-01T00:00:00.000Z',
  ...over,
});

test('an annual actual within 5% of plan is meeting expectations', () => {
  const [row] = compareFinancials([{ year: 2027, revenueUsd: 10_000_000, ebitdaUsd: 1_000_000 }], [
    actual({ revenueUsd: 10_200_000, ebitdaUsd: 950_000 }),
  ], null);
  assert.equal(row.revenueStatus, 'MEETING');
  assert.equal(row.ebitdaStatus, 'MEETING');
  assert.equal(row.quartersReported, 0);
});

test('revenue well above plan is beating, EBITDA well below plan is below', () => {
  const [row] = compareFinancials([{ year: 2027, revenueUsd: 10_000_000, ebitdaUsd: 1_000_000 }], [
    actual({ revenueUsd: 12_000_000, ebitdaUsd: 500_000 }),
  ], null);
  assert.equal(row.revenueStatus, 'BEATING');
  assert.equal(row.ebitdaStatus, 'BELOW');
});

test('negative EBITDA plan: beating means losing less than planned', () => {
  const [row] = compareFinancials([{ year: 2027, revenueUsd: 5_000_000, ebitdaUsd: -1_000_000 }], [
    actual({ revenueUsd: 5_000_000, ebitdaUsd: -200_000 }),
  ], null);
  assert.equal(row.ebitdaStatus, 'BEATING');
});

test('two quarters reported: compared pro-rata against half the annual plan', () => {
  const [row] = compareFinancials(
    [{ year: 2027, revenueUsd: 8_000_000, ebitdaUsd: 2_000_000 }],
    [
      actual({ id: 1, periodType: 'QUARTERLY', quarter: 1, periodEndDate: '2027-03-31', revenueUsd: 2_000_000, ebitdaUsd: 500_000 }),
      actual({ id: 2, periodType: 'QUARTERLY', quarter: 2, periodEndDate: '2027-06-30', revenueUsd: 2_000_000, ebitdaUsd: 500_000 }),
    ],
    null,
  );
  // Expected at 2 of 4 quarters: 4M revenue, 1M EBITDA. Actual is exactly on plan.
  assert.equal(row.actualRevenueUsd, 4_000_000);
  assert.equal(row.actualEbitdaUsd, 1_000_000);
  assert.equal(row.quartersReported, 2);
  assert.equal(row.revenueStatus, 'MEETING');
  assert.equal(row.ebitdaStatus, 'MEETING');
});

test('an annual actual takes precedence over quarters reported the same year', () => {
  const [row] = compareFinancials(
    [{ year: 2027, revenueUsd: 8_000_000, ebitdaUsd: null }],
    [
      actual({ id: 1, periodType: 'QUARTERLY', quarter: 1, periodEndDate: '2027-03-31', revenueUsd: 1_000_000, ebitdaUsd: null }),
      actual({ id: 2, periodType: 'ANNUAL', periodEndDate: '2027-12-31', revenueUsd: 9_000_000, ebitdaUsd: null }),
    ],
    null,
  );
  assert.equal(row.actualRevenueUsd, 9_000_000);
  assert.equal(row.quartersReported, 0);
  // 9M vs an 8M plan is >5% over, so this correctly reads as beating, not just meeting, the annual plan.
  assert.equal(row.revenueStatus, 'BEATING');
});

test('no projection for the year: no status even though there is an actual', () => {
  const [row] = compareFinancials([], [actual({ revenueUsd: 1_000_000, ebitdaUsd: 100_000 })], null);
  assert.equal(row.revenueStatus, null);
  assert.equal(row.ebitdaStatus, null);
  assert.equal(row.projectedRevenueUsd, null);
});

test('a projected year with no actual yet: no status', () => {
  const [row] = compareFinancials([{ year: 2028, revenueUsd: 1_000_000, ebitdaUsd: 100_000 }], [], null);
  assert.equal(row.actualRevenueUsd, null);
  assert.equal(row.revenueStatus, null);
});

test('a year that ended before the entry date is shown as an actual outright, not a projection', () => {
  const [row] = compareFinancials([{ year: 2023, revenueUsd: 142_000_000, ebitdaUsd: 25_400_000 }], [], '2025-10-14');
  assert.equal(row.actualRevenueUsd, 142_000_000);
  assert.equal(row.actualEbitdaUsd, 25_400_000);
  assert.equal(row.projectedRevenueUsd, null);
  assert.equal(row.projectedEbitdaUsd, null);
  assert.equal(row.revenueStatus, null);
  assert.equal(row.ebitdaStatus, null);
});

test('a year ending after the entry date is still a projection, even if the year has since started', () => {
  const [row] = compareFinancials([{ year: 2025, revenueUsd: 421_000_000, ebitdaUsd: 46_500_000 }], [], '2025-10-14');
  assert.equal(row.projectedRevenueUsd, 421_000_000);
  assert.equal(row.actualRevenueUsd, null);
});

test('a real statement for a historical year still wins over the memo figure', () => {
  const [row] = compareFinancials(
    [{ year: 2023, revenueUsd: 142_000_000, ebitdaUsd: 25_400_000 }],
    [actual({ fiscalYear: 2023, periodEndDate: '2023-12-31', revenueUsd: 150_000_000, ebitdaUsd: 30_000_000 })],
    '2025-10-14',
  );
  assert.equal(row.actualRevenueUsd, 150_000_000);
  assert.equal(row.actualEbitdaUsd, 30_000_000);
});

test('with no entry date yet, nothing is treated as historical', () => {
  const [row] = compareFinancials([{ year: 2023, revenueUsd: 142_000_000, ebitdaUsd: 25_400_000 }], [], null);
  assert.equal(row.projectedRevenueUsd, 142_000_000);
  assert.equal(row.actualRevenueUsd, null);
});

test('a restated quarter uploaded later overrides the original, which stays out of the total', () => {
  const [row] = compareFinancials(
    [{ year: 2027, revenueUsd: 8_000_000, ebitdaUsd: null }],
    [
      actual({ id: 1, periodType: 'QUARTERLY', quarter: 1, periodEndDate: '2027-03-31', revenueUsd: 1_000_000, createdAt: '2027-04-01T00:00:00.000Z' }),
      actual({ id: 2, periodType: 'QUARTERLY', quarter: 1, periodEndDate: '2027-03-31', revenueUsd: 1_200_000, createdAt: '2027-05-01T00:00:00.000Z' }),
    ],
    null,
  );
  assert.equal(row.actualRevenueUsd, 1_200_000);
  assert.equal(row.quartersReported, 1);
});

test('an annual statement uploaded after quarterly ones still wins, regardless of upload order', () => {
  const [row] = compareFinancials(
    [{ year: 2027, revenueUsd: 8_000_000, ebitdaUsd: null }],
    [
      actual({ id: 1, periodType: 'ANNUAL', periodEndDate: '2027-12-31', revenueUsd: 9_000_000, createdAt: '2027-04-01T00:00:00.000Z' }),
      actual({ id: 2, periodType: 'QUARTERLY', quarter: 1, periodEndDate: '2027-03-31', revenueUsd: 1_000_000, createdAt: '2027-05-01T00:00:00.000Z' }),
    ],
    null,
  );
  assert.equal(row.actualRevenueUsd, 9_000_000);
  assert.equal(row.quartersReported, 0);
});

test('years are sorted and merged across projections and actuals', () => {
  const rows = compareFinancials(
    [
      { year: 2028, revenueUsd: 1, ebitdaUsd: 1 },
      { year: 2027, revenueUsd: 1, ebitdaUsd: 1 },
    ],
    [actual({ fiscalYear: 2029, revenueUsd: 1, ebitdaUsd: 1 })],
    null,
  );
  assert.deepEqual(rows.map((r) => r.year), [2027, 2028, 2029]);
});
