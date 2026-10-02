'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { strings, t } = require('../src/core/i18n');

test('Arabic and English have the same keys', () => {
  assert.deepEqual(Object.keys(strings.ar).sort(), Object.keys(strings.en).sort());
});

test('every data-i18n key in the UI exists', () => {
  const html = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');
  const keys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length > 10);
  for (const k of keys) assert.ok(k in strings.ar, `missing key ${k}`);
});

test('every payment failure and error code has a message', () => {
  for (const reason of ['declined', 'timeout', 'cancelled', 'error']) {
    assert.ok(`paymentFailed_${reason}` in strings.ar, reason);
  }
  for (const code of ['camera', 'capture', 'print']) assert.ok(`error_${code}` in strings.ar, code);
});

test('placeholders are filled', () => {
  assert.equal(t('en', 'paymentAmount', { amount: 20 }), 'SAR 20');
  assert.equal(t('ar', 'retakesLeft', { n: 2 }), 'محاولات متبقية: 2');
});
