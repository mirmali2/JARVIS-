/**
 * GODSEYE — Preload Script
 *
 * Exposes a safe, narrow API surface from main process to the renderer
 * via contextBridge. The renderer NEVER gets direct access to Node.js.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('godseye', {
  // --- Screen Capture ---
  captureRegion: (x, y, w, h) =>
    ipcRenderer.invoke('capture-region', { x, y, w, h }),
  captureFullScreen: () =>
    ipcRenderer.invoke('capture-fullscreen'),

  // --- OCR ---
  runOcr: (imageDataUrl) =>
    ipcRenderer.invoke('run-ocr', imageDataUrl),

  // --- LLM ---
  queryLlm: (prompt, context) =>
    ipcRenderer.invoke('query-llm', { prompt, context }),
  streamLlm: (prompt, context, images) => {
    ipcRenderer.send('stream-llm', { prompt, context, images });
  },

  // --- Speech-to-Text (Whisper) ---
  transcribeAudio: (audioBase64, mimeType) =>
    ipcRenderer.invoke('whisper-transcribe', { audioBase64, mimeType }),

  // --- Config ---
  getConfig: (path) => ipcRenderer.invoke('config-get', path),
  setConfig: (path, value) => ipcRenderer.invoke('config-set', { path, value }),
  getAllConfig: () => ipcRenderer.invoke('config-get-all'),

  // --- Permissions ---
  requestPermission: (type) => ipcRenderer.invoke('request-permission', type),
  getPermissionStatus: () => ipcRenderer.invoke('permission-status'),

  // --- Window Control ---
  showOverlay: () => ipcRenderer.send('overlay-show'),
  hideOverlay: () => ipcRenderer.send('overlay-hide'),
  setClickThrough: (ignore) => ipcRenderer.send('set-click-through', ignore),

  // --- Events from main ---
  onWakeTriggered: (cb) => {
    ipcRenderer.on('wake-triggered', (_, data) => cb(data));
  },
  onLlmChunk: (cb) => {
    ipcRenderer.on('llm-chunk', (_, data) => cb(data));
  },
  onLlmDone: (cb) => {
    ipcRenderer.on('llm-done', (_, data) => cb(data));
  },
  onLlmError: (cb) => {
    ipcRenderer.on('llm-error', (_, data) => cb(data));
  },

  // --- Cleanup ---
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});
