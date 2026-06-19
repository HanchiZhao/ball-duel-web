export class Vec2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  clone() { return new Vec2(this.x, this.y); }
  set(x, y) { this.x = x; this.y = y; return this; }
  add(v) { this.x += v.x; this.y += v.y; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; return this; }
  scale(s) { this.x *= s; this.y *= s; return this; }
  lengthSq() { return this.x * this.x + this.y * this.y; }
  length() { return Math.hypot(this.x, this.y); }
  dot(v) { return this.x * v.x + this.y * v.y; }
  normalize() {
    const len = this.length();
    if (len <= 1e-9) return randomUnitVector();
    this.x /= len;
    this.y /= len;
    return this;
  }
  rotated(rad) {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return new Vec2(this.x * c - this.y * s, this.x * s + this.y * c);
  }
  perp() { return new Vec2(-this.y, this.x); }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y); }
  lerp(v, t) { return new Vec2(this.x + (v.x - this.x) * t, this.y + (v.y - this.y) * t); }

  static add(a, b) { return new Vec2(a.x + b.x, a.y + b.y); }
  static sub(a, b) { return new Vec2(a.x - b.x, a.y - b.y); }
  static scale(v, s) { return new Vec2(v.x * s, v.y * s); }
}

export function randomUnitVector() {
  const a = Math.random() * Math.PI * 2;
  return new Vec2(Math.cos(a), Math.sin(a));
}

export function safeNormalize(v) {
  const copy = v.clone ? v.clone() : new Vec2(v.x, v.y);
  return copy.normalize();
}
