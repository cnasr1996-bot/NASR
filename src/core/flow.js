'use strict';

/**
 * BoothFlow — the booth's state machine, kept free of Electron and hardware
 * specifics so it can be unit-tested. Hardware drivers and the clock are
 * injected.
 *
 *   attract ──start──▶ capture ──shoot──▶ review ──confirm──▶ payment
 *      ▲                  ▲                  │                   │
 *      │                  └─────retake───────┘        ok │       │ fail/timeout
 *      │                                                 ▼       ▼
 *      └──────── thankyou ◀────── printing ◀─────────────┘   paymentFailed
 *
 * Any state that waits on the customer returns to `attract` after
 * `idleTimeoutMs` (45 s by default) without interaction.
 */

const STATES = Object.freeze({
  ATTRACT: 'attract',
  CAPTURE: 'capture',
  REVIEW: 'review',
  PAYMENT: 'payment',
  PAYMENT_FAILED: 'paymentFailed',
  PRINTING: 'printing',
  THANK_YOU: 'thankyou',
  OUT_OF_SERVICE: 'outOfService',
  ERROR: 'error',
});

// States in which the customer is expected to act; the idle timer runs here.
const IDLE_STATES = new Set([
  STATES.CAPTURE,
  STATES.REVIEW,
  STATES.PAYMENT_FAILED,
  STATES.ERROR,
]);

const DEFAULTS = {
  idleTimeoutMs: 45_000,
  paymentTimeoutMs: 60_000,
  thankYouMs: 8_000,
  maxRetakes: 2,
  price: { amount: 20, currency: 'SAR' },
};

class BoothFlow {
  /**
   * @param {object} deps
   * @param {object} deps.camera   { capturesInMain, startLiveView(), stopLiveView(), capture() }
   * @param {object} deps.payment  { charge({amount,currency,reference,timeoutMs}), cancel() }
   * @param {object} deps.printer  { print(imageDataUrl), getStatus() }
   * @param {object} [deps.clock]  { setTimeout, clearTimeout, now }
   * @param {object} [deps.log]    { info, warn, error }
   * @param {object} [options]
   */
  constructor({ camera, payment, printer, clock, log }, options = {}) {
    this.camera = camera;
    this.payment = payment;
    this.printer = printer;
    this.clock = clock || { setTimeout, clearTimeout, now: Date.now };
    this.log = log || console;
    this.opts = { ...DEFAULTS, ...options };
    this.listeners = new Set();
    this.idleTimer = null;
    this.stateTimer = null;
    this.paymentAttempt = 0;
    this.session = null;
    this.state = STATES.ATTRACT;
    this.context = {};
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  snapshot() {
    return {
      state: this.state,
      context: { ...this.context },
      price: this.opts.price,
      retakesLeft: this.session ? this.opts.maxRetakes - this.session.retakes : this.opts.maxRetakes,
    };
  }

  _set(state, context = {}) {
    this.state = state;
    this.context = context;
    this._clearTimer('stateTimer');
    this._armIdle();
    const snap = this.snapshot();
    for (const fn of this.listeners) fn(snap);
  }

  _clearTimer(name) {
    if (this[name]) {
      this.clock.clearTimeout(this[name]);
      this[name] = null;
    }
  }

  _armIdle() {
    this._clearTimer('idleTimer');
    if (!IDLE_STATES.has(this.state)) return;
    this.idleTimer = this.clock.setTimeout(() => {
      this.idleTimer = null;
      this.log.info(`[flow] idle timeout in "${this.state}", resetting`);
      this.reset();
    }, this.opts.idleTimeoutMs);
  }

  /** Any touch on the screen. Restarts the idle countdown. */
  touch() {
    this._armIdle();
  }

  async reset() {
    this._clearTimer('idleTimer');
    this._clearTimer('stateTimer');
    if (this.state === STATES.PAYMENT) {
      await this._safe(() => this.payment.cancel());
    }
    if (this.state === STATES.CAPTURE || this.state === STATES.REVIEW) {
      await this._safe(() => this.camera.stopLiveView());
    }
    this.session = null;
    await this.refreshAvailability();
  }

  /**
   * Shows `attract` when the booth can serve a customer, or `outOfService`
   * when the printer cannot print — so nobody is charged for a print that
   * will never come out.
   */
  async refreshAvailability() {
    const status = await this._safe(() => this.printer.getStatus());
    if (status && status.ready === false) {
      this._set(STATES.OUT_OF_SERVICE, { reason: status.reason || 'printer' });
    } else {
      this._set(STATES.ATTRACT, { printerWarning: status && status.warning ? status.warning : null });
    }
  }

  async start() {
    if (this.state !== STATES.ATTRACT) return;
    this.session = {
      id: newReference(this.clock.now()),
      retakes: 0,
      printImage: null,
    };
    this.log.info(`[flow] session ${this.session.id} started`);
    await this._enterCapture();
  }

  async _enterCapture() {
    try {
      await this.camera.startLiveView();
      this._set(STATES.CAPTURE, {});
    } catch (err) {
      this.log.error('[flow] camera failed to start', err);
      this._set(STATES.ERROR, { code: 'camera' });
    }
  }

  /**
   * Called by the UI when its countdown reaches zero. With the Canon driver
   * the photo is taken in the main process; with the webcam driver the UI
   * passes the captured frame in.
   */
  async shoot(photoFromUi) {
    if (this.state !== STATES.CAPTURE) return;
    this._set(STATES.CAPTURE, { shooting: true });
    try {
      const photo = this.camera.capturesInMain ? await this.camera.capture() : photoFromUi;
      if (!photo) throw new Error('no photo returned');
      await this._safe(() => this.camera.stopLiveView());
      this._set(STATES.REVIEW, { photo });
    } catch (err) {
      this.log.error('[flow] capture failed', err);
      this._set(STATES.ERROR, { code: 'capture' });
    }
  }

  async retake() {
    if (this.state !== STATES.REVIEW || !this.session) return;
    if (this.session.retakes >= this.opts.maxRetakes) return;
    this.session.retakes += 1;
    await this._enterCapture();
  }

  /**
   * The customer accepted the photo. `printImage` is the final print-ready
   * image (vintage effect + layout) rendered by the UI.
   */
  async confirm(printImage) {
    if (this.state !== STATES.REVIEW || !this.session) return;
    this.session.printImage = printImage;
    await this._pay();
  }

  async retryPayment() {
    if (this.state !== STATES.PAYMENT_FAILED || !this.session) return;
    await this._pay();
  }

  async _pay() {
    // Re-check the printer right before taking money.
    const status = await this._safe(() => this.printer.getStatus());
    if (status && status.ready === false) {
      this.log.warn('[flow] printer not ready before payment', status);
      this._set(STATES.OUT_OF_SERVICE, { reason: status.reason || 'printer' });
      return;
    }

    const attempt = ++this.paymentAttempt;
    const { amount, currency } = this.opts.price;
    this._set(STATES.PAYMENT, { amount, currency });

    let result;
    let guard;
    try {
      // Drivers enforce timeoutMs themselves; the guard covers a terminal
      // that stops responding so the booth can never hang on this screen.
      const guardTimeout = new Promise((resolve) => {
        guard = this.clock.setTimeout(
          () => resolve({ status: 'timeout', message: 'no response from terminal' }),
          this.opts.paymentTimeoutMs + 10_000,
        );
      });
      result = await Promise.race([
        this.payment.charge({
          amount,
          currency,
          reference: this.session.id,
          timeoutMs: this.opts.paymentTimeoutMs,
        }),
        guardTimeout,
      ]);
      if (result.status === 'timeout') await this._safe(() => this.payment.cancel());
    } catch (err) {
      this.log.error('[flow] payment error', err);
      result = { status: 'error', message: String(err && err.message) };
    } finally {
      this.clock.clearTimeout(guard);
    }
    // The flow was reset or cancelled while the terminal was busy.
    if (attempt !== this.paymentAttempt || this.state !== STATES.PAYMENT) return;

    if (result.status === 'approved') {
      this.log.info(`[flow] payment approved ${this.session.id}`, result.transactionId || '');
      this.session.transactionId = result.transactionId;
      await this._print();
    } else {
      this.log.warn(`[flow] payment ${result.status}`, result.message || '');
      this._set(STATES.PAYMENT_FAILED, { reason: result.status });
    }
  }

  /** Customer pressed "cancel" while the terminal was waiting for a card. */
  async cancelPayment() {
    if (this.state !== STATES.PAYMENT) return;
    this.paymentAttempt++;
    await this._safe(() => this.payment.cancel());
    this._set(STATES.PAYMENT_FAILED, { reason: 'cancelled' });
  }

  async _print() {
    this._set(STATES.PRINTING, {});
    try {
      await this.printer.print(this.session.printImage);
      this._set(STATES.THANK_YOU, {});
      this.stateTimer = this.clock.setTimeout(() => {
        this.stateTimer = null;
        this.reset();
      }, this.opts.thankYouMs);
    } catch (err) {
      // Paid but not printed: keep the reference so staff can reprint/refund.
      this.log.error(
        `[flow] PRINT FAILED after payment — session ${this.session.id}, txn ${this.session.transactionId}`,
        err,
      );
      this._set(STATES.ERROR, { code: 'print', reference: this.session.id });
    }
  }

  async _safe(fn) {
    try {
      return await fn();
    } catch (err) {
      this.log.warn('[flow] ignored error', err && err.message);
      return undefined;
    }
  }
}

function newReference(now) {
  const rand = Math.floor(Math.random() * 1e4).toString().padStart(4, '0');
  return `PB${now.toString(36).toUpperCase()}${rand}`;
}

module.exports = { BoothFlow, STATES, DEFAULTS };
