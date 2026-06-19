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

    ctx.font = 'bold 14px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.black;
    ctx.fillText(Math.round(this.hp), this.pos.x, this.pos.y - 2);
    ctx.font = '11px Arial, sans-serif';
    ctx.fillStyle = COLORS.white;
    ctx.fillText(this.label, this.pos.x, this.pos.y + this.radius + 13);
    ctx.restore();

    this.skill.draw(this, game, ctx);
  }

  teamColor(game) {
    if (!this.teamId) return COLORS.white;
    return game.teamColors.get(this.teamId) || COLORS.white;
  }
}
