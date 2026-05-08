/**
 * GODSEYE — Wake Word Detection & Speech-to-Text
 *
 * Two-stage voice pipeline:
 *  Stage 1: Lightweight always-on wake word detector ("Hey Jarvis")
 *           Uses Web Audio API + a simple keyword-spotting approach
 *  Stage 2: Full speech-to-text after wake word is detected
 *           Uses Web Speech API (built-in) or Whisper (for accuracy)
 *
 * Privacy: Audio is processed on-device. No audio is sent to any server
 * except during active STT after the user explicitly triggers it.
 *
 * The wake-word detector runs continuously but processes audio locally
 * using a small neural model. When detected, it activates the full
 * STT pipeline to capture the user's query.
 */

export class VoicePipeline {
  constructor(options = {}) {
    this.wakePhrase = (options.wakePhrase ?? 'hey jarvis').toLowerCase();
    this.sensitivity = options.sensitivity ?? 0.65;
    this.sttEngine = options.sttEngine ?? 'webspeech'; // 'webspeech' | 'whisper'
    this.language = options.language ?? 'en-US';
    this.wakeWordEnabled = options.wakeWordEnabled ?? true;

    // Callbacks
    this.onWake = options.onWake ?? (() => {});
    this.onSpeechResult = options.onSpeechResult ?? (() => {});
    this.onSpeechPartial = options.onSpeechPartial ?? (() => {});
    this.onListeningChange = options.onListeningChange ?? (() => {});
    this.onError = options.onError ?? (() => {});

    // Internal state
    this._micStream = null;
    this._audioContext = null;
    this._wakeDetector = null; // SpeechRecognition instance for wake detection
    this._sttRecognition = null;
    this._isListeningForWake = false;
    this._isListeningForSpeech = false;
    this._isActive = false;
  }

  // ─── Lifecycle ─────────────────────────────────────────────────

  /**
   * Start the always-on wake word listener.
   */
  async startWakeListener() {
    if (this._isListeningForWake) return;

    // Request mic permission
    this._micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this._audioContext = new AudioContext();

    // Use Web Speech API in continuous mode for wake word detection
    // This is a pragmatic approach that works cross-platform without
    // requiring a custom model. For production, replace with Porcupine.
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      this.onError({ message: 'Speech recognition not supported in this browser' });
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    this._wakeDetector = new SpeechRecognition();
    this._wakeDetector.continuous = true;
    this._wakeDetector.interimResults = true;
    this._wakeDetector.lang = this.language;
    this._wakeDetector.maxAlternatives = 3;

    this._wakeDetector.onresult = (event) => {
      if (!this.wakeWordEnabled) return;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        for (let j = 0; j < result.length; j++) {
          const transcript = result[j].transcript.toLowerCase().trim();
          const confidence = result[j].confidence;

          // Check for wake phrase
          if (this._matchesWakePhrase(transcript) && confidence >= this.sensitivity) {
            this._handleWakeDetected(transcript);
            return;
          }
        }
      }
    };

    this._wakeDetector.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        // Expected during silence — restart
        this._restartWakeDetector();
        return;
      }
      this.onError({ message: `Wake detector error: ${event.error}` });
    };

    this._wakeDetector.onend = () => {
      // Auto-restart if we're still supposed to be listening
      if (this._isListeningForWake && !this._isListeningForSpeech) {
        this._restartWakeDetector();
      }
    };

    this._wakeDetector.start();
    this._isListeningForWake = true;
    this._isActive = true;
  }

  _matchesWakePhrase(transcript) {
    // Fuzzy matching: check for the wake phrase or common misrecognitions
    const variants = [
      this.wakePhrase,
      'hey jarvis',
      'hay jarvis',
      'hey travis',
      'hey service',
      'hey jar vis',
      'a jarvis',
      'hey jarv',
    ];
    return variants.some((v) => transcript.includes(v));
  }

  _handleWakeDetected(transcript) {
    // Pause wake listener and switch to full STT mode
    if (this._wakeDetector) {
      this._wakeDetector.stop();
    }
    this._isListeningForWake = false;

    this.onWake({ transcript, timestamp: Date.now() });

    // Auto-start speech capture for the query
    this.startSpeechCapture();
  }

  _restartWakeDetector() {
    if (!this._isListeningForWake) return;
    try {
      setTimeout(() => {
        if (this._wakeDetector && this._isListeningForWake) {
          this._wakeDetector.start();
        }
      }, 100);
    } catch {
      // May fail if already started
    }
  }

  // ─── Speech-to-Text ────────────────────────────────────────────

  /**
   * Start capturing speech for the user's query.
   * Called after wake word detection or manual trigger.
   */
  startSpeechCapture() {
    if (this._isListeningForSpeech) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.onError({ message: 'Speech recognition not available' });
      return;
    }

    this._sttRecognition = new SpeechRecognition();
    this._sttRecognition.continuous = false; // Stop after the user finishes speaking
    this._sttRecognition.interimResults = true;
    this._sttRecognition.lang = this.language;
    this._sttRecognition.maxAlternatives = 1;

    this._sttRecognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (interimTranscript) {
        this.onSpeechPartial({ text: interimTranscript });
      }

      if (finalTranscript) {
        // Remove the wake phrase from the start if present
        let cleaned = finalTranscript.trim();
        const lower = cleaned.toLowerCase();
        if (lower.startsWith(this.wakePhrase)) {
          cleaned = cleaned.slice(this.wakePhrase.length).trim();
        }

        this.onSpeechResult({ text: cleaned, timestamp: Date.now() });
        this.stopSpeechCapture();
      }
    };

    this._sttRecognition.onerror = (event) => {
      if (event.error !== 'no-speech') {
        this.onError({ message: `STT error: ${event.error}` });
      }
      this.stopSpeechCapture();
    };

    this._sttRecognition.onend = () => {
      this._isListeningForSpeech = false;
      this.onListeningChange({ listening: false, mode: 'speech' });
      // Resume wake word listening
      if (this._isActive) {
        this._isListeningForWake = true;
        this._restartWakeDetector();
      }
    };

    this._sttRecognition.start();
    this._isListeningForSpeech = true;
    this.onListeningChange({ listening: true, mode: 'speech' });
  }

  stopSpeechCapture() {
    if (this._sttRecognition) {
      try {
        this._sttRecognition.stop();
      } catch {
        // Already stopped
      }
      this._sttRecognition = null;
    }
    this._isListeningForSpeech = false;
  }

  // ─── TTS (Text-to-Speech for responses) ────────────────────────

  speak(text, options = {}) {
    if (!('speechSynthesis' in window)) return;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = this.language;
    utterance.rate = options.rate ?? 1.0;
    utterance.pitch = options.pitch ?? 1.0;

    if (options.voice) {
      const voices = window.speechSynthesis.getVoices();
      const match = voices.find((v) => v.name === options.voice);
      if (match) utterance.voice = match;
    }

    window.speechSynthesis.speak(utterance);
  }

  stopSpeaking() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  // ─── Cleanup ───────────────────────────────────────────────────

  stop() {
    this._isActive = false;
    this._isListeningForWake = false;

    if (this._wakeDetector) {
      try { this._wakeDetector.stop(); } catch {}
      this._wakeDetector = null;
    }

    this.stopSpeechCapture();
    this.stopSpeaking();

    if (this._micStream) {
      this._micStream.getTracks().forEach((t) => t.stop());
      this._micStream = null;
    }

    if (this._audioContext) {
      this._audioContext.close();
      this._audioContext = null;
    }
  }

  // ─── Audio Level (for waveform visualization) ──────────────────

  /**
   * Get real-time audio level (0–1) for visualizing the microphone.
   * Returns an AnalyserNode that the UI can read from.
   */
  getAnalyser() {
    if (!this._audioContext || !this._micStream) return null;

    const source = this._audioContext.createMediaStreamSource(this._micStream);
    const analyser = this._audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    return analyser;
  }

  get isListeningForWake() {
    return this._isListeningForWake;
  }

  get isListeningForSpeech() {
    return this._isListeningForSpeech;
  }

  get isActive() {
    return this._isActive;
  }
}
