import { COLORS } from './config.js';

export class FloatingText {
  constructor(pos, text, kind = 'damage') {
    this.x = pos.x;
    this.y = pos.y;
    this.text = text;
    this.kind = kind;
    this.age = 0;
    this.life = 0.75;
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
