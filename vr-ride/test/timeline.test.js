'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Timeline, validate, sampleTrack } = require('../src/timeline');
const { loadLibrary } = require('../src/library');
const path = require('path');

test('interpolates keyframes with ease types', () => {
  assert.equal(sampleTrack([[0, 0], [2, 10, 'linear']], 0.5), 2.5);
  assert.equal(sampleTrack([[0, 0], [2, 10]], 1), 5); // smooth: midpoint is still the midpoint
  assert.ok(sampleTrack([[0, 0], [2, 10]], 0.5) < 2.5); // ...but starts slow
  assert.equal(sampleTrack([[0, 0], [2, 10, 'step']], 1.99), 0);
  assert.equal(sampleTrack([[0, 0], [2, 10, 'step']], 2), 10);
});

test('holds first / last values outside the keyframes', () => {
  assert.equal(sampleTrack([[1, 5], [2, 7]], 0), 5);
  assert.equal(sampleTrack([[1, 5], [2, 7]], 99), 7);
});

test('missing tracks are neutral; water bursts', () => {
  const tl = new Timeline({ pitch: [[0, 4]], water: [[10, 1]] });
  const a = tl.sample(5);
  assert.equal(a.pitch, 4);
  assert.equal(a.roll, 0);
  assert.equal(a.water, false);
  assert.equal(tl.sample(10.5).water, true);
  assert.equal(tl.sample(11).water, false);
});

test('validation catches authoring mistakes', () => {
  const errors = validate({ pich: [[0, 1]], roll: [[2, 0], [1, 1]], fan: [[0, 1, 'bouncy']], water: [[3, 0]] });
  assert.equal(errors.length, 4);
  assert.throws(() => new Timeline({ roll: 'x' }), /invalid effects/);
});

test('bundled content loads without errors', () => {
  const lib = loadLibrary(path.join(__dirname, '..', 'content'));
  assert.ok(lib.size >= 1);
  for (const e of lib.values()) assert.deepEqual(e.errors, [], e.id);
});
