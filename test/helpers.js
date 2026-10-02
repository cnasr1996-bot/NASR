'use strict';

/** Manual clock: timers only fire when the test advances time. */
function fakeClock() {
  let now = 1_700_000_000_000;
  let id = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(fn, ms) {
      timers.set(++id, { at: now + ms, fn });
      return id;
    },
    clearTimeout(t) {
      timers.delete(t);
    },
    async advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, t]) => t.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        await due[1].fn();
        await flush();
      }
      now = target;
      await flush();
    },
    pending: () => timers.size,
  };
}

const flush = () => new Promise((r) => setImmediate(r));

const quietLog = { info() {}, warn() {}, error() {} };

function fakeDevices() {
  const calls = [];
  let paymentResolve;
  return {
    calls,
    camera: {
      capturesInMain: true,
      async startLiveView() { calls.push('liveview:start'); },
      async stopLiveView() { calls.push('liveview:stop'); },
      async capture() { calls.push('capture'); return 'data:image/jpeg;base64,AAAA'; },
    },
    payment: {
      charge(req) {
        calls.push(`charge:${req.amount}:${req.currency}`);
        return new Promise((r) => { paymentResolve = r; });
      },
      async cancel() { calls.push('payment:cancel'); },
      resolve: (result) => paymentResolve(result),
    },
    printer: {
      status: { ready: true },
      async getStatus() { return this.status; },
      async print(img) { calls.push(`print:${img}`); },
    },
  };
}

module.exports = { fakeClock, fakeDevices, quietLog, flush };
