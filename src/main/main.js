'use strict';

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const { loadConfig } = require('./config');
const { BoothFlow } = require('../core/flow');
const { createCamera } = require('../hardware/camera');
const { DnpPrinter } = require('../hardware/printer');
const { createPayment } = require('../hardware/payment');
const { printImageSilently } = require('./print-window');
const { createNotifier } = require('./notify');

const config = loadConfig();
const log = console;
let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1920,
    height: 1080,
    kiosk: config.kiosk,
    fullscreen: config.kiosk,
    autoHideMenuBar: true,
    backgroundColor: '#0d0b09',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

app.whenReady().then(async () => {
  // Allow the webcam driver without a permission prompt.
  require('electron').session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) =>
    cb(perm === 'media'),
  );

  const notify = createNotifier(config.operator, log);
  const camera = createCamera(config.camera, log);
  const payment = createPayment(config.payment, log);
  // Every print is archived so staff can reprint after a failure or jam.
  const archiveDir = path.join(app.getPath('pictures'), 'PhotoBooth');
  fs.mkdirSync(archiveDir, { recursive: true });
  const printAndArchive = (dataUrl, opts) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(
      path.join(archiveDir, `${stamp}.jpg`),
      Buffer.from(dataUrl.split(',')[1], 'base64'),
    );
    return printImageSilently(dataUrl, opts);
  };

  const printer = new DnpPrinter(config.printer, {
    printImage: printAndArchive,
    stateFile: path.join(app.getPath('userData'), 'printer-state.json'),
    log,
    notify,
  });

  const flow = new BoothFlow({ camera, payment, printer, log }, config.flow);

  createWindow();

  flow.onChange((snapshot) => win && win.webContents.send('booth:state', snapshot));
  camera.onFrame((frame) => win && win.webContents.send('booth:frame', frame));

  ipcMain.handle('booth:config', () => ({
    defaultLanguage: config.defaultLanguage,
    flow: config.flow,
    attract: config.attract,
    camera: { driver: config.camera.driver },
    print: config.print,
    paper: config.printer.paper,
  }));

  const actions = {
    ready: () => flow.refreshAvailability(),
    touch: () => flow.touch(),
    start: () => flow.start(),
    shoot: (photo) => flow.shoot(photo),
    retake: () => flow.retake(),
    confirm: (printImage) => flow.confirm(printImage),
    cancelPayment: () => flow.cancelPayment(),
    retryPayment: () => flow.retryPayment(),
    reset: () => flow.reset(),
  };
  ipcMain.handle('booth:action', (_e, action, payload) => {
    const fn = actions[action];
    if (!fn) throw new Error(`unknown action ${action}`);
    return fn(payload);
  });

  // Staff shortcuts (keyboard only, no on-screen buttons):
  //   Ctrl+Shift+M  new media roll loaded → reset print counter
  //   Ctrl+Shift+Q  quit kiosk
  globalShortcut.register('CommandOrControl+Shift+M', async () => {
    printer.resetMediaCounter();
    await flow.reset();
  });
  globalShortcut.register('CommandOrControl+Shift+Q', () => app.quit());

  // Re-check the printer periodically so an empty roll shows "out of service"
  // on the attract screen instead of after a customer has started.
  setInterval(() => {
    if (flow.state === 'attract' || flow.state === 'outOfService') flow.refreshAvailability();
  }, 30_000);
});

app.on('window-all-closed', () => app.quit());
