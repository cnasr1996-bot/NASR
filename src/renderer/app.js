/* global I18N, Vintage */
'use strict';

/**
 * Touch UI. Renders whatever state the main process reports and forwards
 * customer actions back; all decisions live in src/core/flow.js.
 */
(async function main() {
  const booth = window.booth;
  const cfg = await booth.getConfig();
  const $ = (sel) => document.querySelector(sel);
  const screens = new Map(
    [...document.querySelectorAll('.screen')].map((el) => [el.dataset.screen, el]),
  );

  let lang = cfg.defaultLanguage || 'ar';
  let current = null; // latest state snapshot
  let webcamStream = null;
  let countdownRunning = false;
  let printImage = null;

  // ---------- Language ----------
  function t(key, vars) {
    return I18N.t(lang, key, vars);
  }
  function applyLanguage() {
    document.documentElement.lang = lang;
    document.documentElement.dir = t('dir');
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    if (current) renderDetails(current);
  }
  $('#lang-toggle').addEventListener('click', () => {
    lang = lang === 'ar' ? 'en' : 'ar';
    applyLanguage();
  });

  // ---------- Touch feedback ----------
  let audioCtx;
  function tapSound() {
    try {
      audioCtx = audioCtx || new AudioContext();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = 620;
      g.gain.setValueAtTime(0.08, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.07);
      o.connect(g).connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + 0.08);
    } catch (_) { /* audio is optional */ }
  }
  document.addEventListener('pointerdown', (e) => {
    booth.send('touch');
    resetIdleWarning();
    const btn = e.target.closest('.btn, .lang-toggle');
    if (!btn) return;
    tapSound();
    if (navigator.vibrate) navigator.vibrate(12);
    const r = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height);
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  });

  // Buttons with data-action. Disabled briefly after a tap to avoid double taps.
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    setTimeout(() => (btn.disabled = false), 800);
    const action = btn.dataset.action;
    if (action === 'confirm') return booth.send('confirm', printImage);
    booth.send(action);
  });

  // Touching anywhere on the attract screen starts a session.
  screens.get('attract').addEventListener('click', (e) => {
    if (!e.target.closest('.lang-toggle')) booth.send('start');
  });

  // ---------- Screen switching ----------
  function show(name) {
    for (const [key, el] of screens) {
      const active = key === name;
      if (el.classList.contains('active') && !active) {
        el.classList.add('leaving');
        setTimeout(() => el.classList.remove('leaving'), 450);
      }
      el.classList.toggle('active', active);
    }
  }

  booth.onState(async (snap) => {
    const prev = current && current.state;
    current = snap;
    show(snap.state);
    renderDetails(snap);
    resetIdleWarning();

    if (snap.state === 'capture' && prev !== 'capture') await enterCapture();
    if (snap.state !== 'capture') stopWebcam();
    if (snap.state === 'review' && prev !== 'review') await renderPrint(snap.context.photo);
    if (snap.state === 'attract') {
      printImage = null;
      playAttractVideo();
    }
  });

  function renderDetails(snap) {
    const c = snap.context || {};
    $('#amount').textContent = t('paymentAmount', { amount: snap.price.amount });
    $('#retakes-left').textContent = t('retakesLeft', { n: snap.retakesLeft });
    $('[data-action="retake"]').hidden = snap.retakesLeft <= 0;
    $('#payment-failed-reason').textContent = t(`paymentFailed_${c.reason || 'error'}`);
    $('#error-message').textContent = t(`error_${c.code || 'capture'}`, { ref: c.reference || '' });
    const warn = $('#printer-warning');
    warn.hidden = !c.printerWarning;
    warn.textContent = c.printerWarning ? `● ${c.printerWarning}` : '';
  }

  // ---------- Attract video ----------
  function playAttractVideo() {
    const v = $('#attract-video');
    if (!cfg.attract.video) return;
    if (!v.src) v.src = cfg.attract.video;
    v.hidden = false;
    v.play().catch(() => {});
  }

  // ---------- Capture ----------
  const liveview = $('.liveview');
  const webcam = $('#webcam');
  const canonFrame = $('#canon-frame');
  const isWebcam = cfg.camera.driver === 'webcam';
  liveview.classList.toggle('mirror', cfg.flow.mirrorLiveView !== false);
  webcam.hidden = !isWebcam;
  canonFrame.hidden = isWebcam;

  booth.onFrame((dataUrl) => {
    canonFrame.src = dataUrl;
  });

  async function startWebcam() {
    if (webcamStream) return;
    webcamStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1920 }, height: { ideal: 1280 } },
      audio: false,
    });
    webcam.srcObject = webcamStream;
    await webcam.play();
  }

  function stopWebcam() {
    if (!webcamStream) return;
    for (const track of webcamStream.getTracks()) track.stop();
    webcamStream = null;
    webcam.srcObject = null;
  }

  function grabWebcamFrame() {
    const c = document.createElement('canvas');
    c.width = webcam.videoWidth;
    c.height = webcam.videoHeight;
    c.getContext('2d').drawImage(webcam, 0, 0);
    return c.toDataURL('image/jpeg', 0.95);
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function enterCapture() {
    if (countdownRunning) return;
    countdownRunning = true;
    const cd = $('#countdown');
    try {
      if (isWebcam) await startWebcam();
      cd.className = 'countdown ready';
      cd.textContent = t('getReady');
      await sleep(1200);
      for (let n = cfg.flow.countdownSeconds || 3; n > 0; n--) {
        if (!current || current.state !== 'capture') return;
        cd.className = 'countdown';
        void cd.offsetWidth; // restart the CSS animation
        cd.textContent = String(n);
        cd.className = 'countdown tick';
        await sleep(1000);
      }
      if (!current || current.state !== 'capture') return;
      cd.textContent = '';
      const flash = $('#flash');
      flash.className = 'flash';
      void flash.offsetWidth;
      flash.className = 'flash go';
      booth.send('shoot', isWebcam ? grabWebcamFrame() : undefined);
    } catch (err) {
      console.error(err);
      booth.send('shoot', undefined); // flow turns a missing photo into an error screen
    } finally {
      countdownRunning = false;
    }
  }

  // ---------- Print composition (vintage effect + layout) ----------
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  /**
   * Builds the final print at printer resolution (6x4 in @ 300 dpi =
   * 1800×1200 px): cream border, vintage photo, caption + date underneath.
   */
  async function renderPrint(photoUrl) {
    const { widthIn, heightIn, dpi } = cfg.paper;
    const W = Math.round(widthIn * dpi);
    const H = Math.round(heightIn * dpi);
    const canvas = $('#print-canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Paper
    ctx.fillStyle = '#f3e9d6';
    ctx.fillRect(0, 0, W, H);

    // Photo window
    const m = Math.round(H * 0.045);
    const bottom = Math.round(H * 0.12);
    const pw = W - m * 2;
    const ph = H - m - bottom;
    const img = await loadImage(photoUrl);
    const scale = Math.max(pw / img.width, ph / img.height);
    const sw = pw / scale;
    const sh = ph / scale;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, m, m, pw, ph);

    const region = ctx.getImageData(m, m, pw, ph);
    Vintage.apply(region, cfg.print.vintage);
    ctx.putImageData(region, m, m);

    // Caption
    ctx.fillStyle = '#5a4632';
    ctx.textBaseline = 'middle';
    const cy = H - bottom / 2 - m * 0.1;
    ctx.font = `600 ${Math.round(bottom * 0.38)}px Georgia, "Times New Roman", serif`;
    ctx.textAlign = 'left';
    ctx.fillText(cfg.print.caption || '', m, cy);
    ctx.font = `${Math.round(bottom * 0.26)}px Georgia, serif`;
    ctx.textAlign = 'right';
    const d = new Date();
    ctx.fillText(
      `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`,
      W - m,
      cy,
    );

    printImage = canvas.toDataURL('image/jpeg', 0.93);
  }

  // ---------- "Are you still there?" overlay ----------
  // The real timeout lives in the flow; this only warns 10 s before it.
  const IDLE_STATES = new Set(['capture', 'review', 'paymentFailed', 'error']);
  let idleWarnTimer = null;
  let idleTick = null;
  function resetIdleWarning() {
    clearTimeout(idleWarnTimer);
    clearInterval(idleTick);
    $('#idle-warning').hidden = true;
    if (!current || !IDLE_STATES.has(current.state)) return;
    const warnAt = cfg.flow.idleTimeoutMs - 10_000;
    idleWarnTimer = setTimeout(() => {
      let left = 10;
      $('#idle-count').textContent = left;
      $('#idle-warning').hidden = false;
      idleTick = setInterval(() => {
        left -= 1;
        $('#idle-count').textContent = Math.max(left, 0);
        if (left <= 0) clearInterval(idleTick);
      }, 1000);
    }, warnAt);
  }

  applyLanguage();
  booth.send('ready');
})();
