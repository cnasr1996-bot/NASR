'use strict';

/**
 * Playback position of one headset as seen by the server.
 *
 * The headset's video is the master clock (it's what the rider sees and
 * hears); it reports currentTime a few times a second and we extrapolate
 * between reports. leadMs lets the chair move slightly ahead of the picture
 * to cover the actuators' own latency.
 */
class PlaybackClock {
  constructor() {
    this.reset();
  }

  reset() {
    this.t = 0;
    this.playing = false;
    this.rate = 1;
    this.at = null;
  }

  report({ t, playing, rate = 1 }, now) {
    this.t = t;
    this.playing = !!playing;
    this.rate = rate;
    this.at = now;
  }

  time(now, leadMs = 0) {
    if (this.at === null) return 0;
    if (!this.playing) return this.t;
    return this.t + ((now - this.at + leadMs) / 1000) * this.rate;
  }

  /** True when the headset stopped reporting (crash, Wi-Fi drop, battery). */
  stale(now, timeoutMs) {
    return this.at === null || now - this.at > timeoutMs;
  }
}

module.exports = { PlaybackClock };
