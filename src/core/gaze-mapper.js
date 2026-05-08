/**
 * GODSEYE — Gaze-to-Screen Mapper
 *
 * Converts normalized iris-position gaze data (0–1) from the GazeTracker
 * into actual screen pixel coordinates, then identifies which screen
 * region/element the user is looking at.
 *
 * Pipeline:
 *  1. Calibration: user looks at known screen points → build mapping matrix
 *  2. Projection: transform raw gaze → screen coordinates via affine/polynomial mapping
 *  3. Fixation detection: identify when gaze dwells on a point (not saccading)
 *  4. Region snapping: cluster nearby gaze points into logical screen regions
 *
 * Calibration uses a simple 9-point or 5-point procedure.
 * The mapping uses polynomial regression for accuracy.
 */

import { TimeWindowBuffer } from '../utils/buffer.js';

export class GazeMapper {
  constructor(options = {}) {
    this.screenWidth = options.screenWidth ?? window.screen.width;
    this.screenHeight = options.screenHeight ?? window.screen.height;
    this.snapRadius = options.snapRadius ?? 60;
    this.fixationThresholdMs = options.fixationThresholdMs ?? 300;
    this.historySeconds = options.historySeconds ?? 10;

    // Calibration data: pairs of { gaze: {x,y}, screen: {x,y} }
    this._calibrationPoints = options.calibrationPoints ?? [];
    this._mappingCoeffs = null; // Computed after calibration

    // Fixation tracking
    this._gazeHistory = new TimeWindowBuffer(this.historySeconds * 1000);
    this._currentFixation = null; // { x, y, startTime, samples }
    this._fixationCallback = options.onFixation ?? (() => {});
    this._gazePointCallback = options.onGazePoint ?? (() => {});

    // If we have stored calibration, rebuild the mapping
    if (this._calibrationPoints.length >= 4) {
      this._computeMapping();
    }
  }

  // ─── Calibration ──────────────────────────────────────────────

  /**
   * Generate calibration target positions (screen coordinates).
   * Returns array of {x, y} for a 9-point grid.
   */
  getCalibrationTargets(pointCount = 9) {
    const margin = 0.1;
    const targets = [];

    if (pointCount === 5) {
      // Center + 4 corners
      targets.push(
        { x: this.screenWidth * 0.5, y: this.screenHeight * 0.5 },
        { x: this.screenWidth * margin, y: this.screenHeight * margin },
        { x: this.screenWidth * (1 - margin), y: this.screenHeight * margin },
        { x: this.screenWidth * margin, y: this.screenHeight * (1 - margin) },
        { x: this.screenWidth * (1 - margin), y: this.screenHeight * (1 - margin) },
      );
    } else {
      // 9-point grid (3x3)
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          targets.push({
            x: this.screenWidth * (margin + col * (1 - 2 * margin) / 2),
            y: this.screenHeight * (margin + row * (1 - 2 * margin) / 2),
          });
        }
      }
    }
    return targets;
  }

  /**
   * Record a calibration sample: the user is looking at screenPoint
   * and the raw gaze data is gazePoint.
   */
  addCalibrationSample(gazePoint, screenPoint) {
    this._calibrationPoints.push({
      gaze: { x: gazePoint.smoothX, y: gazePoint.smoothY },
      screen: { x: screenPoint.x, y: screenPoint.y },
    });
  }

  /**
   * Finalize calibration: compute the mapping from gaze → screen.
   * Uses 2nd-order polynomial regression for each axis independently.
   *
   * screenX = a0 + a1*gx + a2*gy + a3*gx*gy + a4*gx² + a5*gy²
   * screenY = b0 + b1*gx + b2*gy + b3*gx*gy + b4*gx² + b5*gy²
   */
  finishCalibration() {
    if (this._calibrationPoints.length < 4) {
      throw new Error('Need at least 4 calibration points');
    }
    this._computeMapping();
    return this._calibrationPoints;
  }

  _computeMapping() {
    const points = this._calibrationPoints;
    const n = points.length;

    // Build design matrix [1, gx, gy, gx*gy, gx², gy²]
    const X = points.map((p) => {
      const gx = p.gaze.x;
      const gy = p.gaze.y;
      return [1, gx, gy, gx * gy, gx * gx, gy * gy];
    });

    const Yx = points.map((p) => p.screen.x);
    const Yy = points.map((p) => p.screen.y);

    // Solve via normal equations: coeffs = (X'X)^(-1) X'Y
    this._mappingCoeffs = {
      x: this._leastSquares(X, Yx),
      y: this._leastSquares(X, Yy),
    };
  }

  /** Simple least squares solver for small matrices. */
  _leastSquares(X, Y) {
    const nCols = X[0].length;
    const nRows = X.length;

    // X'X
    const XtX = Array.from({ length: nCols }, () => new Float64Array(nCols));
    for (let i = 0; i < nCols; i++) {
      for (let j = 0; j < nCols; j++) {
        let sum = 0;
        for (let k = 0; k < nRows; k++) sum += X[k][i] * X[k][j];
        XtX[i][j] = sum;
      }
    }

    // X'Y
    const XtY = new Float64Array(nCols);
    for (let i = 0; i < nCols; i++) {
      let sum = 0;
      for (let k = 0; k < nRows; k++) sum += X[k][i] * Y[k];
      XtY[i] = sum;
    }

    // Solve via Gaussian elimination
    return this._gaussianElimination(XtX, XtY);
  }

  _gaussianElimination(A, b) {
    const n = b.length;
    const augmented = A.map((row, i) => [...row, b[i]]);

    for (let col = 0; col < n; col++) {
      // Partial pivoting
      let maxRow = col;
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(augmented[row][col]) > Math.abs(augmented[maxRow][col])) {
          maxRow = row;
        }
      }
      [augmented[col], augmented[maxRow]] = [augmented[maxRow], augmented[col]];

      const pivot = augmented[col][col];
      if (Math.abs(pivot) < 1e-10) continue; // Skip singular

      for (let row = col + 1; row < n; row++) {
        const factor = augmented[row][col] / pivot;
        for (let j = col; j <= n; j++) {
          augmented[row][j] -= factor * augmented[col][j];
        }
      }
    }

    // Back substitution
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
      x[i] = augmented[i][n];
      for (let j = i + 1; j < n; j++) {
        x[i] -= augmented[i][j] * x[j];
      }
      x[i] /= augmented[i][i] || 1;
    }
    return Array.from(x);
  }

  // ─── Projection ────────────────────────────────────────────────

  /**
   * Convert raw gaze coordinates to screen pixel coordinates.
   * Falls back to simple linear interpolation if not calibrated.
   */
  gazeToScreen(gazeData) {
    let screenX, screenY;

    if (this._mappingCoeffs) {
      const gx = gazeData.smoothX;
      const gy = gazeData.smoothY;
      const features = [1, gx, gy, gx * gy, gx * gx, gy * gy];

      screenX = this._mappingCoeffs.x.reduce((sum, c, i) => sum + c * features[i], 0);
      screenY = this._mappingCoeffs.y.reduce((sum, c, i) => sum + c * features[i], 0);
    } else {
      // Fallback: simple linear mapping (less accurate but works without calibration)
      // Iris position ~0.3–0.7 maps to screen edges
      screenX = this._linearMap(gazeData.smoothX, 0.3, 0.7, 0, this.screenWidth);
      screenY = this._linearMap(gazeData.smoothY, 0.35, 0.65, 0, this.screenHeight);
    }

    // Clamp to screen bounds
    screenX = Math.max(0, Math.min(this.screenWidth, screenX));
    screenY = Math.max(0, Math.min(this.screenHeight, screenY));

    const point = {
      x: Math.round(screenX),
      y: Math.round(screenY),
      confidence: gazeData.confidence,
      timestamp: gazeData.timestamp,
    };

    this._gazeHistory.push(point);
    this._updateFixation(point);
    this._gazePointCallback(point);

    return point;
  }

  _linearMap(value, inMin, inMax, outMin, outMax) {
    const clamped = Math.max(inMin, Math.min(inMax, value));
    return outMin + ((clamped - inMin) / (inMax - inMin)) * (outMax - outMin);
  }

  // ─── Fixation Detection ────────────────────────────────────────

  _updateFixation(point) {
    if (!this._currentFixation) {
      this._currentFixation = {
        x: point.x,
        y: point.y,
        startTime: point.timestamp,
        samples: [point],
      };
      return;
    }

    const dist = Math.hypot(
      point.x - this._currentFixation.x,
      point.y - this._currentFixation.y
    );

    if (dist <= this.snapRadius) {
      // Still within the same fixation region
      this._currentFixation.samples.push(point);
      // Update centroid as running average
      const n = this._currentFixation.samples.length;
      this._currentFixation.x =
        this._currentFixation.x * ((n - 1) / n) + point.x / n;
      this._currentFixation.y =
        this._currentFixation.y * ((n - 1) / n) + point.y / n;

      const duration = point.timestamp - this._currentFixation.startTime;
      if (duration >= this.fixationThresholdMs) {
        this._fixationCallback({
          x: Math.round(this._currentFixation.x),
          y: Math.round(this._currentFixation.y),
          duration,
          confidence: point.confidence,
        });
      }
    } else {
      // New fixation region
      this._currentFixation = {
        x: point.x,
        y: point.y,
        startTime: point.timestamp,
        samples: [point],
      };
    }
  }

  // ─── Region Query ──────────────────────────────────────────────

  /**
   * Get the primary fixation point from the last N seconds.
   * Returns the longest-held fixation region.
   */
  getPrimaryFocus(lastMs = 3000) {
    const recentPoints = this._gazeHistory.getRecent(lastMs);
    if (recentPoints.length === 0) return null;

    // Cluster points by proximity
    const clusters = this._clusterPoints(recentPoints, this.snapRadius);

    // Return the cluster with the most points (most attended region)
    let largest = clusters[0];
    for (const cluster of clusters) {
      if (cluster.points.length > largest.points.length) {
        largest = cluster;
      }
    }

    return {
      x: Math.round(largest.centroid.x),
      y: Math.round(largest.centroid.y),
      attention: largest.points.length / recentPoints.length,
      duration: largest.points.length > 1
        ? largest.points[largest.points.length - 1].timestamp - largest.points[0].timestamp
        : 0,
    };
  }

  /**
   * Get all recent fixation regions, ranked by attention time.
   */
  getAttentionMap(lastMs = 5000) {
    const recentPoints = this._gazeHistory.getRecent(lastMs);
    if (recentPoints.length === 0) return [];

    const clusters = this._clusterPoints(recentPoints, this.snapRadius);
    return clusters
      .map((c) => ({
        x: Math.round(c.centroid.x),
        y: Math.round(c.centroid.y),
        attention: c.points.length / recentPoints.length,
        samples: c.points.length,
      }))
      .sort((a, b) => b.attention - a.attention);
  }

  /** Simple greedy clustering. */
  _clusterPoints(points, radius) {
    const clusters = [];
    const assigned = new Set();

    for (let i = 0; i < points.length; i++) {
      if (assigned.has(i)) continue;

      const cluster = { centroid: { x: points[i].x, y: points[i].y }, points: [points[i]] };
      assigned.add(i);

      for (let j = i + 1; j < points.length; j++) {
        if (assigned.has(j)) continue;
        const dist = Math.hypot(
          points[j].x - cluster.centroid.x,
          points[j].y - cluster.centroid.y
        );
        if (dist <= radius) {
          cluster.points.push(points[j]);
          assigned.add(j);
          // Update centroid
          const n = cluster.points.length;
          cluster.centroid.x =
            cluster.centroid.x * ((n - 1) / n) + points[j].x / n;
          cluster.centroid.y =
            cluster.centroid.y * ((n - 1) / n) + points[j].y / n;
        }
      }

      clusters.push(cluster);
    }

    return clusters;
  }

  get isCalibrated() {
    return this._mappingCoeffs !== null;
  }

  clearHistory() {
    this._gazeHistory.clear();
    this._currentFixation = null;
  }
}
