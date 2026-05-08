/**
 * GODSEYE — Gaze Tracker
 *
 * Uses MediaPipe Face Mesh (468 landmarks + 10 iris landmarks) to detect
 * the user's face, locate irises, and estimate raw gaze direction.
 *
 * Runs entirely on-device via the @mediapipe/tasks-vision WASM backend.
 *
 * Pipeline:
 *  1. Webcam frame → MediaPipe Face Mesh
 *  2. Extract 478 landmarks (468 face + 10 iris)
 *  3. Isolate iris center landmarks (L: 468, R: 473)
 *  4. Compute iris position relative to eye corners → raw gaze vector
 *  5. Apply temporal smoothing (exponential moving average)
 *  6. Emit { gazeX, gazeY, confidence, timestamp } to the mapper
 *
 * This module runs in the RENDERER process (needs camera access via getUserMedia).
 */

import { RingBuffer } from '../utils/buffer.js';

// --- MediaPipe Landmark Indices ---
const LANDMARKS = {
  // Left eye corners
  LEFT_EYE_INNER: 133,
  LEFT_EYE_OUTER: 33,
  LEFT_EYE_TOP: 159,
  LEFT_EYE_BOTTOM: 145,
  // Right eye corners
  RIGHT_EYE_INNER: 362,
  RIGHT_EYE_OUTER: 263,
  RIGHT_EYE_TOP: 386,
  RIGHT_EYE_BOTTOM: 374,
  // Iris centers (from the 10 extra iris landmarks)
  LEFT_IRIS_CENTER: 468,
  RIGHT_IRIS_CENTER: 473,
  // Nose tip (for head pose estimation)
  NOSE_TIP: 1,
  // Forehead (for head pose)
  FOREHEAD: 10,
};

export class GazeTracker {
  constructor(options = {}) {
    this.smoothing = options.smoothing ?? 0.3;
    this.targetFps = options.targetFps ?? 15;
    this.onGaze = options.onGaze ?? (() => {});
    this.onFaceDetected = options.onFaceDetected ?? (() => {});
    this.onFaceLost = options.onFaceLost ?? (() => {});

    this._faceLandmarker = null;
    this._videoEl = null;
    this._stream = null;
    this._running = false;
    this._animFrameId = null;
    this._lastProcessTime = 0;
    this._frameInterval = 1000 / this.targetFps;

    // Smoothing buffers
    this._smoothX = null;
    this._smoothY = null;
    this._gazeBuffer = new RingBuffer(options.bufferSize ?? 5);

    // State
    this._faceVisible = false;
    this._blinkState = { left: false, right: false };
  }

  /**
   * Initialize MediaPipe and start the webcam.
   * @param {string|null} deviceId - Camera device ID, null for default
   */
  async start(deviceId = null) {
    if (this._running) return;

    // Dynamically import MediaPipe (loaded as ESM in renderer)
    const { FaceLandmarker, FilesetResolver } = await import(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest'
    );

    const filesetResolver = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    this._faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU', // Use WebGL for speed
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true, // For blink detection
      outputFacialTransformationMatrixes: true, // For head pose
    });

    // Start webcam
    const constraints = {
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 },
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
    };

    this._stream = await navigator.mediaDevices.getUserMedia(constraints);

    this._videoEl = document.createElement('video');
    this._videoEl.srcObject = this._stream;
    this._videoEl.setAttribute('playsinline', '');
    this._videoEl.style.display = 'none';
    document.body.appendChild(this._videoEl);
    await this._videoEl.play();

    this._running = true;
    this._processFrame();
  }

  stop() {
    this._running = false;
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
    if (this._stream) {
      this._stream.getTracks().forEach((t) => t.stop());
      this._stream = null;
    }
    if (this._videoEl) {
      this._videoEl.remove();
      this._videoEl = null;
    }
    if (this._faceLandmarker) {
      this._faceLandmarker.close();
      this._faceLandmarker = null;
    }
  }

  _processFrame() {
    if (!this._running) return;

    this._animFrameId = requestAnimationFrame(() => this._processFrame());

    const now = performance.now();
    if (now - this._lastProcessTime < this._frameInterval) return;
    this._lastProcessTime = now;

    if (!this._videoEl || this._videoEl.readyState < 2) return;

    const results = this._faceLandmarker.detectForVideo(this._videoEl, now);

    if (!results.faceLandmarks || results.faceLandmarks.length === 0) {
      if (this._faceVisible) {
        this._faceVisible = false;
        this.onFaceLost();
      }
      return;
    }

    if (!this._faceVisible) {
      this._faceVisible = true;
      this.onFaceDetected();
    }

    const landmarks = results.faceLandmarks[0];
    const blendshapes = results.faceBlendshapes?.[0]?.categories;

    // Extract iris positions relative to eye bounds
    const leftGaze = this._computeEyeGaze(landmarks, 'left');
    const rightGaze = this._computeEyeGaze(landmarks, 'right');

    // Average both eyes for final gaze estimate
    const rawX = (leftGaze.x + rightGaze.x) / 2;
    const rawY = (leftGaze.y + rightGaze.y) / 2;
    const confidence = (leftGaze.confidence + rightGaze.confidence) / 2;

    // Detect blinks via blendshapes
    if (blendshapes) {
      const leftBlink = blendshapes.find((b) => b.categoryName === 'eyeBlinkLeft');
      const rightBlink = blendshapes.find((b) => b.categoryName === 'eyeBlinkRight');
      this._blinkState = {
        left: leftBlink ? leftBlink.score > 0.5 : false,
        right: rightBlink ? rightBlink.score > 0.5 : false,
      };
    }

    // Skip if both eyes blinking
    if (this._blinkState.left && this._blinkState.right) return;

    // Apply exponential moving average smoothing
    if (this._smoothX === null) {
      this._smoothX = rawX;
      this._smoothY = rawY;
    } else {
      const alpha = 1 - this.smoothing;
      this._smoothX = alpha * rawX + this.smoothing * this._smoothX;
      this._smoothY = alpha * rawY + this.smoothing * this._smoothY;
    }

    const gazeData = {
      // Normalized 0–1 values (iris position within eye opening)
      rawX,
      rawY,
      smoothX: this._smoothX,
      smoothY: this._smoothY,
      confidence,
      blinking: this._blinkState,
      timestamp: Date.now(),
    };

    this._gazeBuffer.push(gazeData);
    this.onGaze(gazeData);
  }

  /**
   * Compute normalized iris position within the eye opening.
   * Returns { x, y, confidence } where x,y are 0–1 (0=left/top, 1=right/bottom).
   */
  _computeEyeGaze(landmarks, eye) {
    const isLeft = eye === 'left';
    const inner = landmarks[isLeft ? LANDMARKS.LEFT_EYE_INNER : LANDMARKS.RIGHT_EYE_INNER];
    const outer = landmarks[isLeft ? LANDMARKS.LEFT_EYE_OUTER : LANDMARKS.RIGHT_EYE_OUTER];
    const top = landmarks[isLeft ? LANDMARKS.LEFT_EYE_TOP : LANDMARKS.RIGHT_EYE_TOP];
    const bottom = landmarks[isLeft ? LANDMARKS.LEFT_EYE_BOTTOM : LANDMARKS.RIGHT_EYE_BOTTOM];
    const iris = landmarks[isLeft ? LANDMARKS.LEFT_IRIS_CENTER : LANDMARKS.RIGHT_IRIS_CENTER];

    // Horizontal: where the iris sits between inner and outer corner
    const eyeWidth = Math.sqrt(
      (outer.x - inner.x) ** 2 + (outer.y - inner.y) ** 2
    );
    const irisFromInner = Math.sqrt(
      (iris.x - inner.x) ** 2 + (iris.y - inner.y) ** 2
    );
    const x = eyeWidth > 0 ? irisFromInner / eyeWidth : 0.5;

    // Vertical: where the iris sits between top and bottom lid
    const eyeHeight = Math.sqrt(
      (bottom.x - top.x) ** 2 + (bottom.y - top.y) ** 2
    );
    const irisFromTop = Math.sqrt(
      (iris.x - top.x) ** 2 + (iris.y - top.y) ** 2
    );
    const y = eyeHeight > 0 ? irisFromTop / eyeHeight : 0.5;

    // Confidence based on eye openness (closed eyes → low confidence)
    const openness = eyeHeight / (eyeWidth + 0.0001);
    const confidence = Math.min(1, openness * 4); // Scale so normal open eye ≈ 1.0

    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)), confidence };
  }

  /** Get recent gaze samples for averaging. */
  getRecentGaze(n = 5) {
    return this._gazeBuffer.recent(n);
  }

  get isRunning() {
    return this._running;
  }

  get isFaceVisible() {
    return this._faceVisible;
  }
}
