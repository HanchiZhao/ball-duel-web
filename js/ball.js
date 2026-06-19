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
    this.lastMatchTime = 0;
  }

  currentSpeed(matchTime) {
    let mult = 1;
    for (const slow of this.slowEffects) {
      if (matchTime <= slow.end) mult *= slow.multiplier;
    }
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

  takeDamage(amount, game, source = null, matchTime = this.lastMatchTime) {
    if (this.hp <= 0 || amount <= 0) return 0;
    const actual = Math.max(0, this.skill.modifyIncomingDamage(this, amount, source, game, matchTime));
    if (actual <= 0) return 0;
    this.hp = Math.max(0, this.hp - actual);
    game?.addFloatingText(this.pos, `-${Math.round(actual)}`, 'damage');
    this.skill.onDamageTaken(this, actual, source, game, matchTime);
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
