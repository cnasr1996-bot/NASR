/**
 * Vintage effect — warm, slightly faded, retro look for the printed photo.
 *
 * Works on raw RGBA pixels (canvas ImageData or any {data, width, height}),
 * so the same code runs in the renderer and in Node tests.
 *
 * Pipeline per pixel:
 *   1. partial sepia (toned monochrome mixed with the original colour)
 *   2. warm white balance (more red/yellow, less blue)
 *   3. soft S-curve contrast
 *   4. fade: lifted blacks + rolled-off highlights (old print paper look)
 *   5. vignette (darker corners)
 *   6. fine film grain (deterministic, so previews match prints)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Vintage = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = {
    sepia: 0.35,       // 0..1 how much of the sepia tone to mix in
    warmth: 0.08,      // 0..0.3 red boost / blue cut
    contrast: 0.12,    // 0..0.5 strength of the S-curve
    fadeBlack: 0.07,   // 0..0.2 how far blacks are lifted
    fadeWhite: 0.04,   // 0..0.2 how far whites are pulled down
    vignette: 0.35,    // 0..1 corner darkening
    grain: 0.035,      // 0..0.1 grain amplitude
    seed: 1337,
  };

  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  // Builds a 256-entry lookup table for the tonal curve (contrast + fade).
  function buildToneLut(o) {
    const lut = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      let v = i / 255;
      // smoothstep-based S-curve, blended by `contrast`
      const s = v * v * (3 - 2 * v);
      v = v + (s - v) * o.contrast * 2;
      v = o.fadeBlack + clamp01(v) * (1 - o.fadeBlack - o.fadeWhite);
      lut[i] = v;
    }
    return lut;
  }

  // Small, fast deterministic PRNG (mulberry32).
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Applies the effect in place.
   * @param {{data: Uint8ClampedArray|Uint8Array, width: number, height: number}} img
   * @param {object} [options] see DEFAULTS
   * @returns the same image object
   */
  function apply(img, options) {
    const o = Object.assign({}, DEFAULTS, options || {});
    const { data, width, height } = img;
    const lut = buildToneLut(o);
    const rand = rng(o.seed);
    const cx = width / 2;
    const cy = height / 2;
    const maxD2 = cx * cx + cy * cy;
    const s = o.sepia;
    const warmR = 1 + o.warmth;
    const warmG = 1 + o.warmth * 0.35;
    const warmB = 1 - o.warmth * 1.5;

    for (let y = 0; y < height; y++) {
      const dy = y - cy;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        let r = data[i] / 255;
        let g = data[i + 1] / 255;
        let b = data[i + 2] / 255;

        // 1. sepia
        const sr = 0.393 * r + 0.769 * g + 0.189 * b;
        const sg = 0.349 * r + 0.686 * g + 0.168 * b;
        const sb = 0.272 * r + 0.534 * g + 0.131 * b;
        r = r + (sr - r) * s;
        g = g + (sg - g) * s;
        b = b + (sb - b) * s;

        // 2. warmth
        r *= warmR;
        g *= warmG;
        b *= warmB;

        // 3 + 4. tone curve via LUT
        r = lut[(clamp01(r) * 255) | 0];
        g = lut[(clamp01(g) * 255) | 0];
        b = lut[(clamp01(b) * 255) | 0];

        // 5. vignette (quadratic falloff from the centre)
        const dx = x - cx;
        const d = (dx * dx + dy * dy) / maxD2;
        const vig = 1 - o.vignette * d * d;

        // 6. grain (same offset on all channels = luminance grain)
        const n = (rand() - 0.5) * 2 * o.grain;

        data[i] = clamp01(r * vig + n) * 255 + 0.5;
        data[i + 1] = clamp01(g * vig + n) * 255 + 0.5;
        data[i + 2] = clamp01(b * vig + n) * 255 + 0.5;
      }
    }
    return img;
  }

  return { apply, DEFAULTS };
});
