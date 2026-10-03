'use strict';

const quietLog = { info() {}, warn() {}, error() {} };

const limits = {
  pitch: { min: -15, max: 15, maxRate: 40 },
  roll: { min: -15, max: 15, maxRate: 40 },
  yaw: { min: -20, max: 20, maxRate: 40 },
  heave: { min: -50, max: 50, maxRate: 150 },
  surge: { min: -50, max: 50, maxRate: 150 },
  sway: { min: -50, max: 50, maxRate: 150 },
  vibration: { min: 0, max: 1, maxRate: 20 },
  vibrationHz: { min: 5, max: 80, maxRate: 400 },
};

module.exports = { quietLog, limits };
