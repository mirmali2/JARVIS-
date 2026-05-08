/**
 * GODSEYE Configuration
 * Central configuration with defaults, persisted via electron-store.
 */

const Store = require('electron-store');

const DEFAULTS = {
  // --- Gaze Tracking ---
  gaze: {
    enabled: true,
    // Calibration points stored as { screenX, screenY, irisX, irisY }[]
    calibrationPoints: [],
    // Smoothing factor (0 = no smoothing, 1 = max smoothing)
    smoothing: 0.3,
    // How many past gaze samples to average for stability
    bufferSize: 5,
    // Region snap radius in pixels — gaze within this radius counts as same region
    snapRadius: 60,
    // Fixation threshold: ms the gaze must dwell to count as "looking at"
    fixationThresholdMs: 300,
    // History: how many seconds of gaze context to retain
    historySeconds: 10,
    // Camera device ID (null = default)
    cameraDeviceId: null,
    // Target FPS for face mesh processing
    targetFps: 15,
  },

  // --- Wake Word ---
  wakeWord: {
    enabled: true,
    phrase: 'Hey Jarvis',
    // Sensitivity 0.0–1.0 (higher = more sensitive, more false positives)
    sensitivity: 0.65,
    // Fallback: keyboard shortcut when wake word is disabled
    hotkey: 'CommandOrControl+Shift+G',
  },

  // --- Speech ---
  speech: {
    sttEngine: 'webspeech', // 'webspeech' | 'whisper'
    ttsEnabled: true,
    ttsVoice: null, // null = system default
    ttsRate: 1.0,
    language: 'en-US',
  },

  // --- LLM ---
  llm: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    apiKey: '', // User must provide
    maxTokens: 512,
    temperature: 0.3,
    // System prompt prefix
    systemPrompt: 'You are Jarvis, a fast AI assistant that continuously monitors the user\'s desktop. You receive screenshots showing recent screen activity (oldest to newest). Rules: (1) Be extremely concise — 1-3 sentences unless detail is asked. (2) Use the screenshots to understand what the user has been doing and answer accordingly. (3) If gaze coordinates are given, focus on that area. (4) You have full real-time awareness of their screen — never say you cannot see it.',
  },

  // --- Screen Capture / OCR ---
  capture: {
    enabled: true,
    // Region size around gaze point to capture (pixels)
    regionWidth: 800,
    regionHeight: 400,
    // OCR confidence threshold (0–100)
    ocrConfidence: 60,
    // Max capture rate (captures per second)
    maxCaptureRate: 2,
    // Whether to capture full screen as fallback
    fullScreenFallback: true,
  },

  // --- Privacy ---
  privacy: {
    cameraPermissionGranted: false,
    microphonePermissionGranted: false,
    screenCapturePermissionGranted: false,
    // On-device processing only (no cloud for gaze/OCR)
    onDeviceOnly: true,
    // Auto-clear context buffer after N seconds of inactivity
    autoClearSeconds: 60,
    // Sensitive content detection (blur/skip passwords, credit cards, etc.)
    sensitiveContentFilter: true,
    // Show privacy indicator in system tray
    showPrivacyIndicator: true,
  },

  // --- UI ---
  ui: {
    theme: 'dark', // 'dark' | 'light' | 'system'
    barPosition: 'top', // 'top' | 'bottom'
    barWidth: 620,
    barHeight: 56,
    animationDuration: 200, // ms
    // Auto-dismiss response after N seconds (0 = manual)
    autoDismissSeconds: 0,
    opacity: 0.95,
    showGazeIndicator: false, // Debug: show gaze dot on screen
  },
};

let store = null;

function getStore() {
  if (!store) {
    store = new Store({
      name: 'godseye-config',
      defaults: DEFAULTS,
    });
  }
  return store;
}

function get(path) {
  return getStore().get(path);
}

function set(path, value) {
  getStore().set(path, value);
}

function getAll() {
  return getStore().store;
}

function reset() {
  getStore().clear();
}

module.exports = { get, set, getAll, reset, DEFAULTS };
