'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Vintage = require('../src/core/vintage');

function solid(w, h, [r, g, b]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
  return { data, width: w, height: h };
}
const px = (img, x, y) => {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
};
const noGrain = { grain: 0 };

test('neutral grey turns warm (red > blue)', () => {
  const img = Vintage.apply(solid(9, 9, [128, 128, 128]), noGrain);
  const [r, g, b] = px(img, 4, 4);
  assert.ok(r > g && g > b, `expected warm tone, got ${r},${g},${b}`);
});

test('blacks are lifted and whites rolled off (faded look)', () => {
  const black = px(Vintage.apply(solid(9, 9, [0, 0, 0]), { ...noGrain, vignette: 0 }), 4, 4);
  const white = px(Vintage.apply(solid(9, 9, [255, 255, 255]), { ...noGrain, vignette: 0 }), 4, 4);
  assert.ok(Math.max(...black.slice(0, 3)) > 10, `black not lifted: ${black}`);
  assert.ok(Math.min(...white.slice(0, 3)) < 250, `white not faded: ${white}`);
});

test('corners are darker than the centre (vignette)', () => {
  const img = Vintage.apply(solid(101, 101, [200, 200, 200]), noGrain);
  assert.ok(px(img, 0, 0)[0] < px(img, 50, 50)[0]);
});

test('alpha is untouched and output is deterministic', () => {
  const a = Vintage.apply(solid(20, 20, [90, 140, 200]));
  const b = Vintage.apply(solid(20, 20, [90, 140, 200]));
  assert.deepEqual(a.data, b.data);
  assert.equal(px(a, 3, 3)[3], 255);
});

test('fast enough for a 6x4 print at 300 dpi', () => {
  const img = solid(1800, 1200, [120, 100, 80]);
  const t0 = performance.now();
  Vintage.apply(img);
  const ms = performance.now() - t0;
  assert.ok(ms < 1500, `took ${ms.toFixed(0)} ms`);
});
