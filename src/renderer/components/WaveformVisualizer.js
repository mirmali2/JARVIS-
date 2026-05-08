/**
 * GODSEYE — Waveform Visualizer
 *
 * Real-time audio waveform display for the microphone.
 * Uses Web Audio AnalyserNode to draw frequency bars.
 * Minimal and elegant — just a few animated bars.
 */

export class WaveformVisualizer {
  constructor(container, options = {}) {
    this.container = container;
    this.barCount = options.barCount ?? 5;
    this.color = options.color ?? '#818cf8';
    this._analyser = null;
    this._animFrameId = null;
    this._bars = [];

    this._build();
  }

  _build() {
    this.wrapper = document.createElement('div');
    this.wrapper.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 2px;
      height: 24px;
    `;

    for (let i = 0; i < this.barCount; i++) {
      const bar = document.createElement('div');
      bar.style.cssText = `
        width: 3px;
        height: 4px;
        border-radius: 2px;
        background: ${this.color};
        transition: height 0.05s ease;
        min-height: 4px;
      `;
      this._bars.push(bar);
      this.wrapper.appendChild(bar);
    }

    this.container.appendChild(this.wrapper);
  }

  /**
   * Start visualizing from a Web Audio AnalyserNode.
   */
  start(analyser) {
    this._analyser = analyser;
    if (!analyser) return;
    this._draw();
  }

  stop() {
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
    // Reset bars to idle
    this._bars.forEach((bar) => {
      bar.style.height = '4px';
    });
  }

  _draw() {
    if (!this._analyser) return;

    this._animFrameId = requestAnimationFrame(() => this._draw());

    const dataArray = new Uint8Array(this._analyser.frequencyBinCount);
    this._analyser.getByteFrequencyData(dataArray);

    // Sample evenly across the frequency spectrum
    const step = Math.floor(dataArray.length / this.barCount);

    for (let i = 0; i < this.barCount; i++) {
      const value = dataArray[i * step] / 255;
      const height = Math.max(4, value * 20);
      this._bars[i].style.height = `${height}px`;
    }
  }

  destroy() {
    this.stop();
    this.wrapper.remove();
  }
}
