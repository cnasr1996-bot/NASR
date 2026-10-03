'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Engine } = require('../src/engine');
const { Timeline } = require('../src/timeline');
const { createChair, createOutput } = require('../src/drivers');
const { quietLog, limits } = require('./helpers');

function setup({ seats = ['1'] } = {}) {
  let now = 1_000_000;
  const config = {
    engine: { tickHz: 50, leadMs: 0, headsetTimeoutMs: 1000, parkWhenHeadsetRemoved: true },
    headset: { poseHz: 25 },
    seats: seats.map((id) => ({ id, chair: { driver: 'mock', format: '{raw_pitch}' } })),
    outputs: [
      { id: 'fan', kind: 'fan', driver: 'mock', seats },
      { id: 'water', kind: 'water', driver: 'mock', seats },
    ],
    limits,
    water: { maxOnMs: 1500, minOffMs: 500, maxPerShowMs: 10000 },
  };
  const library = new Map([['ride', {
    id: 'ride', errors: [], duration: 20, video: { src: '/v.mp4', format: '360-mono' }, title: { en: 'Ride' },
    timeline: new Timeline({ pitch: [[0, 10], [20, 10]], fan: [[0, 1]], water: [[5, 1]] }),
  }]]);
  const engine = new Engine(config, { library, createChair, createOutput, log: quietLog, now: () => now });
  const headsets = {};
  for (const id of seats) {
    const sent = [];
    headsets[id] = { sent, handle: engine.attachHeadset(id, (m) => sent.push(m)) };
  }
  const run = (ms, each) => {
    for (let t = 0; t < ms; t += 20) {
      now += 20;
      each?.(now);
      engine.tick();
    }
  };
  const report = (id, t, playing = true) => engine.headsetMessage(id, { type: 'time', t, playing });
  const status = (id, state) => engine.headsetMessage(id, { type: 'status', state, inXR: true });
  const seat = (id) => engine.seats.get(id);
  const out = (id) => engine.outputs.find((o) => o.id === id);
  return { engine, headsets, run, report, status, seat, out, advance: (ms) => { now += ms; } };
}

function startShow(s, ids = ['1']) {
  s.engine.load('ride');
  for (const id of ids) s.status(id, 'ready');
  assert.equal(s.engine.show.state, 'ready');
  s.engine.start();
  for (const id of ids) s.status(id, 'playing');
}

test('load → ready → start drives the chair from the headset clock', () => {
  const s = setup();
  s.engine.load('ride');
  assert.equal(s.headsets['1'].sent.at(-1).type, 'load');
  assert.equal(s.engine.show.state, 'loading');
  assert.throws(() => s.engine.start(), /no headset is ready/);
  s.status('1', 'ready');
  s.engine.start();
  assert.equal(s.headsets['1'].sent.at(-1).type, 'play');
  s.status('1', 'playing');

  let t = 0;
  s.run(1000, () => { t += 0.02; s.report('1', t); });
  assert.equal(s.seat('1').output.pitch, 10); // reached target through the rate limiter
  assert.equal(s.out('fan').value, 1);
  assert.ok(s.headsets['1'].sent.some((m) => m.type === 'pose' && m.pitch > 0));
});

test('chair parks when the headset stops reporting', () => {
  const s = setup();
  startShow(s);
  let t = 0;
  s.run(1000, () => { t += 0.02; s.report('1', t); });
  assert.equal(s.seat('1').fault, null);
  s.run(1100); // silence
  assert.equal(s.seat('1').fault, 'headset-lost');
  s.run(1000);
  assert.equal(s.seat('1').output.pitch, 0);
  assert.equal(s.out('fan').value, 0);
});

test('chair parks when the rider takes the headset off, resumes when back on', () => {
  const s = setup();
  startShow(s);
  let t = 0;
  const tick = () => { t += 0.02; s.report('1', t); };
  s.run(1000, tick);
  s.engine.headsetMessage('1', { type: 'presence', worn: false });
  s.run(1000, tick);
  assert.equal(s.seat('1').fault, 'headset-removed');
  assert.equal(s.seat('1').output.pitch, 0);
  s.engine.headsetMessage('1', { type: 'presence', worn: true });
  s.run(1000, tick);
  assert.equal(s.seat('1').output.pitch, 10);
});

test('E-stop parks everything, cuts water, stops video, and blocks start until released', () => {
  const s = setup();
  startShow(s);
  let t = 4.5;
  s.run(800, () => { t += 0.02; s.report('1', t); });
  assert.equal(s.out('water').value, true);
  s.engine.setEstop(true);
  s.run(20);
  assert.equal(s.out('water').value, false);
  assert.equal(s.out('fan').value, 0);
  assert.ok(s.headsets['1'].sent.some((m) => m.type === 'stop'));
  s.run(1000);
  assert.equal(s.seat('1').output.pitch, 0);
  s.engine.load('ride');
  s.status('1', 'ready');
  assert.throws(() => s.engine.start(), /E-stop/);
  s.engine.setEstop(false);
  s.engine.start();
  assert.equal(s.engine.show.state, 'running');
});

test('buffering headset holds the chair (clock does not run ahead)', () => {
  const s = setup();
  startShow(s);
  s.report('1', 3, false);
  s.advance(500);
  assert.equal(s.seat('1').clock.time(s.engine.now()), 3);
});

test('each seat follows its own headset; show ends when every headset ends', () => {
  const s = setup({ seats: ['1', '2'] });
  startShow(s, ['1', '2']);
  s.run(200, () => { s.report('1', 10); s.report('2', 0.5); });
  s.status('1', 'ended');
  assert.equal(s.engine.show.state, 'running');
  s.status('2', 'ended');
  assert.equal(s.engine.show.state, 'idle');
});

test('seat without a headset is not part of the show', () => {
  const s = setup({ seats: ['1', '2'] });
  s.engine.detachHeadset('2', s.headsets['2'].handle);
  startShow(s, ['1']);
  assert.equal(s.seat('1').active, true);
  assert.equal(s.seat('2').active, false);
});

test('chair test pattern runs only when idle', () => {
  const s = setup();
  s.engine.testChair('1');
  s.run(2000);
  assert.ok(Math.abs(s.seat('1').output.pitch) > 1);
  startShow(s);
  assert.throws(() => s.engine.testChair('1'), /not while a show/);
});
