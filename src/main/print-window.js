'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { BrowserWindow } = require('electron');

/**
 * Prints an image full-bleed to a named printer with no dialog.
 * The page size must match a paper size the DNP driver offers (e.g. 6x4).
 */
function printImageSilently(dataUrl, { deviceName, widthMicrons, heightMicrons }) {
  // Large data: URLs can exceed Chromium's URL limit, so go through temp files.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'booth-print-'));
  const imgPath = path.join(dir, 'photo.jpg');
  fs.writeFileSync(imgPath, Buffer.from(dataUrl.split(',')[1], 'base64'));
  const cleanup = () => fs.rmSync(dir, { recursive: true, force: true });

  return new Promise((resolve, reject) => {
    const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    const landscape = widthMicrons > heightMicrons;
    const html = `<!doctype html><html><head><style>
      @page { size: ${widthMicrons / 1000}mm ${heightMicrons / 1000}mm; margin: 0 }
      html, body { margin: 0; padding: 0; width: 100%; height: 100% }
      img { display: block; width: 100vw; height: 100vh; object-fit: cover }
    </style></head><body><img src="photo.jpg"></body></html>`;

    w.webContents.once('did-finish-load', () => {
      w.webContents.print(
        {
          silent: true,
          deviceName,
          printBackground: true,
          landscape,
          margins: { marginType: 'none' },
          // Electron expects portrait dimensions plus the landscape flag.
          pageSize: {
            width: Math.min(widthMicrons, heightMicrons),
            height: Math.max(widthMicrons, heightMicrons),
          },
        },
        (success, failureReason) => {
          w.destroy();
          cleanup();
          success ? resolve() : reject(new Error(failureReason || 'print failed'));
        },
      );
    });
    const htmlPath = path.join(dir, 'print.html');
    fs.writeFileSync(htmlPath, html);
    w.loadFile(htmlPath).catch((err) => {
      w.destroy();
      cleanup();
      reject(err);
    });
  });
}

module.exports = { printImageSilently };
