'use strict';

const fs = require('fs');
const path = require('path');
const { Timeline } = require('./timeline');

const VIDEO_FORMATS = [
  '360-mono', '360-tb', '360-sbs', // full sphere: mono, stereo top/bottom, stereo side-by-side
  '180-sbs', '180-tb', //             VR180 (front half sphere), stereo
  'flat', 'flat-sbs', 'flat-tb', //   big cinema screen, 2D or 3D
];

/**
 * Experiences live in content/<id>/experience.json next to their video.
 * Broken ones are listed with their errors instead of crashing the server,
 * so the operator sees what to fix.
 */
function loadLibrary(dir) {
  const items = new Map();
  if (!fs.existsSync(dir)) return items;
  for (const id of fs.readdirSync(dir).sort()) {
    const file = path.join(dir, id, 'experience.json');
    if (!fs.existsSync(file)) continue;
    const item = { id, errors: [] };
    try {
      const exp = JSON.parse(fs.readFileSync(file, 'utf8'));
      item.title = exp.title || { en: id };
      item.duration = exp.duration;
      item.video = exp.video || null;
      if (!(exp.duration > 0)) item.errors.push('duration (seconds) is required');
      if (item.video) {
        if (!VIDEO_FORMATS.includes(item.video.format)) {
          item.errors.push(`video.format must be one of ${VIDEO_FORMATS.join(', ')}`);
        }
        if (!/^https?:/.test(item.video.src) && !fs.existsSync(path.join(dir, id, item.video.src || ''))) {
          item.errors.push(`video file not found: content/${id}/${item.video.src}`);
        }
      }
      item.timeline = new Timeline(exp.effects || {});
    } catch (e) {
      item.errors.push(e.message);
    }
    items.set(id, item);
  }
  return items;
}

/** What the headset needs to know (no timeline). */
function forHeadset(item) {
  const video = item.video && {
    ...item.video,
    src: /^https?:/.test(item.video.src) ? item.video.src : `/content/${item.id}/${item.video.src}`,
  };
  return { id: item.id, title: item.title, duration: item.duration, video };
}

module.exports = { loadLibrary, forHeadset, VIDEO_FORMATS };
