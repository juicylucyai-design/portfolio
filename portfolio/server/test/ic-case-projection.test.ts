import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectIcCase } from '../src/modules/ic-case/ic-case.projection';

test('single tranche: $10M for 20%, exit at $125M valuation in 2030', () => {
  const projection = projectIcCase({
    approvedOn: '2026-11-01',
    entryPostMoneyUsd: 50_000_000,
    entryOwnershipPct: 20,
    dilutionToExitPct: 0,
    exitYear: 2030,
    exitValuationUsd: 125_000_000,
    tranches: [{ amountUsd: 10_000_000, expectedDate: '2026-12-31' }],
  });
  assert.equal(projection.commitmentUsd, 10_000_000);
  assert.equal(projection.projectedProceedsUsd, 25_000_000);
  assert.equal(projection.projectedMoic, 2.5);
  assert.equal(projection.exitDate, '2030-12-31');
  assert.ok(projection.projectedIrr !== null && Math.abs(projection.projectedIrr - 0.25722) < 0.0001);
});

test('three tranches with 25% dilution to exit', () => {
  const projection = projectIcCase({
    approvedOn: '2025-12-10',
    entryPostMoneyUsd: 50_000_000,
    entryOwnershipPct: 20,
    dilutionToExitPct: 25,
    exitYear: 2031,
    exitValuationUsd: 200_000_000,
    tranches: [
      { amountUsd: 4_000_000, expectedDate: '2026-01-15' },
      { amountUsd: 3_000_000, expectedDate: '2026-08-20' },
      { amountUsd: 3_000_000, expectedDate: '2027-06-30' },
    ],
  });
  assert.equal(projection.commitmentUsd, 10_000_000);
  assert.equal(projection.exitOwnershipPct, 15);
  assert.equal(projection.projectedProceedsUsd, 30_000_000);
  assert.equal(projection.projectedMoic, 3);
  assert.ok(projection.projectedIrr !== null && projection.projectedIrr > 0.2 && projection.projectedIrr < 0.3);
});

test('zero exit valuation projects a total loss with no IRR', () => {
  const projection = projectIcCase({
    approvedOn: '2026-01-01',
    entryPostMoneyUsd: 10_000_000,
    entryOwnershipPct: 10,
    dilutionToExitPct: 0,
    exitYear: 2029,
    exitValuationUsd: 0,
    tranches: [{ amountUsd: 1_000_000, expectedDate: '2026-02-01' }],
  });
  assert.equal(projection.projectedMoic, 0);
  assert.equal(projection.projectedIrr, null);
});
