/**
 * GODSEYE — OCR Engine
 *
 * Extracts text from screen capture images using Tesseract.js.
 * Runs entirely on-device in a Web Worker — no cloud OCR.
 *
 * Features:
 *  - Region-based OCR (only processes the area around the gaze point)
 *  - Line/paragraph detection with bounding boxes
 *  - Confidence scoring per word
 *  - Sensitive content detection (credit cards, passwords, etc.)
 *  - Caching to avoid re-OCRing static screen content
 */

import Tesseract from 'tesseract.js';

const SENSITIVE_PATTERNS = [
  /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/, // Credit card
  /\b\d{3}-\d{2}-\d{4}\b/, // SSN
  /password\s*[:=]\s*\S+/i, // Password fields
  /secret\s*[:=]\s*\S+/i, // Secret keys
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/i, // Bearer tokens
  /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/, // Private keys
];

export class OcrEngine {
  constructor(options = {}) {
    this.language = options.language ?? 'eng';
    this.confidenceThreshold = options.confidenceThreshold ?? 60;
    this.sensitiveContentFilter = options.sensitiveContentFilter ?? true;

    this._worker = null;
    this._ready = false;
    this._cache = new Map(); // hash → { text, lines, timestamp }
    this._cacheMaxAge = 5000; // ms
    this._cacheMaxSize = 20;
  }

  async init() {
    if (this._ready) return;

    this._worker = await Tesseract.createWorker(this.language, 1, {
      // Use CDN-hosted Tesseract WASM + trained data for zero setup
      workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core-simd-lstm.wasm.js',
    });

    this._ready = true;
  }

  /**
   * Extract text from an image.
   * @param {string} imageDataUrl - Base64 data URL of the image
   * @param {object} options
   * @param {boolean} options.withLayout - Include line/paragraph structure
   * @returns {Promise<OcrResult>}
   */
  async recognize(imageDataUrl, options = {}) {
    if (!this._ready) await this.init();

    // Check cache
    const cacheKey = this._hashImage(imageDataUrl);
    const cached = this._cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this._cacheMaxAge) {
      return cached.result;
    }

    const { data } = await this._worker.recognize(imageDataUrl);

    const result = {
      text: data.text.trim(),
      confidence: data.confidence,
      lines: data.lines.map((line) => ({
        text: line.text.trim(),
        confidence: line.confidence,
        bbox: line.bbox, // { x0, y0, x1, y1 }
        words: line.words.map((word) => ({
          text: word.text,
          confidence: word.confidence,
          bbox: word.bbox,
        })),
      })),
      paragraphs: data.paragraphs.map((para) => ({
        text: para.text.trim(),
        confidence: para.confidence,
        bbox: para.bbox,
      })),
      hasSensitiveContent: false,
    };

    // Filter sensitive content
    if (this.sensitiveContentFilter) {
      result.hasSensitiveContent = this._detectSensitive(result.text);
      if (result.hasSensitiveContent) {
        result.text = this._redactSensitive(result.text);
        result.lines = result.lines.map((line) => ({
          ...line,
          text: this._redactSensitive(line.text),
        }));
      }
    }

    // Filter low-confidence lines
    result.lines = result.lines.filter(
      (line) => line.confidence >= this.confidenceThreshold
    );

    // Cache result
    this._cacheResult(cacheKey, result);

    return result;
  }

  /**
   * Find the text at a specific point within the OCR result.
   * Returns the word, line, and paragraph containing the point.
   */
  getTextAtPoint(ocrResult, x, y, capturedBounds) {
    // Adjust coordinates relative to the captured image region
    const relX = x - (capturedBounds?.x ?? 0);
    const relY = y - (capturedBounds?.y ?? 0);

    let matchedWord = null;
    let matchedLine = null;
    let matchedParagraph = null;

    for (const line of ocrResult.lines) {
      if (this._pointInBbox(relX, relY, line.bbox)) {
        matchedLine = line;
        for (const word of line.words) {
          if (this._pointInBbox(relX, relY, word.bbox)) {
            matchedWord = word;
            break;
          }
        }
        break;
      }
    }

    for (const para of ocrResult.paragraphs) {
      if (this._pointInBbox(relX, relY, para.bbox)) {
        matchedParagraph = para;
        break;
      }
    }

    return {
      word: matchedWord?.text ?? null,
      line: matchedLine?.text ?? null,
      paragraph: matchedParagraph?.text ?? null,
      // Also include surrounding lines for more context
      surroundingLines: this._getSurroundingLines(ocrResult, matchedLine, 2),
    };
  }

  _pointInBbox(x, y, bbox) {
    if (!bbox) return false;
    return x >= bbox.x0 && x <= bbox.x1 && y >= bbox.y0 && y <= bbox.y1;
  }

  _getSurroundingLines(ocrResult, targetLine, radius) {
    if (!targetLine) return [];
    const idx = ocrResult.lines.indexOf(targetLine);
    if (idx === -1) return [];
    const start = Math.max(0, idx - radius);
    const end = Math.min(ocrResult.lines.length, idx + radius + 1);
    return ocrResult.lines.slice(start, end).map((l) => l.text);
  }

  _detectSensitive(text) {
    return SENSITIVE_PATTERNS.some((pattern) => pattern.test(text));
  }

  _redactSensitive(text) {
    let redacted = text;
    for (const pattern of SENSITIVE_PATTERNS) {
      redacted = redacted.replace(pattern, '[REDACTED]');
    }
    return redacted;
  }

  _hashImage(dataUrl) {
    // Simple fast hash of the data URL (first + last 200 chars + length)
    const s = dataUrl;
    return `${s.length}_${s.slice(0, 200)}_${s.slice(-200)}`;
  }

  _cacheResult(key, result) {
    // Evict old entries
    if (this._cache.size >= this._cacheMaxSize) {
      const oldest = this._cache.keys().next().value;
      this._cache.delete(oldest);
    }
    this._cache.set(key, { result, timestamp: Date.now() });
  }

  async destroy() {
    if (this._worker) {
      await this._worker.terminate();
      this._worker = null;
      this._ready = false;
    }
    this._cache.clear();
  }
}
