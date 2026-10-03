'use strict';

const path = require('path');
const { loadConfig, ROOT } = require('./config');
const { loadLibrary } = require('./library');
const { Engine } = require('./engine');
const { createChair, createOutput } = require('./drivers');
const { startServer } = require('./server');

async function main() {
  const config = loadConfig();
  const contentDir = path.join(ROOT, 'content');
  const log = console;

  let library = loadLibrary(contentDir);
  const libraryProxy = {
    get: (id) => library.get(id),
    values: () => library.values(),
  };
  const engine = new Engine(config, { library: libraryProxy, createChair, createOutput, log });
  const reloadLibrary = () => {
    library = loadLibrary(contentDir);
    log.info(`[library] ${library.size} experience(s)`);
    engine._changed();
  };
  for (const e of library.values()) {
    if (e.errors.length) log.warn(`[library] ${e.id}: ${e.errors.join('; ')}`);
  }

  engine.run();
  const { urls } = await startServer(config, engine, { contentDir, reloadLibrary, log });
  const u = urls();
  log.info(`\nOperator dashboard: http://localhost:${config.server.httpPort}/operator/  ${u.operator.join('  ')}`);
  for (const h of u.headsets) log.info(`Headset seat ${h.seat}: ${h.urls.join('  ') || '(no LAN address found)'}`);

  let stopping = false;
  const shutdown = async () => {
    if (stopping) process.exit(1); // second Ctrl+C: quit now
    stopping = true;
    log.info('\nParking chairs and switching off effects...');
    await engine.shutdown();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
