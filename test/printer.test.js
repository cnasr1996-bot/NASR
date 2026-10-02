'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DnpPrinter } = require('../src/hardware/printer');
const { quietLog } = require('./helpers');

function make(capacity = 3) {
  const stateFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dnp-')), 'state.json');
  const alerts = [];
  const printed = [];
  const printer = new DnpPrinter(
    { driver: 'test', mediaCapacity: capacity, lowMediaWarning: 1, deviceName: 'X', paper: { widthIn: 6, heightIn: 4 } },
    { printImage: async (img, opts) => printed.push({ img, opts }), stateFile, log: quietLog, notify: (k, d) => alerts.push(k) },
  );
  return { printer, alerts, printed, stateFile };
}

test('sends 6x4 in page size in microns', async () => {
  const { printer, printed } = make();
  await printer.print('IMG');
  assert.deepEqual(printed[0].opts, { deviceName: 'X', widthMicrons: 152400, heightMicrons: 101600 });
});

test('media counter warns when low and blocks when empty', async () => {
  const { printer, alerts } = make(3);
  await printer.print('a');
  await printer.print('b');
  assert.deepEqual(alerts, ['media-low']);
  assert.equal((await printer.getStatus()).warning, 'media-low');
  await printer.print('c');
  const s = await printer.getStatus();
  assert.equal(s.ready, false);
  assert.equal(s.reason, 'media-out');
});

test('counter survives restarts and resets on roll change', async () => {
  const { printer, stateFile } = make(10);
  await printer.print('a');
  const again = new DnpPrinter(
    { driver: 'test', mediaCapacity: 10, lowMediaWarning: 1, paper: { widthIn: 6, heightIn: 4 } },
    { printImage: async () => {}, stateFile, log: quietLog },
  );
  assert.equal(again.remainingPrints(), 9);
  again.resetMediaCounter();
  assert.equal(again.remainingPrints(), 10);
});
