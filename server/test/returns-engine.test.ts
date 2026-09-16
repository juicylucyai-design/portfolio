import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moic, npv, xirr } from '../src/shared/returns-engine';
import { sumUsd } from '../src/shared/money';

test('xirr matches Excel for the XIRR documentation example', () => {
  const rate = xirr([
    { date: '2008-01-01', amount: -10000 },
    { date: '2008-03-01', amount: 2750 },
    { date: '2008-10-30', amount: 4250 },
    { date: '2009-02-15', amount: 3250 },
    { date: '2009-04-01', amount: 2750 },
  ]);
  assert.ok(rate !== null);
  assert.ok(Math.abs(rate - 0.373362535) < 1e-6, `expected 0.373362535, got ${rate}`);
});

test('xirr of a single investment and exit equals the compound annual rate', () => {
  const rate = xirr([
    { date: '2026-12-31', amount: -10_000_000 },
    { date: '2030-12-31', amount: 25_000_000 },
  ]);
  const days = 1461; // includes 29 Feb 2028
  assert.ok(rate !== null);
  assert.ok(Math.abs(rate - (Math.pow(2.5, 365 / days) - 1)) < 1e-9);
});

test('xirr handles a loss', () => {
  const rate = xirr([
    { date: '2026-01-01', amount: -1000 },
    { date: '2027-01-01', amount: 500 },
  ]);
  assert.ok(rate !== null);
  assert.ok(Math.abs(rate - -0.5) < 1e-9);
});

test('xirr is null without both money in and money out', () => {
  assert.equal(xirr([{ date: '2026-01-01', amount: -1000 }]), null);
  assert.equal(xirr([{ date: '2026-01-01', amount: -1000 }, { date: '2030-12-31', amount: 0 }]), null);
});

test('xirr solves multi-tranche flows to a zero NPV', () => {
  const flows = [
    { date: '2026-01-15', amount: -4_000_000 },
    { date: '2026-08-20', amount: -3_000_000 },
    { date: '2027-06-30', amount: -3_000_000 },
    { date: '2031-12-31', amount: 30_000_000 },
  ];
  const rate = xirr(flows);
  assert.ok(rate !== null);
  assert.ok(Math.abs(npv(rate, flows)) < 0.01);
});

test('moic and cent-exact sums', () => {
  assert.equal(moic(10_000_000, 25_000_000), 2.5);
  assert.equal(moic(0, 5), null);
  assert.equal(sumUsd([0.1, 0.2]), 0.3);
});
