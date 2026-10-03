'use strict';

const $ = (id) => document.getElementById(id);
const pin = new URLSearchParams(location.search).get('pin') || '';
let ws;
let state = null;

// Bars are drawn relative to the configured chair envelope; these are just
// display ranges (the real limits are enforced on the server).
const AXES = [
  ['pitch', '°', 20], ['roll', '°', 20], ['yaw', '°', 25],
  ['heave', 'mm', 60], ['surge', 'mm', 60], ['sway', 'mm', 60],
  ['vibration', '', 1],
];

function cmd(obj) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/ws?role=operator&pin=${encodeURIComponent(pin)}`);
  ws.onopen = () => { $('conn').textContent = 'online'; $('conn').className = 'pill ok'; };
  ws.onclose = () => {
    $('conn').textContent = 'offline';
    $('conn').className = 'pill bad';
    setTimeout(connect, 1500);
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'state') { state = msg.state; render(); }
    if (msg.type === 'error' || msg.type === 'fatal') showError(msg.message);
  };
}

let errorTimer;
function showError(text) {
  $('error').textContent = text;
  $('error').classList.remove('hidden');
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => $('error').classList.add('hidden'), 6000);
}

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) e.append(c);
  return e;
}

const pill = (text, kind = '') => el('span', { class: `pill ${kind}` }, text);
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function render() {
  const s = state;
  const running = s.show.state === 'running';
  $('estopBanner').classList.toggle('hidden', !s.estop);
  $('showState').textContent = s.show.experienceId ? `${s.show.state} · ${s.show.experienceId}` : s.show.state;
  $('showState').className = `pill ${running ? 'ok' : s.show.state === 'ready' ? 'warn' : ''}`;

  // experience list (keep the selection)
  const sel = $('experience');
  const keep = sel.value || s.show.experienceId;
  sel.replaceChildren(...s.experiences.map((e) => el('option', { value: e.id },
    `${e.title.en || e.id}${e.title.ar ? ` — ${e.title.ar}` : ''} (${fmt(e.duration || 0)}, ${e.format})${e.errors.length ? ' ⚠' : ''}`)));
  if (keep) sel.value = keep;
  const chosen = s.experiences.find((e) => e.id === sel.value);
  $('expErrors').textContent = chosen?.errors.length ? `⚠ ${chosen.errors.join(' · ')}` : '';

  $('load').disabled = running || s.estop;
  $('start').disabled = s.estop || !['ready', 'loading'].includes(s.show.state);
  $('stop').disabled = s.show.state === 'idle';

  // seats
  $('seats').replaceChildren(...s.seats.map((seat) => {
    const h = seat.headset;
    const badges = [];
    if (!h) badges.push(pill('no headset', 'bad'));
    else {
      badges.push(pill(h.state, h.state === 'error' ? 'bad' : h.state === 'ready' || h.state === 'playing' ? 'ok' : ''));
      badges.push(pill(h.inXR ? 'in VR' : 'not in VR', h.inXR ? 'ok' : 'warn'));
      if (!h.worn) badges.push(pill('headset off head', 'warn'));
      if (h.info?.battery !== undefined) {
        badges.push(pill(`🔋 ${h.info.battery}%${h.info.charging ? '⚡' : ''}`, h.info.battery < 20 ? 'bad' : ''));
      }
    }
    if (seat.fault) badges.push(pill(`parked: ${seat.fault}`, 'bad'));
    if (seat.testing) badges.push(pill('testing chair', 'warn'));
    const bars = AXES.map(([axis, unit, range]) => {
      const v = seat.chair[axis];
      const frac = Math.max(-1, Math.min(1, v / range));
      const style = axis === 'vibration'
        ? `left:0;width:${frac * 100}%`
        : frac >= 0 ? `left:50%;width:${frac * 50}%` : `left:${50 + frac * 50}%;width:${-frac * 50}%`;
      return el('div', { class: 'axis' }, axis, el('div', { class: 'bar' }, el('i', { style })), el('span', { class: 'num' }, `${v.toFixed(axis === 'vibration' ? 2 : 1)}${unit}`));
    });
    return el('div', { class: 'card' },
      el('div', { class: 'seatHead' }, el('strong', {}, seat.name), el('span', { class: 'muted' }, seat.time !== null ? fmt(seat.time) : '')),
      el('div', { class: 'status' }, ...badges),
      ...(h?.error ? [el('div', { class: 'muted' }, `⚠ ${h.error}`)] : []),
      ...bars,
      el('div', { class: 'row', style: 'margin-top:10px' },
        el('button', { onclick: () => cmd({ cmd: 'recenter', seat: seat.id }), ...(h ? {} : { disabled: '' }) }, 'Recenter'),
        el('button', { onclick: () => cmd({ cmd: 'testChair', seat: seat.id }), ...(running || s.estop ? { disabled: '' } : {}) }, 'Test chair'),
      ),
    );
  }));

  // outputs
  $('outputs').replaceChildren(...s.outputs.map((o) => {
    const on = o.kind === 'water' ? o.value === true : o.value > 0;
    const label = o.kind === 'water' ? (on ? 'spraying' : 'off') : `${Math.round((o.value || 0) * 100)}%`;
    return el('div', { class: 'out' },
      el('span', {}, `${o.kind === 'water' ? '💧' : '🌀'} ${o.id}`),
      pill(label, on ? 'ok' : ''),
      el('button', { onclick: () => cmd({ cmd: 'testOutput', id: o.id }), ...(running || s.estop ? { disabled: '' } : {}) }, 'Test'),
    );
  }));

  // headset links
  $('urls').replaceChildren(...s.urls.headsets.map((h) => el('div', {},
    `Seat ${h.seat}: `, ...h.urls.flatMap((u, i) => [i ? ' · ' : '', el('a', { href: u, target: '_blank' }, u)]))));
}

$('estop').onclick = () => cmd({ cmd: 'estop', on: true });
$('release').onclick = () => {
  if (confirm('Release E-stop? Make sure every rider is seated and safe.')) cmd({ cmd: 'estop', on: false });
};
$('load').onclick = () => cmd({ cmd: 'load', id: $('experience').value });
$('start').onclick = () => cmd({ cmd: 'start' });
$('stop').onclick = () => cmd({ cmd: 'stop' });
$('recenterAll').onclick = () => cmd({ cmd: 'recenter' });
$('reload').onclick = () => cmd({ cmd: 'reloadLibrary' });
$('experience').onchange = () => state && render();
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') cmd({ cmd: 'estop', on: true });
});

connect();
