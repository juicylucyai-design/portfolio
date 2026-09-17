import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeCarry } from '../src/modules/carry/carry.calc';

const fullTerms = { qualified: true, originationPct: 5, monitoringPct: 5, closurePct: 10 };
// 2021-01-01 to 2024-01-01 spans exactly three non-leap years: 1095 actual days / 365 = 3.0 years exactly.
const entry = '2021-01-01';
const threeYearsLater = '2024-01-01';

test('same person for all three roles: 20% of carriable profit, hurdle compounded over the holding period', () => {
  // Proceeds 20M, cost 10M -> profit 10M. Hurdle = 10M * (1.12^3 - 1) = 4,049,280. Carriable = 5,950,720.
  const carry = computeCarry(20_000_000, 10_000_000, entry, threeYearsLater, fullTerms, 12);
  assert.equal(carry.profitUsd, 10_000_000);
  assert.equal(carry.hurdleAmountUsd, 4_049_280);
  assert.equal(carry.carriableProfitUsd, 5_950_720);
  assert.equal(carry.originationCarryUsd, 297_536);
  assert.equal(carry.monitoringCarryUsd, 297_536);
  assert.equal(carry.closureCarryUsd, 595_072);
  assert.equal(carry.totalCarryUsd, 1_190_144, '20% of 5,950,720 carriable profit');
});

test('a longer holding period compounds a bigger hurdle, leaving less carriable profit', () => {
  const oneYear = computeCarry(20_000_000, 10_000_000, '2023-01-01', '2024-01-01', fullTerms, 12);
  const threeYears = computeCarry(20_000_000, 10_000_000, entry, threeYearsLater, fullTerms, 12);
  assert.ok(oneYear.hurdleAmountUsd !== null && threeYears.hurdleAmountUsd !== null);
  assert.ok(threeYears.hurdleAmountUsd! > oneYear.hurdleAmountUsd!);
  assert.ok(threeYears.totalCarryUsd! < oneYear.totalCarryUsd!);
});

test('a non-qualified investment is a pass-through: no carry', () => {
  const carry = computeCarry(20_000_000, 10_000_000, entry, threeYearsLater, { ...fullTerms, qualified: false }, 12);
  assert.equal(carry.profitUsd, null);
  assert.equal(carry.totalCarryUsd, null);
});

test('missing entry or as-of date means no carry figures at all', () => {
  assert.equal(computeCarry(20_000_000, 10_000_000, null, threeYearsLater, fullTerms, 12).totalCarryUsd, null);
  assert.equal(computeCarry(20_000_000, 10_000_000, entry, null, fullTerms, 12).totalCarryUsd, null);
});

test('a loss (proceeds below cost) has zero profit and zero carry, not negative', () => {
  const carry = computeCarry(5_000_000, 10_000_000, entry, threeYearsLater, fullTerms, 12);
  assert.equal(carry.profitUsd, 0);
  assert.equal(carry.carriableProfitUsd, 0);
  assert.equal(carry.totalCarryUsd, 0);
});

test('a hurdle bigger than profit floors carriable profit at zero, not negative', () => {
  // Profit is only 1M, but the 12%/yr compounded hurdle on 10M cost over 3 years is over 4M.
  const carry = computeCarry(11_000_000, 10_000_000, entry, threeYearsLater, fullTerms, 12);
  assert.equal(carry.profitUsd, 1_000_000);
  assert.ok(carry.hurdleAmountUsd! > carry.profitUsd!);
  assert.equal(carry.carriableProfitUsd, 0);
  assert.equal(carry.totalCarryUsd, 0);
});

test('nothing to project (no IC approval, no closing) means no carry figures at all', () => {
  const carry = computeCarry(null, null, null, null, fullTerms, 12);
  assert.equal(carry.profitUsd, null);
  assert.equal(carry.totalCarryUsd, null);
});

test('different people can have different, lower role percentages', () => {
  const carry = computeCarry(20_000_000, 10_000_000, entry, threeYearsLater, { qualified: true, originationPct: 3, monitoringPct: 2, closurePct: 10 }, 12);
  // Carriable profit is still 5,950,720; roles sum to 15%.
  assert.equal(carry.originationCarryUsd, 178_521.6);
  assert.equal(carry.monitoringCarryUsd, 119_014.4);
  assert.equal(carry.closureCarryUsd, 595_072);
  assert.equal(carry.totalCarryUsd, 892_608);
});

test('a 0% hurdle carries the entire profit regardless of holding period', () => {
  const carry = computeCarry(20_000_000, 10_000_000, entry, threeYearsLater, fullTerms, 0);
  assert.equal(carry.hurdleAmountUsd, 0);
  assert.equal(carry.carriableProfitUsd, 10_000_000);
  assert.equal(carry.totalCarryUsd, 2_000_000);
});
