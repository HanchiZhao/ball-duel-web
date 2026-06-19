import { BALL_RADIUS, BALL_SPEED, COLORS } from './config.js';
import { Vec2, randomUnitVector, safeNormalize } from './vector.js';
import { clamp, jitterWallBounceVelocity } from './utils.js';

let NEXT_UID = 1;

export class Ball {
  constructor(role, pos, label, teamId = null) {
    this.uid = NEXT_UID++;
    this.role = role;
    this.label = label;
    this.teamId = teamId;
    this.pos = pos.clone();
    this.radius = role.radius ?? BALL_RADIUS;
    this.baseSpeed = role.speed ?? BALL_SPEED;
    this.hp = role.hp;
    this.maxHp = role.hp;
    this.color = role.color;
    this.vel = randomUnitVector().scale(this.baseSpeed);
    this.skill = role.createSkill();
    this.lastBodyDamageTimes = new Map();
    this.externalForceUntil = 0;
    this.heldBy = null;
    this.stunUntil = 0;
    this.slowEffects = [];
    this.dotEffects = [];
    this.stuckPapers = [];
    this.throwWallDamageUntil = 0;
    this.throwWallDamage = 0;
    this.nextThrowWallDamage = 0;
    this.lastMatchTime = 0;
  }

  currentSpeed(matchTime) {
    let mult = 1;
    for (const slow of this.slowEffects) {
      if (matchTime <= slow.end) mult *= slow.multiplier;
    }
    mult *= Math.max(0.05, 1 - (this.flowerbedSlow || 0));
    mult *= this.skill.speedMultiplier(this, matchTime);
    return this.baseSpeed * mult;
  }

  addSlow(multiplier, duration, matchTime) {
    this.slowEffects.push({ multiplier, end: matchTime + duration });
  }

  addStun(duration, matchTime) {
    this.stunUntil = Math.max(this.stunUntil, matchTime + duration);
  }

  addDot(damage, interval, duration, matchTime, sourceName = 'dot') {
    this.dotEffects.push({ damage, interval, end: matchTime + duration, next: matchTime + interval, sourceName });
  }

  addStuckPaper(duration, matchTime, incomingDirection) {
    const dir = safeNormalize(incomingDirection);
    const angle = Math.atan2(dir.y, dir.x);
    const side = Vec2.scale(dir, -this.radius * 0.28);
    this.stuckPapers.push({
      end: matchTime + duration,
      angle,
      offsetX: side.x + (Math.random() - 0.5) * this.radius * 0.45,
      offsetY: side.y + (Math.random() - 0.5) * this.radius * 0.45,
      spin: (Math.random() - 0.5) * 0.45
    });
  }

  takeDamage(amount, game, source = null, matchTime = this.lastMatchTime) {
    if (this.hp <= 0 || amount <= 0) return 0;
    const actual = Math.max(0, this.skill.modifyIncomingDamage(this, amount, source, game, matchTime));
    if (actual <= 0) return 0;
    const wasAlive = this.hp > 0;
    this.hp = Math.max(0, this.hp - actual);
    game?.addFloatingText(this.pos, `-${Math.round(actual)}`, 'damage');
    this.skill.onDamageTaken(this, actual, source, game, matchTime);
    if (wasAlive && this.hp <= 0) this.skill.onDeath(this, game, matchTime);
    return actual;
  }

  heal(amount, game) {
    if (this.hp <= 0 || amount <= 0) return 0;
    this.hp += amount;
    game?.addFloatingText(this.pos, `+${Math.round(amount)}`, 'heal');
    return amount;
  }

  update(game, dt, matchTime) {
    this.lastMatchTime = matchTime;
    this.slowEffects = this.slowEffects.filter(s => matchTime <= s.end);
    this.stuckPapers = this.stuckPapers.filter(p => matchTime <= p.end);
    this.dotEffects = this.dotEffects.filter(dot => {
      while (matchTime >= dot.next && dot.next <= dot.end && this.hp > 0) {
        dot.next += dot.interval;
        this.takeDamage(dot.damage, game, dot.sourceName, matchTime);
      }
      return matchTime <= dot.end;
    });

    this.skill.update(this, game, dt, matchTime);

    if (this.hp <= 0 || this.heldBy) return;
    if (matchTime < this.stunUntil) return;

    if (matchTime > this.externalForceUntil) {
      const speed = this.currentSpeed(matchTime);
      if (this.vel.length() <= 0) this.vel = randomUnitVector().scale(speed);
      else this.vel = safeNormalize(this.vel).scale(speed);
    }

    this.pos.add(Vec2.scale(this.vel, dt));
    this.keepInsideArena(game, matchTime);
  }

  keepInsideArena(game, matchTime) {
    const a = game.arena;
    let wall = null;
    if (this.pos.x - this.radius < a.left) {
      this.pos.x = a.left + this.radius;
      wall = 'left';
    } else if (this.pos.x + this.radius > a.right) {
      this.pos.x = a.right - this.radius;
      wall = 'right';
    }
    if (this.pos.y - this.radius < a.top) {
      this.pos.y = a.top + this.radius;
      wall = 'top';
    } else if (this.pos.y + this.radius > a.bottom) {
      this.pos.y = a.bottom - this.radius;
      wall = 'bottom';
    }
    if (wall) {
      this.vel = jitterWallBounceVelocity(this.vel, wall);
      if (matchTime <= this.throwWallDamageUntil && matchTime >= this.nextThrowWallDamage && this.throwWallDamage > 0) {
        this.nextThrowWallDamage = matchTime + 0.12;
        this.takeDamage(this.throwWallDamage, game, 'wall crash', matchTime);
      }
      this.skill.onWallBounce(this, wall, game, matchTime);
    }
  }

  draw(ctx, game) {
    if (this.hp <= 0) return;
    const phased = this.skill.isUntargetable(this, this.lastMatchTime);
    ctx.save();
    if (phased) ctx.globalAlpha = 0.60;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = phased ? COLORS.ghostPhase : this.color;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = this.teamColor(game);
    ctx.stroke();
    ctx.globalAlpha = 1;

    this.drawRoleDecoration(ctx);
    this.drawStuckPapers(ctx);

    ctx.font = 'bold 22px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,.72)';
    ctx.fillStyle = COLORS.black;
    const hpText = String(Math.round(this.hp));
    ctx.strokeText(hpText, this.pos.x, this.pos.y - 2);
    ctx.fillText(hpText, this.pos.x, this.pos.y - 2);

    if ((this.pengciMarks || 0) > 0) {
      ctx.font = 'bold 13px Arial, sans-serif';
      ctx.fillStyle = '#ffe150';
      ctx.strokeStyle = 'rgba(0,0,0,.75)';
      const mark = `瓷×${this.pengciMarks}`;
      ctx.strokeText(mark, this.pos.x, this.pos.y - this.radius - 10);
      ctx.fillText(mark, this.pos.x, this.pos.y - this.radius - 10);
    }
    if ((this.spellMarks || 0) > 0) {
      ctx.font = 'bold 13px Arial, sans-serif';
      ctx.fillStyle = '#dcaaff';
      ctx.strokeStyle = 'rgba(0,0,0,.75)';
      const mark = `咒×${this.spellMarks}`;
      ctx.strokeText(mark, this.pos.x, this.pos.y + this.radius + 28);
      ctx.fillText(mark, this.pos.x, this.pos.y + this.radius + 28);
    }

    ctx.font = '12px Arial, sans-serif';
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = 'rgba(0,0,0,.7)';
    ctx.lineWidth = 3;
    ctx.strokeText(this.label, this.pos.x, this.pos.y + this.radius + 13);
    ctx.fillText(this.label, this.pos.x, this.pos.y + this.radius + 13);
    ctx.restore();

    this.skill.draw(this, game, ctx);
  }



  drawStuckPapers(ctx) {
    if (!this.stuckPapers.length) return;
    ctx.save();
    for (const paper of this.stuckPapers) {
      const cx = this.pos.x + paper.offsetX;
      const cy = this.pos.y + paper.offsetY;
      const angle = paper.angle + paper.spin;
      const w = 32, h = 22;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.fillStyle = COLORS.paperWhite;
      ctx.strokeStyle = COLORS.paperEdge;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(-w / 2, -h / 2, w, h);
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 1;
      for (const y of [-4, 4]) {
        ctx.beginPath();
        ctx.moveTo(-8, y);
        ctx.lineTo(8, y);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(w / 2 - 8, -h / 2);
      ctx.lineTo(w / 2, -h / 2 + 8);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  drawRoleDecoration(ctx) {
    const id = this.role.id;
    const x = this.pos.x, y = this.pos.y, r = this.radius;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (id === 'paperman') {
      ctx.strokeStyle = COLORS.paperEdge;
      ctx.lineWidth = 2;
      for (const off of [-9, 0, 9]) {
        ctx.beginPath(); ctx.moveTo(x - 15, y + off); ctx.lineTo(x + 15, y + off - 3); ctx.stroke();
      }
    } else if (id === 'ninja') {
      ctx.fillStyle = COLORS.black;
      ctx.fillRect(x - r + 7, y - 6, r * 2 - 14, 12);
      ctx.fillStyle = COLORS.white;
      ctx.beginPath(); ctx.arc(x - 8, y - 1, 3, 0, Math.PI * 2); ctx.arc(x + 8, y - 1, 3, 0, Math.PI * 2); ctx.fill();
    } else if (id === 'blackhole') {
      ctx.strokeStyle = COLORS.cyan;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r * .55, 0, Math.PI * 2); ctx.stroke();
    } else if (id === 'fruitshooter') {
      ctx.fillStyle = COLORS.leafGreen;
      ctx.beginPath(); ctx.ellipse(x + 6, y - r + 4, 12, 6, -0.4, 0, Math.PI * 2); ctx.fill();
    } else if (id === 'pengci') {
      ctx.strokeStyle = COLORS.vaseBlue;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x - 15, y + 8); ctx.quadraticCurveTo(x, y - 11, x + 15, y + 8); ctx.stroke();
    } else if (id === 'huatuo') {
      ctx.strokeStyle = COLORS.white;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.lineTo(x + 12, y); ctx.moveTo(x, y - 12); ctx.lineTo(x, y + 12); ctx.stroke();
    } else if (id === 'shieldguard') {
      ctx.strokeStyle = COLORS.shieldBlue;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, r * .55, 0, Math.PI * 2); ctx.stroke();
    } else if (id === 'sniper') {
      ctx.strokeStyle = COLORS.sniperGold;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(x - 18, y + 10); ctx.lineTo(x + 18, y - 10); ctx.stroke();
    } else if (id === 'ghost') {
      ctx.fillStyle = COLORS.black;
      ctx.beginPath(); ctx.arc(x - 8, y - 5, 3, 0, Math.PI * 2); ctx.arc(x + 8, y - 5, 3, 0, Math.PI * 2); ctx.fill();
    } else if (id === 'spell') {
      ctx.strokeStyle = COLORS.spellCyan;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r * .45, 0, Math.PI * 1.4); ctx.stroke();
    } else if (id === 'poisonfang') {
      ctx.fillStyle = COLORS.poisonGreen;
      ctx.beginPath(); ctx.moveTo(x, y - 18); ctx.lineTo(x - 13, y + 13); ctx.lineTo(x + 13, y + 13); ctx.closePath(); ctx.fill();
    } else if (id === 'spider') {
      ctx.strokeStyle = COLORS.spiderPurple; ctx.lineWidth = 3;
      for (const sx of [-18, -10, 10, 18]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + sx, y + (sx < 0 ? -20 : 20)); ctx.stroke(); }
      ctx.fillStyle = COLORS.black; ctx.beginPath(); ctx.arc(x - 7, y - 4, 3, 0, Math.PI * 2); ctx.arc(x + 7, y - 4, 3, 0, Math.PI * 2); ctx.fill();
    } else if (id === 'gascan') {
      ctx.strokeStyle = COLORS.black; ctx.lineWidth = 3; ctx.fillStyle = COLORS.gasOrange; ctx.fillRect(x - 12, y - 16, 24, 32); ctx.strokeRect(x - 12, y - 16, 24, 32); ctx.fillStyle = COLORS.black; ctx.fillRect(x - 5, y - 23, 10, 7);
    } else if (id === 'hand') {
      ctx.fillStyle = COLORS.handSkin; ctx.beginPath(); ctx.ellipse(x, y + 3, 14, 18, 0, 0, Math.PI * 2); ctx.fill(); for (const fx of [-12, -4, 4, 12]) { ctx.beginPath(); ctx.ellipse(x + fx, y - 14, 4, 10, 0, 0, Math.PI * 2); ctx.fill(); }
    } else if (id === 'dragon') {
      ctx.strokeStyle = COLORS.orange; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x - 16, y + 10); ctx.quadraticCurveTo(x, y - 22, x + 16, y + 10); ctx.stroke(); ctx.fillStyle = COLORS.yellow; ctx.beginPath(); ctx.moveTo(x + 18, y + 8); ctx.lineTo(x + 4, y); ctx.lineTo(x + 14, y - 9); ctx.closePath(); ctx.fill();
    } else if (id === 'jadefoot') {
      ctx.fillStyle = COLORS.footPink; ctx.beginPath(); ctx.ellipse(x, y + 3, 12, 19, 0, 0, Math.PI * 2); ctx.fill(); for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(x + i * 6, y - 16, 3, 0, Math.PI * 2); ctx.fill(); }
    } else if (id === 'wave') {
      ctx.strokeStyle = COLORS.waveBlue; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 15, 0.1, Math.PI * 1.5); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, 23, 1.0, Math.PI * 1.85); ctx.stroke();
    } else if (id === 'cresson') {
      ctx.fillStyle = COLORS.cressonPink; for (let i = 0; i < 6; i++) { const a = i * Math.PI * 2 / 6; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 11, y + Math.sin(a) * 11, 8, 0, Math.PI * 2); ctx.fill(); } ctx.fillStyle = COLORS.yellow; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
    } else if (id === 'slime') {
      ctx.fillStyle = COLORS.slimeDark || '#2da046';
      ctx.beginPath(); ctx.ellipse(x - 7, y - 5, 7, 4, -0.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + 10, y + 8, 5, 3, 0.3, 0, Math.PI * 2); ctx.fill();
    } else if (id === 'king') {
      ctx.fillStyle = COLORS.kingGold || '#ffd74b';
      ctx.beginPath();
      ctx.moveTo(x - 16, y - 12); ctx.lineTo(x - 8, y - 24); ctx.lineTo(x, y - 12); ctx.lineTo(x + 8, y - 24); ctx.lineTo(x + 16, y - 12);
      ctx.closePath(); ctx.fill(); ctx.strokeStyle = COLORS.black; ctx.stroke();
    } else if (id === 'guard') {
      ctx.strokeStyle = COLORS.guardNavy || '#5a7dd2'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x, y - 17); ctx.lineTo(x + 14, y - 5); ctx.lineTo(x + 10, y + 15); ctx.lineTo(x, y + 21); ctx.lineTo(x - 10, y + 15); ctx.lineTo(x - 14, y - 5); ctx.closePath(); ctx.stroke();
    } else if (id === 'libai') {
      ctx.strokeStyle = COLORS.swordSilver || '#d2e6f5'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x - 17, y + 13); ctx.lineTo(x + 16, y - 16); ctx.stroke();
      ctx.fillStyle = COLORS.winePurple || '#9146b4'; ctx.beginPath(); ctx.arc(x - 12, y - 13, 6, 0, Math.PI * 2); ctx.fill();
    } else if (id === 'chishishen') {
      ctx.fillStyle = COLORS.poopBrown || '#694626';
      ctx.beginPath(); ctx.arc(x - 8, y + 5, 8, 0, Math.PI * 2); ctx.arc(x + 7, y + 5, 8, 0, Math.PI * 2); ctx.arc(x, y - 6, 7, 0, Math.PI * 2); ctx.fill();
    } else if (id === 'annoyingorange') {
      ctx.fillStyle = COLORS.black;
      ctx.beginPath(); ctx.arc(x - 8, y - 4, 3, 0, Math.PI * 2); ctx.arc(x + 8, y - 4, 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = COLORS.black; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y + 6, 9, 0, Math.PI); ctx.stroke();
    } else if (id === 'quicksilver') {
      ctx.strokeStyle = COLORS.quicksilverBlue || '#96dcff'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x - 12, y - 18); ctx.lineTo(x + 2, y - 2); ctx.lineTo(x - 5, y - 2); ctx.lineTo(x + 12, y + 18); ctx.stroke();
    } else if (id === 'swordsman') {
      ctx.strokeStyle = COLORS.swordSilver || '#d2e6f5'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(x - 18, y + 18); ctx.lineTo(x + 18, y - 18); ctx.stroke();
      ctx.strokeStyle = COLORS.swordAura || '#96d2ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r * .72, 0, Math.PI * 2); ctx.stroke();
    } else if (id === 'catherine') {
      ctx.strokeStyle = COLORS.arrowGold;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x - 14, y + 12); ctx.lineTo(x + 14, y - 12); ctx.moveTo(x + 14, y - 12); ctx.lineTo(x + 6, y - 11); ctx.stroke();
    }
    ctx.restore();
  }

  teamColor(game) {
    if (!this.teamId) return COLORS.white;
    return game.teamColors.get(this.teamId) || COLORS.white;
  }
}
