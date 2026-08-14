import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveConfig } from '../dist/config.js';

const base = {
  platform: 'SectorAlarm',
  name: 'Sector Alarm',
  email: 'user@example.com',
  password: 'secret',
  code: '1234',
};

test('accepts a numeric PIN and defaults control flags to true', () => {
  const resolved = resolveConfig(base);
  assert.equal(typeof resolved, 'object');
  if (typeof resolved === 'string') {
    return;
  }
  assert.equal(resolved.allowDisarm, true);
  assert.equal(resolved.allowLockControl, true);
  assert.equal(resolved.code, '1234');
});

test('rejects a non-numeric PIN', () => {
  assert.equal(typeof resolveConfig({ ...base, code: '12ab' }), 'string');
});

test('honours allowDisarm false', () => {
  const resolved = resolveConfig({ ...base, allowDisarm: false });
  assert.equal(typeof resolved, 'object');
  if (typeof resolved === 'string') {
    return;
  }
  assert.equal(resolved.allowDisarm, false);
});
