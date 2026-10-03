'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

/** Deep merge; arrays from `over` replace arrays in `base`. */
function merge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = isPlainObject(v) && isPlainObject(base[k]) ? merge(base[k], v) : v;
  }
  return out;
}

/** config/default.json overridden by config/local.json (per-venue, not committed). */
function loadConfig(dir = path.join(ROOT, 'config')) {
  const base = JSON.parse(fs.readFileSync(path.join(dir, 'default.json'), 'utf8'));
  const localFile = path.join(dir, 'local.json');
  const local = fs.existsSync(localFile) ? JSON.parse(fs.readFileSync(localFile, 'utf8')) : {};
  const config = merge(base, local);
  config.server.dataDir = path.resolve(ROOT, config.server.dataDir);
  return config;
}

module.exports = { loadConfig, merge, ROOT };
