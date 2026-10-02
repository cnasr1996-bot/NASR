'use strict';

/**
 * Operator alerts (media low/out, printer errors). Always logged; also POSTed
 * as JSON to operator.webhookUrl when set (e.g. a WhatsApp/Telegram/Slack
 * relay). Repeated alerts of the same kind are throttled.
 */
function createNotifier(config = {}, log = console, throttleMs = 15 * 60_000) {
  const lastSent = new Map();
  return function notify(kind, details = {}) {
    const now = Date.now();
    if (now - (lastSent.get(kind) || 0) < throttleMs) return;
    lastSent.set(kind, now);
    log.warn(`[alert] ${kind}`, details);
    if (!config.webhookUrl) return;
    fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, details, at: new Date(now).toISOString() }),
    }).catch((err) => log.warn('[alert] webhook failed', err.message));
  };
}

module.exports = { createNotifier };
