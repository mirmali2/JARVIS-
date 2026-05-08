/**
 * GODSEYE — First-Run Consent Dialog
 *
 * Shown on first launch. Explains what GODSEYE does,
 * what permissions it needs, and lets the user opt-in
 * to each capability individually.
 */

export class ConsentDialog {
  constructor(container, options = {}) {
    this.container = container;
    this.onComplete = options.onComplete ?? (() => {});
    this._overlay = null;
  }

  show(requirements) {
    this._overlay = document.createElement('div');
    this._overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.92);
      z-index: 99999999;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Inter', sans-serif;
      pointer-events: auto;
    `;

    const card = document.createElement('div');
    card.style.cssText = `
      width: 480px;
      background: #18181b;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 20px;
      padding: 36px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    `;

    // Logo / Title
    card.innerHTML = `
      <div style="text-align:center;margin-bottom:24px;">
        <div style="font-size:32px;font-weight:700;color:#e4e4e7;letter-spacing:-0.02em;">GODSEYE</div>
        <div style="font-size:14px;color:#71717a;margin-top:4px;">Your AI-Powered Desktop Assistant</div>
      </div>
      <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 24px;">
        GODSEYE uses your camera, microphone, and screen to understand what you're looking at
        and help you instantly. <strong style="color:#e4e4e7;">All processing happens on your device</strong> —
        only the text you ask about is sent to the AI.
      </p>
      <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 24px;">
        Choose which capabilities to enable. You can change these anytime in Settings.
      </p>
    `;

    // Permission toggles
    const toggles = {};
    requirements.forEach((req) => {
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 14px 16px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 12px;
        margin-bottom: 10px;
      `;

      // Checkbox
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = true;
      checkbox.style.cssText = `
        margin-top: 2px;
        accent-color: #6366f1;
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      `;
      toggles[req.type] = checkbox;

      // Text
      const textCol = document.createElement('div');
      textCol.innerHTML = `
        <div style="color:#e4e4e7;font-size:14px;font-weight:500;">${req.name}</div>
        <div style="color:#71717a;font-size:13px;line-height:1.5;margin-top:4px;">${req.description}</div>
      `;

      row.appendChild(checkbox);
      row.appendChild(textCol);
      card.appendChild(row);
    });

    // Continue button
    const btnWrapper = document.createElement('div');
    btnWrapper.style.cssText = `text-align:center;margin-top:24px;`;

    const continueBtn = document.createElement('button');
    continueBtn.textContent = 'Get Started';
    continueBtn.style.cssText = `
      padding: 12px 40px;
      border-radius: 12px;
      border: none;
      background: #6366f1;
      color: white;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
    `;
    continueBtn.addEventListener('mouseenter', () => {
      continueBtn.style.transform = 'translateY(-1px)';
      continueBtn.style.boxShadow = '0 6px 16px rgba(99, 102, 241, 0.4)';
    });
    continueBtn.addEventListener('mouseleave', () => {
      continueBtn.style.transform = 'translateY(0)';
      continueBtn.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.3)';
    });
    continueBtn.addEventListener('click', () => {
      const permissions = {};
      for (const [type, checkbox] of Object.entries(toggles)) {
        permissions[type] = checkbox.checked;
      }
      this._overlay.remove();
      this._overlay = null;
      this.onComplete(permissions);
    });

    btnWrapper.appendChild(continueBtn);
    card.appendChild(btnWrapper);

    // Privacy note
    const note = document.createElement('div');
    note.style.cssText = `
      text-align: center;
      margin-top: 16px;
      color: #52525b;
      font-size: 12px;
    `;
    note.textContent = 'Your data stays on your device. No audio or video is stored.';
    card.appendChild(note);

    this._overlay.appendChild(card);
    this.container.appendChild(this._overlay);
  }
}
