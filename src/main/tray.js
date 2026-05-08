/**
 * GODSEYE — System Tray
 *
 * Provides quick-access controls: toggle gaze tracking, mic, screen capture,
 * open settings, quit. Shows privacy status via icon/tooltip.
 */

const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const config = require('../utils/config');
const { createModuleLogger } = require('../utils/logger');

const log = createModuleLogger('tray');

function createTray(overlayWindow) {
  // Use a simple 16x16 icon — in production replace with proper .ico/.icns
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon.png');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } catch {
    // Fallback: create a tiny colored square
    trayIcon = nativeImage.createEmpty();
  }

  const tray = new Tray(trayIcon);
  tray.setToolTip('GODSEYE — AI Assistant');

  function buildMenu() {
    const gazeEnabled = config.get('gaze.enabled');
    const wakeEnabled = config.get('wakeWord.enabled');
    const captureEnabled = config.get('capture.enabled');

    return Menu.buildFromTemplate([
      {
        label: 'GODSEYE',
        enabled: false,
      },
      { type: 'separator' },
      {
        label: `Eye Tracking: ${gazeEnabled ? 'ON' : 'OFF'}`,
        click: () => {
          config.set('gaze.enabled', !gazeEnabled);
          overlayWindow.webContents.send('config-changed', { path: 'gaze.enabled', value: !gazeEnabled });
          tray.setContextMenu(buildMenu());
          log.info('Eye tracking toggled', { enabled: !gazeEnabled });
        },
      },
      {
        label: `Wake Word: ${wakeEnabled ? 'ON' : 'OFF'}`,
        click: () => {
          config.set('wakeWord.enabled', !wakeEnabled);
          overlayWindow.webContents.send('config-changed', { path: 'wakeWord.enabled', value: !wakeEnabled });
          tray.setContextMenu(buildMenu());
          log.info('Wake word toggled', { enabled: !wakeEnabled });
        },
      },
      {
        label: `Screen Context: ${captureEnabled ? 'ON' : 'OFF'}`,
        click: () => {
          config.set('capture.enabled', !captureEnabled);
          overlayWindow.webContents.send('config-changed', { path: 'capture.enabled', value: !captureEnabled });
          tray.setContextMenu(buildMenu());
          log.info('Screen capture toggled', { enabled: !captureEnabled });
        },
      },
      { type: 'separator' },
      {
        label: 'Settings...',
        click: () => {
          overlayWindow.webContents.send('open-settings');
          overlayWindow.show();
        },
      },
      { type: 'separator' },
      {
        label: 'Quit GODSEYE',
        click: () => {
          overlayWindow.destroy();
          require('electron').app.quit();
        },
      },
    ]);
  }

  tray.setContextMenu(buildMenu());

  tray.on('click', () => {
    overlayWindow.webContents.send('wake-triggered', { source: 'tray' });
    overlayWindow.show();
  });

  return tray;
}

module.exports = { createTray };
