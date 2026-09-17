import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CLOSING_SCHEMA, normaliseClosing } from '../src/modules/intake/closing.extraction';
import { countUnionFields } from '../src/modules/intake/extraction-helpers';
import { IC_MEMO_SCHEMA } from '../src/modules/intake/ic-memo.extraction';

const oneClosing = {
  closeDate: '2026-09-30',
  trancheNumber: '1',
  securityClass: 'Series B CCPS',
  sharesAllotted: '60,000',
  pricePerShareUsd: '100',
  amountInvestedUsd: '6000000',
  originalCurrency: 'inr',
  originalAmount: '499200000',
  originalPricePerShare: '8320',
  fxRateUsdPerUnit: '0.0120192',
  postMoneyValuationUsd: '52000000',
  fullyDilutedSharesAfter: '520000',
  ownershipPctAfter: '11.54',
  notes: '',
  expenses: [
    { category: 'LEGAL', description: 'Company counsel', amountUsd: '120000' },
    { category: 'STAMP_DUTY', description: 'Stamp duty on allotment', amountUsd: '' },
    { category: 'BROKERAGE', description: 'Unknown category', amountUsd: '5000' },
  ],
};

const answer = {
  closings: [oneClosing],
  sources: [{ field: 'closings[0].sharesAllotted', page: 3, quote: '60,000 Series B CCPS allotted to NKSquared' }],
  warnings: ['INR converted at the rate in the funds-flow statement.'],
};

test('reads a closing answer into checked values', () => {
  const { closings, warnings } = normaliseClosing(answer);
  assert.equal(closings.length, 1);
  const closing = closings[0];
  assert.equal(closing.closeDate, '2026-09-30');
  assert.equal(closing.trancheNumber, 1);
  assert.equal(closing.sharesAllotted, 60_000);
  assert.equal(closing.originalCurrency, 'INR');
  assert.equal(closing.fxRateUsdPerUnit, 0.0120192);
  assert.equal(closing.ownershipPctAfter, 11.54);
  assert.equal(closing.notes, null);
  assert.equal(closing.expenses.length, 3);
  assert.equal(closing.expenses[1].amountUsd, null, 'a blank amount stays blank for the reviewer to fill in');
  assert.equal(closing.expenses[2].category, 'OTHER', 'unknown categories fall back to Other');
  assert.deepEqual(warnings, ['INR converted at the rate in the funds-flow statement.']);
});

test('rejects impossible closing figures', () => {
  const { closings, warnings } = normaliseClosing({
    ...answer,
    closings: [{ ...oneClosing, ownershipPctAfter: '140', sharesAllotted: '-1', originalCurrency: 'rupees' }],
  });
  const closing = closings[0];
  assert.equal(closing.ownershipPctAfter, null);
  assert.equal(closing.sharesAllotted, null);
  assert.equal(closing.originalCurrency, null);
  assert.equal(warnings.length, 3);
});

test('one document can cover more than one tranche', () => {
  const { closings } = normaliseClosing({
    ...answer,
    closings: [
      { ...oneClosing, trancheNumber: '1', amountInvestedUsd: '10000000' },
      { ...oneClosing, trancheNumber: '2', amountInvestedUsd: '5000000' },
    ],
  });
  assert.equal(closings.length, 2);
  assert.equal(closings[0].trancheNumber, 1);
  assert.equal(closings[1].trancheNumber, 2);
  assert.equal(closings[1].amountInvestedUsd, 5_000_000);
});

test('extraction schemas stay within the API limit on nullable fields (none used)', () => {
  assert.equal(countUnionFields(CLOSING_SCHEMA), 0);
  assert.equal(countUnionFields(IC_MEMO_SCHEMA), 0);
});
