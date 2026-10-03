'use strict';

const dgram = require('dgram');

/**
 * Byte pipes to hardware. Each returns { send(text), close() }.
 *   udp    — motion software / controllers listening on the network
 *            (FlyPT Mover, SimTools, ESP32/Arduino-Ethernet boards...)
 *   serial — controller on a USB COM port (Arduino, SMC3, Thanos AMC...)
 *   http   — `text` is a URL to GET (Shelly / Tasmota / ESP relays & dimmers)
 *   mock   — records what would be sent; for development without hardware
 */
function createTransport(cfg, log = console) {
  switch (cfg.driver) {
    case 'udp': {
      const sock = dgram.createSocket('udp4');
      sock.on('error', (e) => log.warn(`[udp ${cfg.host}:${cfg.port}] ${e.message}`));
      return {
        send(text) {
          sock.send(Buffer.from(text), cfg.port, cfg.host);
        },
        close() {
          try { sock.close(); } catch (_) { /* already closed */ }
        },
      };
    }
    case 'serial': {
      let SerialPort;
      try {
        ({ SerialPort } = require('serialport'));
      } catch (_) {
        throw new Error('serial driver needs the "serialport" package (npm install serialport)');
      }
      const port = new SerialPort({ path: cfg.path, baudRate: cfg.baudRate || 115200 });
      port.on('error', (e) => log.warn(`[serial ${cfg.path}] ${e.message}`));
      return {
        send(text) {
          if (port.isOpen) port.write(text);
        },
        close() {
          if (port.isOpen) port.close();
        },
      };
    }
    case 'http': {
      let inFlight = null;
      let queued = null;
      // Only the latest state matters: if a request is still running, keep
      // just the newest URL and send it when the previous one finishes.
      const go = (url) => {
        inFlight = fetch(url, { signal: AbortSignal.timeout(cfg.timeoutMs || 2000) })
          .catch((e) => log.warn(`[http] ${url}: ${e.message}`))
          .finally(() => {
            inFlight = null;
            if (queued) {
              const next = queued;
              queued = null;
              go(next);
            }
          });
      };
      return {
        send(url) {
          if (inFlight) queued = url; else go(url);
        },
        close() {},
      };
    }
    case 'mock': {
      const sent = [];
      return { sent, send(text) { sent.push(text); if (sent.length > 1000) sent.shift(); }, close() {} };
    }
    default:
      throw new Error(`unknown driver "${cfg.driver}" (use udp, serial, http or mock)`);
  }
}

/** Replace {name} placeholders with values. */
function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (m, key) => (key in values ? String(values[key]) : m));
}

module.exports = { createTransport, fill };
