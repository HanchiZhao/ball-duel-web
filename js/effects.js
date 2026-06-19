import { COLORS } from './config.js';

export class FloatingText {
  constructor(pos, text, kind = 'damage') {
    this.x = pos.x;
    this.y = pos.y;
    this.text = text;
    this.kind = kind;
    this.age = 0;
    this.life = kind === 'heal' ? 0.82 : 0.75;
    this.vx = (Math.random() - 0.5) * 26;
    this.vy = kind === 'heal' ? -70 : -62;
  }

  update(dt) {
    this.age += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += 36 * dt;
    return this.age < this.life;
  }

  draw(ctx) {
    const t = this.age / this.life;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,.65)';
    ctx.fillStyle = this.kind === 'heal' ? COLORS.heal : COLORS.damage;
    ctx.strokeText(this.text, this.x, this.y);
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
}

export class PulseRingEffect {
  constructor(pos, options = {}) {
    this.x = pos.x;
    this.y = pos.y;
    this.age = 0;
    this.life = options.life ?? 0.42;
    this.startRadius = options.startRadius ?? 12;
    this.endRadius = options.endRadius ?? 42;
    this.color = options.color ?? COLORS.white;
    this.lineWidth = options.lineWidth ?? 3;
    this.dash = options.dash ?? null;
  }

  update(dt) {
    this.age += dt;
    return this.age < this.life;
  }

  draw(ctx) {
    const t = Math.min(1, this.age / this.life);
    const r = this.startRadius + (this.endRadius - this.startRadius) * easeOutCubic(t);
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.75;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.lineWidth * (1 - t * 0.45);
    if (this.dash) ctx.setLineDash(this.dash);
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

export class ParticleBurstEffect {
  constructor(pos, options = {}) {
    this.age = 0;
    this.life = options.life ?? 0.58;
    this.gravity = options.gravity ?? 120;
    this.particles = [];
    const colors = options.colors ?? [COLORS.damage, COLORS.orange, COLORS.yellow];
    const count = options.count ?? 12;
    const speedMin = options.speedMin ?? 60;
    const speedMax = options.speedMax ?? 170;
    const sizeMin = options.sizeMin ?? 2;
    const sizeMax = options.sizeMax ?? 5;
    const shape = options.shape ?? 'spark';
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speedMin + Math.random() * (speedMax - speedMin);
      this.particles.push({
        x: pos.x,
        y: pos.y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 18,
        size: sizeMin + Math.random() * (sizeMax - sizeMin),
        color: colors[i % colors.length],
        spin: Math.random() * Math.PI,
        spinSpeed: (Math.random() - 0.5) * 10,
        shape,
      });
    }
  }

  update(dt) {
    this.age += dt;
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += this.gravity * dt;
      p.spin += p.spinSpeed * dt;
    }
    return this.age < this.life;
  }

  draw(ctx) {
    const t = Math.min(1, this.age / this.life);
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.86;
    for (const p of this.particles) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = 'rgba(0,0,0,.35)';
      ctx.lineWidth = 1;
      if (p.shape === 'plus') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(2, p.size * 0.45);
        ctx.beginPath();
        ctx.moveTo(-p.size, 0); ctx.lineTo(p.size, 0);
        ctx.moveTo(0, -p.size); ctx.lineTo(0, p.size);
        ctx.stroke();
      } else if (p.shape === 'paper') {
        ctx.fillRect(-p.size * 1.2, -p.size * 0.8, p.size * 2.4, p.size * 1.6);
        ctx.strokeRect(-p.size * 1.2, -p.size * 0.8, p.size * 2.4, p.size * 1.6);
      } else {
        ctx.beginPath();
        ctx.moveTo(p.size, 0);
        ctx.lineTo(-p.size * 0.55, p.size * 0.7);
        ctx.lineTo(-p.size * 0.25, -p.size * 0.65);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }
}

export class PlusSparkEffect {
  constructor(pos, options = {}) {
    this.age = 0;
    this.life = options.life ?? 0.72;
    this.items = [];
    const count = options.count ?? 7;
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.15;
      const s = 45 + Math.random() * 80;
      this.items.push({
        x: pos.x + (Math.random() - 0.5) * 18,
        y: pos.y + (Math.random() - 0.5) * 18,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        size: 5 + Math.random() * 4,
        spin: Math.random() * Math.PI,
        color: options.color ?? COLORS.heal,
      });
    }
  }

  update(dt) {
    this.age += dt;
    for (const item of this.items) {
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      item.vy += 42 * dt;
      item.spin += 3.2 * dt;
    }
    return this.age < this.life;
  }

  draw(ctx) {
    const t = Math.min(1, this.age / this.life);
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.82;
    for (const item of this.items) {
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate(item.spin);
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-item.size, 0); ctx.lineTo(item.size, 0);
      ctx.moveTo(0, -item.size); ctx.lineTo(0, item.size);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
}

export class WallSparkEffect {
  constructor(pos, wall, color = COLORS.cyan) {
    this.age = 0;
    this.life = 0.34;
    this.wall = wall;
    this.color = color;
    this.particles = [];
    const inward = wall === 'left' ? [1, 0] : wall === 'right' ? [-1, 0] : wall === 'top' ? [0, 1] : [0, -1];
    const baseAngle = Math.atan2(inward[1], inward[0]);
    for (let i = 0; i < 8; i++) {
      const a = baseAngle + (Math.random() - 0.5) * 1.25;
      const s = 70 + Math.random() * 125;
      this.particles.push({ x: pos.x, y: pos.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, size: 2 + Math.random() * 3 });
    }
  }
  update(dt) {
    this.age += dt;
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.98; p.vy *= 0.98; }
    return this.age < this.life;
  }
  draw(ctx) {
    const t = this.age / this.life;
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.68;
    ctx.fillStyle = this.color;
    for (const p of this.particles) {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - t * 0.3), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
