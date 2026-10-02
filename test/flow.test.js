'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { BoothFlow, STATES } = require('../src/core/flow');
const { fakeClock, fakeDevices, quietLog, flush } = require('./helpers');

function setup(options = {}) {
  const clock = fakeClock();
  const dev = fakeDevices();
  const flow = new BoothFlow({ ...dev, clock, log: quietLog }, options);
  const seen = [];
  flow.onChange((s) => seen.push(s.state));
  return { flow, dev, clock, seen };
}

async function toReview(flow) {
  await flow.refreshAvailability();
  await flow.start();
  await flow.shoot();
}

test('happy path: capture → review → pay → print → thank you → attract', async () => {
  const { flow, dev, clock, seen } = setup();
  await toReview(flow);
  assert.equal(flow.state, STATES.REVIEW);
  assert.equal(flow.context.photo, 'data:image/jpeg;base64,AAAA');

  const confirming = flow.confirm('PRINT');
  await flush();
  assert.equal(flow.state, STATES.PAYMENT);
  dev.payment.resolve({ status: 'approved', transactionId: 'T1' });
  await confirming;

  assert.equal(flow.state, STATES.THANK_YOU);
  assert.ok(dev.calls.includes('print:PRINT'));
  await clock.advance(8_000);
  assert.equal(flow.state, STATES.ATTRACT);
  assert.deepEqual(seen, ['attract', 'capture', 'capture', 'review', 'payment', 'printing', 'thankyou', 'attract']);
});

test('returns to attract after 45 s without interaction', async () => {
  const { flow, clock } = setup();
  await toReview(flow);
  await clock.advance(44_999);
  assert.equal(flow.state, STATES.REVIEW);
  await clock.advance(1);
  assert.equal(flow.state, STATES.ATTRACT);
});

test('touch restarts the idle countdown', async () => {
  const { flow, clock } = setup();
  await toReview(flow);
  await clock.advance(40_000);
  flow.touch();
  await clock.advance(40_000);
  assert.equal(flow.state, STATES.REVIEW);
  await clock.advance(5_000);
  assert.equal(flow.state, STATES.ATTRACT);
});

test('idle timer does not interrupt a payment in progress', async () => {
  const { flow, clock } = setup();
  await toReview(flow);
  flow.confirm('P');
  await flush();
  await clock.advance(50_000);
  assert.equal(flow.state, STATES.PAYMENT);
});

test('declined payment → paymentFailed, retry can succeed', async () => {
  const { flow, dev } = setup();
  await toReview(flow);
  const p1 = flow.confirm('P');
  await flush();
  dev.payment.resolve({ status: 'declined' });
  await p1;
  assert.equal(flow.state, STATES.PAYMENT_FAILED);
  assert.equal(flow.context.reason, 'declined');

  const p2 = flow.retryPayment();
  await flush();
  dev.payment.resolve({ status: 'approved' });
  await p2;
  assert.equal(flow.state, STATES.THANK_YOU);
});

test('paymentFailed screen also times out back to attract', async () => {
  const { flow, dev, clock } = setup();
  await toReview(flow);
  const p = flow.confirm('P');
  await flush();
  dev.payment.resolve({ status: 'timeout' });
  await p;
  await clock.advance(45_000);
  assert.equal(flow.state, STATES.ATTRACT);
});

test('customer cancel stops the terminal and ignores its late answer', async () => {
  const { flow, dev } = setup();
  await toReview(flow);
  const p = flow.confirm('P');
  await flush();
  await flow.cancelPayment();
  assert.ok(dev.calls.includes('payment:cancel'));
  assert.equal(flow.state, STATES.PAYMENT_FAILED);
  dev.payment.resolve({ status: 'approved' });
  await p;
  assert.equal(flow.state, STATES.PAYMENT_FAILED);
  assert.ok(!dev.calls.some((c) => c.startsWith('print:')));
});

test('unresponsive terminal is cancelled by the guard timeout', async () => {
  const { flow, dev, clock } = setup({ paymentTimeoutMs: 60_000 });
  await toReview(flow);
  const p = flow.confirm('P');
  await flush();
  await clock.advance(70_000);
  await p;
  assert.equal(flow.state, STATES.PAYMENT_FAILED);
  assert.equal(flow.context.reason, 'timeout');
  assert.ok(dev.calls.includes('payment:cancel'));
});

test('printer not ready → out of service, and no charge is attempted', async () => {
  const { flow, dev } = setup();
  await toReview(flow);
  dev.printer.status = { ready: false, reason: 'media-out' };
  await flow.confirm('P');
  assert.equal(flow.state, STATES.OUT_OF_SERVICE);
  assert.ok(!dev.calls.some((c) => c.startsWith('charge')));
});

test('attract shows out of service while the printer is down', async () => {
  const { flow, dev } = setup();
  dev.printer.status = { ready: false, reason: 'PaperOut' };
  await flow.refreshAvailability();
  assert.equal(flow.state, STATES.OUT_OF_SERVICE);
  await flow.start();
  assert.equal(flow.state, STATES.OUT_OF_SERVICE);
});

test('retakes are limited', async () => {
  const { flow } = setup({ maxRetakes: 1 });
  await toReview(flow);
  await flow.retake();
  await flow.shoot();
  assert.equal(flow.snapshot().retakesLeft, 0);
  await flow.retake();
  assert.equal(flow.state, STATES.REVIEW);
});

test('print failure after payment keeps the reference for staff', async () => {
  const { flow, dev } = setup();
  dev.printer.print = async () => { throw new Error('jam'); };
  await toReview(flow);
  const p = flow.confirm('P');
  await flush();
  dev.payment.resolve({ status: 'approved' });
  await p;
  assert.equal(flow.state, STATES.ERROR);
  assert.equal(flow.context.code, 'print');
  assert.match(flow.context.reference, /^PB/);
});

test('webcam mode uses the photo sent by the UI', async () => {
  const { flow, dev } = setup();
  dev.camera.capturesInMain = false;
  await flow.refreshAvailability();
  await flow.start();
  await flow.shoot('data:image/jpeg;base64,UI');
  assert.equal(flow.context.photo, 'data:image/jpeg;base64,UI');
});

test('camera failure shows an error instead of hanging', async () => {
  const { flow, dev } = setup();
  dev.camera.startLiveView = async () => { throw new Error('no camera'); };
  await flow.refreshAvailability();
  await flow.start();
  assert.equal(flow.state, STATES.ERROR);
  assert.equal(flow.context.code, 'camera');
});
