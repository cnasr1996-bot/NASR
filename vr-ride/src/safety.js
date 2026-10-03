'use strict';

const { CHAIR } = require('./timeline');

/**
 * Keeps the chair inside its configured envelope and never lets it jump:
 * every axis is clamped to [min, max] and its speed limited to maxRate
 * (units per second). Parking (return to neutral) goes through the same
 * limiter, so an E-stop or lost headset brings the rider down smoothly.
 *
 * This is a software guard only. The chair must also have its own
 * hardwired emergency stop and end-stops.
 */
class MotionLimiter {
  constructor(limits) {
    this.limits = limits;
    this.current = null;
  }

  reset(values) {
    this.current = { ...values };
  }

  step(target, dtSec) {
    if (!this.current) this.reset(target);
    const out = {};
    for (const axis of CHAIR) {
      const lim = this.limits[axis] || {};
      let v = target[axis];
      if (lim.min !== undefined) v = Math.max(lim.min, v);
      if (lim.max !== undefined) v = Math.min(lim.max, v);
      const prev = this.current[axis];
      if (lim.maxRate && prev !== undefined) {
        const maxDelta = lim.maxRate * dtSec;
        v = Math.min(prev + maxDelta, Math.max(prev - maxDelta, v));
      }
      out[axis] = v;
    }
    this.current = out;
    return out;
  }
}

/**
 * Water sprinklers fail wet, so they get hard limits independent of content:
 * a single burst can't exceed maxOnMs, there is a minOffMs gap between
 * bursts, and a show can't spray more than maxPerShowMs in total.
 */
class WaterGuard {
  constructor({ maxOnMs, minOffMs, maxPerShowMs }) {
    this.maxOnMs = maxOnMs;
    this.minOffMs = minOffMs;
    this.maxPerShowMs = maxPerShowMs;
    this.newShow();
  }

  newShow() {
    this.on = false;
    this.onSince = 0;
    this.offSince = -Infinity;
    this.usedMs = 0;
    this.lastNow = null;
  }

  /** @returns {boolean} whether the valve may be open right now */
  step(want, now) {
    if (this.on) this.usedMs += now - (this.lastNow ?? now);
    this.lastNow = now;

    if (this.on) {
      const tooLong = now - this.onSince >= this.maxOnMs;
      const budgetGone = this.usedMs >= this.maxPerShowMs;
      if (!want || tooLong || budgetGone) {
        this.on = false;
        this.offSince = now;
        // Content still asking for water after a forced cut doesn't re-open
        // until it lets go — avoids pulsing a long burst into many short ones.
        this.latchedOff = want;
      }
    } else {
      if (!want) this.latchedOff = false;
      const rested = now - this.offSince >= this.minOffMs;
      if (want && !this.latchedOff && rested && this.usedMs < this.maxPerShowMs) {
        this.on = true;
        this.onSince = now;
      }
    }
    return this.on;
  }
}

module.exports = { MotionLimiter, WaterGuard };
