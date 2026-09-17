import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emailToText } from '../src/modules/intake/email';

const RAW_EMAIL = [
  'From: Ahmed Almatrouk <ahmed.almatrouk@tamara.co>',
  'To: Sumit Sadana <sumit@nksqr.com>',
  'Subject: Tamara - ROFR Notice [Secondary Transaction]',
  'Date: Wed, 25 Feb 2026 10:12:04 +0000',
  'Content-Type: text/plain; charset="utf-8"',
  '',
  'Dear Tamara Shareholders,',
  '',
  'Implied Equity Valuation: $2.50 billion',
  '',
].join('\r\n');

test('decodes a raw .eml into plain text with header context', async () => {
  const text = await emailToText(Buffer.from(RAW_EMAIL, 'utf-8'));
  assert.match(text, /From: .*ahmed\.almatrouk@tamara\.co/);
  assert.match(text, /Subject: Tamara - ROFR Notice \[Secondary Transaction\]/);
  assert.match(text, /Dear Tamara Shareholders/);
  assert.match(text, /\$2\.50 billion/);
});
