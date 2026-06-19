import { Skill } from '../skillBase.js';
import { Projectile } from '../projectileBase.js';
import { Hazard } from '../hazardBase.js';
import { ARENA_SIZE, BALL_RADIUS, COLORS, NORMAL_BODY_COOLDOWN, NORMAL_BODY_DAMAGE } from '../config.js';
import { Vec2, randomUnitVector, safeNormalize } from '../vector.js';
import { circleHit, distancePointToSegment, randomPointInRect, clamp } from '../utils.js';

export class NormalSkill extends Skill {
  onBodyCollision(owner, other, game, matchTime) {
    const key = other.uid;
    const last = owner.lastBodyDamageTimes.get(key) ?? -999;
    if (matchTime - last >= NORMAL_BODY_COOLDOWN) {
      owner.lastBodyDamageTimes.set(key, matchTime);
      other.takeDamage(NORMAL_BODY_DAMAGE, game, owner, matchTime);
      return true;
    }
    return false;
  }
}

export class HammerSkill extends Skill {
  constructor() {
    super();
    this.angle = Math.random() * Math.PI * 2;
    this.orbitRadius = 86;
    this.hammerRadius = 25;
    this.angularSpeed = 9.0;
    this.damage = 8;
    this.hitCooldown = 0.32;
    this.nextHitTimes = new Map();
  }

  hammerPos(owner) {
    return new Vec2(
      owner.pos.x + Math.cos(this.angle) * this.orbitRadius,
      owner.pos.y + Math.sin(this.angle) * this.orbitRadius
    );
  }

  update(owner, game, dt, matchTime) {
    this.angle += this.angularSpeed * dt;
    const p = this.hammerPos(owner);
    for (const ball of game.balls) {
      if (ball.hp <= 0 || ball === owner || game.areAllies(ball, owner)) continue;
      if (!circleHit(p, this.hammerRadius, ball.pos, ball.radius)) continue;
      const next = this.nextHitTimes.get(ball.uid) ?? 0;
      if (matchTime < next) continue;
      this.nextHitTimes.set(ball.uid, matchTime + this.hitCooldown);
      ball.takeDamage(this.damage, game, owner, matchTime);
      const knock = safeNormalize(Vec2.sub(ball.pos, owner.pos));
      ball.vel = knock.scale(Math.max(ball.currentSpeed(matchTime), 650));
      ball.externalForceUntil = matchTime + 0.22;
    }
  }

  draw(owner, game, ctx) {
    const p = this.hammerPos(owner);
    ctx.save();
    ctx.strokeStyle = '#ead8a4';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(owner.pos.x, owner.pos.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, this.hammerRadius, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.hammer;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.black;
    ctx.stroke();
    ctx.restore();
  }
}

export class VampireSkill extends Skill {
  constructor() {
    super();
    this.drainDamage = 3;
    this.drainHeal = 3;
    this.drainInterval = 0.5;
    this.drainDuration = 1.5;
    this.retriggerCooldown = 0.4;
    this.activeDrains = new Map();
    this.nextReady = 0;
  }

  onBodyCollision(owner, other, game, matchTime) {
    if (matchTime < this.nextReady || this.activeDrains.has(other.uid)) return false;
    this.nextReady = matchTime + this.drainDuration + this.retriggerCooldown;
    owner.addSlow(0.35, this.drainDuration, matchTime);
    other.addSlow(0.35, this.drainDuration, matchTime);
    this.activeDrains.set(other.uid, {
      target: other,
      end: matchTime + this.drainDuration,
      next: matchTime + this.drainInterval
    });
    return true;
  }

  update(owner, game, dt, matchTime) {
    for (const [uid, drain] of [...this.activeDrains.entries()]) {
      if (matchTime >= drain.end || owner.hp <= 0 || drain.target.hp <= 0) {
        this.activeDrains.delete(uid);
        continue;
      }
      while (matchTime >= drain.next && drain.next <= drain.end) {
        drain.next += this.drainInterval;
        const actual = drain.target.takeDamage(this.drainDamage, game, owner, matchTime);
        if (actual > 0) owner.heal(this.drainHeal, game);
      }
    }
  }
}

class HealingOrbProjectile extends Projectile {
  constructor(owner, pos, direction) {
    super(owner);
    this.pos = pos.clone();
    this.vel = safeNormalize(direction).scale(455);
    this.radius = 13;
    this.spin = 0;
  }

  explode(game, matchTime) {
    game.hazards.push(new HealingFieldHazard(this.owner, this.pos, matchTime));
    this.alive = false;
  }

  update(game, dt, matchTime) {
    this.pos.add(Vec2.scale(this.vel, dt));
    this.spin += 8 * dt;
    const a = game.arena;
    const hitWall = this.pos.x - this.radius <= a.left || this.pos.x + this.radius >= a.right ||
      this.pos.y - this.radius <= a.top || this.pos.y + this.radius >= a.bottom;
    if (hitWall) {
      this.pos.x = clamp(this.pos.x, a.left + this.radius, a.right - this.radius);
      this.pos.y = clamp(this.pos.y, a.top + this.radius, a.bottom - this.radius);
      this.explode(game, matchTime);
      return;
    }
    for (const ball of game.balls) {
      if (ball.hp <= 0 || game.areAllies(ball, this.owner)) continue;
      if (circleHit(this.pos, this.radius, ball.pos, ball.radius)) {
        this.explode(game, matchTime);
        return;
      }
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.huatuo;
    ctx.fill();
    ctx.strokeStyle = COLORS.white;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(this.pos.x - 7, this.pos.y);
    ctx.lineTo(this.pos.x + 7, this.pos.y);
    ctx.moveTo(this.pos.x, this.pos.y - 7);
    ctx.lineTo(this.pos.x, this.pos.y + 7);
    ctx.stroke();
    ctx.restore();
  }
}

class HealingFieldHazard extends Hazard {
  constructor(owner, pos, matchTime) {
    super(owner);
    this.pos = pos.clone();
    this.radius = 120;
    this.duration = 7;
    this.end = matchTime + this.duration;
    this.nextTick = matchTime + 0.5;
    this.pulse = 0;
  }

  update(game, dt, matchTime) {
    this.pulse += dt * 5;
    if (matchTime >= this.end) {
      this.alive = false;
      return;
    }
    while (matchTime >= this.nextTick && this.nextTick <= this.end) {
      this.nextTick += 0.5;
      for (const ball of game.balls) {
        if (ball.hp <= 0) continue;
        if (!circleHit(this.pos, this.radius, ball.pos, ball.radius)) continue;
        if (ball === this.owner || game.areAllies(ball, this.owner)) ball.heal(1, game);
        else ball.takeDamage(1, game, this.owner, matchTime);
      }
    }
  }

  draw(ctx) {
    const pulse = this.radius + Math.sin(this.pulse) * 5;
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, pulse, 0, Math.PI * 2);
    ctx.strokeStyle = COLORS.heal;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(80,220,130,.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
}

export class HuatuoSkill extends Skill {
  constructor() {
    super();
    this.nextFire = 1.2;
    this.cooldown = 2.0;
  }

  update(owner, game, dt, matchTime) {
    if (matchTime < this.nextFire) return;
    const enemy = game.nearestEnemy(owner);
    if (!enemy) return;
    this.nextFire = matchTime + this.cooldown;
    const dir = safeNormalize(Vec2.sub(enemy.pos, owner.pos));
    const start = Vec2.add(owner.pos, Vec2.scale(dir, owner.radius + 14));
    game.projectiles.push(new HealingOrbProjectile(owner, start, dir));
  }
}

export class GhostSkill extends Skill {
  constructor() {
    super();
    this.phaseInterval = 3;
    this.phaseDamage = 8;
    this.touchCooldown = 0.38;
    this.nextTouch = new Map();
  }

  isPhased(owner, matchTime) {
    return Math.floor(matchTime / this.phaseInterval) % 2 === 1;
  }

  isUntargetable(owner, matchTime) { return this.isPhased(owner, matchTime); }
  ignoresPhysicalCollision(owner, other, matchTime) { return this.isPhased(owner, matchTime); }
  modifyIncomingDamage(owner, amount, source, game, matchTime) { return this.isPhased(owner, matchTime) ? 0 : amount; }
  speedMultiplier(owner, matchTime) { return this.isPhased(owner, matchTime) ? 2.0 : 1.0; }

  update(owner, game, dt, matchTime) {
    if (!this.isPhased(owner, matchTime)) return;
    for (const ball of game.balls) {
      if (ball.hp <= 0 || ball === owner || game.areAllies(ball, owner)) continue;
      if (!circleHit(owner.pos, owner.radius, ball.pos, ball.radius)) continue;
      const next = this.nextTouch.get(ball.uid) ?? 0;
      if (matchTime < next) continue;
      this.nextTouch.set(ball.uid, matchTime + this.touchCooldown);
      ball.takeDamage(this.phaseDamage, game, owner, matchTime);
    }
  }
}

export class RibbonSkill extends Skill {
  constructor() {
    super();
    this.ribbonCount = 3;
    this.ribbonLength = ARENA_SIZE;
    this.damage = 2;
    this.hitCooldown = 0.32;
    this.history = [];
    this.nextHit = new Map();
    this.colors = [COLORS.ribbonRed, COLORS.ribbonBlue, COLORS.ribbonGold];
  }

  update(owner, game, dt, matchTime) {
    this.history.unshift(owner.pos.clone());
    if (this.history.length > 140) this.history.pop();
    for (let i = 0; i < this.ribbonCount; i++) {
      const pts = this.ribbonPoints(owner, i);
      for (const ball of game.balls) {
        if (ball.hp <= 0 || ball === owner || game.areAllies(ball, owner)) continue;
        let touching = false;
        for (let j = 1; j < pts.length; j++) {
          if (distancePointToSegment(ball.pos, pts[j - 1], pts[j]) <= ball.radius + 4) {
            touching = true;
            break;
          }
        }
        if (!touching) continue;
        const key = `${i}:${ball.uid}`;
        const next = this.nextHit.get(key) ?? 0;
        if (matchTime < next) continue;
        this.nextHit.set(key, matchTime + this.hitCooldown);
        ball.takeDamage(this.damage, game, owner, matchTime);
      }
    }
  }

  ribbonPoints(owner, index) {
    if (this.history.length < 2) {
      const back = safeNormalize(owner.vel).scale(-this.ribbonLength);
      return [owner.pos.clone(), Vec2.add(owner.pos, back)];
    }
    const offset = (index - 1) * 10;
    const pts = [];
    const side = safeNormalize(owner.vel).perp().scale(offset);
    let total = 0;
    for (let i = 0; i < this.history.length; i++) {
      const p = Vec2.add(this.history[i], side);
      if (i > 0) total += this.history[i].distanceTo(this.history[i - 1]);
      if (total <= this.ribbonLength) pts.push(p);
      else break;
    }
    return pts.length >= 2 ? pts : [owner.pos.clone(), owner.pos.clone().add(side)];
  }

  draw(owner, game, ctx) {
    ctx.save();
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (let i = 0; i < this.ribbonCount; i++) {
      const pts = this.ribbonPoints(owner, i);
      if (pts.length < 2) continue;
      ctx.strokeStyle = this.colors[i];
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

class IceCurlingRingHazard extends Hazard {
  constructor(owner, matchTime) {
    super(owner);
    this.created = matchTime;
    this.freezeDuration = 1.0;
    this.center = null;
    this.smallRadius = Math.floor(ARENA_SIZE * 0.13);
    this.midRadius = Math.floor(ARENA_SIZE * 0.30);
    this.largeRadius = Math.floor(ARENA_SIZE * 0.45);
    this.snapshots = new Map();
    this.resolved = false;
  }

  ensureCenter(game) {
    if (!this.center) this.center = new Vec2((game.arena.left + game.arena.right) / 2, (game.arena.top + game.arena.bottom) / 2);
  }

  zoneOf(pos, radius = BALL_RADIUS) {
    const d = pos.distanceTo(this.center);
    const nearestEdge = Math.max(0, d - radius);
    if (nearestEdge <= this.smallRadius) return 0;
    if (nearestEdge <= this.midRadius) return 1;
    if (nearestEdge <= this.largeRadius) return 2;
    return 3;
  }

  update(game, dt, matchTime) {
    this.ensureCenter(game);
    if (this.snapshots.size === 0) {
      for (const ball of game.balls) {
        if (ball.hp <= 0) continue;
        this.snapshots.set(ball.uid, this.zoneOf(ball.pos, ball.radius));
        ball.addStun(this.freezeDuration, matchTime);
      }
    }
    if (!this.resolved && matchTime >= this.created + this.freezeDuration) {
      this.resolved = true;
      const ownerZone = this.snapshots.get(this.owner.uid) ?? this.zoneOf(this.owner.pos, this.owner.radius);
      for (const ball of game.balls) {
        if (ball.hp <= 0 || ball === this.owner || game.areAllies(ball, this.owner)) continue;
        const targetZone = this.snapshots.get(ball.uid) ?? this.zoneOf(ball.pos, ball.radius);
        const lead = targetZone - ownerZone;
        if (lead < 0) continue;
        let damage = (lead + 1) * 5;
        if (ownerZone === 0) damage *= 2;
        ball.takeDamage(damage, game, this.owner, matchTime);
      }
      this.alive = false;
    }
  }

  draw(ctx) {
    if (!this.center) return;
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.iceRing;
    for (const r of [this.largeRadius, this.midRadius, this.smallRadius]) {
      ctx.beginPath();
      ctx.arc(this.center.x, this.center.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(130,220,255,.08)';
    ctx.beginPath();
    ctx.arc(this.center.x, this.center.y, this.largeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export class IceCurlingSkill extends Skill {
  constructor() {
    super();
    this.nextCast = 4.0;
    this.cooldown = 5.0;
  }

  update(owner, game, dt, matchTime) {
    if (matchTime < this.nextCast) return;
    this.nextCast = matchTime + this.cooldown;
    game.hazards.push(new IceCurlingRingHazard(owner, matchTime));
  }
}
