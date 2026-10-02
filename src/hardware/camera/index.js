'use strict';

/**
 * Camera driver factory.
 *
 * Every driver implements:
 *   capturesInMain: boolean      true → capture() returns the photo;
 *                                false → the UI captures (webcam mode)
 *   startLiveView(): Promise
 *   stopLiveView():  Promise
 *   capture():       Promise<string>  JPEG data URL
 *   onFrame(fn)                       live-view frames (data URLs), main-process drivers only
 */
function createCamera(config, log) {
  switch (config.driver) {
    case 'canon':
      return new (require('./canon-edsdk').CanonCamera)(config, log);
    case 'webcam':
    default:
      return new WebcamCamera();
  }
}

/** Development driver: the renderer uses the PC webcam via getUserMedia. */
class WebcamCamera {
  constructor() {
    this.capturesInMain = false;
  }
  async startLiveView() {}
  async stopLiveView() {}
  async capture() {
    throw new Error('webcam captures in the renderer');
  }
  onFrame() {}
}

module.exports = { createCamera, WebcamCamera };
