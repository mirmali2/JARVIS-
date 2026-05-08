/**
 * GODSEYE — Floating Bar Component
 *
 * The main UI element: a minimal, elegant bar that drops from the top
 * of the screen when activated. Contains:
 *  - Text input field (for typed queries)
 *  - Mic button with waveform indicator
 *  - Privacy indicator dots (camera, mic, screen)
 *  - Submit / close controls
 *  - Response panel (expands below when LLM responds)
 *
 * Behavior:
 *  - Hidden by default, slides in on wake word / hotkey
 *  - Auto-focuses the input field when shown
 *  - Supports voice, typing, and paste
 *  - Non-intrusive: click outside to dismiss
 *  - Smooth CSS animations for enter/exit
 */

import { ResponsePanel } from './ResponsePanel.js';
import { PrivacyIndicator } from './PrivacyIndicator.js';
import { WaveformVisualizer } from './WaveformVisualizer.js';

export class FloatingBar {
  constructor(container, options = {}) {
    this.container = container;
    this.barWidth = options.barWidth ?? 620;
    this.barHeight = options.barHeight ?? 56;
    this.position = options.position ?? 'top';
    this.opacity = options.opacity ?? 0.95;
    this.animationDuration = options.animationDuration ?? 200;

    // Callbacks
    this.onSubmit = options.onSubmit ?? (() => {});
    this.onDismiss = options.onDismiss ?? (() => {});
    this.onMicToggle = options.onMicToggle ?? (() => {});
    this.onSettingsOpen = options.onSettingsOpen ?? (() => {});

    // State
    this._visible = false;
    this._query = '';
    this._isListening = false;
    this._isProcessing = false;
    this._responseText = '';

    // Sub-components
    this._responsePanel = null;
    this._privacyIndicator = null;
    this._waveform = null;

    this._build();
  }

  _build() {
    // Wrapper — full screen transparent overlay
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'godseye-wrapper';
    this.wrapper.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 999999;
      font-family: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;

    // Bar container
    this.bar = document.createElement('div');
    this.bar.className = 'godseye-bar';
    this.bar.style.cssText = `
      position: absolute;
      ${this.position === 'top' ? 'top: 16px' : 'bottom: 16px'};
      left: 50%;
      transform: translateX(-50%) translateY(${this.position === 'top' ? '-120%' : '120%'});
      width: ${this.barWidth}px;
      min-height: ${this.barHeight}px;
      background: rgba(18, 18, 24, ${this.opacity});
      backdrop-filter: blur(24px) saturate(180%);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05) inset;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      pointer-events: auto;
      transition: transform ${this.animationDuration}ms cubic-bezier(0.16, 1, 0.3, 1),
                  opacity ${this.animationDuration}ms ease;
      opacity: 0;
    `;

    // Input row
    const inputRow = document.createElement('div');
    inputRow.style.cssText = `
      display: flex;
      align-items: center;
      padding: 8px 12px;
      gap: 8px;
      min-height: ${this.barHeight}px;
    `;

    // Gaze indicator dot
    this.gazeDot = document.createElement('div');
    this.gazeDot.style.cssText = `
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #22c55e;
      flex-shrink: 0;
      transition: background 0.3s ease;
      box-shadow: 0 0 6px rgba(34, 197, 94, 0.4);
    `;
    this.gazeDot.title = 'Gaze tracking active';

    // Text input
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = 'Ask about what you\'re looking at...';
    this.input.style.cssText = `
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: #e4e4e7;
      font-size: 15px;
      font-weight: 400;
      letter-spacing: 0.01em;
      caret-color: #818cf8;
      ::placeholder { color: rgba(228, 228, 231, 0.4); }
    `;
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.input.value.trim()) {
        this._handleSubmit(this.input.value.trim());
      }
      if (e.key === 'Escape') {
        this.hide();
      }
    });
    this.input.addEventListener('input', () => {
      this._query = this.input.value;
    });

    // Waveform container (shown when mic is active)
    this.waveformContainer = document.createElement('div');
    this.waveformContainer.style.cssText = `
      width: 60px;
      height: 24px;
      display: none;
      align-items: center;
    `;

    // Mic button
    this.micBtn = document.createElement('button');
    this.micBtn.innerHTML = this._micIcon();
    this.micBtn.style.cssText = `
      width: 36px;
      height: 36px;
      border-radius: 10px;
      border: none;
      background: rgba(255, 255, 255, 0.06);
      color: #a1a1aa;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
      flex-shrink: 0;
    `;
    this.micBtn.addEventListener('click', () => this._toggleMic());
    this.micBtn.addEventListener('mouseenter', () => {
      this.micBtn.style.background = 'rgba(255, 255, 255, 0.1)';
      this.micBtn.style.color = '#e4e4e7';
    });
    this.micBtn.addEventListener('mouseleave', () => {
      if (!this._isListening) {
        this.micBtn.style.background = 'rgba(255, 255, 255, 0.06)';
        this.micBtn.style.color = '#a1a1aa';
      }
    });

    // Submit button
    this.submitBtn = document.createElement('button');
    this.submitBtn.innerHTML = this._sendIcon();
    this.submitBtn.style.cssText = `
      width: 36px;
      height: 36px;
      border-radius: 10px;
      border: none;
      background: #6366f1;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
      flex-shrink: 0;
      opacity: 0.7;
    `;
    this.submitBtn.addEventListener('click', () => {
      if (this.input.value.trim()) {
        this._handleSubmit(this.input.value.trim());
      }
    });
    this.submitBtn.addEventListener('mouseenter', () => {
      this.submitBtn.style.opacity = '1';
      this.submitBtn.style.transform = 'scale(1.05)';
    });
    this.submitBtn.addEventListener('mouseleave', () => {
      this.submitBtn.style.opacity = '0.7';
      this.submitBtn.style.transform = 'scale(1)';
    });

    // Privacy indicator
    this.privacyContainer = document.createElement('div');
    this._privacyIndicator = new PrivacyIndicator(this.privacyContainer);

    // Assemble input row
    inputRow.appendChild(this.gazeDot);
    inputRow.appendChild(this.input);
    inputRow.appendChild(this.waveformContainer);
    inputRow.appendChild(this.micBtn);
    inputRow.appendChild(this.submitBtn);
    inputRow.appendChild(this.privacyContainer);

    // Response panel
    this.responseContainer = document.createElement('div');
    this._responsePanel = new ResponsePanel(this.responseContainer);

    // Assemble bar
    this.bar.appendChild(inputRow);
    this.bar.appendChild(this.responseContainer);

    this.wrapper.appendChild(this.bar);
    this.container.appendChild(this.wrapper);

    // Click outside to dismiss
    this.wrapper.addEventListener('click', (e) => {
      if (e.target === this.wrapper) {
        this.hide();
      }
    });
  }

  // ─── Show / Hide ───────────────────────────────────────────────

  show() {
    if (this._visible) return;
    this._visible = true;

    // Make wrapper intercept clicks
    this.wrapper.style.pointerEvents = 'auto';
    window.godseye.setClickThrough(false);

    // Animate in
    requestAnimationFrame(() => {
      this.bar.style.transform = 'translateX(-50%) translateY(0)';
      this.bar.style.opacity = '1';
    });

    // Focus input
    setTimeout(() => this.input.focus(), this.animationDuration);
  }

  hide() {
    if (!this._visible) return;
    this._visible = false;

    const offset = this.position === 'top' ? '-120%' : '120%';
    this.bar.style.transform = `translateX(-50%) translateY(${offset})`;
    this.bar.style.opacity = '0';

    // Restore click-through after animation
    setTimeout(() => {
      this.wrapper.style.pointerEvents = 'none';
      window.godseye.setClickThrough(true);
      window.godseye.hideOverlay();
    }, this.animationDuration);

    // Clear state
    this.input.value = '';
    this._query = '';
    this._responsePanel.clear();
    this.onDismiss();
  }

  // ─── Input Handling ────────────────────────────────────────────

  _handleSubmit(query) {
    this.input.disabled = true;
    this._isProcessing = true;
    this.submitBtn.style.opacity = '0.4';
    this._responsePanel.showLoading();

    this.onSubmit(query);
  }

  /**
   * Called externally when the LLM starts streaming a response.
   */
  showStreamingResponse(delta) {
    this._responsePanel.appendText(delta);
  }

  /**
   * Called when the LLM response is complete.
   */
  showResponse(text) {
    this.input.disabled = false;
    this._isProcessing = false;
    this.submitBtn.style.opacity = '0.7';
    this._responsePanel.showResponse(text);
  }

  showError(message) {
    this.input.disabled = false;
    this._isProcessing = false;
    this.submitBtn.style.opacity = '0.7';
    this._responsePanel.showError(message);
  }

  /**
   * Pre-fill the input with the voice transcript.
   */
  setTranscript(text) {
    this.input.value = text;
    this._query = text;
  }

  // ─── Mic ───────────────────────────────────────────────────────

  _toggleMic() {
    this._isListening = !this._isListening;

    if (this._isListening) {
      this.micBtn.style.background = 'rgba(239, 68, 68, 0.2)';
      this.micBtn.style.color = '#ef4444';
      this.micBtn.innerHTML = this._micActiveIcon();
      this.waveformContainer.style.display = 'flex';
    } else {
      this.micBtn.style.background = 'rgba(255, 255, 255, 0.06)';
      this.micBtn.style.color = '#a1a1aa';
      this.micBtn.innerHTML = this._micIcon();
      this.waveformContainer.style.display = 'none';
    }

    this.onMicToggle(this._isListening);
  }

  setMicActive(active) {
    if (active === this._isListening) return;
    this._toggleMic();
  }

  // ─── Privacy Indicators ────────────────────────────────────────

  updatePrivacyIndicators(indicators) {
    this._privacyIndicator.update(indicators);
  }

  setGazeActive(active) {
    this.gazeDot.style.background = active ? '#22c55e' : '#71717a';
    this.gazeDot.style.boxShadow = active
      ? '0 0 6px rgba(34, 197, 94, 0.4)'
      : 'none';
  }

  // ─── SVG Icons ─────────────────────────────────────────────────

  _micIcon() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" x2="12" y1="19" y2="22"/>
    </svg>`;
  }

  _micActiveIcon() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" fill="none" stroke-width="2"/>
      <line x1="12" x2="12" y1="19" y2="22" stroke-width="2"/>
    </svg>`;
  }

  _sendIcon() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 2 11 13"/>
      <path d="M22 2 15 22 11 13 2 9Z"/>
    </svg>`;
  }

  get isVisible() {
    return this._visible;
  }
}
