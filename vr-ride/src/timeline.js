'use strict';

/**
 * Effects timeline for one experience.
 *
 * Motion and fan tracks are keyframes: [timeSec, value, ease?]. The ease on a
 * keyframe describes how we arrive at it from the previous one:
 *   "smooth" (default) — ease in/out, no jerk at the keyframes
 *   "linear"           — constant speed
 *   "step"             — hold the previous value, then jump
 *
 * Units are what the author thinks in; the chair driver maps them to the
 * controller's range using config.limits:
 *   pitch / roll / yaw     degrees (+pitch = nose up, +roll = right side down, +yaw = turn right)
 *   heave / surge / sway   millimetres (+up, +forward, +right)
 *   vibration              0..1 seat shaker strength
 *   vibrationHz            shaker frequency
 *   fan                    0..1 (relay fans switch on above 0.5)
 *
 * Water is a list of bursts: [startSec, durationSec].
 */

const MOTION = ['pitch', 'roll', 'yaw', 'heave', 'surge', 'sway'];
const CHAIR = [...MOTION, 'vibration', 'vibrationHz'];
const KEYFRAME_TRACKS = [...CHAIR, 'fan'];
const EASES = ['smooth', 'linear', 'step'];

const NEUTRAL = Object.freeze({
  pitch: 0, roll: 0, yaw: 0, heave: 0, surge: 0, sway: 0, vibration: 0, vibrationHz: 30, fan: 0, water: false,
});

function validate(effects) {
  const errors = [];
  if (!effects || typeof effects !== 'object') return ['effects must be an object'];
  for (const [name, track] of Object.entries(effects)) {
    if (name !== 'water' && !KEYFRAME_TRACKS.includes(name)) {
      errors.push(`unknown track "${name}" (known: ${[...KEYFRAME_TRACKS, 'water'].join(', ')})`);
      continue;
    }
    if (!Array.isArray(track)) {
      errors.push(`${name}: must be an array`);
      continue;
    }
    let lastT = -Infinity;
    track.forEach((k, i) => {
      const where = `${name}[${i}]`;
      if (!Array.isArray(k) || typeof k[0] !== 'number' || typeof k[1] !== 'number') {
        errors.push(`${where}: expected [time, value${name === 'water' ? ' (duration)' : ''}]`);
        return;
      }
      if (k[0] < 0) errors.push(`${where}: negative time`);
      if (name === 'water') {
        if (k[1] <= 0) errors.push(`${where}: burst duration must be > 0`);
      } else {
        if (k[0] < lastT) errors.push(`${where}: keyframes must be in time order`);
        if (k[2] !== undefined && !EASES.includes(k[2])) errors.push(`${where}: unknown ease "${k[2]}"`);
      }
      lastT = k[0];
    });
  }
  return errors;
}

const smooth = (x) => x * x * (3 - 2 * x);

function sampleTrack(track, t) {
  if (!track || track.length === 0) return undefined;
  if (t <= track[0][0]) return track[0][1];
  const last = track[track.length - 1];
  if (t >= last[0]) return last[1];
  // Binary search for the segment [a, b] containing t.
  let lo = 0;
  let hi = track.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid][0] <= t) lo = mid; else hi = mid;
  }
  const a = track[lo];
  const b = track[hi];
  const ease = b[2] || 'smooth';
  if (ease === 'step' || b[0] === a[0]) return a[1];
  let x = (t - a[0]) / (b[0] - a[0]);
  if (ease === 'smooth') x = smooth(x);
  return a[1] + (b[1] - a[1]) * x;
}

class Timeline {
  constructor(effects = {}) {
    const errors = validate(effects);
    if (errors.length) throw new Error(`invalid effects:\n  ${errors.join('\n  ')}`);
    this.effects = effects;
  }

  /** All channel values at playback time t (seconds). Missing tracks stay neutral. */
  sample(t) {
    const out = { ...NEUTRAL };
    for (const name of KEYFRAME_TRACKS) {
      const v = sampleTrack(this.effects[name], t);
      if (v !== undefined) out[name] = v;
    }
    out.water = (this.effects.water || []).some(([start, dur]) => t >= start && t < start + dur);
    return out;
  }
}

module.exports = { Timeline, validate, sampleTrack, NEUTRAL, MOTION, CHAIR, KEYFRAME_TRACKS };
