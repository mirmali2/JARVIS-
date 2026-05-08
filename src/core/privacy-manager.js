/**
 * GODSEYE — Privacy Manager
 *
 * Centralized privacy controls for the entire system.
 * Manages:
 *  - Permission state for camera, microphone, screen capture
 *  - Active indicator state (what's currently being accessed)
 *  - Auto-clear timers for context buffers
 *  - Sensitive content filtering
 *  - User consent flows
 *  - Data retention policies
 *
 * Privacy principles:
 *  1. On-device by default: gaze tracking, OCR, and wake word run locally
 *  2. Explicit consent: every capability requires user opt-in
 *  3. Visible indicators: camera/mic/capture activity shown at all times
 *  4. Easy off-switch: any capability can be disabled instantly
 *  5. Auto-clear: context buffers purge automatically on inactivity
 *  6. No persistent storage of screen content or audio
 */

export class PrivacyManager {
  constructor(options = {}) {
    this.autoClearSeconds = options.autoClearSeconds ?? 60;
    this.sensitiveContentFilter = options.sensitiveContentFilter ?? true;

    // Permission state
    this._permissions = {
      camera: options.cameraPermissionGranted ?? false,
      microphone: options.microphonePermissionGranted ?? false,
      screenCapture: options.screenCapturePermissionGranted ?? false,
    };

    // Active usage indicators
    this._activeIndicators = {
      camera: false, // Webcam is actively streaming
      microphone: false, // Mic is actively listening
      screenCapture: false, // Screen is being captured
      llm: false, // Data is being sent to LLM API
    };

    // Auto-clear timer
    this._autoClearTimer = null;
    this._lastActivityTime = Date.now();

    // Callbacks
    this.onIndicatorChange = options.onIndicatorChange ?? (() => {});
    this.onPermissionChange = options.onPermissionChange ?? (() => {});
    this.onAutoClear = options.onAutoClear ?? (() => {});

    // Start auto-clear monitoring
    this._startAutoClearMonitor();
  }

  // ─── Permissions ───────────────────────────────────────────────

  async requestPermission(type) {
    if (!['camera', 'microphone', 'screenCapture'].includes(type)) {
      throw new Error(`Unknown permission type: ${type}`);
    }

    // The actual permission request happens via the main process
    const granted = await window.godseye.requestPermission(type);
    this._permissions[type] = granted;
    this.onPermissionChange({ type, granted });

    // Persist
    const configKey = {
      camera: 'privacy.cameraPermissionGranted',
      microphone: 'privacy.microphonePermissionGranted',
      screenCapture: 'privacy.screenCapturePermissionGranted',
    }[type];
    await window.godseye.setConfig(configKey, granted);

    return granted;
  }

  isPermitted(type) {
    return this._permissions[type] ?? false;
  }

  getPermissions() {
    return { ...this._permissions };
  }

  // ─── Active Indicators ─────────────────────────────────────────

  setActive(type, active) {
    if (!(type in this._activeIndicators)) return;

    // Don't activate if not permitted
    if (active && !this._permissions[type === 'llm' ? 'screenCapture' : type]) {
      return;
    }

    this._activeIndicators[type] = active;
    this._lastActivityTime = Date.now();
    this.onIndicatorChange({ ...this._activeIndicators });
  }

  getIndicators() {
    return { ...this._activeIndicators };
  }

  /** Check if ANY privacy-sensitive system is active. */
  isAnythingActive() {
    return Object.values(this._activeIndicators).some(Boolean);
  }

  // ─── Auto-Clear ────────────────────────────────────────────────

  _startAutoClearMonitor() {
    this._autoClearTimer = setInterval(() => {
      const elapsed = (Date.now() - this._lastActivityTime) / 1000;
      if (elapsed >= this.autoClearSeconds && !this.isAnythingActive()) {
        this.onAutoClear();
      }
    }, 10000); // Check every 10 seconds
  }

  resetActivityTimer() {
    this._lastActivityTime = Date.now();
  }

  // ─── Emergency Stop ────────────────────────────────────────────

  /**
   * Immediately disable all privacy-sensitive systems.
   * Called when user clicks the "panic" button or closes the lid.
   */
  emergencyStop() {
    Object.keys(this._activeIndicators).forEach((key) => {
      this._activeIndicators[key] = false;
    });
    this.onIndicatorChange({ ...this._activeIndicators });
    this.onAutoClear(); // Clear all context
  }

  // ─── Consent Flow ──────────────────────────────────────────────

  /**
   * Generate the consent state for the first-run dialog.
   * Returns what permissions we need and why.
   */
  getConsentRequirements() {
    return [
      {
        type: 'camera',
        name: 'Camera Access',
        description: 'Used for eye tracking to detect what you\'re looking at on screen. Video is processed entirely on your device and never stored or transmitted.',
        required: false,
        icon: 'eye',
      },
      {
        type: 'microphone',
        name: 'Microphone Access',
        description: 'Used for "Hey Jarvis" wake word detection and voice queries. Audio is processed on-device for wake word detection. Voice queries are transcribed locally.',
        required: false,
        icon: 'mic',
      },
      {
        type: 'screenCapture',
        name: 'Screen Reading',
        description: 'Used to read text around where you\'re looking so the AI can understand your context. Screen content is processed on-device via OCR and only the extracted text is sent to the AI when you ask a question.',
        required: false,
        icon: 'monitor',
      },
    ];
  }

  /**
   * Check if first-run consent has been completed.
   */
  async isConsentCompleted() {
    const completed = await window.godseye.getConfig('privacy.consentCompleted');
    return completed === true;
  }

  async markConsentCompleted() {
    await window.godseye.setConfig('privacy.consentCompleted', true);
  }

  // ─── Cleanup ───────────────────────────────────────────────────

  destroy() {
    if (this._autoClearTimer) {
      clearInterval(this._autoClearTimer);
      this._autoClearTimer = null;
    }
  }
}
