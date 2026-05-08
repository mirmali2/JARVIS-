/**
 * GODSEYE — Overlay Window
 *
 * A frameless, transparent, always-on-top window that hosts the floating bar.
 * The window covers the full screen but is click-through except for the bar itself.
 */

const { BrowserWindow, screen } = require('electron');
const path = require('path');
const config = require('../utils/config');
const { createModuleLogger } = require('../utils/logger');

const log = createModuleLogger('overlay');

function createOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const win = new BrowserWindow({
    x: 0,
    y: 0,
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    // Allow click-through on the transparent parts
    // The renderer will manage which areas are interactive
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Ignore mouse events on transparent areas by default
  win.setIgnoreMouseEvents(true, { forward: true });

  // Load the renderer
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Open DevTools in dev mode so we can see errors
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  // Start hidden — revealed by wake word or hotkey
  win.hide();

  // Prevent the window from being closable by the user
  win.on('close', (e) => {
    e.preventDefault();
    win.hide();
  });

  log.info('Overlay window created', { width, height });
  return win;
}

module.exports = { createOverlayWindow };
