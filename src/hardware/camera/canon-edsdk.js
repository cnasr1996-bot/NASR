'use strict';

/**
 * Canon EOS driver over USB using Canon's official EDSDK, through the
 * @brick-a-brack/napi-canon-cameras Node addon (Windows only).
 *
 * The EDSDK itself is not redistributable: register at Canon's developer
 * programme, download the EDSDK, and build the addon as described in
 * docs/SETUP.md. Until then this driver cannot load and the app should run
 * with camera.driver = "webcam".
 */
const { EventEmitter } = require('events');

class CanonCamera extends EventEmitter {
  constructor(config, log) {
    super();
    this.capturesInMain = true;
    this.config = config;
    this.log = log || console;
    this.api = require('@brick-a-brack/napi-canon-cameras');
    this.camera = null;
    this.frameTimer = null;
    this.pendingCapture = null;
    this.stopWatching = this.api.watchCameras(50);
  }

  _connect() {
    if (this.camera) return this.camera;
    const { cameraBrowser, Camera, CameraProperty, Option, ImageQuality } = this.api;
    const camera = cameraBrowser.getCamera();
    if (!camera) throw new Error('No Canon camera found on USB');

    camera.setEventHandler((eventName, event) => {
      if (eventName === Camera.EventName.DownloadRequest && this.pendingCapture) {
        try {
          const base64 = event.file.downloadToString();
          this.pendingCapture.resolve(
            base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`,
          );
        } catch (err) {
          this.pendingCapture.reject(err);
        }
        this.pendingCapture = null;
      } else if (eventName === Camera.EventName.CameraDisconnect) {
        this.log.warn('[canon] camera disconnected');
        this.camera = null;
      }
    });

    // keepAlive stops the camera from going to sleep between customers.
    camera.connect(true);
    camera.setProperties({
      // Send photos straight to the PC instead of the SD card.
      [CameraProperty.ID.SaveTo]: Option.SaveTo.Host,
      // Large/Fine JPEG is far more than a 4x6 print needs and avoids RAW decoding.
      [CameraProperty.ID.ImageQuality]: ImageQuality.ID[this.config.imageQuality || 'LargeJPEGFine'],
    });
    this.camera = camera;
    return camera;
  }

  async startLiveView() {
    const camera = this._connect();
    if (!camera.isLiveViewActive()) camera.startLiveView();
    const interval = Math.round(1000 / (this.config.liveViewFps || 20));
    clearInterval(this.frameTimer);
    this.frameTimer = setInterval(() => {
      try {
        const frame = camera.getLiveViewImage();
        if (frame) this.emit('frame', frame.getDataURL());
      } catch (_) {
        // The camera drops frames while focusing or right after start; skip them.
      }
    }, interval);
  }

  async stopLiveView() {
    clearInterval(this.frameTimer);
    this.frameTimer = null;
    if (this.camera && this.camera.isLiveViewActive()) this.camera.stopLiveView();
  }

  capture() {
    const camera = this._connect();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCapture = null;
        reject(new Error('Canon capture timed out'));
      }, this.config.captureTimeoutMs || 15000);
      this.pendingCapture = {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      };
      camera.takePicture();
    });
  }

  onFrame(fn) {
    this.on('frame', fn);
  }

  dispose() {
    clearInterval(this.frameTimer);
    if (this.stopWatching) this.stopWatching();
    if (this.camera) this.camera.disconnect();
  }
}

module.exports = { CanonCamera };
