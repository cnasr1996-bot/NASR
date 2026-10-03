// NASR VR Ride — headset player (WebXR).
//
// Runs in the headset browser (Meta Quest Browser, Pico Browser, Apple
// Vision Pro Safari, or PC VR via Chrome/Edge + SteamVR/Oculus Link).
// The video playing here is the master clock: we report currentTime to the
// ride server, which drives the chair / fans / water from it.
//
// The XR session stays open between riders. Between shows the rider sees a
// lobby; the operator loads and starts shows from the dashboard and nobody
// has to touch the headset.

import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const seatId = params.get('seat') || localStorage.getItem('seat') || '1';
localStorage.setItem('seat', seatId);

const T = {
  wait: ['Please wait', 'يرجى الانتظار'],
  waitSub: ['Your ride will start in a moment', 'ستبدأ رحلتك بعد لحظات'],
  loading: ['Loading…', 'جارِ التحميل…'],
  ready: ['Get ready!', 'استعد!'],
  readySub: ['Sit back and hold on', 'اجلس بثبات وتمسّك جيداً'],
  estop: ['Ride paused', 'تم إيقاف الرحلة'],
  estopSub: ['Please stay seated — staff are coming', 'يرجى البقاء في المقعد — الموظف قادم'],
  thanks: ['Thank you!', 'شكراً لك!'],
  thanksSub: ['Please wait for the chair to stop', 'يرجى الانتظار حتى يتوقف الكرسي'],
  offline: ['Connecting…', 'جارِ الاتصال…'],
  error: ['Something went wrong', 'حدث خطأ'],
};

// ---------------------------------------------------------------------------
// state

let ws = null;
let cfg = { motionCompensation: true, recenterOnStart: true, framebufferScale: 1, foveation: 0.3 };
let seatName = `Seat ${seatId}`;
let experience = null;
let status = 'idle'; // idle | loading | ready | playing | ended | error
let estop = false;
let connected = false;
let worn = true;
let demoClock = null; // { startedAt, offset } for experiences without video

const video = document.createElement('video');
video.playsInline = true;
video.crossOrigin = 'anonymous';
video.preload = 'auto';

// ---------------------------------------------------------------------------
// three.js scene
//
//   scene
//   └─ chairRig      ← chair rotation (motion compensation): keeps the world
//      │               fixed to the seat, so tilting the chair doesn't tilt
//      │               the picture inside the headset
//      └─ yawRig     ← recenter: rotates "front of the video" to rider's front
//         ├─ lobby   (text panel + backdrop)
//         ├─ media   (video sphere / screen)
//         └─ demo    (procedural tunnel for experiences without video)

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local'); // seated: origin at the head when the session starts
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020308);
const camera = new THREE.PerspectiveCamera(80, innerWidth / innerHeight, 0.05, 500);
camera.layers.enable(1); // in 2D preview show the left-eye image of stereo video
const chairRig = new THREE.Group();
const yawRig = new THREE.Group();
scene.add(chairRig);
chairRig.add(yawRig);
yawRig.rotation.y = Number(localStorage.getItem('yawOffset') || 0);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---- lobby: starfield + bilingual text panel ------------------------------

const lobby = new THREE.Group();
yawRig.add(lobby);
{
  const n = 1500;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(60 + Math.random() * 60);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  lobby.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8fa8ff, size: 0.35, sizeAttenuation: true })));
}
const panelCanvas = document.createElement('canvas');
panelCanvas.width = 1024;
panelCanvas.height = 512;
const panelTex = new THREE.CanvasTexture(panelCanvas);
panelTex.colorSpace = THREE.SRGBColorSpace;
const panel = new THREE.Mesh(
  new THREE.PlaneGeometry(2.4, 1.2),
  new THREE.MeshBasicMaterial({ map: panelTex, transparent: true }),
);
panel.position.set(0, 0, -3);
lobby.add(panel);

function drawPanel(key, progress) {
  const c = panelCanvas.getContext('2d');
  c.clearRect(0, 0, 1024, 512);
  c.fillStyle = key === 'estop' ? 'rgba(90,10,14,.88)' : 'rgba(12,16,30,.82)';
  c.beginPath();
  c.roundRect(8, 8, 1008, 496, 40);
  c.fill();
  c.textAlign = 'center';
  c.fillStyle = '#ffffff';
  c.font = '700 64px system-ui, sans-serif';
  c.fillText(T[key][0], 512, 130);
  c.direction = 'rtl';
  c.font = '700 64px system-ui, "Noto Naskh Arabic", sans-serif';
  c.fillText(T[key][1], 512, 220);
  c.direction = 'ltr';
  const sub = T[`${key}Sub`];
  if (sub) {
    c.fillStyle = '#b8c0d8';
    c.font = '36px system-ui, sans-serif';
    c.fillText(sub[0], 512, 300);
    c.direction = 'rtl';
    c.fillText(sub[1], 512, 352);
    c.direction = 'ltr';
  }
  if (progress !== undefined) {
    c.fillStyle = '#26304a';
    c.fillRect(212, 400, 600, 18);
    c.fillStyle = '#2f7bff';
    c.fillRect(212, 400, 600 * Math.min(1, progress), 18);
  }
  c.fillStyle = '#6c7590';
  c.font = '28px system-ui, sans-serif';
  c.fillText(seatName, 512, 470);
  panelTex.needsUpdate = true;
}

// ---- media: 360 / 180 / flat, mono or stereo ------------------------------

const media = new THREE.Group();
yawRig.add(media);
const videoTex = new THREE.VideoTexture(video);
videoTex.colorSpace = THREE.SRGBColorSpace;
videoTex.generateMipmaps = false;
videoTex.minFilter = THREE.LinearFilter;

/** Remap a geometry's UVs into a sub-rectangle of the video (one eye of a stereo frame). */
function cropUV(geometry, [u0, v0, du, dv]) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * du, v0 + uv.getY(i) * dv);
  uv.needsUpdate = true;
  return geometry;
}

function makeShape(format) {
  const kind = format.split('-')[0];
  if (kind === '360' || kind === '180') {
    const g = kind === '360'
      ? new THREE.SphereGeometry(50, 96, 48)
      : new THREE.SphereGeometry(50, 64, 48, Math.PI / 2, Math.PI);
    g.scale(-1, 1, 1); // view from inside
    return { geometry: g, rotationY: -Math.PI / 2, position: [0, 0, 0] }; // video centre straight ahead
  }
  // Cinema screen: 8 m wide, 6 m away, aspect fixed once the video size is known.
  const aspect = (video.videoWidth || 16) / (video.videoHeight || 9);
  const eyeAspect = format === 'flat-sbs' ? aspect / 2 : format === 'flat-tb' ? aspect * 2 : aspect;
  return { geometry: new THREE.PlaneGeometry(8, 8 / eyeAspect), rotationY: 0, position: [0, 0, -6] };
}

function buildMedia(format) {
  media.clear();
  const stereo = format.split('-')[1]; // undefined | 'mono' | 'tb' | 'sbs'
  // [u0, v0, du, dv] per eye. Video textures are flipped, so v=1 is the top row.
  const eyes = stereo === 'tb'
    ? [[0, 0.5, 1, 0.5], [0, 0, 1, 0.5]] // left eye on top
    : stereo === 'sbs'
      ? [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]] // left eye on the left
      : [null];
  eyes.forEach((rect, i) => {
    const shape = makeShape(format);
    const mesh = new THREE.Mesh(
      rect ? cropUV(shape.geometry, rect) : shape.geometry,
      new THREE.MeshBasicMaterial({ map: videoTex }),
    );
    mesh.rotation.y = shape.rotationY;
    mesh.position.set(...shape.position);
    // WebXR in three.js: left-eye camera renders layer 1, right-eye layer 2.
    if (rect) mesh.layers.set(i + 1);
    media.add(mesh);
  });
  if (format.startsWith('flat')) {
    // A dark room around the screen so the edges don't float in the void.
    const room = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), new THREE.MeshBasicMaterial({ color: 0x050505, side: THREE.BackSide }));
    media.add(room);
  }
}

// ---- demo: procedural tunnel, for testing chairs without any video file ---

const demo = new THREE.Group();
yawRig.add(demo);
const RINGS = 60;
for (let i = 0; i < RINGS; i++) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(4, 0.06, 6, 48),
    new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.55 + (i % 10) / 40, 0.9, 0.55) }),
  );
  ring.position.z = -i * 3;
  demo.add(ring);
}
demo.visible = false;

function demoTime() {
  if (!demoClock) return 0;
  return demoClock.offset + (demoClock.startedAt === null ? 0 : (performance.now() - demoClock.startedAt) / 1000);
}

/** Forward distance travelled at time t: speed ramps up then down, like a ride. */
function demoDistance(t) {
  return 6 * t + 3 * t * t * Math.min(1, t / 10) * 0.2;
}

function updateDemo() {
  const t = demoTime();
  const d = demoDistance(t);
  demo.children.forEach((ring, i) => {
    const z = -((i * 3 - d) % (RINGS * 3) + RINGS * 3) % (RINGS * 3);
    ring.position.set(Math.sin((z - d) * 0.05) * 2, Math.cos((z - d) * 0.04) * 1.5, z);
  });
}

// ---------------------------------------------------------------------------
// what the rider sees

function showLobby(key, progress) {
  drawPanel(key, progress);
  lobby.visible = true;
  media.visible = false;
  demo.visible = false;
}

function showContent() {
  lobby.visible = false;
  media.visible = !!experience?.video;
  demo.visible = !experience?.video;
}

function render() {
  if (estop) showLobby('estop');
  else if (!connected) showLobby('offline');
  else if (status === 'playing') showContent();
  else if (status === 'loading') showLobby('loading', bufferedFraction());
  else if (status === 'ready') showLobby('ready');
  else if (status === 'ended') showLobby('thanks');
  else if (status === 'error') showLobby('error');
  else showLobby('wait');
}

function bufferedFraction() {
  if (!video.duration || !video.buffered.length) return 0;
  return video.buffered.end(video.buffered.length - 1) / video.duration;
}

// ---------------------------------------------------------------------------
// server connection

function send(obj) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function setStatus(s, error) {
  status = s;
  send({ type: 'status', state: s, error: error || null, inXR: renderer.xr.isPresenting });
  render();
}

function reportTime() {
  if (status !== 'playing') return;
  if (experience.video) {
    // While buffering, report "not playing" so the chair holds still instead
    // of running ahead of a frozen picture.
    const playing = !video.paused && !video.ended && video.readyState >= 3;
    send({ type: 'time', t: video.currentTime, playing, rate: video.playbackRate });
  } else {
    send({ type: 'time', t: demoTime(), playing: demoClock?.startedAt !== null, rate: 1 });
  }
}
setInterval(reportTime, 100);

function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/ws?role=headset&seat=${encodeURIComponent(seatId)}`);
  ws.onopen = () => {
    connected = true;
    $('connDot').classList.add('ok');
    $('connText').textContent = 'Connected to ride server';
    send({ type: 'info', info: { ua: navigator.userAgent, xr: !!navigator.xr } });
    sendBattery();
    // Re-announce our state: the server forgets everything on reconnect.
    setStatus(status === 'playing' ? 'idle' : status);
    send({ type: 'presence', worn });
  };
  ws.onclose = () => {
    const was = connected;
    connected = false;
    $('connDot').classList.remove('ok');
    $('connText').textContent = 'Ride server not reachable — retrying…';
    // Chair parks on the server side when we vanish; stop the picture too so
    // the rider isn't watching a ride with no motion.
    if (was && status === 'playing') stopPlayback('idle');
    render();
    setTimeout(connect, 1500);
  };
  ws.onmessage = (ev) => handle(JSON.parse(ev.data));
}

async function sendBattery() {
  try {
    const b = await navigator.getBattery?.();
    if (b) send({ type: 'info', info: { battery: Math.round(b.level * 100), charging: b.charging } });
  } catch (_) { /* not supported */ }
}
setInterval(sendBattery, 60000);

function handle(msg) {
  switch (msg.type) {
    case 'config':
      cfg = { ...cfg, ...msg.headset };
      seatName = msg.seat.name;
      $('seatLabel').textContent = seatName;
      applyXRSettings();
      break;
    case 'load':
      load(msg.experience);
      break;
    case 'play':
      play();
      break;
    case 'stop':
      stopPlayback('idle');
      break;
    case 'estop':
      estop = msg.on;
      if (estop) pausePlayback();
      break;
    case 'recenter':
      recenter();
      break;
    case 'pose':
      chairTarget.setFromEuler(new THREE.Euler(
        THREE.MathUtils.degToRad(msg.pitch),
        THREE.MathUtils.degToRad(-msg.yaw),
        THREE.MathUtils.degToRad(-msg.roll),
        'YXZ',
      ));
      return; // 30 Hz — don't redraw the lobby for it
    case 'replaced':
      $('warn').textContent = 'Another headset connected as this seat.';
      break;
    case 'fatal':
      $('warn').textContent = msg.message;
      break;
  }
  render();
}

// ---------------------------------------------------------------------------
// playback

let loadToken = 0;

async function load(exp) {
  const token = ++loadToken;
  experience = exp;
  video.pause();
  demoClock = null;
  setStatus('loading');
  if (!exp.video) {
    demoClock = { startedAt: null, offset: 0 };
    setStatus('ready');
    return;
  }
  try {
    video.src = exp.video.src;
    video.load();
    await new Promise((resolve, reject) => {
      const done = () => { cleanup(); resolve(); };
      const fail = () => { cleanup(); reject(new Error(`cannot load ${exp.video.src}`)); };
      const progress = () => render();
      const cleanup = () => {
        video.removeEventListener('canplaythrough', done);
        video.removeEventListener('error', fail);
        video.removeEventListener('progress', progress);
      };
      video.addEventListener('canplaythrough', done);
      video.addEventListener('error', fail);
      video.addEventListener('progress', progress);
    });
    if (token !== loadToken) return;
    buildMedia(exp.video.format);
    setStatus('ready');
  } catch (e) {
    if (token === loadToken) setStatus('error', e.message);
  }
}

async function play() {
  if (status !== 'ready' || estop) return;
  if (cfg.recenterOnStart) recenter();
  setStatus('playing');
  if (!experience.video) {
    demoClock = { startedAt: performance.now(), offset: 0 };
    return;
  }
  video.currentTime = 0;
  try {
    await video.play();
  } catch (e) {
    // Autoplay with sound refused: should not happen once the rider/staff
    // tapped "Enter VR" (that tap unlocks media), but fall back to muted.
    video.muted = true;
    await video.play().catch((err) => setStatus('error', err.message));
  }
}

function pausePlayback() {
  video.pause();
  if (demoClock?.startedAt != null) demoClock = { startedAt: null, offset: demoTime() };
  reportTime();
}

function stopPlayback(next) {
  video.pause();
  demoClock = null;
  experience = next === 'idle' ? null : experience;
  setStatus(next);
}

video.addEventListener('ended', () => {
  if (status === 'playing') setStatus('ended');
});
for (const ev of ['playing', 'pause', 'waiting', 'seeked']) video.addEventListener(ev, reportTime);

function checkDemoEnd() {
  if (status === 'playing' && !experience.video && demoTime() >= experience.duration) setStatus('ended');
}

// After "thank you", drop back to the waiting screen.
let endedTimer = null;
setInterval(() => {
  if (status === 'ended' && !endedTimer) {
    endedTimer = setTimeout(() => { endedTimer = null; if (status === 'ended') setStatus('idle'); }, 8000);
  }
}, 500);

// ---------------------------------------------------------------------------
// recenter + motion compensation

function headYaw() {
  const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  const dir = new THREE.Vector3();
  cam.getWorldDirection(dir);
  return Math.atan2(-dir.x, -dir.z);
}

/** Rotate the content so its front is where the rider is facing now. */
function recenter() {
  yawRig.rotation.y = headYaw();
  localStorage.setItem('yawOffset', String(yawRig.rotation.y));
}

const chairTarget = new THREE.Quaternion();
const clock = new THREE.Clock();

function updateChairRig(dt) {
  const target = cfg.motionCompensation && status === 'playing' ? chairTarget : new THREE.Quaternion();
  // Poses arrive ~30 Hz over Wi-Fi; smooth them to display rate.
  chairRig.quaternion.slerp(target, 1 - Math.exp(-dt / 0.035));
}

// ---------------------------------------------------------------------------
// WebXR session

function applyXRSettings() {
  if (renderer.xr.isPresenting) return; // must be set before the session starts
  renderer.xr.setFramebufferScaleFactor(cfg.framebufferScale || 1);
  renderer.xr.setFoveation(cfg.foveation ?? 0.3);
}

const sessionInit = { optionalFeatures: [] };

async function onSessionStarted(session) {
  session.addEventListener('end', onSessionEnded);
  // Headset taken off (proximity sensor) → 'hidden'. The server parks the chair.
  session.addEventListener('visibilitychange', () => {
    worn = session.visibilityState !== 'hidden';
    send({ type: 'presence', worn });
  });
  await renderer.xr.setSession(session);
  $('panel').classList.add('hidden');
  setStatus(status);
}

function onSessionEnded() {
  $('panel').classList.remove('hidden');
  setStatus(status);
  offerSession();
}

async function enterVR() {
  // This tap also unlocks audio for later video.play() calls without a tap.
  video.muted = false;
  video.play().then(() => video.pause()).catch(() => {});
  const session = await navigator.xr.requestSession('immersive-vr', sessionInit);
  await onSessionStarted(session);
}

/** Quest Browser: show the system "Enter VR" prompt without a page tap. */
function offerSession() {
  if (navigator.xr?.offerSession) {
    navigator.xr.offerSession('immersive-vr', sessionInit).then(onSessionStarted).catch(() => {});
  }
}

async function setupEnterButton() {
  const btn = $('enter');
  if (!window.isSecureContext) {
    btn.textContent = 'VR needs HTTPS';
    $('warn').textContent = `Open https://${location.hostname}:${location.port || 8443}${location.pathname}${location.search} instead.`;
    return;
  }
  if (!navigator.xr || !(await navigator.xr.isSessionSupported('immersive-vr').catch(() => false))) {
    btn.textContent = 'VR not available here';
    $('warn').textContent = 'Open this page in the headset browser. Use "2D preview" to test on a PC.';
    return;
  }
  btn.disabled = false;
  btn.textContent = 'Enter VR  •  دخول الواقع الافتراضي';
  btn.onclick = () => enterVR().catch((e) => { $('warn').textContent = e.message; });
  offerSession();
}

// ---------------------------------------------------------------------------
// 2D preview for testing on a PC: drag to look around

$('preview').onclick = () => {
  $('panel').classList.add('hidden');
  video.muted = false;
  video.play().then(() => video.pause()).catch(() => {});
};
{
  let drag = null;
  let lon = 0;
  let lat = 0;
  renderer.domElement.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, lon, lat }; });
  addEventListener('pointerup', () => { drag = null; });
  addEventListener('pointermove', (e) => {
    if (!drag) return;
    lon = drag.lon + (e.clientX - drag.x) * 0.004;
    lat = THREE.MathUtils.clamp(drag.lat + (e.clientY - drag.y) * 0.004, -1.4, 1.4);
    camera.rotation.set(lat, lon, 0, 'YXZ');
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') $('panel').classList.remove('hidden'); });
}

// seat picker
fetch('/api/seats').then((r) => r.json()).then((seats) => {
  const sel = $('seatSelect');
  for (const s of seats) sel.add(new Option(s.name, s.id, false, s.id === seatId));
  sel.onchange = () => {
    localStorage.removeItem('yawOffset');
    location.search = `?seat=${encodeURIComponent(sel.value)}`;
  };
}).catch(() => {});

// ---------------------------------------------------------------------------

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  updateChairRig(dt);
  if (demo.visible) updateDemo();
  checkDemoEnd();
  if (status === 'loading') drawPanelThrottled();
  renderer.render(scene, camera);
});

let lastPanelDraw = 0;
function drawPanelThrottled() {
  if (performance.now() - lastPanelDraw > 500) {
    lastPanelDraw = performance.now();
    render();
  }
}

$('seatLabel').textContent = seatName;
render();
connect();
setupEnterButton();
