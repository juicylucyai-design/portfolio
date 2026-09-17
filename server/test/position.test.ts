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
  entryPostMoneyUsd: 50_000_000,
  entryOwnershipPct: 20,
  dilutionToExitPct: 25,
  tranches: [
    { trancheNumber: 1, amountUsd: 6_000_000, expectedDate: '2026-09-01', milestone: null },
    { trancheNumber: 2, amountUsd: 4_000_000, expectedDate: '2027-06-01', milestone: null },
  ],
};

test('no closing yet: the IC approval is the position', () => {
  const position = computePosition(1, [], ic);
  assert.equal(position.basis, 'IC');
  assert.equal(position.costUsd, 10_000_000);
  assert.equal(position.projectedMoic, 3);
  assert.equal(position.undrawnCommitmentUsd, 10_000_000);
  assert.equal(position.entryValuationUsd, 50_000_000, 'no closing yet, so valuation is the IC-approved entry valuation');
  assert.equal(position.currentValuationUsd, 50_000_000);
});

test('nothing recorded: empty position', () => {
  const position = computePosition(1, [], null);
  assert.equal(position.basis, 'NONE');
  assert.equal(position.costUsd, null);
});

test('closings replace the IC figures: actual cost with expenses, actual ownership, actual dates', () => {
  const closings = [
    { closingNumber: 1, closeDate: '2026-09-30', icTrancheNumber: 1, sharesAllotted: 60_000, amountInvestedUsd: 6_000_000, expensesTotalUsd: 150_000, ownershipPctAfter: 11.5 },
    { closingNumber: 2, closeDate: '2027-07-15', icTrancheNumber: 2, sharesAllotted: 38_000, amountInvestedUsd: 3_800_000, expensesTotalUsd: 20_000, ownershipPctAfter: 18.9 },
  ];
  const position = computePosition(1, closings, ic);
  assert.equal(position.basis, 'CLOSING');
  assert.equal(position.investedUsd, 9_800_000);
  assert.equal(position.expensesUsd, 170_000);
  assert.equal(position.costUsd, 9_970_000);
  assert.equal(position.sharesHeld, 98_000);
  assert.equal(position.ownershipPct, 18.9, 'ownership is the latest closing, not the IC entry ownership');
  assert.equal(position.undrawnCommitmentUsd, 0, 'both tranches have a closing, so nothing is left to draw even though tranche 2 closed for less than approved');
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

test('valuation: entry is the first closing\'s post-money, current is the latest closing\'s', () => {
  const closings = [
    { closingNumber: 1, closeDate: '2026-09-30', icTrancheNumber: 1, sharesAllotted: 60_000, amountInvestedUsd: 6_000_000, expensesTotalUsd: 0, ownershipPctAfter: 11.5, postMoneyValuationUsd: 40_000_000 },
    { closingNumber: 2, closeDate: '2027-07-15', icTrancheNumber: 2, sharesAllotted: 38_000, amountInvestedUsd: 3_800_000, expensesTotalUsd: 0, ownershipPctAfter: 18.9, postMoneyValuationUsd: 65_000_000 },
  ];
  const position = computePosition(1, closings, ic);
  assert.equal(position.entryValuationUsd, 40_000_000);
  assert.equal(position.currentValuationUsd, 65_000_000);
});

test('valuation falls back to the IC entry valuation when a closing has none recorded', () => {
  const closings = [
    { closingNumber: 1, closeDate: '2026-09-30', icTrancheNumber: 1, sharesAllotted: 60_000, amountInvestedUsd: 6_000_000, expensesTotalUsd: 0, ownershipPctAfter: 11.5 },
  ];
  const position = computePosition(1, closings, ic);
  assert.equal(position.entryValuationUsd, 50_000_000);
  assert.equal(position.currentValuationUsd, 50_000_000);
});

test('a tranche not yet closed stays undrawn, regardless of how much other tranches closed for', () => {
  const closings = [
    { closingNumber: 1, closeDate: '2026-09-30', icTrancheNumber: 1, sharesAllotted: 60_000, amountInvestedUsd: 6_000_000, expensesTotalUsd: 0, ownershipPctAfter: 11.5 },
  ];
  const position = computePosition(1, closings, ic);
  assert.equal(position.undrawnCommitmentUsd, 4_000_000, 'tranche 2 has no closing yet, so its full approved amount is still undrawn');
});

test('closings out of date order still use the latest closing for ownership', () => {
  const position = computePosition(1, [
    { closingNumber: 2, closeDate: '2027-01-01', icTrancheNumber: 2, sharesAllotted: 10, amountInvestedUsd: 100, expensesTotalUsd: 0, ownershipPctAfter: 15 },
    { closingNumber: 1, closeDate: '2026-01-01', icTrancheNumber: 1, sharesAllotted: 10, amountInvestedUsd: 100, expensesTotalUsd: 0, ownershipPctAfter: 10 },
  ], ic);
  assert.equal(position.ownershipPct, 15);
  assert.equal(position.lastCloseDate, '2027-01-01');
});

test('exit year not after the latest closing: no IRR, with a note saying why', () => {
  const position = computePosition(
    1,
    [{ closingNumber: 1, closeDate: '2032-02-01', icTrancheNumber: 1, sharesAllotted: 1, amountInvestedUsd: 1_000_000, expensesTotalUsd: 0, ownershipPctAfter: 10 }],
    ic,
  );
  assert.equal(position.projectedIrr, null);
  assert.ok(position.notes.some((note) => note.includes('2031')));
});

test('closings without an IC approval: actuals, but no projection', () => {
  const position = computePosition(
    1,
    [{ closingNumber: 1, closeDate: '2026-02-01', icTrancheNumber: null, sharesAllotted: 1, amountInvestedUsd: 1_000_000, expensesTotalUsd: 5_000, ownershipPctAfter: 10 }],
    null,
  );
  assert.equal(position.costUsd, 1_005_000);
  assert.equal(position.projectedMoic, null);
  assert.ok(position.notes.some((note) => note.includes('No IC approval')));
});

const closedAt40m = [
  { closingNumber: 1, closeDate: '2026-02-01', icTrancheNumber: 1, sharesAllotted: 1, amountInvestedUsd: 6_000_000, expensesTotalUsd: 0, ownershipPctAfter: 11.5, postMoneyValuationUsd: 40_000_000 },
];

test('a priced capital event after the latest closing marks the current valuation', () => {
  const position = computePosition(1, closedAt40m, ic, [{ eventDate: '2026-06-01', impliedValuationUsd: 65_000_000 }]);
  assert.equal(position.currentValuationUsd, 65_000_000);
  assert.equal(position.entryValuationUsd, 40_000_000, 'entry valuation is unaffected by later capital events');
});

test('a capital event before the latest closing does not override the current valuation', () => {
  const position = computePosition(1, closedAt40m, ic, [{ eventDate: '2025-01-01', impliedValuationUsd: 65_000_000 }]);
  assert.equal(position.currentValuationUsd, 40_000_000);
});

test('a capital event with no implied valuation is ignored for marking purposes', () => {
  const position = computePosition(1, closedAt40m, ic, [{ eventDate: '2026-06-01', impliedValuationUsd: null }]);
  assert.equal(position.currentValuationUsd, 40_000_000);
});

test('the most recent of several priced capital events wins', () => {
  const position = computePosition(1, closedAt40m, ic, [
    { eventDate: '2026-06-01', impliedValuationUsd: 65_000_000 },
    { eventDate: '2026-08-01', impliedValuationUsd: 80_000_000 },
  ]);
  assert.equal(position.currentValuationUsd, 80_000_000);
});
