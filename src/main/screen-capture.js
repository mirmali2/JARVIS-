/**
 * GODSEYE — Screen Capture
 *
 * Captures screen regions around the user's gaze point or the full screen.
 * Uses Electron's desktopCapturer + offscreen rendering.
 * Returns base64-encoded image data for OCR processing.
 */

const { desktopCapturer, screen } = require('electron');
const { createModuleLogger } = require('../utils/logger');

const log = createModuleLogger('screen-capture');

class ScreenCapture {
  constructor() {
    this._lastCapture = null;
    this._lastCaptureTime = 0;
    this._minInterval = 200; // ms between captures
  }

  /**
   * Capture a region of the primary screen.
   * @param {number} x - Center X of capture region
   * @param {number} y - Center Y of capture region
   * @param {number} w - Width of capture region
   * @param {number} h - Height of capture region
   * @returns {Promise<{ dataUrl: string, bounds: object }>}
   */
  async captureRegion(x, y, w, h) {
    const now = Date.now();
    if (now - this._lastCaptureTime < this._minInterval) {
      // Rate limit — return last capture if recent enough
      if (this._lastCapture) return this._lastCapture;
    }

    try {
      const primaryDisplay = screen.getPrimaryDisplay();
      const { scaleFactor } = primaryDisplay;
      const screenSize = primaryDisplay.size;

      // Clamp region to screen bounds
      const left = Math.max(0, Math.round(x - w / 2));
      const top = Math.max(0, Math.round(y - h / 2));
      const right = Math.min(screenSize.width, left + w);
      const bottom = Math.min(screenSize.height, top + h);
      const clampedW = right - left;
      const clampedH = bottom - top;

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.round(screenSize.width * scaleFactor),
          height: Math.round(screenSize.height * scaleFactor),
        },
      });

      if (sources.length === 0) {
        log.warn('No screen sources available');
        return null;
      }

      const fullScreenImage = sources[0].thumbnail;

      // Crop to the requested region
      let cropped = fullScreenImage.crop({
        x: Math.round(left * scaleFactor),
        y: Math.round(top * scaleFactor),
        width: Math.round(clampedW * scaleFactor),
        height: Math.round(clampedH * scaleFactor),
      });

      // Resize to max 1280px wide for fast LLM upload (keeps aspect ratio)
      const imgSize = cropped.getSize();
      if (imgSize.width > 1280) {
        const ratio = 1280 / imgSize.width;
        cropped = cropped.resize({
          width: 1280,
          height: Math.round(imgSize.height * ratio),
        });
      }

      // Use JPEG for ~5x smaller payload than PNG
      const jpegBuf = cropped.toJPEG(75);
      const b64 = jpegBuf.toString('base64');
      const dataUrl = `data:image/jpeg;base64,${b64}`;

      const result = {
        dataUrl,
        bounds: { x: left, y: top, width: clampedW, height: clampedH },
      };

      this._lastCapture = result;
      this._lastCaptureTime = now;

      log.debug('Region captured', result.bounds);
      return result;
    } catch (e) {
      log.error('Screen capture failed', { error: e.message });
      return null;
    }
  }

  /**
   * Capture the full primary screen.
   * @returns {Promise<{ dataUrl: string, bounds: object }>}
   */
  async captureFullScreen() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;
    return this.captureRegion(width / 2, height / 2, width, height);
  }

  destroy() {
    this._lastCapture = null;
  }
}

module.exports = { ScreenCapture };
