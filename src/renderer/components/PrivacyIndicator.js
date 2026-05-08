/**
 * GODSEYE — Privacy Indicator
 *
 * Small, always-visible dots showing which privacy-sensitive systems
 * are currently active. Provides instant visual feedback.
 *
 * Dots:
 *  🟢 Green  = Camera (eye tracking)
 *  🔴 Red    = Microphone (listening)
 *  🔵 Blue   = Screen capture (reading screen)
 *  🟡 Yellow = LLM (sending data to API)
 *
 * Each dot has a tooltip explaining what it means.
 * Clicking the indicator group opens the privacy settings panel.
 */

export class PrivacyIndicator {
  constructor(container, options = {}) {
    this.container = container;
    this.onClick = options.onClick ?? (() => {});

    this._indicators = {
      camera: { active: false, color: '#22c55e', label: 'Camera' },
      microphone: { active: false, color: '#ef4444', label: 'Microphone' },
      screenCapture: { active: false, color: '#3b82f6', label: 'Screen' },
      llm: { active: false, color: '#eab308', label: 'AI' },
    };

    this._build();
  }

  _build() {
    this.wrapper = document.createElement('div');
    this.wrapper.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 6px;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.15s ease;
    `;
    this.wrapper.addEventListener('mouseenter', () => {
      this.wrapper.style.background = 'rgba(255, 255, 255, 0.06)';
    });
    this.wrapper.addEventListener('mouseleave', () => {
      this.wrapper.style.background = 'transparent';
    });
    this.wrapper.addEventListener('click', () => this.onClick());

    this._dots = {};

    for (const [key, config] of Object.entries(this._indicators)) {
      const dot = document.createElement('div');
      dot.style.cssText = `
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: ${config.color};
        opacity: 0.2;
        transition: opacity 0.3s ease, box-shadow 0.3s ease;
      `;
      dot.title = `${config.label}: inactive`;
      this._dots[key] = dot;
      this.wrapper.appendChild(dot);
    }

    this.container.appendChild(this.wrapper);
  }

  /**
   * Update indicator states.
   * @param {{ camera?: boolean, microphone?: boolean, screenCapture?: boolean, llm?: boolean }} indicators
   */
  update(indicators) {
    for (const [key, active] of Object.entries(indicators)) {
      if (this._dots[key]) {
        const config = this._indicators[key];
        this._dots[key].style.opacity = active ? '1' : '0.2';
        this._dots[key].style.boxShadow = active
          ? `0 0 6px ${config.color}40`
          : 'none';
        this._dots[key].title = `${config.label}: ${active ? 'active' : 'inactive'}`;
        this._indicators[key].active = active;
      }
    }
  }
}
