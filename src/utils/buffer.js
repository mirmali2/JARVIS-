/**
 * GODSEYE Ring Buffers — ES Module version (works in renderer)
 */

export class RingBuffer {
  constructor(capacity) {
    this.capacity = capacity;
    this.items = [];
    this.head = 0;
  }

  push(item) {
    if (this.items.length < this.capacity) {
      this.items.push(item);
    } else {
      this.items[this.head] = item;
    }
    this.head = (this.head + 1) % this.capacity;
  }

  toArray() {
    if (this.items.length < this.capacity) return [...this.items];
    return [...this.items.slice(this.head), ...this.items.slice(0, this.head)];
  }

  latest() {
    if (this.items.length === 0) return null;
    const idx = (this.head - 1 + this.items.length) % this.items.length;
    return this.items[idx];
  }

  recent(n) {
    return this.toArray().slice(-n).reverse();
  }

  clear() { this.items = []; this.head = 0; }
  get size() { return this.items.length; }
}

export class TimeWindowBuffer {
  constructor(windowMs) {
    this.windowMs = windowMs;
    this.items = [];
  }

  push(data) {
    const now = Date.now();
    this.items.push({ timestamp: now, data });
    this._evict(now);
  }

  _evict(now) {
    const cutoff = now - this.windowMs;
    while (this.items.length > 0 && this.items[0].timestamp < cutoff) {
      this.items.shift();
    }
  }

  getAll() { this._evict(Date.now()); return this.items.map(i => i.data); }

  getRecent(ms) {
    const cutoff = Date.now() - ms;
    return this.items.filter(i => i.timestamp >= cutoff).map(i => i.data);
  }

  latest() {
    this._evict(Date.now());
    return this.items.length > 0 ? this.items[this.items.length - 1].data : null;
  }

  clear() { this.items = []; }
  get size() { this._evict(Date.now()); return this.items.length; }
}
