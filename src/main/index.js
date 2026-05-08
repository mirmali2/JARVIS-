/**
 * GODSEYE — Main Process Entry Point
 *
 * Responsibilities:
 *  1. Create the transparent overlay window (always-on-top floating bar)
 *  2. Register global hotkey as fallback wake trigger
 *  3. Set up system tray with privacy controls
 *  4. Wire IPC channels between main ↔ renderer
 *  5. Manage permissions (camera, mic, screen capture)
 */

const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const path = require('path');
const { createOverlayWindow } = require('./overlay');
const { createTray } = require('./tray');
const { registerIpcHandlers } = require('./ipc-handlers');
const { setupPermissions } = require('./permissions');
const { ScreenCapture } = require('./screen-capture');
const config = require('../utils/config');
const { init: initLogger, createModuleLogger } = require('../utils/logger');

const log = createModuleLogger('main');

let overlayWindow = null;
let tray = null;
let screenCapture = null;

// Single instance lock — only one GODSEYE at a time
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (overlayWindow) {
    overlayWindow.show();
    overlayWindow.focus();
  }
});

app.whenReady().then(async () => {
  initLogger('debug');
  log.info('GODSEYE starting');

  // Permissions setup (camera, mic)
  await setupPermissions();

  // Create the overlay window
  overlayWindow = createOverlayWindow();

  // Screen capture module
  screenCapture = new ScreenCapture();

  // System tray
  tray = createTray(overlayWindow);

  // IPC handlers
  registerIpcHandlers(overlayWindow, screenCapture);

  // Global hotkey — always hardcode as fallback in case config drifts
  const hotkey = config.get('wakeWord.hotkey') || 'CommandOrControl+Shift+G';
  const registered = globalShortcut.register(hotkey, () => {
    log.info('Hotkey wake triggered', { hotkey });
    // Make window visible and interactive
    overlayWindow.show();
    overlayWindow.focus();
    overlayWindow.setIgnoreMouseEvents(false, { forward: true });
    overlayWindow.webContents.send('wake-triggered', { source: 'hotkey' });
  });
  log.info('Hotkey registration', { hotkey, registered });

  log.info('GODSEYE ready');
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (screenCapture) screenCapture.destroy();
});

// Keep running in background on macOS
app.on('window-all-closed', (e) => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle permission requests from renderer
app.on('web-contents-created', (_, contents) => {
  contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'mediaKeySystem', 'display-capture'];
    if (allowed.includes(permission)) {
      log.info('Permission granted', { permission });
      callback(true);
    } else {
      log.warn('Permission denied', { permission });
      callback(false);
    }
  });
});
