'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const dgram = require('dgram');
const { createChair, createOutput, scale } = require('../src/drivers');
const { NEUTRAL } = require('../src/timeline');
const { quietLog, limits } = require('./helpers');

test('scales units to the controller range', () => {
  assert.equal(scale(0, { min: -15, max: 15 }, [0, 255], 0), '128');
  assert.equal(scale(-15, { min: -15, max: 15 }, [0, 255], 0), '0');
  assert.equal(scale(99, { min: -15, max: 15 }, [-1, 1], 2), '1.00');
});

test('chair line uses the configured format', () => {
  const chair = createChair({ driver: 'mock', format: 'P{pitch}R{roll}V{vibration}|{raw_pitch}\n', outputRange: [0, 255] }, limits, quietLog);
  chair.send({ ...NEUTRAL, pitch: 15, roll: -15, vibration: 1 });
  assert.equal(chair.transport.sent[0], 'P255R0V255|15.00\n');
});

test('chair over UDP', async () => {
  const rx = dgram.createSocket('udp4');
  await new Promise((r) => rx.bind(0, '127.0.0.1', r));
  const got = new Promise((r) => rx.once('message', (m) => r(m.toString())));
  const chair = createChair({ driver: 'udp', host: '127.0.0.1', port: rx.address().port, format: 'P{pitch}' }, limits, quietLog);
  chair.send({ ...NEUTRAL, pitch: 0 });
  assert.equal(await got, 'P128');
  chair.close();
  rx.close();
});

test('outputs only send on change; http templates for Shelly', () => {
  const water = createOutput({ id: 'w', kind: 'water', driver: 'mock', format: 'http://{host}/relay/{relay}?turn={onoff}&timer=2', host: '10.0.0.5' }, quietLog);
  water.set(false, 0);
  water.set(false, 10);
  water.set(true, 20);
  assert.deepEqual(water.transport.sent, ['http://10.0.0.5/relay/0?turn=off&timer=2', 'http://10.0.0.5/relay/0?turn=on&timer=2']);

  const fan = createOutput({ id: 'f', kind: 'fan', driver: 'mock', format: '{pct}', resendMs: 1000 }, quietLog);
  fan.set(0.5, 0);
  fan.set(0.5, 500);
  fan.set(0.5, 1000);
  assert.deepEqual(fan.transport.sent, ['50', '50']);
});
