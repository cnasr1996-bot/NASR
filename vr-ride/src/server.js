'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const { WebSocketServer } = require('ws');
const { ROOT } = require('./config');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
};

function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
}

/**
 * WebXR only runs on HTTPS, so headsets connect to the HTTPS port. We make
 * a self-signed certificate for this PC's LAN addresses once; each headset
 * accepts it once ("Advanced → Proceed") and the browser remembers.
 */
async function loadOrCreateCert(dataDir, log) {
  const dir = path.join(dataDir, 'tls');
  const keyFile = path.join(dir, 'key.pem');
  const certFile = path.join(dir, 'cert.pem');
  const metaFile = path.join(dir, 'hosts.json');
  const hosts = ['localhost', '127.0.0.1', ...lanAddresses()];
  try {
    const known = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    if (hosts.every((h) => known.includes(h))) {
      return { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) };
    }
  } catch (_) { /* none yet */ }

  const selfsigned = require('selfsigned');
  const notAfterDate = new Date();
  notAfterDate.setFullYear(notAfterDate.getFullYear() + 10);
  const pems = await selfsigned.generate([{ name: 'commonName', value: 'NASR VR Ride' }], {
    keySize: 2048,
    algorithm: 'sha256',
    notAfterDate,
    extensions: [{
      name: 'subjectAltName',
      altNames: hosts.map((h) => (/^[\d.]+$/.test(h) ? { type: 7, ip: h } : { type: 2, value: h })),
    }],
  });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(keyFile, pems.private);
  fs.writeFileSync(certFile, pems.cert);
  fs.writeFileSync(metaFile, JSON.stringify(hosts));
  log.info(`[tls] new certificate for ${hosts.join(', ')} — headsets must accept it once`);
  return { key: pems.private, cert: pems.cert };
}

/** Static files with HTTP Range support (needed for video seeking/streaming). */
function serveFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404).end('not found');
      return;
    }
    const headers = {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
    };
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m) {
      let start = m[1] === '' ? st.size - Number(m[2]) : Number(m[1]);
      let end = m[1] === '' || m[2] === '' ? st.size - 1 : Number(m[2]);
      start = Math.max(0, start);
      end = Math.min(end, st.size - 1);
      if (start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }).end();
        return;
      }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

/** Resolve a URL path under a root directory, refusing ../ escapes. */
function safeJoin(root, rel) {
  const p = path.normalize(path.join(root, decodeURIComponent(rel)));
  return p.startsWith(root + path.sep) || p === root ? p : null;
}

function makeHandler(contentDir, seats = []) {
  const threeBuild = path.dirname(require.resolve('three')); // node_modules/three/build
  const mounts = [
    ['/operator/', path.join(ROOT, 'public', 'operator')],
    ['/headset/', path.join(ROOT, 'public', 'headset')],
    ['/vendor/three/', threeBuild],
    ['/vendor/three-addons/', path.join(threeBuild, '..', 'examples', 'jsm')],
    ['/content/', contentDir],
  ];
  return (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/seats') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(seats.map((s) => ({ id: s.id, name: s.name || `Seat ${s.id}` }))));
      return;
    }
    if (url.pathname === '/') {
      res.writeHead(302, { Location: '/operator/' }).end();
      return;
    }
    for (const [prefix, dir] of mounts) {
      if (!url.pathname.startsWith(prefix)) continue;
      let rel = url.pathname.slice(prefix.length);
      if (rel === '' || rel.endsWith('/')) rel += 'index.html';
      const file = safeJoin(dir, rel);
      if (!file) break;
      serveFile(req, res, file);
      return;
    }
    res.writeHead(404).end('not found');
  };
}

async function startServer(config, engine, { contentDir, reloadLibrary, log = console }) {
  const handler = makeHandler(contentDir, config.seats);
  const tls = await loadOrCreateCert(config.server.dataDir, log);
  const servers = [
    http.createServer(handler).listen(config.server.httpPort),
    https.createServer(tls, handler).listen(config.server.httpsPort),
  ];

  const operators = new Set();
  const urls = () => {
    const hosts = lanAddresses();
    return {
      operator: hosts.map((h) => `http://${h}:${config.server.httpPort}/operator/`),
      headsets: config.seats.map((s) => ({
        seat: s.id,
        urls: hosts.map((h) => `https://${h}:${config.server.httpsPort}/headset/?seat=${encodeURIComponent(s.id)}`),
      })),
    };
  };
  const broadcast = (state) => {
    const msg = JSON.stringify({ type: 'state', state: { ...state, urls: urls() } });
    for (const ws of operators) ws.send(msg);
  };
  engine.onChange(broadcast);

  const onConnection = (ws, req) => {
    const q = new URL(req.url, 'http://x').searchParams;
    const send = (obj) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
    };

    if (q.get('role') === 'headset') {
      const seatId = q.get('seat');
      let headset;
      try {
        headset = engine.attachHeadset(seatId, send);
      } catch (e) {
        send({ type: 'fatal', message: e.message });
        ws.close();
        return;
      }
      ws.on('message', (data) => {
        try {
          engine.headsetMessage(seatId, JSON.parse(data));
        } catch (e) {
          log.warn(`[seat ${seatId}] bad message: ${e.message}`);
        }
      });
      ws.on('close', () => engine.detachHeadset(seatId, headset));
      return;
    }

    if (config.server.operatorPin && q.get('pin') !== String(config.server.operatorPin)) {
      send({ type: 'fatal', message: 'wrong PIN' });
      ws.close();
      return;
    }
    operators.add(ws);
    ws.on('close', () => operators.delete(ws));
    send({ type: 'state', state: { ...engine.getState(), urls: urls() } });
    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data);
        switch (msg.cmd) {
          case 'load': engine.load(msg.id); break;
          case 'start': engine.start(); break;
          case 'stop': engine.stop(); break;
          case 'estop': engine.setEstop(msg.on); break;
          case 'recenter': engine.recenter(msg.seat); break;
          case 'testChair': engine.testChair(msg.seat); break;
          case 'testOutput': engine.testOutput(msg.id); break;
          case 'reloadLibrary': reloadLibrary(); break;
          default: throw new Error(`unknown command "${msg.cmd}"`);
        }
        engine._emit(true);
      } catch (e) {
        send({ type: 'error', message: e.message });
      }
    });
  };

  for (const server of servers) {
    new WebSocketServer({ server, path: '/ws' }).on('connection', onConnection);
  }
  return { servers, urls };
}

module.exports = { startServer, makeHandler, lanAddresses };
