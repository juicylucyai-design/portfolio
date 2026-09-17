import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { findClaudeCode } from '../src/modules/intake/claude-code.reader';
import { chooseReader } from '../src/modules/intake/pdf-reader';

test('the API reader is the default', () => {
  assert.equal(chooseReader({}), 'api');
  assert.equal(chooseReader({ CLAUDE_READER: 'API' }), 'api');
});

test('the Claude Code reader can be chosen for local runs', () => {
  assert.equal(chooseReader({ CLAUDE_READER: 'claude-code', NODE_ENV: 'staging' }), 'claude-code');
});

test('the Claude Code reader is refused in production and on Railway', () => {
  assert.throws(() => chooseReader({ CLAUDE_READER: 'claude-code', NODE_ENV: 'production' }), /local/);
  assert.throws(() => chooseReader({ CLAUDE_READER: 'claude-code', RAILWAY_ENVIRONMENT: 'production' }), /Railway/);
  assert.throws(() => chooseReader({ CLAUDE_READER: 'claude-code', RAILWAY_PROJECT_ID: 'abc' }), /Railway/);
});

test('an unknown reader name is an error, not a silent fallback', () => {
  assert.throws(() => chooseReader({ CLAUDE_READER: 'desktop' }), /must be/);
});

test('finds the newest Claude Code bundled with the desktop app', () => {
  const appData = mkdtempSync(path.join(os.tmpdir(), 'nksq-appdata-'));
  const exeName = process.platform === 'win32' ? 'claude.exe' : 'claude';
  for (const version of ['2.1.9', '2.1.271', '2.1.30']) {
    mkdirSync(path.join(appData, 'Claude', 'claude-code', version), { recursive: true });
    writeFileSync(path.join(appData, 'Claude', 'claude-code', version, exeName), '');
  }
  assert.equal(findClaudeCode({ APPDATA: appData }), path.join(appData, 'Claude', 'claude-code', '2.1.271', exeName));
  assert.equal(findClaudeCode({ APPDATA: path.join(appData, 'missing') }), null);
  assert.equal(findClaudeCode({ CLAUDE_CODE_PATH: path.join(appData, 'nope.exe') }), null);
});
