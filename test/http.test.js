import assert from 'node:assert/strict';
import { test } from 'node:test';

import { summarizeHttpErrorBody } from '../dist/sector/api.js';

test('redacts secrets in API error bodies', () => {
  const body = '{"Password":"hunter2","AuthorizationToken":"aaa.bbb.ccc","PanelCode":"1234"}';
  const summary = summarizeHttpErrorBody(body);
  assert.equal(summary.includes('hunter2'), false);
  assert.equal(summary.includes('aaa.bbb.ccc'), false);
  assert.equal(summary.includes('1234'), false);
  assert.equal(summary.includes('[redacted]'), true);
});

test('truncates long error bodies', () => {
  const summary = summarizeHttpErrorBody('x'.repeat(500));
  assert.equal(summary.endsWith('…'), true);
  assert.ok(summary.length <= 181);
});
