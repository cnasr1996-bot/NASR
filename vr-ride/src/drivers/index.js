'use strict';

const { createTransport, fill } = require('./transport');
const { CHAIR } = require('../timeline');

/** Map a value in [min, max] to the controller's range, e.g. 0..255 or -1..1. */
function scale(v, { min, max }, [lo, hi], decimals) {
  const n = max === min ? 0.5 : (v - min) / (max - min);
  const out = lo + Math.min(1, Math.max(0, n)) * (hi - lo);
  return out.toFixed(decimals);
}

/**
 * Motion chair. Sends one line per engine tick using `format`, where each
 * axis placeholder ({pitch}, {roll}, {yaw}, {heave}, {surge}, {sway},
 * {vibration}, {vibrationHz}) is scaled from config.limits to outputRange.
 * {raw_<axis>} gives the unscaled value (degrees / mm) for controllers
 * that want real units.
 */
function createChair(cfg, limits, log) {
  const transport = createTransport(cfg, log);
  const range = cfg.outputRange || [0, 255];
  const decimals = cfg.decimals ?? 0;
  return {
    transport,
    send(values) {
      const vars = {};
      for (const axis of CHAIR) {
        vars[axis] = scale(values[axis], limits[axis], range, decimals);
        vars[`raw_${axis}`] = values[axis].toFixed(2);
      }
      transport.send(fill(cfg.format, vars));
    },
    close: () => transport.close(),
  };
}

const DEFAULT_TEMPLATES = {
  // Shelly relay (Gen1 & Gen2 compatible URL). The timer is a hardware-side
  // auto-off: if this server dies with the valve open, Shelly closes it anyway.
  water: { http: 'http://{host}/relay/{relay}?turn={onoff}&timer=2', other: 'WATER{on}\n' },
  fan: { http: 'http://{host}/relay/{relay}?turn={onoff}', other: 'FAN{level}\n' },
};

/**
 * Fan or water output. Sends only when the value changes, plus a periodic
 * resend (resendMs) so a controller that rebooted picks the state back up.
 */
function createOutput(cfg, log) {
  const transport = createTransport(cfg, log);
  const kind = cfg.kind;
  const template = cfg.format
    || (cfg.driver === 'http' ? DEFAULT_TEMPLATES[kind].http : DEFAULT_TEMPLATES[kind].other);
  const range = cfg.outputRange || [0, 255];
  let last;
  let lastSentAt = 0;
  return {
    id: cfg.id,
    kind,
    seats: cfg.seats || [],
    transport,
    get value() { return last; },
    set(value, now) {
      // Relay fans are on/off; dimmers/PWM get a level.
      const key = kind === 'water' ? !!value : Math.round(value * 100) / 100;
      const due = cfg.resendMs && now - lastSentAt >= cfg.resendMs;
      if (key === last && !due) return;
      last = key;
      lastSentAt = now;
      const level = kind === 'water' ? (key ? 1 : 0) : key;
      transport.send(fill(template, {
        host: cfg.host,
        relay: cfg.relay ?? 0,
        on: level >= 0.5 ? 1 : 0,
        onoff: level >= 0.5 ? 'on' : 'off',
        pct: Math.round(level * 100),
        level: (range[0] + level * (range[1] - range[0])).toFixed(cfg.decimals ?? 0),
      }));
    },
    close: () => transport.close(),
  };
}

module.exports = { createChair, createOutput, scale };
