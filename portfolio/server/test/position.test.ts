import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { IcCaseSummary } from '@nksq/contracts';
import { computePosition } from '../src/modules/performance/position';
import { npv } from '../src/shared/returns-engine';

const ic: IcCaseSummary = {
  investmentId: 1,
  version: 2,
  commitmentUsd: 10_000_000,
  projectedProceedsUsd: 30_000_000,
  projectedMoic: 3,
  projectedIrr: 0.25,
  exitYear: 2031,
  exitValuationUsd: 200_000_000,
  entryOwnershipPct: 20,
  dilutionToExitPct: 25,
  trancheCount: 2,
};

test('no closing yet: the IC approval is the position', () => {
  const position = computePosition(1, [], ic);
  assert.equal(position.basis, 'IC');
  assert.equal(position.costUsd, 10_000_000);
  assert.equal(position.projectedMoic, 3);
  assert.equal(position.undrawnCommitmentUsd, 10_000_000);
});

test('nothing recorded: empty position', () => {
  const position = computePosition(1, [], null);
  assert.equal(position.basis, 'NONE');
  assert.equal(position.costUsd, null);
});

test('closings replace the IC figures: actual cost with expenses, actual ownership, actual dates', () => {
  const closings = [
    { closingNumber: 1, closeDate: '2026-09-30', sharesAllotted: 60_000, amountInvestedUsd: 6_000_000, expensesTotalUsd: 150_000, ownershipPctAfter: 11.5 },
    { closingNumber: 2, closeDate: '2027-07-15', sharesAllotted: 38_000, amountInvestedUsd: 3_800_000, expensesTotalUsd: 20_000, ownershipPctAfter: 18.9 },
  ];
  const position = computePosition(1, closings, ic);
  assert.equal(position.basis, 'CLOSING');
  assert.equal(position.investedUsd, 9_800_000);
  assert.equal(position.expensesUsd, 170_000);
  assert.equal(position.costUsd, 9_970_000);
  assert.equal(position.sharesHeld, 98_000);
  assert.equal(position.ownershipPct, 18.9, 'ownership is the latest closing, not the IC entry ownership');
  assert.equal(position.undrawnCommitmentUsd, 200_000);
  // 200M exit × 18.9% × (1 − 25%) = 28.35M
  assert.equal(position.projectedProceedsUsd, 28_350_000);
  assert.equal(position.projectedMoic, Math.round((28_350_000 / 9_970_000) * 10000) / 10000);
  assert.ok(position.projectedIrr !== null);
  const flows = [
    { date: '2026-09-30', amount: -6_150_000 },
    { date: '2027-07-15', amount: -3_820_000 },
    { date: '2031-12-31', amount: 28_350_000 },
  ];
  assert.ok(Math.abs(npv(position.projectedIrr, flows)) < 50, 'IRR discounts actual closing cash flows, expenses included');
});

test('closings out of date order still use the latest closing for ownership', () => {
  const position = computePosition(1, [
    { closingNumber: 2, closeDate: '2027-01-01', sharesAllotted: 10, amountInvestedUsd: 100, expensesTotalUsd: 0, ownershipPctAfter: 15 },
    { closingNumber: 1, closeDate: '2026-01-01', sharesAllotted: 10, amountInvestedUsd: 100, expensesTotalUsd: 0, ownershipPctAfter: 10 },
  ], ic);
  assert.equal(position.ownershipPct, 15);
  assert.equal(position.lastCloseDate, '2027-01-01');
});

test('exit year not after the latest closing: no IRR, with a note saying why', () => {
  const position = computePosition(
    1,
    [{ closingNumber: 1, closeDate: '2032-02-01', sharesAllotted: 1, amountInvestedUsd: 1_000_000, expensesTotalUsd: 0, ownershipPctAfter: 10 }],
    ic,
  );
  assert.equal(position.projectedIrr, null);
  assert.ok(position.notes[0].includes('2031'));
});

test('closings without an IC approval: actuals, but no projection', () => {
  const position = computePosition(
    1,
    [{ closingNumber: 1, closeDate: '2026-02-01', sharesAllotted: 1, amountInvestedUsd: 1_000_000, expensesTotalUsd: 5_000, ownershipPctAfter: 10 }],
    null,
  );
  assert.equal(position.costUsd, 1_005_000);
  assert.equal(position.projectedMoic, null);
  assert.equal(position.notes.length, 1);
});
