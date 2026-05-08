/**
 * GODSEYE — Renderer App (self-contained, no broken imports)
 * All UI and logic inline so there are zero module resolution failures.
 */

// ── Floating Bar ─────────────────────────────────────────────────

class FloatingBar {
  constructor() {
    this.visible = false;
    this.streaming = false;
    this.responseText = '';
    this._build();
    this._bindEvents();
  }

  _build() {
    // Wrapper covers full screen (click-through except the bar)
    this.wrapper = document.createElement('div');
    this.wrapper.id = 'godseye-wrapper';
    this.wrapper.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      pointer-events: none; z-index: 999999;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;

    // The bar itself
    this.bar = document.createElement('div');
    this.bar.style.cssText = `
      position: absolute;
      top: 20px;
      left: 50%;
      transform: translateX(-50%) translateY(-140%);
      width: 640px;
      background: rgba(15, 15, 20, 0.96);
      backdrop-filter: blur(28px) saturate(180%);
      -webkit-backdrop-filter: blur(28px) saturate(180%);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 18px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset;
      overflow: hidden;
      pointer-events: auto;
      transition: transform 220ms cubic-bezier(0.16,1,0.3,1), opacity 220ms ease;
      opacity: 0;
    `;

    // ── Input row ──
    const inputRow = document.createElement('div');
    inputRow.style.cssText = `
      display: flex; align-items: center; padding: 10px 14px; gap: 10px; min-height: 58px;
    `;

    // Eye dot
    this.eyeDot = document.createElement('div');
    this.eyeDot.style.cssText = `
      width: 8px; height: 8px; border-radius: 50%;
      background: #22c55e; flex-shrink: 0;
      box-shadow: 0 0 8px rgba(34,197,94,0.5);
      transition: background 0.3s, box-shadow 0.3s;
    `;

    // Input field
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = 'Ask about what you\'re looking at...';
    this.input.style.cssText = `
      flex: 1; background: transparent; border: none; outline: none;
      color: #e4e4e7; font-size: 15px; font-family: inherit; caret-color: #818cf8;
    `;

    // Mic button
    this.micBtn = document.createElement('button');
    this.micBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`;
    this.micBtn.style.cssText = `
      width: 36px; height: 36px; border-radius: 10px; border: none;
      background: rgba(255,255,255,0.06); color: #a1a1aa; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.15s ease; flex-shrink: 0;
    `;

    // Send button
    this.sendBtn = document.createElement('button');
    this.sendBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9Z"/></svg>`;
    this.sendBtn.style.cssText = `
      width: 36px; height: 36px; border-radius: 10px; border: none;
      background: #6366f1; color: white; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.15s ease; flex-shrink: 0;
    `;

    // Privacy dots (camera · mic · screen · ai)
    this.privacyDots = document.createElement('div');
    this.privacyDots.style.cssText = `display:flex;gap:4px;align-items:center;padding:0 4px;`;
    [
      { id: 'dot-cam', color: '#22c55e', tip: 'Camera' },
      { id: 'dot-mic', color: '#ef4444', tip: 'Mic' },
      { id: 'dot-scr', color: '#3b82f6', tip: 'Screen' },
      { id: 'dot-ai',  color: '#eab308', tip: 'AI' },
    ].forEach(({ id, color, tip }) => {
      const d = document.createElement('div');
      d.id = id;
      d.title = tip;
      d.style.cssText = `width:6px;height:6px;border-radius:50%;background:${color};opacity:0.2;transition:opacity 0.3s,box-shadow 0.3s;`;
      this.privacyDots.appendChild(d);
    });

    inputRow.appendChild(this.eyeDot);
    inputRow.appendChild(this.input);
    inputRow.appendChild(this.micBtn);
    inputRow.appendChild(this.sendBtn);
    inputRow.appendChild(this.privacyDots);

    // ── Response panel ──
    this.responsePanel = document.createElement('div');
    this.responsePanel.style.cssText = `max-height:0;overflow:hidden;transition:max-height 0.3s cubic-bezier(0.16,1,0.3,1);`;

    this.responseInner = document.createElement('div');
    this.responseInner.style.cssText = `padding:0 16px 14px;border-top:1px solid rgba(255,255,255,0.06);`;

    // Loading dots
    this.loadingEl = document.createElement('div');
    this.loadingEl.style.cssText = `display:none;align-items:center;gap:6px;padding:12px 0;color:#71717a;font-size:13px;`;
    this.loadingEl.innerHTML = `
      <div style="display:flex;gap:3px;">
        <div style="width:5px;height:5px;border-radius:50%;background:#818cf8;animation:gsPulse 1.2s ease infinite;"></div>
        <div style="width:5px;height:5px;border-radius:50%;background:#818cf8;animation:gsPulse 1.2s ease 0.2s infinite;"></div>
        <div style="width:5px;height:5px;border-radius:50%;background:#818cf8;animation:gsPulse 1.2s ease 0.4s infinite;"></div>
      </div>
      <span>Thinking...</span>
    `;

    // Response text
    this.responseText = document.createElement('div');
    this.responseText.style.cssText = `
      color:#d4d4d8;font-size:14px;line-height:1.65;padding-top:12px;
      max-height:340px;overflow-y:auto;word-wrap:break-word;
    `;

    // Action bar
    this.actionBar = document.createElement('div');
    this.actionBar.style.cssText = `display:none;gap:6px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.04);margin-top:8px;`;

    const copyBtn = this._actionBtn('Copy', () => {
      navigator.clipboard?.writeText(this._fullText || '');
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    });
    this.actionBar.appendChild(copyBtn);

    this.responseInner.appendChild(this.loadingEl);
    this.responseInner.appendChild(this.responseText);
    this.responseInner.appendChild(this.actionBar);
    this.responsePanel.appendChild(this.responseInner);

    this.bar.appendChild(inputRow);
    this.bar.appendChild(this.responsePanel);
    this.wrapper.appendChild(this.bar);
    document.body.appendChild(this.wrapper);
  }

  _actionBtn(label, onClick) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = `
      padding:4px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.08);
      background:rgba(255,255,255,0.04);color:#a1a1aa;font-size:12px;cursor:pointer;
      transition:all 0.15s;
    `;
    btn.addEventListener('click', onClick);
    return btn;
  }

  _bindEvents() {
    // Submit on Enter
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.input.value.trim()) {
        this._submit(this.input.value.trim());
      }
      if (e.key === 'Escape') this.hide();
    });

    // Submit button
    this.sendBtn.addEventListener('click', () => {
      if (this.input.value.trim()) this._submit(this.input.value.trim());
    });

    // Mic button
    this.micBtn.addEventListener('click', () => this._toggleMic());

    // Click outside to dismiss
    this.wrapper.addEventListener('click', (e) => {
      if (e.target === this.wrapper) this.hide();
    });

    // Hover effects
    this.sendBtn.addEventListener('mouseenter', () => { this.sendBtn.style.transform = 'scale(1.05)'; });
    this.sendBtn.addEventListener('mouseleave', () => { this.sendBtn.style.transform = 'scale(1)'; });
    this.micBtn.addEventListener('mouseenter', () => { this.micBtn.style.background = 'rgba(255,255,255,0.1)'; });
    this.micBtn.addEventListener('mouseleave', () => {
      if (!this._micActive) this.micBtn.style.background = 'rgba(255,255,255,0.06)';
    });
  }

  // ── Show / Hide ──

  show() {
    if (this.visible) return;
    this.visible = true;
    this.wrapper.style.pointerEvents = 'auto';
    window.godseye?.setClickThrough(false);
    requestAnimationFrame(() => {
      this.bar.style.transform = 'translateX(-50%) translateY(0)';
      this.bar.style.opacity = '1';
    });
    setTimeout(() => {
      this.input.focus();
      // Auto-start mic when bar opens
      this._startMic();
    }, 300);
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.bar.style.transform = 'translateX(-50%) translateY(-140%)';
    this.bar.style.opacity = '0';
    setTimeout(() => {
      this.wrapper.style.pointerEvents = 'none';
      window.godseye?.setClickThrough(true);
      // Don't hide overlay if eye tracker is active (tracking dot needs the window)
      if (!this._eyeTracker?._calibrated) {
        window.godseye?.hideOverlay();
      }
      this._clearResponse();
    }, 230);
    this._killMic();
    this.input.value = '';
    // Notify wake word listener to resume
    if (this._onHideCallback) this._onHideCallback();
  }

  onHide(cb) { this._onHideCallback = cb; }

  // ── Query ──

  async _submit(query) {
    this.input.disabled = true;
    this._showLoading();

    try {
      // Pull context from screen monitor (continuous background captures)
      const mon = this._screenMonitor;
      let contextText = '';
      let images = [];
      if (mon) {
        images = mon.getContextImages();
        contextText = mon.getContextText(this._eyeTracker);
      }
      if (images.length === 0) {
        // Fallback: single capture if monitor not ready yet
        try {
          const cap = await window.godseye.captureFullScreen();
          if (cap?.dataUrl) images = [cap.dataUrl];
        } catch {}
      }

      // Stream the LLM response
      this._fullText = '';
      window.godseye.onLlmChunk(({ text }) => {
        this._fullText += text;
        this._showStreaming(this._fullText);
      });
      window.godseye.onLlmDone(() => {
        this._showFinal(this._fullText);
        this.input.disabled = false;
        window.godseye.removeAllListeners('llm-chunk');
        window.godseye.removeAllListeners('llm-done');
        window.godseye.removeAllListeners('llm-error');
        if (this._micActive && !this._micManuallyOff) {
          setTimeout(() => this._beginRecordingCycle(), 200);
        }
      });
      window.godseye.onLlmError(({ error }) => {
        this._showError(error);
        this.input.disabled = false;
        window.godseye.removeAllListeners('llm-chunk');
        window.godseye.removeAllListeners('llm-done');
        window.godseye.removeAllListeners('llm-error');
        if (this._micActive && !this._micManuallyOff) {
          setTimeout(() => this._beginRecordingCycle(), 200);
        }
      });

      window.godseye.streamLlm(query, contextText, images);
    } catch (e) {
      this._showError(e.message);
      this.input.disabled = false;
    }
  }

  // ── Mic: always-on system ──
  // Mic stream stays alive the entire time the bar is open.
  // Only the MediaRecorder cycles between record → transcribe → record.
  // Mic only turns OFF when user clicks the mic button or hides the bar.

  _micActive = false;
  _mediaStream = null;
  _mediaRecorder = null;
  _audioChunks = [];
  _analyser = null;
  _audioCtx = null;
  _silenceCheck = null;
  _hasSpeech = false;
  _silenceStart = null;
  _isTranscribing = false;
  _micManuallyOff = false;  // true only if user clicked mic button to turn off

  _toggleMic() {
    if (this._micActive) {
      this._micManuallyOff = true;
      this._killMic();
    } else {
      this._micManuallyOff = false;
      this._startMic();
    }
  }

  /** Open the mic stream and start the listen→transcribe loop. */
  async _startMic() {
    if (this._micActive) return;
    this._micManuallyOff = false;

    try {
      this._mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });

      this._audioCtx = new AudioContext();
      const source = this._audioCtx.createMediaStreamSource(this._mediaStream);

      // High-pass filter to cut low-freq noise (fans, hum, traffic)
      this._hpFilter = this._audioCtx.createBiquadFilter();
      this._hpFilter.type = 'highpass';
      this._hpFilter.frequency.value = 85;
      this._hpFilter.Q.value = 0.7;

      this._analyser = this._audioCtx.createAnalyser();
      this._analyser.fftSize = 1024;
      this._analyser.smoothingTimeConstant = 0.3;
      source.connect(this._hpFilter);
      this._hpFilter.connect(this._analyser);

      // Quick noise floor calibration (400ms)
      this._micNoiseFloor = 0.025;
      const samples = [];
      const cal = setInterval(() => samples.push(this._getAudioLevel()), 50);
      setTimeout(() => {
        clearInterval(cal);
        if (samples.length > 0) {
          const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
          const variance = samples.reduce((a, b) => a + (b - avg) ** 2, 0) / samples.length;
          this._micNoiseFloor = Math.max(0.02, avg + Math.sqrt(variance) * 1.5);
        }
        this._micActive = true;
        this._updateMicUI(true);
        console.log('[GODSEYE] Mic on (noise floor:', this._micNoiseFloor.toFixed(4) + ')');
        this._beginRecordingCycle();
      }, 400);

    } catch (e) {
      console.error('[GODSEYE] Mic error:', e);
      this.input.placeholder = 'Mic error: ' + e.message;
    }
  }

  /** Start a new record cycle — records until 2s silence after speech. */
  _beginRecordingCycle() {
    if (!this._micActive || !this._mediaStream) return;

    this._audioChunks = [];
    this._hasSpeech = false;
    this._silenceStart = null;
    this._isTranscribing = false;
    this.input.value = '';
    this.input.placeholder = 'Listening... speak now';

    // Create a fresh recorder each cycle (reusing the same mic stream)
    this._mediaRecorder = new MediaRecorder(this._mediaStream, {
      mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm'
    });

    this._mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this._audioChunks.push(e.data);
    };

    this._mediaRecorder.onstop = () => {
      // Only transcribe if we actually heard speech
      if (this._hasSpeech && this._audioChunks.length > 0) {
        this._transcribeAndContinue();
      } else {
        // No speech — just start a new cycle
        if (this._micActive) this._beginRecordingCycle();
      }
    };

    this._mediaRecorder.start(250);

    // Silence detection with noise-aware threshold
    if (this._silenceCheck) clearInterval(this._silenceCheck);
    const speechThreshold = (this._micNoiseFloor || 0.025) * 1.8;
    let speechStartTime = null;

    this._silenceCheck = setInterval(() => {
      if (this._isTranscribing) return;
      const level = this._getAudioLevel();

      if (level > speechThreshold) {
        if (!speechStartTime) speechStartTime = Date.now();
        // Require 200ms sustained speech to confirm (filters clicks/pops)
        if (!this._hasSpeech && Date.now() - speechStartTime > 200) {
          this._hasSpeech = true;
        }
        this._silenceStart = null;
        if (this._hasSpeech) this.input.placeholder = 'Listening...';
      } else {
        if (!this._hasSpeech) {
          speechStartTime = null;  // Reset transient noise
        } else if (!this._silenceStart) {
          this._silenceStart = Date.now();
        } else if (Date.now() - this._silenceStart > 1000) {
          // 1s silence after confirmed speech → stop recording, transcribe
          if (this._silenceCheck) { clearInterval(this._silenceCheck); this._silenceCheck = null; }
          if (this._mediaRecorder?.state !== 'inactive') {
            this._mediaRecorder.stop();
          }
        }
      }
    }, 80);
  }

  _getAudioLevel() {
    if (!this._analyser) return 0;
    const data = new Uint8Array(this._analyser.frequencyBinCount);
    this._analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    return sum / (data.length * 255);
  }

  /** Transcribe the current recording, submit it, then re-start listening. */
  async _transcribeAndContinue() {
    if (this._audioChunks.length === 0) {
      if (this._micActive) this._beginRecordingCycle();
      return;
    }

    this._isTranscribing = true;
    this.input.placeholder = 'Transcribing...';

    try {
      const blob = new Blob(this._audioChunks, { type: 'audio/webm' });
      // Convert to base64 in chunks to avoid stack overflow on large audio
      const arrayBuf = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
      }
      const base64 = btoa(binary);

      const result = await window.godseye.transcribeAudio(base64, 'audio/webm');

      if (result.text && result.text.trim()) {
        const text = result.text.trim();
        this.input.value = text;
        console.log('[GODSEYE] Whisper:', text);

        // Submit the query — mic stays alive, will resume after answer
        this._isTranscribing = false;
        this._submitVoiceQuery(text);
      } else {
        // Nothing recognized or error — go back to listening
        if (result.error) console.error('[GODSEYE] Whisper error:', result.error);
        this.input.placeholder = result.error
          ? 'Error: ' + result.error.slice(0, 60)
          : 'Didn\'t catch that. Try again...';
        this._isTranscribing = false;
        if (this._micActive) {
          setTimeout(() => this._beginRecordingCycle(), 200);
        }
      }
    } catch (e) {
      console.error('[GODSEYE] Transcribe failed:', e);
      this._isTranscribing = false;
      if (this._micActive) {
        setTimeout(() => this._beginRecordingCycle(), 500);
      }
    }
  }

  /** Submit a voice query, then re-start listening when the answer is done. */
  _submitVoiceQuery(query) {
    this.input.disabled = true;
    this._showLoading();

    // Pause recording during LLM response
    if (this._silenceCheck) { clearInterval(this._silenceCheck); this._silenceCheck = null; }
    if (this._mediaRecorder?.state !== 'inactive') {
      try { this._mediaRecorder.stop(); } catch {}
    }

    (async () => {
      try {
        // Pull context from screen monitor
        const mon = this._screenMonitor;
        let contextText = '';
        let images = [];
        if (mon) {
          images = mon.getContextImages();
          contextText = mon.getContextText(this._eyeTracker);
        }
        if (images.length === 0) {
          try {
            const cap = await window.godseye.captureFullScreen();
            if (cap?.dataUrl) images = [cap.dataUrl];
          } catch {}
        }

        this._fullText = '';
        window.godseye.onLlmChunk(({ text }) => {
          this._fullText += text;
          this._showStreaming(this._fullText);
        });
        window.godseye.onLlmDone(() => {
          this._showFinal(this._fullText);
          this.input.disabled = false;
          window.godseye.removeAllListeners('llm-chunk');
          window.godseye.removeAllListeners('llm-done');
          window.godseye.removeAllListeners('llm-error');
          if (this._micActive && !this._micManuallyOff) {
            setTimeout(() => this._beginRecordingCycle(), 200);
          }
        });
        window.godseye.onLlmError(({ error }) => {
          this._showError(error);
          this.input.disabled = false;
          window.godseye.removeAllListeners('llm-chunk');
          window.godseye.removeAllListeners('llm-done');
          window.godseye.removeAllListeners('llm-error');
          if (this._micActive && !this._micManuallyOff) {
            setTimeout(() => this._beginRecordingCycle(), 200);
          }
        });

        window.godseye.streamLlm(query, contextText, images);
      } catch (e) {
        this._showError(e.message);
        this.input.disabled = false;
        if (this._micActive && !this._micManuallyOff) {
          setTimeout(() => this._beginRecordingCycle(), 200);
        }
      }
    })();
  }

  /** Kill mic completely (user clicked mic off or bar hidden). */
  _killMic() {
    if (this._silenceCheck) { clearInterval(this._silenceCheck); this._silenceCheck = null; }
    if (this._mediaRecorder?.state !== 'inactive') {
      try { this._mediaRecorder.stop(); } catch {}
    }
    this._mediaRecorder = null;
    if (this._mediaStream) {
      this._mediaStream.getTracks().forEach(t => t.stop());
      this._mediaStream = null;
    }
    if (this._audioCtx) {
      try { this._audioCtx.close(); } catch {}
      this._audioCtx = null;
    }
    this._analyser = null;
    this._audioChunks = [];
    this._micActive = false;
    this._isTranscribing = false;
    this._updateMicUI(false);
    this.input.placeholder = 'Ask about what you\'re looking at...';
  }

  _updateMicUI(active) {
    if (active) {
      this.micBtn.style.background = 'rgba(239,68,68,0.2)';
      this.micBtn.style.color = '#ef4444';
      this._setDot('dot-mic', true);
    } else {
      this.micBtn.style.background = 'rgba(255,255,255,0.06)';
      this.micBtn.style.color = '#a1a1aa';
      this._setDot('dot-mic', false);
    }
  }

  // ── Response display ──

  _showLoading() {
    this.responsePanel.style.maxHeight = '400px';
    this.loadingEl.style.display = 'flex';
    this.responseText.innerHTML = '';
    this.actionBar.style.display = 'none';
    this._setDot('dot-ai', true);
  }

  _showStreaming(text) {
    this.loadingEl.style.display = 'none';
    this.responseText.innerHTML = this._format(text);
    this.responseText.scrollTop = this.responseText.scrollHeight;
  }

  _showFinal(text) {
    this.loadingEl.style.display = 'none';
    this.responseText.innerHTML = this._format(text);
    this.actionBar.style.display = 'flex';
    this._setDot('dot-ai', false);
  }

  _showError(msg) {
    this.loadingEl.style.display = 'none';
    this.responseText.innerHTML = `<div style="color:#ef4444;font-size:13px;">⚠ ${this._esc(msg || 'Something went wrong.')}</div>`;
    this.actionBar.style.display = 'none';
    this._setDot('dot-ai', false);
  }

  _clearResponse() {
    this.loadingEl.style.display = 'none';
    this.responseText.innerHTML = '';
    this.actionBar.style.display = 'none';
    this.responsePanel.style.maxHeight = '0';
    this.input.value = '';
    this.input.disabled = false;
    this._fullText = '';
  }

  // ── Privacy dots ──

  _setDot(id, active) {
    const dot = document.getElementById(id);
    if (!dot) return;
    const colors = { 'dot-cam': '#22c55e', 'dot-mic': '#ef4444', 'dot-scr': '#3b82f6', 'dot-ai': '#eab308' };
    dot.style.opacity = active ? '1' : '0.2';
    dot.style.boxShadow = active ? `0 0 6px ${colors[id]}60` : 'none';
  }

  setGazeActive(active) {
    this.eyeDot.style.background = active ? '#22c55e' : '#52525b';
    this.eyeDot.style.boxShadow = active ? '0 0 8px rgba(34,197,94,0.5)' : 'none';
  }

  setVoiceListening(active) { this._setDot('dot-mic', active); }
  setScreenActive(active) { this._setDot('dot-scr', active); }

  // ── Helpers ──

  _format(text) {
    let h = this._esc(text);
    h = h.replace(/```[\w]*\n?([\s\S]*?)```/g, '<pre style="background:rgba(0,0,0,0.3);padding:10px;border-radius:8px;font-size:13px;font-family:monospace;overflow-x:auto;margin:8px 0;border:1px solid rgba(255,255,255,0.06);">$1</pre>');
    h = h.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.07);padding:1px 5px;border-radius:4px;font-family:monospace;font-size:13px;">$1</code>');
    h = h.replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#e4e4e7;font-weight:600;">$1</strong>');
    h = h.replace(/^[•\-\*] (.+)$/gm, '<div style="display:flex;gap:6px;padding:1px 0;"><span style="color:#818cf8;flex-shrink:0;">•</span><span>$1</span></div>');
    h = h.replace(/^(\d+)\. (.+)$/gm, '<div style="display:flex;gap:6px;padding:1px 0;"><span style="color:#818cf8;flex-shrink:0;">$1.</span><span>$2</span></div>');
    h = h.replace(/\n/g, '<br>');
    return h;
  }

  _esc(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
  }
}

// ── Gaze Mapper (Polynomial Regression) ─────────────────────────────
// Maps normalized iris coordinates → screen pixel coordinates using a
// quadratic model fitted via least-squares on calibration data.

class GazeMapper {
  constructor() { this.coeffsX = null; this.coeffsY = null; }

  calibrate(points) {
    if (points.length < 4) return false;
    const A = [], bx = [], by = [];
    for (const p of points) {
      const ix = p.iris.x, iy = p.iris.y;
      A.push([1, ix, iy, ix * ix, iy * iy, ix * iy]);
      bx.push(p.screen.x);
      by.push(p.screen.y);
    }
    this.coeffsX = this._leastSquares(A, bx);
    this.coeffsY = this._leastSquares(A, by);
    return true;
  }

  predict(ix, iy) {
    if (!this.coeffsX || !this.coeffsY) return null;
    const f = [1, ix, iy, ix * ix, iy * iy, ix * iy];
    return {
      x: f.reduce((s, v, i) => s + v * this.coeffsX[i], 0),
      y: f.reduce((s, v, i) => s + v * this.coeffsY[i], 0),
    };
  }

  _leastSquares(A, b) {
    const m = A[0].length, n = A.length;
    const AtA = Array.from({ length: m }, () => Array(m).fill(0));
    for (let i = 0; i < m; i++)
      for (let j = 0; j < m; j++)
        for (let k = 0; k < n; k++)
          AtA[i][j] += A[k][i] * A[k][j];
    const Atb = Array(m).fill(0);
    for (let i = 0; i < m; i++)
      for (let k = 0; k < n; k++)
        Atb[i] += A[k][i] * b[k];
    return this._solve(AtA, Atb);
  }

  _solve(A, b) {
    const n = A.length;
    const aug = A.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < n; col++) {
      let maxR = col;
      for (let r = col + 1; r < n; r++)
        if (Math.abs(aug[r][col]) > Math.abs(aug[maxR][col])) maxR = r;
      [aug[col], aug[maxR]] = [aug[maxR], aug[col]];
      if (Math.abs(aug[col][col]) < 1e-10) continue;
      for (let r = col + 1; r < n; r++) {
        const f = aug[r][col] / aug[col][col];
        for (let j = col; j <= n; j++) aug[r][j] -= f * aug[col][j];
      }
    }
    const x = Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      x[i] = aug[i][n];
      for (let j = i + 1; j < n; j++) x[i] -= aug[i][j] * x[j];
      x[i] /= aug[i][i] || 1;
    }
    return x;
  }
}

// ── Eye Tracker (MediaPipe Face Mesh + Calibration + Tracking Dot) ──
// Loads FaceLandmarker from CDN, opens webcam, runs 9-point calibration,
// then continuously tracks iris position and displays a gaze dot.

class EyeTracker {
  constructor() {
    this.mapper = new GazeMapper();
    this.video = null;
    this.faceLandmarker = null;
    this._running = false;
    this._currentIris = null;
    this._smoothX = null;
    this._smoothY = null;
    this.dot = null;
    this._calibrated = false;
    this._frameId = null;
    this._lastTs = -1;
  }

  async init() {
    console.log('[GODSEYE] Loading MediaPipe Face Mesh...');
    await this._loadMediaPipe();
    console.log('[GODSEYE] Opening camera for eye tracking...');
    await this._openCamera();
    this._createDot();
    console.log('[GODSEYE] Eye tracker initialized');
  }

  async _loadMediaPipe() {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load MediaPipe from CDN'));
      document.head.appendChild(s);
    });

    const V = globalThis.vision;
    if (!V?.FilesetResolver || !V?.FaceLandmarker)
      throw new Error('MediaPipe vision exports not found');

    const fileset = await V.FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
    );
    this.faceLandmarker = await V.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
  }

  async _openCamera() {
    this.video = document.createElement('video');
    this.video.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-1;';
    this.video.setAttribute('playsinline', '');
    this.video.setAttribute('autoplay', '');
    document.body.appendChild(this.video);
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' }
    });
    this.video.srcObject = stream;
    await this.video.play();
  }

  _createDot() {
    this.dot = document.createElement('div');
    this.dot.id = 'gaze-dot';
    this.dot.style.cssText = `
      position:fixed;top:0;left:0;width:14px;height:14px;
      border-radius:50%;background:rgba(99,102,241,0.7);
      box-shadow:0 0 10px rgba(99,102,241,0.5),0 0 20px rgba(99,102,241,0.15);
      pointer-events:none;z-index:999998;
      transform:translate(-50%,-50%);opacity:0;transition:opacity 0.3s;
    `;
    document.body.appendChild(this.dot);
  }

  _processFrame() {
    if (!this.faceLandmarker || !this.video || this.video.readyState < 2) return null;
    const now = performance.now();
    if (now <= this._lastTs) return this._currentIris;
    this._lastTs = now;
    try {
      const res = this.faceLandmarker.detectForVideo(this.video, now);
      if (res.faceLandmarks?.length > 0) {
        this._currentIris = this._extractIris(res.faceLandmarks[0]);
        return this._currentIris;
      }
    } catch {}
    return null;
  }

  _extractIris(lm) {
    const lO = lm[33], lI = lm[133], lT = lm[159], lB = lm[145], lIr = lm[468];
    const rO = lm[263], rI = lm[362], rT = lm[386], rB = lm[374], rIr = lm[473];
    const lW = Math.abs(lI.x - lO.x) || 0.001;
    const lH = Math.abs(lB.y - lT.y) || 0.001;
    const rW = Math.abs(rO.x - rI.x) || 0.001;
    const rH = Math.abs(rB.y - rT.y) || 0.001;
    return {
      x: ((lIr.x - lO.x) / lW + (rIr.x - rI.x) / rW) / 2,
      y: ((lIr.y - lT.y) / lH + (rIr.y - rT.y) / rH) / 2,
    };
  }

  // ── 9-Point Calibration ──────────────────────────────────
  async calibrate() {
    window.godseye?.showOverlay();
    window.godseye?.setClickThrough(false);

    const ov = document.createElement('div');
    ov.style.cssText = `
      position:fixed;top:0;left:0;width:100vw;height:100vh;
      background:rgba(8,8,12,0.97);z-index:999999;
      font-family:'Inter',sans-serif;color:#e4e4e7;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
    `;
    document.body.appendChild(ov);

    // Instructions
    const info = document.createElement('div');
    info.style.cssText = 'text-align:center;animation:godseye-fade-in 0.4s ease;';
    info.innerHTML = `
      <div style="width:60px;height:60px;border-radius:50%;
        background:linear-gradient(135deg,#6366f1,#8b5cf6);
        margin:0 auto 20px;display:flex;align-items:center;justify-content:center;">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
          <circle cx="12" cy="12" r="3"/><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12z"/>
        </svg>
      </div>
      <div style="font-size:26px;font-weight:700;margin-bottom:10px;">Eye Calibration</div>
      <div style="font-size:15px;color:#a1a1aa;max-width:420px;line-height:1.6;margin-bottom:28px;">
        Look at each <span style="color:#818cf8;font-weight:600;">purple dot</span> as it appears on screen.<br>
        Keep your head still and centered in front of the camera.
      </div>
    `;
    const btn = document.createElement('button');
    btn.textContent = 'Start Calibration';
    btn.style.cssText = `
      padding:12px 36px;border-radius:12px;border:none;background:#6366f1;
      color:white;font-size:16px;font-weight:600;cursor:pointer;
      transition:transform 0.15s,box-shadow 0.15s;
      box-shadow:0 4px 12px rgba(99,102,241,0.4);
    `;
    btn.onmouseenter = () => { btn.style.transform = 'scale(1.04)'; };
    btn.onmouseleave = () => { btn.style.transform = 'scale(1)'; };
    info.appendChild(btn);
    ov.appendChild(info);

    await new Promise(r => btn.addEventListener('click', r, { once: true }));
    info.remove();

    // Countdown
    const cEl = document.createElement('div');
    cEl.style.cssText = 'font-size:64px;font-weight:700;color:#6366f1;text-shadow:0 0 30px rgba(99,102,241,0.4);';
    ov.appendChild(cEl);
    for (let i = 3; i > 0; i--) {
      cEl.textContent = i;
      await this._wait(800);
    }
    cEl.remove();

    // Calibration dot + ring
    const calDot = document.createElement('div');
    calDot.style.cssText = `
      position:absolute;width:18px;height:18px;border-radius:50%;
      background:#6366f1;box-shadow:0 0 20px rgba(99,102,241,0.7);
      transform:translate(-50%,-50%);transition:left 0.35s ease,top 0.35s ease;
    `;
    const ring = document.createElement('div');
    ring.style.cssText = `
      position:absolute;width:42px;height:42px;border-radius:50%;
      border:2px solid rgba(99,102,241,0.4);
      transform:translate(-50%,-50%);
      transition:left 0.35s ease,top 0.35s ease,width 0.8s ease,height 0.8s ease,opacity 0.3s;
    `;
    const prog = document.createElement('div');
    prog.style.cssText = 'position:absolute;bottom:40px;left:50%;transform:translateX(-50%);font-size:14px;color:#71717a;';
    ov.appendChild(calDot);
    ov.appendChild(ring);
    ov.appendChild(prog);

    this._running = true;

    const margin = 0.08;
    const positions = [
      { x: margin, y: margin },          { x: 0.5, y: margin },
      { x: 1 - margin, y: margin },      { x: margin, y: 0.5 },
      { x: 0.5, y: 0.5 },               { x: 1 - margin, y: 0.5 },
      { x: margin, y: 1 - margin },      { x: 0.5, y: 1 - margin },
      { x: 1 - margin, y: 1 - margin },
    ];

    const calData = [];
    const sw = window.innerWidth, sh = window.innerHeight;

    for (let i = 0; i < positions.length; i++) {
      const px = positions[i].x * sw, py = positions[i].y * sh;

      calDot.style.left = px + 'px'; calDot.style.top = py + 'px';
      ring.style.left = px + 'px'; ring.style.top = py + 'px';
      ring.style.width = '42px'; ring.style.height = '42px'; ring.style.opacity = '1';
      prog.textContent = `Point ${i + 1} of ${positions.length}`;

      await this._wait(500);
      ring.style.width = '18px'; ring.style.height = '18px';

      const samples = [];
      const t0 = Date.now();
      while (Date.now() - t0 < 1000) {
        const iris = this._processFrame();
        if (iris) samples.push(iris);
        await this._wait(33);
      }
      ring.style.opacity = '0.2';

      if (samples.length >= 5) {
        const ax = samples.reduce((s, p) => s + p.x, 0) / samples.length;
        const ay = samples.reduce((s, p) => s + p.y, 0) / samples.length;
        calData.push({ iris: { x: ax, y: ay }, screen: { x: px, y: py } });
        console.log(`[GODSEYE] Cal ${i + 1}/${positions.length}: iris(${ax.toFixed(3)},${ay.toFixed(3)}) -> (${Math.round(px)},${Math.round(py)}) [${samples.length} frames]`);
      }
      await this._wait(200);
    }

    calDot.remove(); ring.remove(); prog.remove();

    const done = document.createElement('div');
    done.style.cssText = 'text-align:center;animation:godseye-fade-in 0.3s ease;';
    done.innerHTML = `
      <div style="font-size:48px;margin-bottom:12px;">&#10003;</div>
      <div style="font-size:22px;font-weight:600;color:#22c55e;">Calibration Complete</div>
      <div style="font-size:14px;color:#71717a;margin-top:6px;">${calData.length} of ${positions.length} points captured</div>
    `;
    ov.appendChild(done);
    await this._wait(1500);
    ov.remove();

    if (calData.length >= 4) {
      this.mapper.calibrate(calData);
      this._calibrated = true;
      console.log('[GODSEYE] Gaze mapper calibrated');
    } else {
      console.error('[GODSEYE] Not enough calibration data');
    }

    window.godseye?.setClickThrough(true);
  }

  startTracking() {
    if (!this._calibrated) return;
    this._running = true;
    this.dot.style.opacity = '1';
    this._trackLoop();
    console.log('[GODSEYE] Gaze tracking active');
  }

  _trackLoop() {
    if (!this._running || !this._calibrated) return;
    const iris = this._processFrame();
    if (iris) {
      const pred = this.mapper.predict(iris.x, iris.y);
      if (pred) {
        const a = 0.2;
        this._smoothX = this._smoothX === null ? pred.x : a * pred.x + (1 - a) * this._smoothX;
        this._smoothY = this._smoothY === null ? pred.y : a * pred.y + (1 - a) * this._smoothY;
        const x = Math.max(0, Math.min(window.innerWidth, this._smoothX));
        const y = Math.max(0, Math.min(window.innerHeight, this._smoothY));
        this.dot.style.left = x + 'px';
        this.dot.style.top = y + 'px';
      }
    }
    this._frameId = requestAnimationFrame(() => this._trackLoop());
  }

  get currentGaze() {
    if (this._smoothX === null) return null;
    return {
      x: Math.max(0, Math.min(window.innerWidth, this._smoothX)),
      y: Math.max(0, Math.min(window.innerHeight, this._smoothY)),
    };
  }

  stopTracking() {
    this._running = false;
    if (this._frameId) cancelAnimationFrame(this._frameId);
    if (this.dot) this.dot.style.opacity = '0';
  }

  _wait(ms) { return new Promise(r => setTimeout(r, ms)); }
}

// ── Screen Monitor (Continuous Background Awareness) ────────────────
// Captures the screen every 5 seconds and stores a rolling buffer.
// When the user asks a question, the last 2 frames (current + ~20s ago)
// are sent to Claude so it has full context of what the user was doing.
// No background API calls — purely local capture + memory storage.

class ScreenMonitor {
  constructor() {
    this._frames = [];       // { ts, dataUrl }
    this._maxFrames = 12;    // ~60s of history at 5s intervals
    this._interval = null;
    this._lastLen = 0;       // For change detection
  }

  start() {
    this._tick();            // First capture immediately
    this._interval = setInterval(() => this._tick(), 5000);
    console.log('[GODSEYE] Screen monitor started — capturing every 5s');
  }

  async _tick() {
    try {
      const capture = await window.godseye.captureFullScreen();
      if (!capture?.dataUrl) return;

      // Skip if screen is basically identical (JPEG size within 3%)
      const len = capture.dataUrl.length;
      if (this._lastLen && Math.abs(len - this._lastLen) / this._lastLen < 0.03) return;
      this._lastLen = len;

      this._frames.push({ ts: Date.now(), dataUrl: capture.dataUrl });
      while (this._frames.length > this._maxFrames) this._frames.shift();
    } catch {}
  }

  /** Return [older, current] images for LLM context. Max 2 to keep latency low. */
  getContextImages() {
    const n = this._frames.length;
    if (n === 0) return [];
    if (n === 1) return [this._frames[0].dataUrl];

    // Pick one historical frame from ~20s ago + the latest
    const histIdx = Math.max(0, n - 5);   // ~25s back at 5s intervals
    return [
      this._frames[histIdx].dataUrl,       // older context
      this._frames[n - 1].dataUrl,         // current
    ];
  }

  /** Short text summary of monitoring status */
  getContextText(eyeTracker) {
    const n = this._frames.length;
    if (n === 0) return '';

    const spanSec = n > 1
      ? Math.round((this._frames[n - 1].ts - this._frames[0].ts) / 1000)
      : 0;

    let ctx = `You are continuously monitoring the user's screen. `;
    ctx += n > 1
      ? `${n} screen snapshots captured over the last ${spanSec}s (oldest to newest are attached). `
      : 'Current screenshot attached. ';

    const gaze = eyeTracker?.currentGaze;
    if (gaze) {
      ctx += `User is looking at approximately (${Math.round(gaze.x)}, ${Math.round(gaze.y)}) on a ${window.innerWidth}x${window.innerHeight} screen.`;
    }
    return ctx;
  }

  stop() {
    if (this._interval) clearInterval(this._interval);
    this._frames = [];
  }
}

// ── Wake Word Listener (Simplified, Reliable) ──────────────────────
// Records fixed 3-second chunks continuously. After each chunk, checks
// if there was any significant audio (peak level). If yes, sends to
// Whisper and checks for "jarvis". No complex VAD — just record + check.
// This avoids the noise floor issues that caused missed wake words.

class WakeWordListener {
  constructor(bar) {
    this.bar = bar;
    this._active = false;
    this._stream = null;
    this._audioCtx = null;
    this._analyser = null;
    this._transcribing = false;
    this._retries = 0;
  }

  async start() {
    if (this._active) return;
    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      this._audioCtx = new AudioContext();
      const src = this._audioCtx.createMediaStreamSource(this._stream);
      const hp = this._audioCtx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 85;
      src.connect(hp);
      this._analyser = this._audioCtx.createAnalyser();
      this._analyser.fftSize = 512;
      hp.connect(this._analyser);

      this._active = true;
      console.log('[GODSEYE] Wake word listener active');
      this._cycle();
    } catch (e) {
      console.error('[GODSEYE] Wake word mic error:', e.message);
      if (this._retries < 5) {
        this._retries++;
        console.log(`[GODSEYE] Wake word retry #${this._retries} in ${this._retries * 2}s`);
        setTimeout(() => this.start(), this._retries * 2000);
      }
    }
  }

  _getLevel() {
    if (!this._analyser) return 0;
    const d = new Uint8Array(this._analyser.frequencyBinCount);
    this._analyser.getByteFrequencyData(d);
    let s = 0;
    for (let i = 0; i < d.length; i++) s += d[i];
    return s / (d.length * 255);
  }

  _cycle() {
    if (!this._active || !this._stream) return;
    if (this.bar.visible) {
      setTimeout(() => this._cycle(), 500);
      return;
    }

    const chunks = [];
    let peakLevel = 0;
    const rec = new MediaRecorder(this._stream, {
      mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm'
    });

    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    const monitor = setInterval(() => {
      const l = this._getLevel();
      if (l > peakLevel) peakLevel = l;
    }, 100);

    rec.onstop = () => {
      clearInterval(monitor);
      // Start next cycle immediately (don't wait for transcription)
      if (this._active) setTimeout(() => this._cycle(), 50);
      // Only transcribe if peak was significant and not already busy
      if (peakLevel > 0.025 && chunks.length > 0 && !this._transcribing) {
        this._checkWake(chunks);
      }
    };

    rec.start(250);
    setTimeout(() => {
      if (rec.state !== 'inactive') rec.stop();
    }, 2000);
  }

  async _checkWake(chunks) {
    this._transcribing = true;
    try {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 8192)
        bin += String.fromCharCode(...bytes.slice(i, i + 8192));
      const b64 = btoa(bin);
      const result = await window.godseye.transcribeAudio(b64, 'audio/webm');
      if (result.text) {
        const t = result.text.toLowerCase().trim();
        console.log('[GODSEYE] Wake check:', t);
        if (['jarvis', 'travis', 'jervis', 'javis', 'jarvus', 'hey jarvis'].some(w => t.includes(w))) {
          console.log('[GODSEYE] *** WAKE WORD DETECTED ***');
          window.godseye?.showOverlay();
          window.godseye?.setClickThrough(false);
          this.bar.show();
        }
      }
    } catch (e) {
      console.error('[GODSEYE] Wake check error:', e);
    }
    this._transcribing = false;
  }

  resume() {
    if (this._active && !this.bar.visible) this._cycle();
  }

  stop() {
    this._active = false;
    if (this._stream) { this._stream.getTracks().forEach(t => t.stop()); this._stream = null; }
    if (this._audioCtx) { try { this._audioCtx.close(); } catch {} this._audioCtx = null; }
  }
}

// ── Boot ─────────────────────────────────────────────────────────

const bar = new FloatingBar();

// Listen for hotkey / tray trigger from main process
window.godseye?.onWakeTriggered(() => {
  window.godseye.setClickThrough(false);
  bar.show();
});

// Start continuous screen monitor (captures every 5s, no API calls)
const monitor = new ScreenMonitor();
monitor.start();
bar._screenMonitor = monitor;

// Start always-on wake word listener
const wakeWord = new WakeWordListener(bar);
wakeWord.start();

// When bar hides, resume wake word listening
bar.onHide(() => wakeWord.resume());

// Eye tracker: init → calibrate → track
(async () => {
  try {
    const eyeTracker = new EyeTracker();
    await eyeTracker.init();
    await eyeTracker.calibrate();
    eyeTracker.startTracking();

    // Make gaze available to bar for screen context
    bar._eyeTracker = eyeTracker;

    // Keep overlay visible (transparent + click-through) for tracking dot
    window.godseye?.showOverlay();
    window.godseye?.setClickThrough(true);

    console.log('[GODSEYE] Eye tracking active');
  } catch (e) {
    console.error('[GODSEYE] Eye tracker failed:', e.message || e);
    console.log('[GODSEYE] Continuing without eye tracking');
  }
})();

console.log('[GODSEYE] Renderer ready');
