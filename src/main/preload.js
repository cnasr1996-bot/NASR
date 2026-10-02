'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// The only surface the UI can use; no Node access in the renderer.
contextBridge.exposeInMainWorld('booth', {
  getConfig: () => ipcRenderer.invoke('booth:config'),
  send: (action, payload) => ipcRenderer.invoke('booth:action', action, payload),
  onState: (fn) => ipcRenderer.on('booth:state', (_e, s) => fn(s)),
  onFrame: (fn) => ipcRenderer.on('booth:frame', (_e, f) => fn(f)),
});
