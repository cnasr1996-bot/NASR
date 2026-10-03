'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MotionLimiter, WaterGuard } = require('../src/safety');
const { NEUTRAL } = require('../src/timeline');

const limits = {
  pitch: { min: -10, max: 10, maxRate: 20 },
  roll: { min: -10, max: 10, maxRate: 20 },
};

test('clamps to the envelope', () => {
  const m = new MotionLimiter(limits);
  m.reset(NEUTRAL);
  let out;
  for (let i = 0; i < 100; i++) out = m.step({ ...NEUTRAL, pitch: 50, roll: -50 }, 0.1);
  assert.equal(out.pitch, 10);
  assert.equal(out.roll, -10);
});

test('limits speed so the chair never jumps', () => {
  const m = new MotionLimiter(limits);
  m.reset(NEUTRAL);
  assert.equal(m.step({ ...NEUTRAL, pitch: 10 }, 0.1).pitch, 2); // 20°/s × 0.1 s
  assert.equal(m.step({ ...NEUTRAL, pitch: 10 }, 0.1).pitch, 4);
  assert.equal(m.step(NEUTRAL, 0.1).pitch, 2); // parking is rate-limited too
});

test('water: burst length capped, gap enforced, show budget enforced', () => {
  const g = new WaterGuard({ maxOnMs: 1000, minOffMs: 500, maxPerShowMs: 1800 });
  assert.equal(g.step(true, 0), true);
  assert.equal(g.step(true, 999), true);
  assert.equal(g.step(true, 1000), false); // cut after 1 s
  assert.equal(g.step(true, 2000), false); // stays off while content still asks
  assert.equal(g.step(false, 2100), false);
  assert.equal(g.step(true, 2200), true); // let go and asked again → allowed
  assert.equal(g.step(true, 3000), false); // 1800 ms budget used
  assert.equal(g.step(false, 4000), false);
  assert.equal(g.step(true, 5000), false); // no more water this show
  g.newShow();
  assert.equal(g.step(true, 6000), true);
});

test('water: minimum off time between bursts', () => {
  const g = new WaterGuard({ maxOnMs: 1000, minOffMs: 500, maxPerShowMs: 10000 });
  g.step(true, 0);
  g.step(false, 200);
  assert.equal(g.step(true, 400), false);
  assert.equal(g.step(true, 700), true);
});
