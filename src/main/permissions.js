/**
 * GODSEYE — Permission Management
 *
 * Handles OS-level permission requests for camera, microphone, and screen capture.
 * Each permission is requested only once and cached.
 */

const { systemPreferences } = require('electron');
const config = require('../utils/config');
const { createModuleLogger } = require('../utils/logger');

const log = createModuleLogger('permissions');

async function setupPermissions() {
  // On macOS, request camera and microphone access at startup
  if (process.platform === 'darwin') {
    try {
      const camStatus = systemPreferences.getMediaAccessStatus('camera');
      if (camStatus !== 'granted') {
        const granted = await systemPreferences.askForMediaAccess('camera');
        config.set('privacy.cameraPermissionGranted', granted);
        log.info('Camera permission', { granted });
      } else {
        config.set('privacy.cameraPermissionGranted', true);
      }
    } catch (e) {
      log.error('Camera permission request failed', { error: e.message });
    }

    try {
      const micStatus = systemPreferences.getMediaAccessStatus('microphone');
      if (micStatus !== 'granted') {
        const granted = await systemPreferences.askForMediaAccess('microphone');
        config.set('privacy.microphonePermissionGranted', granted);
        log.info('Microphone permission', { granted });
      } else {
        config.set('privacy.microphonePermissionGranted', true);
      }
    } catch (e) {
      log.error('Mic permission request failed', { error: e.message });
    }
  }

  // On Windows/Linux, permissions are granted at the Chromium level
  // via the session permission handler in index.js
  if (process.platform === 'win32' || process.platform === 'linux') {
    config.set('privacy.cameraPermissionGranted', true);
    config.set('privacy.microphonePermissionGranted', true);
    log.info('Permissions delegated to Chromium session handler');
  }
}

async function checkPermission(type) {
  if (process.platform === 'darwin') {
    return systemPreferences.getMediaAccessStatus(type);
  }
  // Windows/Linux — we handle via Chromium
  return 'granted';
}

module.exports = { setupPermissions, checkPermission };
