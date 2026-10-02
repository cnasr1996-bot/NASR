'use strict';

/**
 * DNP dye-sublimation printer.
 *
 * Printing goes through the normal Windows driver (installed from DNP), so
 * paper size, overcoat (glossy/matte) and cutting are set once in the driver
 * defaults. The app sends a full-bleed image sized for the configured paper.
 *
 * Status comes from two sources:
 *   1. the Windows print spooler (offline, paper out, jam, error...)
 *   2. a media counter: DNP ribbon and paper ship together in one kit with a
 *      fixed number of prints (e.g. 700 × 4x6 for the DS-RX1HS), so counting
 *      prints since the last roll change gives a reliable "almost out" alert.
 *      Staff reset the counter from the admin shortcut when they load a roll.
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

class DnpPrinter {
  /**
   * @param {object} config  printer section of the config
   * @param {object} deps    { printImage(dataUrl, opts) — does the actual printing,
   *                           stateFile — where the media counter is stored, log, notify }
   */
  constructor(config, { printImage, stateFile, log, notify }) {
    this.config = config;
    this.printImage = printImage;
    this.stateFile = stateFile;
    this.log = log || console;
    this.notify = notify || (() => {});
    this.state = this._load();
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
    } catch (_) {
      return { printsSinceMediaChange: 0, totalPrints: 0 };
    }
  }

  _save() {
    if (!this.stateFile) return;
    fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
    fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
  }

  remainingPrints() {
    return Math.max(0, this.config.mediaCapacity - this.state.printsSinceMediaChange);
  }

  resetMediaCounter() {
    this.state.printsSinceMediaChange = 0;
    this._save();
    this.log.info('[printer] media counter reset');
  }

  async print(dataUrl) {
    if (this.config.driver === 'mock') {
      await new Promise((r) => setTimeout(r, this.config.mockPrintMs || 3000));
    } else {
      await this.printImage(dataUrl, {
        deviceName: this.config.deviceName,
        widthMicrons: Math.round(this.config.paper.widthIn * 25400),
        heightMicrons: Math.round(this.config.paper.heightIn * 25400),
      });
    }
    this.state.printsSinceMediaChange += 1;
    this.state.totalPrints += 1;
    this._save();

    const left = this.remainingPrints();
    if (left <= this.config.lowMediaWarning) {
      this.notify('media-low', { remaining: left });
    }
  }

  /** @returns {Promise<{ready: boolean, reason?: string, warning?: string, remaining: number}>} */
  async getStatus() {
    const remaining = this.remainingPrints();
    if (remaining <= 0) {
      this.notify('media-out', { remaining });
      return { ready: false, reason: 'media-out', remaining };
    }
    if (this.config.driver === 'windows' && process.platform === 'win32') {
      const spooler = await spoolerStatus(this.config.deviceName).catch((err) => {
        this.log.warn('[printer] spooler query failed', err.message);
        return null;
      });
      if (spooler && !spooler.ok) {
        this.notify('printer-error', spooler);
        return { ready: false, reason: spooler.status, remaining };
      }
    }
    const warning = remaining <= this.config.lowMediaWarning ? 'media-low' : null;
    return { ready: true, warning, remaining };
  }
}

// Get-Printer reports values such as Normal, PaperOut, Offline, Error, PaperJam.
const OK_STATUSES = new Set(['Normal', 'Printing', 'Busy', 'Processing', 'WarmingUp', 'Waiting']);

function spoolerStatus(deviceName) {
  return new Promise((resolve, reject) => {
    const cmd = `(Get-Printer -Name '${deviceName.replace(/'/g, "''")}').PrinterStatus`;
    execFile('powershell.exe', ['-NoProfile', '-Command', cmd], { timeout: 5000 }, (err, stdout) => {
      if (err) return reject(err);
      const status = stdout.trim() || 'Unknown';
      resolve({ ok: OK_STATUSES.has(status), status });
    });
  });
}

module.exports = { DnpPrinter };
