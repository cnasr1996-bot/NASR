'use strict';

/**
 * Payment terminal drivers.
 *
 * Interface:
 *   charge({ amount, currency, reference, timeoutMs })
 *     → Promise<{ status: 'approved'|'declined'|'timeout'|'error', transactionId?, message? }>
 *   cancel() → Promise   aborts a charge in progress on the terminal
 *
 * In Saudi Arabia the terminal comes from the acquirer/PSP (bank, Geidea,
 * NeoLeap, Surepay, ...). Each provides its own "ECR integration" protocol
 * (TCP/IP or serial). Once the provider is chosen, implement its spec in a new
 * driver here with the same interface — nothing else in the app changes.
 */
function createPayment(config, log) {
  switch (config.driver) {
    case 'mock':
    default:
      return new MockPayment(config, log);
  }
}

/** Simulates a terminal. `mockOutcome`: approved | declined | timeout | random */
class MockPayment {
  constructor(config, log) {
    this.config = config;
    this.log = log || console;
    this.pending = null;
  }

  charge({ amount, currency, reference, timeoutMs }) {
    this.log.info(`[payment:mock] charging ${amount} ${currency} ref=${reference}`);
    return new Promise((resolve) => {
      let outcome = this.config.mockOutcome || 'approved';
      if (outcome === 'random') outcome = Math.random() < 0.8 ? 'approved' : 'declined';
      const delay = outcome === 'timeout' ? timeoutMs : this.config.mockDelayMs || 4000;
      const finish = (result) => {
        clearTimeout(this.pending && this.pending.timer);
        this.pending = null;
        resolve(result);
      };
      const timer = setTimeout(() => {
        finish(
          outcome === 'approved'
            ? { status: 'approved', transactionId: `MOCK-${Date.now()}` }
            : { status: outcome },
        );
      }, Math.min(delay, timeoutMs));
      this.pending = { timer, finish };
    });
  }

  async cancel() {
    if (this.pending) this.pending.finish({ status: 'cancelled' });
  }
}

module.exports = { createPayment, MockPayment };
