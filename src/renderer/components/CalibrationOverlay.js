/**
 * GODSEYE — Calibration Overlay
 *
 * Full-screen overlay for the gaze calibration procedure.
 * Shows target dots one at a time that the user must look at.
 * Collects gaze samples at each point to build the mapping.
 *
 * Flow:
 *  1. Show instruction text
 *  2. Display target dot at position
 *  3. Wait for the user to fixate (animate a shrinking circle)
 *  4. Collect gaze samples for 1.5 seconds
 *  5. Move to next point
 *  6. After all points, compute calibration and dismiss
 */

export class CalibrationOverlay {
  constructor(container, options = {}) {
    this.container = container;
    this.pointCount = options.pointCount ?? 9;
    this.collectDuration = options.collectDuration ?? 1500; // ms per point
    this.onSampleCollect = options.onSampleCollect ?? (() => {});
    this.onComplete = options.onComplete ?? (() => {});
    this.onCancel = options.onCancel ?? (() => {});

    this._targets = [];
    this._currentIndex = 0;
    this._collecting = false;
    this._overlay = null;
  }

  /**
   * Start the calibration procedure.
   * @param {{ x: number, y: number }[]} targets - Screen positions to calibrate
   */
  start(targets) {
    this._targets = targets;
    this._currentIndex = 0;
    this._build();
    this._showNextTarget();
  }

  _build() {
    this._overlay = document.createElement('div');
    this._overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.92);
      z-index: 9999999;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-family: 'Inter', sans-serif;
      pointer-events: auto;
    `;

    // Instruction text
    this._instruction = document.createElement('div');
    this._instruction.style.cssText = `
      position: absolute;
      top: 40px;
      color: #a1a1aa;
      font-size: 16px;
      text-align: center;
      max-width: 500px;
      line-height: 1.5;
    `;
    this._instruction.textContent = 'Look at each dot as it appears and hold your gaze until it disappears.';

    // Progress
    this._progress = document.createElement('div');
    this._progress.style.cssText = `
      position: absolute;
      bottom: 40px;
      color: #71717a;
      font-size: 14px;
    `;

    // Cancel button
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel (Esc)';
    cancelBtn.style.cssText = `
      position: absolute;
      top: 20px;
      right: 20px;
      padding: 6px 16px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(255, 255, 255, 0.05);
      color: #a1a1aa;
      font-size: 13px;
      cursor: pointer;
    `;
    cancelBtn.addEventListener('click', () => this.cancel());

    // Target dot
    this._dot = document.createElement('div');
    this._dot.style.cssText = `
      position: absolute;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: #818cf8;
      transform: translate(-50%, -50%);
      transition: left 0.3s ease, top 0.3s ease, width 0.3s ease, height 0.3s ease;
      box-shadow: 0 0 20px rgba(129, 140, 248, 0.4);
    `;

    // Inner dot (shows progress via shrinking ring)
    this._ring = document.createElement('div');
    this._ring.style.cssText = `
      position: absolute;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: 2px solid rgba(129, 140, 248, 0.3);
      transform: translate(-50%, -50%);
      transition: left 0.3s ease, top 0.3s ease;
    `;

    this._overlay.appendChild(this._instruction);
    this._overlay.appendChild(this._progress);
    this._overlay.appendChild(cancelBtn);
    this._overlay.appendChild(this._ring);
    this._overlay.appendChild(this._dot);

    // Keyboard handler
    this._keyHandler = (e) => {
      if (e.key === 'Escape') this.cancel();
    };
    document.addEventListener('keydown', this._keyHandler);

    this.container.appendChild(this._overlay);
  }

  _showNextTarget() {
    if (this._currentIndex >= this._targets.length) {
      this._complete();
      return;
    }

    const target = this._targets[this._currentIndex];
    this._progress.textContent = `${this._currentIndex + 1} / ${this._targets.length}`;

    // Move dot to target position
    this._dot.style.left = `${target.x}px`;
    this._dot.style.top = `${target.y}px`;
    this._ring.style.left = `${target.x}px`;
    this._ring.style.top = `${target.y}px`;

    // Start collecting after a short delay (let the user find the dot)
    setTimeout(() => {
      this._startCollecting(target);
    }, 500);
  }

  _startCollecting(target) {
    this._collecting = true;

    // Animate the ring shrinking (visual feedback that collection is happening)
    this._ring.style.width = '40px';
    this._ring.style.height = '40px';
    this._ring.style.transition = `width ${this.collectDuration}ms linear, height ${this.collectDuration}ms linear, left 0.3s ease, top 0.3s ease`;
    requestAnimationFrame(() => {
      this._ring.style.width = '12px';
      this._ring.style.height = '12px';
    });

    // Collect samples for the duration
    setTimeout(() => {
      this._collecting = false;
      this.onSampleCollect({
        targetIndex: this._currentIndex,
        screenPoint: target,
      });

      this._currentIndex++;
      this._showNextTarget();
    }, this.collectDuration);
  }

  _complete() {
    this._destroy();
    this.onComplete();
  }

  cancel() {
    this._destroy();
    this.onCancel();
  }

  _destroy() {
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
    document.removeEventListener('keydown', this._keyHandler);
  }

  get isCollecting() {
    return this._collecting;
  }
}
