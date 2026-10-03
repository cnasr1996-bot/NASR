'use strict';

const { MotionLimiter, WaterGuard } = require('./safety');
const { PlaybackClock } = require('./clock');
const { Timeline, NEUTRAL, CHAIR } = require('./timeline');
const { forHeadset } = require('./library');

/** Built-in pattern the operator can run to check a chair without a headset. */
const CHAIR_TEST = new Timeline({
  pitch: [[0, 0], [1.5, 8], [3, -8], [4.5, 0]],
  roll: [[4.5, 0], [6, 8], [7.5, -8], [9, 0]],
  heave: [[9, 0], [10, 30], [11, -30], [12, 0]],
  vibration: [[12, 0], [12.1, 0.6, 'step'], [13.5, 0.6], [13.6, 0, 'step']],
});
const CHAIR_TEST_SEC = 14;

/**
 * Runs the show: one experience at a time across all seats whose headset is
 * connected. Each seat's chair follows its own headset's video clock, so a
 * headset that buffers or starts late never puts its chair out of sync.
 * Shared fans / water follow the seats they're assigned to.
 *
 * Every tick, whatever happens, each chair gets a value: the timeline when
 * all is well, neutral (through the rate limiter) when anything is off —
 * E-stop, headset lost, headset taken off, show over.
 */
class Engine {
  constructor(config, { library, createChair, createOutput, log = console, now = Date.now }) {
    this.config = config;
    this.library = library;
    this.log = log;
    this.now = now;
    this.listeners = new Set();
    this.estop = false;
    this.show = { state: 'idle', experienceId: null };
    this.lastTick = null;
    this.tickCount = 0;

    this.seats = new Map(config.seats.map((s) => [s.id, {
      id: s.id,
      name: s.name || `Seat ${s.id}`,
      chair: createChair(s.chair, config.limits, log),
      limiter: new MotionLimiter(config.limits),
      clock: new PlaybackClock(),
      headset: null, // { send, state, inXR, worn, error, info }
      active: false,
      fault: null,
      target: { ...NEUTRAL },
      output: { ...NEUTRAL },
      test: null,
    }]));

    this.outputs = config.outputs.map((o) => {
      const out = createOutput(o, log);
      out.guard = o.kind === 'water' ? new WaterGuard(config.water) : null;
      out.test = null;
      return out;
    });
  }

  // ---- operator commands ------------------------------------------------

  load(experienceId) {
    const item = this.library.get(experienceId);
    if (!item) throw new Error(`no experience "${experienceId}"`);
    if (item.errors.length) throw new Error(`"${experienceId}" has errors: ${item.errors.join('; ')}`);
    if (this.show.state === 'running') throw new Error('stop the current show first');
    this.show = { state: 'loading', experienceId };
    for (const seat of this.seats.values()) {
      seat.active = false;
      seat.fault = null;
      seat.clock.reset();
      if (seat.headset) {
        seat.headset.state = 'loading';
        seat.headset.send({ type: 'load', experience: forHeadset(item) });
      }
    }
    this.log.info(`[show] loading ${experienceId}`);
    this._changed();
  }

  start() {
    if (this.estop) throw new Error('E-stop is active');
    if (this.show.state !== 'ready' && this.show.state !== 'loading') throw new Error('load an experience first');
    const ready = [...this.seats.values()].filter((s) => s.headset && s.headset.state === 'ready');
    if (!ready.length) throw new Error('no headset is ready');
    for (const seat of this.seats.values()) {
      seat.active = ready.includes(seat);
      seat.test = null;
      seat.clock.reset();
    }
    for (const o of this.outputs) o.guard?.newShow();
    this.show = { state: 'running', experienceId: this.show.experienceId, startedAt: this.now() };
    for (const seat of ready) seat.headset.send({ type: 'play' });
    this.log.info(`[show] start ${this.show.experienceId} on seats ${ready.map((s) => s.id).join(', ')}`);
    this._changed();
  }

  stop() {
    for (const seat of this.seats.values()) {
      seat.active = false;
      seat.test = null;
      seat.headset?.send({ type: 'stop' });
    }
    for (const o of this.outputs) o.test = null;
    this.show = { state: 'idle', experienceId: null };
    this.log.info('[show] stopped');
    this._changed();
  }

  setEstop(on) {
    this.estop = !!on;
    if (on) {
      for (const seat of this.seats.values()) {
        seat.active = false;
        seat.test = null;
      }
      for (const o of this.outputs) o.test = null;
      this.show = { state: 'idle', experienceId: null };
    }
    for (const seat of this.seats.values()) {
      seat.headset?.send({ type: 'estop', on: this.estop });
      if (on) seat.headset?.send({ type: 'stop' });
    }
    this.log.warn(`[safety] E-STOP ${on ? 'PRESSED' : 'released'}`);
    this._changed();
  }

  recenter(seatId) {
    for (const seat of this.seats.values()) {
      if (!seatId || seat.id === seatId) seat.headset?.send({ type: 'recenter' });
    }
  }

  testChair(seatId) {
    this._assertIdle();
    const seat = this.seats.get(seatId);
    if (!seat) throw new Error(`no seat "${seatId}"`);
    seat.test = { startedAt: this.now() };
    this._changed();
  }

  testOutput(outputId, ms = 2000) {
    this._assertIdle();
    const out = this.outputs.find((o) => o.id === outputId);
    if (!out) throw new Error(`no output "${outputId}"`);
    out.guard?.newShow();
    out.test = { until: this.now() + Math.min(ms, 5000) };
    this._changed();
  }

  _assertIdle() {
    if (this.estop) throw new Error('E-stop is active');
    if (this.show.state === 'running') throw new Error('not while a show is running');
  }

  // ---- headset connection -----------------------------------------------

  attachHeadset(seatId, send) {
    const seat = this.seats.get(seatId);
    if (!seat) throw new Error(`no seat "${seatId}" in config`);
    if (seat.headset) seat.headset.send({ type: 'replaced' });
    seat.headset = { send, state: 'idle', inXR: false, worn: true, error: null, info: {} };
    send({ type: 'config', seat: { id: seat.id, name: seat.name }, headset: this.config.headset });
    send({ type: 'estop', on: this.estop });
    const item = this.show.experienceId && this.library.get(this.show.experienceId);
    if (item && this.show.state !== 'running') {
      seat.headset.state = 'loading';
      send({ type: 'load', experience: forHeadset(item) });
    }
    this.log.info(`[seat ${seatId}] headset connected`);
    this._changed();
    return seat.headset;
  }

  detachHeadset(seatId, headset) {
    const seat = this.seats.get(seatId);
    if (!seat || seat.headset !== headset) return; // a newer connection already replaced it
    seat.headset = null;
    this.log.warn(`[seat ${seatId}] headset disconnected`);
    this._updateShowState();
    this._changed();
  }

  headsetMessage(seatId, msg) {
    const seat = this.seats.get(seatId);
    if (!seat?.headset) return;
    const h = seat.headset;
    switch (msg.type) {
      case 'time':
        seat.clock.report(msg, this.now());
        return; // high-rate; no state broadcast
      case 'status':
        h.state = msg.state;
        h.error = msg.error || null;
        if ('inXR' in msg) h.inXR = !!msg.inXR;
        break;
      case 'presence':
        h.worn = !!msg.worn;
        this.log.info(`[seat ${seatId}] headset ${h.worn ? 'on head' : 'removed'}`);
        break;
      case 'info':
        h.info = { ...h.info, ...msg.info };
        break;
      default:
        return;
    }
    this._updateShowState();
    this._changed();
  }

  _updateShowState() {
    const seats = [...this.seats.values()];
    if (this.show.state === 'loading') {
      const withHeadset = seats.filter((s) => s.headset);
      if (withHeadset.length && withHeadset.every((s) => s.headset.state === 'ready')) {
        this.show.state = 'ready';
      }
    } else if (this.show.state === 'running') {
      const stillGoing = seats.filter((s) => s.active && s.headset
        && (s.headset.state === 'ready' || s.headset.state === 'playing'));
      if (!stillGoing.length) {
        this.log.info(`[show] finished ${this.show.experienceId}`);
        for (const s of seats) s.active = false;
        this.show = { state: 'idle', experienceId: null };
      }
    }
  }

  // ---- the loop ---------------------------------------------------------

  tick() {
    const now = this.now();
    const dt = this.lastTick === null ? 0 : Math.min(0.1, (now - this.lastTick) / 1000);
    this.lastTick = now;
    this.tickCount += 1;
    const { engine } = this.config;
    const item = this.show.experienceId && this.library.get(this.show.experienceId);

    for (const seat of this.seats.values()) {
      let target = NEUTRAL;
      let fault = null;
      if (!this.estop && seat.active && item) {
        if (!seat.headset || seat.clock.stale(now, engine.headsetTimeoutMs)) {
          fault = 'headset-lost';
        } else if (engine.parkWhenHeadsetRemoved && !seat.headset.worn) {
          fault = 'headset-removed';
        } else {
          const t = seat.clock.time(now, engine.leadMs);
          if (t <= item.duration) target = item.timeline.sample(t);
        }
      } else if (!this.estop && seat.test) {
        const t = (now - seat.test.startedAt) / 1000;
        if (t > CHAIR_TEST_SEC) seat.test = null; else target = CHAIR_TEST.sample(t);
      }
      if (fault !== seat.fault) {
        if (fault) this.log.warn(`[seat ${seat.id}] parking chair: ${fault}`);
        seat.fault = fault;
        this._changed();
      }
      seat.target = target;
      seat.output = seat.limiter.step(target, dt);
      seat.chair.send(seat.output);
      this._sendPose(seat);
    }

    for (const out of this.outputs) {
      let want;
      if (out.test && now < out.test.until && !this.estop) {
        want = out.kind === 'water' ? true : 1;
      } else {
        out.test = null;
        const feeding = out.seats.map((id) => this.seats.get(id)).filter((s) => s && s.active && !s.fault);
        want = out.kind === 'water'
          ? feeding.some((s) => s.target.water)
          : Math.max(0, ...feeding.map((s) => s.target.fan));
      }
      if (this.estop) want = out.kind === 'water' ? false : 0;
      out.set(out.guard ? out.guard.step(!!want, now) : want, now);
    }
  }

  _sendPose(seat) {
    if (!seat.headset) return;
    const every = Math.max(1, Math.round(this.config.engine.tickHz / this.config.headset.poseHz));
    if (this.tickCount % every) return;
    const o = seat.output;
    seat.headset.send({ type: 'pose', pitch: o.pitch, roll: o.roll, yaw: o.yaw, heave: o.heave, surge: o.surge, sway: o.sway });
  }

  run() {
    this.timer = setInterval(() => this.tick(), 1000 / this.config.engine.tickHz);
    this.stateTimer = setInterval(() => this._emit(), 200);
  }

  /** Park everything (blocking-ish), then close drivers. */
  async shutdown() {
    clearInterval(this.timer);
    clearInterval(this.stateTimer);
    this.setEstop(true);
    const step = 1000 / this.config.engine.tickHz;
    for (let i = 0; i < 3000 / step; i++) {
      this.tick();
      await new Promise((r) => setTimeout(r, step));
    }
    for (const seat of this.seats.values()) seat.chair.close();
    for (const out of this.outputs) out.close();
  }

  // ---- state for the operator dashboard ---------------------------------

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _changed() {
    this.dirty = true;
  }

  _emit(force) {
    // Live chair values change every tick while moving or parking; send one
    // more update after motion stops so the dashboard shows where it settled.
    const moving = [...this.seats.values()].some((s) => s.active || s.test
      || CHAIR.some((a) => Math.abs(s.output[a] - NEUTRAL[a]) > 0.01));
    const wasMoving = this.wasMoving;
    this.wasMoving = moving;
    if (!this.dirty && !force && !moving && !wasMoving) return;
    this.dirty = false;
    const state = this.getState();
    for (const fn of this.listeners) fn(state);
  }

  getState() {
    const now = this.now();
    const round = (v) => Math.round(v * 100) / 100;
    return {
      estop: this.estop,
      show: this.show,
      experiences: [...this.library.values()].map((e) => ({
        id: e.id, title: e.title, duration: e.duration, format: e.video?.format || 'demo', errors: e.errors,
      })),
      seats: [...this.seats.values()].map((s) => ({
        id: s.id,
        name: s.name,
        active: s.active,
        fault: s.fault,
        testing: !!s.test,
        time: s.active ? round(s.clock.time(now)) : null,
        headset: s.headset && {
          state: s.headset.state, inXR: s.headset.inXR, worn: s.headset.worn, error: s.headset.error, info: s.headset.info,
        },
        chair: Object.fromEntries(CHAIR.map((a) => [a, round(s.output[a])])),
      })),
      outputs: this.outputs.map((o) => ({ id: o.id, kind: o.kind, value: o.value ?? null, testing: !!o.test })),
    };
  }
}

module.exports = { Engine, CHAIR_TEST_SEC };
