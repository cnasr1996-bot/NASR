'use strict';

const fs = require('fs');
const path = require('path');

function isObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function merge(base, override) {
  const out = { ...base };
  for (const [k, v] of Object.entries(override || {})) {
    out[k] = isObject(v) && isObject(base[k]) ? merge(base[k], v) : v;
  }
  return out;
}

/**
 * Loads config/default.json, then overlays config/local.json (per-booth
 * settings, not committed) if present — next to the sources in development,
 * or in the installed app's resources folder.
 */
function loadConfig(dir = path.join(__dirname, '..', '..', 'config')) {
  const base = JSON.parse(fs.readFileSync(path.join(dir, 'default.json'), 'utf8'));
  const candidates = [path.join(dir, 'local.json')];
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'config', 'local.json'));
  const localPath = candidates.find((p) => fs.existsSync(p));
  const local = localPath ? JSON.parse(fs.readFileSync(localPath, 'utf8')) : {};
  return merge(base, local);
}

module.exports = { loadConfig, merge };
