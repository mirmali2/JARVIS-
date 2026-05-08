/**
 * GODSEYE — Response Panel
 *
 * Expandable panel below the floating bar that displays LLM responses.
 * Supports:
 *  - Streaming text with typing animation
 *  - Markdown-like formatting (bold, code, lists)
 *  - Copy button
 *  - Loading indicator
 *  - Error display
 *  - Auto-scroll as content streams in
 */

export class ResponsePanel {
  constructor(container) {
    this.container = container;
    this._fullText = '';
    this._visible = false;
    this._build();
  }

  _build() {
    this.panel = document.createElement('div');
    this.panel.className = 'godseye-response';
    this.panel.style.cssText = `
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    // Inner content
    this.inner = document.createElement('div');
    this.inner.style.cssText = `
      padding: 0 16px 12px 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
    `;

    // Response text
    this.textEl = document.createElement('div');
    this.textEl.style.cssText = `
      color: #d4d4d8;
      font-size: 14px;
      line-height: 1.6;
      letter-spacing: 0.01em;
      padding-top: 12px;
      max-height: 320px;
      overflow-y: auto;
      word-wrap: break-word;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.1) transparent;
    `;

    // Action bar (copy, TTS, dismiss)
    this.actionBar = document.createElement('div');
    this.actionBar.style.cssText = `
      display: none;
      align-items: center;
      gap: 6px;
      padding-top: 8px;
      border-top: 1px solid rgba(255, 255, 255, 0.04);
      margin-top: 8px;
    `;

    // Copy button
    this.copyBtn = this._createActionButton('Copy', this._copyIcon(), () => {
      navigator.clipboard.writeText(this._fullText);
      this.copyBtn.querySelector('span').textContent = 'Copied!';
      setTimeout(() => {
        this.copyBtn.querySelector('span').textContent = 'Copy';
      }, 1500);
    });

    // TTS button
    this.ttsBtn = this._createActionButton('Read aloud', this._speakerIcon(), () => {
      if ('speechSynthesis' in window) {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
          this.ttsBtn.querySelector('span').textContent = 'Read aloud';
        } else {
          const utterance = new SpeechSynthesisUtterance(this._fullText);
          utterance.rate = 1.0;
          utterance.onend = () => {
            this.ttsBtn.querySelector('span').textContent = 'Read aloud';
          };
          window.speechSynthesis.speak(utterance);
          this.ttsBtn.querySelector('span').textContent = 'Stop';
        }
      }
    });

    this.actionBar.appendChild(this.copyBtn);
    this.actionBar.appendChild(this.ttsBtn);

    // Loading indicator
    this.loadingEl = document.createElement('div');
    this.loadingEl.style.cssText = `
      display: none;
      align-items: center;
      gap: 8px;
      padding: 12px 0;
      color: #71717a;
      font-size: 13px;
    `;
    this.loadingEl.innerHTML = `
      <div style="display:flex;gap:3px;align-items:center;">
        <div class="godseye-dot" style="width:4px;height:4px;border-radius:50%;background:#818cf8;animation:godseye-pulse 1.2s ease-in-out infinite;"></div>
        <div class="godseye-dot" style="width:4px;height:4px;border-radius:50%;background:#818cf8;animation:godseye-pulse 1.2s ease-in-out 0.2s infinite;"></div>
        <div class="godseye-dot" style="width:4px;height:4px;border-radius:50%;background:#818cf8;animation:godseye-pulse 1.2s ease-in-out 0.4s infinite;"></div>
      </div>
      <span>Thinking...</span>
    `;

    this.inner.appendChild(this.loadingEl);
    this.inner.appendChild(this.textEl);
    this.inner.appendChild(this.actionBar);
    this.panel.appendChild(this.inner);
    this.container.appendChild(this.panel);
  }

  _createActionButton(label, icon, onClick) {
    const btn = document.createElement('button');
    btn.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.04);
      color: #a1a1aa;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s ease;
    `;
    btn.innerHTML = `${icon}<span>${label}</span>`;
    btn.addEventListener('click', onClick);
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(255, 255, 255, 0.08)';
      btn.style.color = '#e4e4e7';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'rgba(255, 255, 255, 0.04)';
      btn.style.color = '#a1a1aa';
    });
    return btn;
  }

  // ─── Display Methods ───────────────────────────────────────────

  showLoading() {
    this._show();
    this.loadingEl.style.display = 'flex';
    this.textEl.innerHTML = '';
    this.actionBar.style.display = 'none';
    this._fullText = '';
  }

  /**
   * Append streaming text chunk.
   */
  appendText(delta) {
    this.loadingEl.style.display = 'none';
    this._fullText += delta;
    this.textEl.innerHTML = this._formatText(this._fullText);
    // Auto-scroll to bottom
    this.textEl.scrollTop = this.textEl.scrollHeight;
    this._show();
  }

  /**
   * Show complete response.
   */
  showResponse(text) {
    this.loadingEl.style.display = 'none';
    this._fullText = text;
    this.textEl.innerHTML = this._formatText(text);
    this.actionBar.style.display = 'flex';
    this._show();
  }

  showError(message) {
    this.loadingEl.style.display = 'none';
    this._fullText = '';
    this.textEl.innerHTML = `<div style="color:#ef4444;display:flex;align-items:center;gap:6px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>
      ${this._escapeHtml(message)}
    </div>`;
    this.actionBar.style.display = 'none';
    this._show();
  }

  clear() {
    this._fullText = '';
    this.textEl.innerHTML = '';
    this.loadingEl.style.display = 'none';
    this.actionBar.style.display = 'none';
    this._hide();
  }

  _show() {
    if (this._visible) return;
    this._visible = true;
    this.panel.style.maxHeight = '400px';
  }

  _hide() {
    this._visible = false;
    this.panel.style.maxHeight = '0';
  }

  // ─── Text Formatting ──────────────────────────────────────────

  _formatText(text) {
    let html = this._escapeHtml(text);

    // Inline code: `code`
    html = html.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:4px;font-size:13px;font-family:\'JetBrains Mono\',\'Fira Code\',monospace;">$1</code>');

    // Bold: **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#e4e4e7;font-weight:600;">$1</strong>');

    // Code blocks: ```\ncode\n```
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre style="background:rgba(0,0,0,0.3);padding:10px 12px;border-radius:8px;font-size:13px;font-family:'JetBrains Mono','Fira Code',monospace;overflow-x:auto;margin:8px 0;border:1px solid rgba(255,255,255,0.05);"><code>${code.trim()}</code></pre>`;
    });

    // Bullet lists
    html = html.replace(/^[•\-\*] (.+)$/gm, '<div style="display:flex;gap:6px;padding:2px 0;"><span style="color:#818cf8;">•</span><span>$1</span></div>');

    // Numbered lists
    html = html.replace(/^(\d+)\. (.+)$/gm, '<div style="display:flex;gap:6px;padding:2px 0;"><span style="color:#818cf8;">$1.</span><span>$2</span></div>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ─── Icons ─────────────────────────────────────────────────────

  _copyIcon() {
    return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
  }

  _speakerIcon() {
    return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
  }
}
