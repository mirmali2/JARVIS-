/**
 * GODSEYE — Context Engine
 *
 * The brain of the contextual understanding system. Orchestrates:
 *  1. Gaze tracking → screen coordinate
 *  2. Screen capture of the gazed region
 *  3. OCR of the captured region
 *  4. Text extraction at the precise gaze point
 *  5. Context assembly for the LLM
 *
 * Maintains a rolling buffer of recent context snapshots so the LLM
 * can reference what the user was looking at in the last few seconds,
 * not just the instant of the query.
 */

import { TimeWindowBuffer } from '../utils/buffer.js';
import { GazeTracker } from './gaze-tracker.js';
import { GazeMapper } from './gaze-mapper.js';
import { OcrEngine } from './ocr-engine.js';

/**
 * @typedef {Object} ContextSnapshot
 * @property {number} timestamp
 * @property {{ x: number, y: number }} gazePoint - Screen coordinates
 * @property {string} fullText - All text in the captured region
 * @property {string|null} focusedWord - The word at the gaze point
 * @property {string|null} focusedLine - The line at the gaze point
 * @property {string|null} focusedParagraph - The paragraph at the gaze point
 * @property {string[]} surroundingLines - Lines near the gaze point
 * @property {boolean} hasSensitiveContent
 * @property {{ x: number, y: number, width: number, height: number }} capturedBounds
 */

export class ContextEngine {
  constructor(options = {}) {
    this.captureRegionWidth = options.captureRegionWidth ?? 800;
    this.captureRegionHeight = options.captureRegionHeight ?? 400;
    this.maxCaptureRate = options.maxCaptureRate ?? 2; // per second
    this.historySeconds = options.historySeconds ?? 10;

    // Sub-modules
    this.gazeTracker = new GazeTracker({
      smoothing: options.smoothing ?? 0.3,
      targetFps: options.targetFps ?? 15,
      bufferSize: options.gazeBufferSize ?? 5,
      onGaze: (data) => this._onGaze(data),
      onFaceDetected: () => this._onFaceDetected(),
      onFaceLost: () => this._onFaceLost(),
    });

    this.gazeMapper = new GazeMapper({
      screenWidth: options.screenWidth,
      screenHeight: options.screenHeight,
      snapRadius: options.snapRadius ?? 60,
      fixationThresholdMs: options.fixationThresholdMs ?? 300,
      historySeconds: this.historySeconds,
      calibrationPoints: options.calibrationPoints ?? [],
      onFixation: (f) => this._onFixation(f),
      onGazePoint: (p) => this._onScreenGaze(p),
    });

    this.ocrEngine = new OcrEngine({
      language: options.ocrLanguage ?? 'eng',
      confidenceThreshold: options.ocrConfidence ?? 60,
      sensitiveContentFilter: options.sensitiveContentFilter ?? true,
    });

    // Context history
    this._contextBuffer = new TimeWindowBuffer(this.historySeconds * 1000);
    this._lastCaptureTime = 0;
    this._captureInterval = 1000 / this.maxCaptureRate;

    // Current state
    this._latestScreenGaze = null;
    this._latestFixation = null;
    this._faceVisible = false;
    this._active = false;

    // Callbacks
    this.onContextUpdate = options.onContextUpdate ?? (() => {});
    this.onStateChange = options.onStateChange ?? (() => {});
  }

  // ─── Lifecycle ─────────────────────────────────────────────────

  async start(cameraDeviceId = null) {
    if (this._active) return;
    await this.ocrEngine.init();
    await this.gazeTracker.start(cameraDeviceId);
    this._active = true;
    this.onStateChange({ active: true, faceVisible: false });
  }

  async stop() {
    this._active = false;
    this.gazeTracker.stop();
    await this.ocrEngine.destroy();
    this.onStateChange({ active: false, faceVisible: false });
  }

  // ─── Event Handlers ────────────────────────────────────────────

  _onGaze(gazeData) {
    if (!this._active) return;
    // Map raw gaze to screen coordinates
    this.gazeMapper.gazeToScreen(gazeData);
  }

  _onScreenGaze(screenPoint) {
    this._latestScreenGaze = screenPoint;
  }

  _onFixation(fixation) {
    this._latestFixation = fixation;
    // When the user fixates, trigger a capture + OCR cycle
    this._captureAndOcr(fixation.x, fixation.y);
  }

  _onFaceDetected() {
    this._faceVisible = true;
    this.onStateChange({ active: this._active, faceVisible: true });
  }

  _onFaceLost() {
    this._faceVisible = false;
    this.onStateChange({ active: this._active, faceVisible: false });
  }

  // ─── Capture + OCR Pipeline ────────────────────────────────────

  async _captureAndOcr(x, y) {
    const now = Date.now();
    if (now - this._lastCaptureTime < this._captureInterval) return;
    this._lastCaptureTime = now;

    try {
      // Request screen capture from main process
      const capture = await window.godseye.captureRegion(
        x, y,
        this.captureRegionWidth,
        this.captureRegionHeight
      );

      if (!capture || !capture.dataUrl) return;

      // Run OCR
      const ocrResult = await this.ocrEngine.recognize(capture.dataUrl);

      if (!ocrResult.text) return;

      // Find what's at the exact gaze point
      const focused = this.ocrEngine.getTextAtPoint(
        ocrResult, x, y, capture.bounds
      );

      /** @type {ContextSnapshot} */
      const snapshot = {
        timestamp: now,
        gazePoint: { x, y },
        fullText: ocrResult.text,
        focusedWord: focused.word,
        focusedLine: focused.line,
        focusedParagraph: focused.paragraph,
        surroundingLines: focused.surroundingLines,
        hasSensitiveContent: ocrResult.hasSensitiveContent,
        capturedBounds: capture.bounds,
      };

      this._contextBuffer.push(snapshot);
      this.onContextUpdate(snapshot);
    } catch (err) {
      console.error('[ContextEngine] Capture/OCR failed:', err);
    }
  }

  // ─── Context Assembly for LLM ──────────────────────────────────

  /**
   * Build a context string for the LLM based on recent gaze history.
   * This is called when the user triggers "Hey Jarvis" or types a query.
   *
   * Returns a structured context block the LLM can use to understand
   * what the user is looking at.
   */
  assembleContext() {
    const snapshots = this._contextBuffer.getAll();

    if (snapshots.length === 0) {
      // No gaze context — try a full-screen fallback
      return {
        contextText: '',
        focusedContent: null,
        hasContext: false,
        suggestion: 'No gaze context available. Try looking at the content you want help with.',
      };
    }

    // Get the most recent snapshot
    const latest = snapshots[snapshots.length - 1];

    // Deduplicate context: find unique content across recent snapshots
    const uniqueTexts = new Set();
    const recentContent = [];
    for (let i = snapshots.length - 1; i >= 0 && recentContent.length < 5; i--) {
      const s = snapshots[i];
      const key = s.focusedLine || s.focusedParagraph || s.fullText.slice(0, 100);
      if (!uniqueTexts.has(key)) {
        uniqueTexts.add(key);
        recentContent.push(s);
      }
    }

    // Build the context string
    let contextText = '';

    // Primary focus
    if (latest.focusedParagraph) {
      contextText += `[Currently looking at this paragraph]\n${latest.focusedParagraph}\n\n`;
    } else if (latest.focusedLine) {
      contextText += `[Currently looking at this line]\n${latest.focusedLine}\n\n`;
    }

    // Surrounding content
    if (latest.surroundingLines.length > 0) {
      contextText += `[Surrounding content]\n${latest.surroundingLines.join('\n')}\n\n`;
    }

    // Full visible text
    if (latest.fullText && latest.fullText !== latest.focusedParagraph) {
      contextText += `[Full visible region]\n${latest.fullText}\n\n`;
    }

    // Recent gaze history (what they were looking at before)
    if (recentContent.length > 1) {
      contextText += `[Previously viewed content]\n`;
      for (let i = 1; i < recentContent.length; i++) {
        const s = recentContent[i];
        const text = s.focusedLine || s.focusedParagraph || s.fullText.slice(0, 200);
        contextText += `- ${text}\n`;
      }
    }

    return {
      contextText: contextText.trim(),
      focusedContent: {
        word: latest.focusedWord,
        line: latest.focusedLine,
        paragraph: latest.focusedParagraph,
      },
      hasContext: true,
      hasSensitiveContent: snapshots.some((s) => s.hasSensitiveContent),
    };
  }

  /**
   * Force a capture + OCR at the current gaze point (or screen center).
   * Used when wake word triggers and we need fresh context immediately.
   */
  async forceCapture() {
    const focus = this.gazeMapper.getPrimaryFocus(3000);
    if (focus) {
      await this._captureAndOcr(focus.x, focus.y);
    } else {
      // Fallback: capture center of screen
      const w = this.gazeMapper.screenWidth;
      const h = this.gazeMapper.screenHeight;
      await this._captureAndOcr(w / 2, h / 2);
    }
    return this.assembleContext();
  }

  /** Clear all buffered context (privacy: user clicked "clear"). */
  clearContext() {
    this._contextBuffer.clear();
    this.gazeMapper.clearHistory();
  }

  get isActive() {
    return this._active;
  }

  get isFaceVisible() {
    return this._faceVisible;
  }

  get latestGazePoint() {
    return this._latestScreenGaze;
  }
}
