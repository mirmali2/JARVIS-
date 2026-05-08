/**
 * GODSEYE — Settings Panel
 *
 * Full-screen modal for configuring all GODSEYE settings.
 * Sections:
 *  - API Key (required for LLM)
 *  - Eye Tracking (enable/disable, calibrate, sensitivity)
 *  - Voice (wake word, STT engine, TTS)
 *  - Screen Context (capture region, OCR confidence)
 *  - Privacy (permissions, auto-clear, sensitive content filter)
 *  - UI (theme, position, opacity)
 *  - About
 */

export class SettingsPanel {
  constructor(container, options = {}) {
    this.container = container;
    this.onSave = options.onSave ?? (() => {});
    this.onClose = options.onClose ?? (() => {});
    this.onCalibrate = options.onCalibrate ?? (() => {});
    this.onResetCalibration = options.onResetCalibration ?? (() => {});

    this._config = {};
    this._visible = false;
    this._overlay = null;
  }

  async show() {
    if (this._visible) return;
    this._visible = true;

    this._config = await window.godseye.getAllConfig();
    this._build();
  }

  hide() {
    if (!this._visible) return;
    this._visible = false;
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
    this.onClose();
  }

  _build() {
    this._overlay = document.createElement('div');
    this._overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(8px);
      z-index: 9999998;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: auto;
      font-family: 'Inter', sans-serif;
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
      width: 520px;
      max-height: 80vh;
      background: #18181b;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.1) transparent;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    `;
    header.innerHTML = `<h2 style="color:#e4e4e7;font-size:18px;font-weight:600;margin:0;">GODSEYE Settings</h2>`;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: #71717a;
      font-size: 18px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 6px;
    `;
    closeBtn.addEventListener('click', () => this.hide());
    header.appendChild(closeBtn);

    // Content
    const content = document.createElement('div');
    content.style.cssText = `padding: 16px 24px 24px;`;

    // --- API Key Section ---
    content.appendChild(this._section('LLM Configuration', [
      this._inputField('API Key', 'llm.apiKey', this._config.llm?.apiKey || '', 'password',
        'Your Anthropic API key'),
      this._selectField('Model', 'llm.model', this._config.llm?.model || 'claude-sonnet-4-20250514', [
        { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (Fast)' },
        { value: 'claude-opus-4-20250514', label: 'Claude Opus 4 (Powerful)' },
        { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (Fastest)' },
      ]),
    ]));

    // --- Eye Tracking Section ---
    content.appendChild(this._section('Eye Tracking', [
      this._toggleField('Enable Eye Tracking', 'gaze.enabled', this._config.gaze?.enabled ?? true),
      this._sliderField('Smoothing', 'gaze.smoothing', this._config.gaze?.smoothing ?? 0.3, 0, 1, 0.05),
      this._sliderField('Fixation Threshold (ms)', 'gaze.fixationThresholdMs', this._config.gaze?.fixationThresholdMs ?? 300, 100, 1000, 50),
      this._buttonField('Calibrate Eye Tracking', 'Run Calibration', () => {
        this.hide();
        this.onCalibrate();
      }),
      this._buttonField('Reset Calibration', 'Reset', () => this.onResetCalibration(), 'secondary'),
    ]));

    // --- Voice Section ---
    content.appendChild(this._section('Voice & Wake Word', [
      this._toggleField('Enable Wake Word', 'wakeWord.enabled', this._config.wakeWord?.enabled ?? true),
      this._inputField('Hotkey Shortcut', 'wakeWord.hotkey', this._config.wakeWord?.hotkey || 'CommandOrControl+Shift+J', 'text',
        'Fallback keyboard shortcut'),
      this._toggleField('Text-to-Speech', 'speech.ttsEnabled', this._config.speech?.ttsEnabled ?? true),
    ]));

    // --- Screen Context Section ---
    content.appendChild(this._section('Screen Context', [
      this._toggleField('Enable Screen Reading', 'capture.enabled', this._config.capture?.enabled ?? true),
      this._sliderField('Capture Region Width', 'capture.regionWidth', this._config.capture?.regionWidth ?? 800, 400, 1600, 100),
      this._sliderField('OCR Confidence', 'capture.ocrConfidence', this._config.capture?.ocrConfidence ?? 60, 30, 95, 5),
    ]));

    // --- Privacy Section ---
    content.appendChild(this._section('Privacy', [
      this._toggleField('Sensitive Content Filter', 'privacy.sensitiveContentFilter', this._config.privacy?.sensitiveContentFilter ?? true),
      this._sliderField('Auto-Clear Context (sec)', 'privacy.autoClearSeconds', this._config.privacy?.autoClearSeconds ?? 60, 10, 300, 10),
      this._toggleField('Show Privacy Indicator', 'privacy.showPrivacyIndicator', this._config.privacy?.showPrivacyIndicator ?? true),
    ]));

    // --- UI Section ---
    content.appendChild(this._section('Appearance', [
      this._selectField('Bar Position', 'ui.barPosition', this._config.ui?.barPosition || 'top', [
        { value: 'top', label: 'Top' },
        { value: 'bottom', label: 'Bottom' },
      ]),
      this._sliderField('Opacity', 'ui.opacity', this._config.ui?.opacity ?? 0.95, 0.5, 1, 0.05),
      this._toggleField('Show Gaze Dot (Debug)', 'ui.showGazeIndicator', this._config.ui?.showGazeIndicator ?? false),
    ]));

    panel.appendChild(header);
    panel.appendChild(content);
    this._overlay.appendChild(panel);

    // Escape to close
    this._keyHandler = (e) => {
      if (e.key === 'Escape') this.hide();
    };
    document.addEventListener('keydown', this._keyHandler);

    this.container.appendChild(this._overlay);
  }

  // ─── Field Builders ────────────────────────────────────────────

  _section(title, fields) {
    const section = document.createElement('div');
    section.style.cssText = `margin-bottom: 24px;`;

    const heading = document.createElement('h3');
    heading.textContent = title;
    heading.style.cssText = `
      color: #a1a1aa;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0 0 12px 0;
    `;
    section.appendChild(heading);

    fields.forEach((field) => section.appendChild(field));
    return section;
  }

  _inputField(label, configPath, value, type, placeholder) {
    const row = this._fieldRow(label);
    const input = document.createElement('input');
    input.type = type;
    input.value = value;
    input.placeholder = placeholder || '';
    input.style.cssText = `
      width: 220px;
      padding: 6px 10px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      color: #e4e4e7;
      font-size: 13px;
      outline: none;
    `;
    input.addEventListener('change', () => {
      window.godseye.setConfig(configPath, input.value);
    });
    row.appendChild(input);
    return row;
  }

  _toggleField(label, configPath, value) {
    const row = this._fieldRow(label);
    const toggle = document.createElement('button');
    let isOn = value;
    const update = () => {
      toggle.style.background = isOn ? '#6366f1' : 'rgba(255, 255, 255, 0.1)';
      toggle.innerHTML = `<div style="width:16px;height:16px;border-radius:50%;background:white;transform:translateX(${isOn ? '18px' : '0'});transition:transform 0.15s ease;"></div>`;
    };
    toggle.style.cssText = `
      width: 40px;
      height: 22px;
      border-radius: 11px;
      border: none;
      padding: 3px;
      cursor: pointer;
      transition: background 0.15s ease;
      display: flex;
      align-items: center;
    `;
    update();
    toggle.addEventListener('click', () => {
      isOn = !isOn;
      update();
      window.godseye.setConfig(configPath, isOn);
    });
    row.appendChild(toggle);
    return row;
  }

  _sliderField(label, configPath, value, min, max, step) {
    const row = this._fieldRow(label);
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `display:flex;align-items:center;gap:8px;`;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = value;
    slider.style.cssText = `width:140px;accent-color:#6366f1;`;

    const valueLabel = document.createElement('span');
    valueLabel.textContent = value;
    valueLabel.style.cssText = `color:#a1a1aa;font-size:12px;min-width:36px;text-align:right;`;

    slider.addEventListener('input', () => {
      const numVal = parseFloat(slider.value);
      valueLabel.textContent = numVal;
      window.godseye.setConfig(configPath, numVal);
    });

    wrapper.appendChild(slider);
    wrapper.appendChild(valueLabel);
    row.appendChild(wrapper);
    return row;
  }

  _selectField(label, configPath, value, options) {
    const row = this._fieldRow(label);
    const select = document.createElement('select');
    select.style.cssText = `
      padding: 6px 10px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      color: #e4e4e7;
      font-size: 13px;
      outline: none;
    `;
    options.forEach((opt) => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      option.selected = opt.value === value;
      option.style.background = '#18181b';
      select.appendChild(option);
    });
    select.addEventListener('change', () => {
      window.godseye.setConfig(configPath, select.value);
    });
    row.appendChild(select);
    return row;
  }

  _buttonField(label, buttonText, onClick, variant = 'primary') {
    const row = this._fieldRow(label);
    const btn = document.createElement('button');
    btn.textContent = buttonText;
    btn.style.cssText = `
      padding: 6px 14px;
      border-radius: 8px;
      border: 1px solid ${variant === 'primary' ? '#6366f1' : 'rgba(255,255,255,0.1)'};
      background: ${variant === 'primary' ? 'rgba(99,102,241,0.15)' : 'transparent'};
      color: ${variant === 'primary' ? '#818cf8' : '#a1a1aa'};
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s ease;
    `;
    btn.addEventListener('click', onClick);
    row.appendChild(btn);
    return row;
  }

  _fieldRow(label) {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 0;
    `;
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = `color:#d4d4d8;font-size:14px;`;
    row.appendChild(labelEl);
    return row;
  }

  get isVisible() {
    return this._visible;
  }
}
