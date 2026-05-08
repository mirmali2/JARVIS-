/**
 * GODSEYE — Gaze Indicator (Debug Overlay)
 *
 * Shows a translucent dot on screen where the system estimates
 * the user is looking. Used for debugging/calibration.
 * Hidden by default — toggled via settings.
 */

export class GazeIndicator {
  constructor(container) {
    this.container = container;
    this._visible = false;

    this.dot = document.createElement('div');
    this.dot.style.cssText = `
      position: fixed;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: rgba(129, 140, 248, 0.35);
      border: 2px solid rgba(129, 140, 248, 0.6);
      transform: translate(-50%, -50%);
      pointer-events: none;
      z-index: 9999990;
      transition: left 0.06s linear, top 0.06s linear;
      display: none;
    `;

    // Trail effect — shows recent gaze path
    this._trail = [];
    for (let i = 0; i < 5; i++) {
      const trailDot = document.createElement('div');
      const opacity = 0.15 - i * 0.025;
      const size = 14 - i * 2;
      trailDot.style.cssText = `
        position: fixed;
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background: rgba(129, 140, 248, ${opacity});
        transform: translate(-50%, -50%);
        pointer-events: none;
        z-index: 9999989;
        display: none;
      `;
      this._trail.push(trailDot);
      this.container.appendChild(trailDot);
    }

    this.container.appendChild(this.dot);
  }

  show() {
    this._visible = true;
    this.dot.style.display = 'block';
    this._trail.forEach((d) => (d.style.display = 'block'));
  }

  hide() {
    this._visible = false;
    this.dot.style.display = 'none';
    this._trail.forEach((d) => (d.style.display = 'none'));
  }

  update(x, y) {
    if (!this._visible) return;

    // Shift trail positions
    for (let i = this._trail.length - 1; i > 0; i--) {
      this._trail[i].style.left = this._trail[i - 1].style.left;
      this._trail[i].style.top = this._trail[i - 1].style.top;
    }
    if (this._trail.length > 0) {
      this._trail[0].style.left = this.dot.style.left;
      this._trail[0].style.top = this.dot.style.top;
    }

    this.dot.style.left = `${x}px`;
    this.dot.style.top = `${y}px`;
  }
}
