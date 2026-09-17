import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAPITAL_EVENT_SCHEMA, normaliseCapitalEvent } from '../src/modules/intake/capital-event.extraction';
import { countUnionFields } from '../src/modules/intake/extraction-helpers';

const answer = {
  capitalEvent: {
    eventType: 'SECONDARY_TRANSACTION',
    eventDate: '2026-02-25',
    sellingParty: 'Checkout.com',
    buyingParty: 'Kablar Capital LLC',
    securityClass: 'Series A Preferred Shares',
    shares: '146926',
    pricePerShareUsd: '68.06',
    totalConsiderationUsd: '9999783.56',
    impliedValuationUsd: '2500000000',
    deadlineDate: '2026-03-12',
    notes: 'ROFR notice for a secondary transaction.',
  },
  sources: [{ field: 'capitalEvent.impliedValuationUsd', page: 0, quote: 'Implied Equity Valuation: $2.50 billion' }],
  warnings: [],
};

test('reads a capital event answer into checked values', () => {
  const { capitalEvent, warnings } = normaliseCapitalEvent(answer);
  assert.equal(capitalEvent.eventType, 'SECONDARY_TRANSACTION');
  assert.equal(capitalEvent.eventDate, '2026-02-25');
  assert.equal(capitalEvent.sellingParty, 'Checkout.com');
  assert.equal(capitalEvent.buyingParty, 'Kablar Capital LLC');
  assert.equal(capitalEvent.shares, 146_926);
  assert.equal(capitalEvent.pricePerShareUsd, 68.06);
  assert.equal(capitalEvent.totalConsiderationUsd, 9_999_783.56);
  assert.equal(capitalEvent.impliedValuationUsd, 2_500_000_000);
  assert.equal(capitalEvent.deadlineDate, '2026-03-12');
  assert.deepEqual(warnings, []);
});

test('an unknown event type is dropped with a warning', () => {
  const { capitalEvent, warnings } = normaliseCapitalEvent({
    ...answer,
    capitalEvent: { ...answer.capitalEvent, eventType: 'ROFR_NOTICE' },
  });
  assert.equal(capitalEvent.eventType, null);
  assert.equal(warnings.length, 1);
});

test('capital event schema stays within the API limit on nullable fields', () => {
  assert.equal(countUnionFields(CAPITAL_EVENT_SCHEMA), 0);
});
