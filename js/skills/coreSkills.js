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

// ============================================================
// Round 2 projectile / ranged角色
// ============================================================

class PaperProjectile extends Projectile {
  constructor(owner, pos, direction) {
    super(owner);
    this.pos = pos.clone();
    this.direction = safeNormalize(direction);
    this.vel = this.direction.clone().scale(440);
    this.radius = 13;
  }
  update(game, dt, matchTime) {
    this.pos.add(Vec2.scale(this.vel, dt));
    if (this.pos.x < game.arena.left - 100 || this.pos.x > game.arena.right + 100 ||
        this.pos.y < game.arena.top - 100 || this.pos.y > game.arena.bottom + 100) {
      this.alive = false;
      return;
    }
    for (const ball of game.balls) {
      if (ball.hp <= 0 || game.areAllies(ball, this.owner)) continue;
      if (!circleHit(this.pos, this.radius, ball.pos, ball.radius)) continue;
      this.alive = false;
      ball.addDot(1, 0.5, 4.0, matchTime, 'paper page');
      ball.addSlow(0.5, 4.0, matchTime);
      ball.addStuckPaper?.(4.0, matchTime, this.direction);
      return;
    }
  }
  draw(ctx) {
    const dir = safeNormalize(this.vel);
    const perp = dir.perp();
    const w = 32, h = 22;
    const pts = [
      Vec2.add(Vec2.add(this.pos, Vec2.scale(dir, w / 2)), Vec2.scale(perp, h / 2)),
      Vec2.add(Vec2.add(this.pos, Vec2.scale(dir, -w / 2)), Vec2.scale(perp, h / 2)),
      Vec2.add(Vec2.add(this.pos, Vec2.scale(dir, -w / 2)), Vec2.scale(perp, -h / 2)),
      Vec2.add(Vec2.add(this.pos, Vec2.scale(dir, w / 2)), Vec2.scale(perp, -h / 2))
    ];
    ctx.save();
    ctx.fillStyle = COLORS.paperWhite;
    ctx.strokeStyle = COLORS.paperEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1;
    for (const off of [-4, 4]) {
      const c = Vec2.add(this.pos, Vec2.scale(perp, off));
      ctx.beginPath();
      ctx.moveTo(c.x - dir.x * 8, c.y - dir.y * 8);
      ctx.lineTo(c.x + dir.x * 8, c.y + dir.y * 8);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export class PapermanSkill extends Skill {
  constructor() { super(); this.nextFire = 1.0; this.cooldown = 2.0; }
  update(owner, game, dt, matchTime) {
    if (matchTime < this.nextFire) return;
    const enemy = game.nearestEnemy(owner); if (!enemy) return;
    this.nextFire = matchTime + this.cooldown;
    const dir = safeNormalize(Vec2.sub(enemy.pos, owner.pos));
    const start = Vec2.add(owner.pos, Vec2.scale(dir, owner.radius + 16));
    game.projectiles.push(new PaperProjectile(owner, start, dir));
  }
}

class ShurikenProjectile extends Projectile {
  constructor(owner, pos, direction) {
    super(owner);
    this.pos = pos.clone();
    this.vel = safeNormalize(direction).scale(760);
    this.radius = 9;
    this.bouncesLeft = 2;
    this.spin = Math.random() * Math.PI * 2;
  }
  update(game, dt, matchTime) {
    this.pos.add(Vec2.scale(this.vel, dt));
    this.spin += 28 * dt;
    let bounced = false;
    const a = game.arena;
    if (this.pos.x - this.radius <= a.left) { this.pos.x = a.left + this.radius; this.vel.x = Math.abs(this.vel.x); bounced = true; }
    if (this.pos.x + this.radius >= a.right) { this.pos.x = a.right - this.radius; this.vel.x = -Math.abs(this.vel.x); bounced = true; }
    if (this.pos.y - this.radius <= a.top) { this.pos.y = a.top + this.radius; this.vel.y = Math.abs(this.vel.y); bounced = true; }
    if (this.pos.y + this.radius >= a.bottom) { this.pos.y = a.bottom - this.radius; this.vel.y = -Math.abs(this.vel.y); bounced = true; }
    if (bounced) { this.bouncesLeft -= 1; if (this.bouncesLeft < 0) { this.alive = false; return; } }
    for (const ball of game.balls) {
      if (ball.hp <= 0 || game.areAllies(ball, this.owner)) continue;
      if (!circleHit(this.pos, this.radius, ball.pos, ball.radius)) continue;
      ball.takeDamage(5, game, this.owner, matchTime);
      this.alive = false;
      return;
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.fillStyle = '#bfc3cc';
    ctx.strokeStyle = COLORS.ninjaGreen;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? 16 : 6;
      const a = this.spin + i * Math.PI / 4;
      const x = this.pos.x + Math.cos(a) * r;
      const y = this.pos.y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

export class NinjaSkill extends Skill {
  constructor() { super(); this.nextFire = 0.8; this.cooldown = 2.2; this.count = 3; this.maxCount = 7; }
  update(owner, game, dt, matchTime) {
    if (matchTime < this.nextFire) return;
    this.nextFire = matchTime + this.cooldown;
    for (let i = 0; i < this.count; i++) {
      const dir = randomUnitVector();
      const start = Vec2.add(owner.pos, Vec2.scale(dir, owner.radius + 12));
      game.projectiles.push(new ShurikenProjectile(owner, start, dir));
    }
    this.count = Math.min(this.maxCount, this.count + 1);
  }
}

class BlackHoleHazardWeb extends Hazard {
  constructor(owner, pos, matchTime) {
    super(owner);
    this.pos = pos.clone();
    this.end = matchTime + 2.0;
    this.radius = 125;
    this.nextTick = matchTime + 0.4;
    this.spin = 0;
  }
  update(game, dt, matchTime) {
    this.spin += 7 * dt;
    if (matchTime >= this.end) { this.alive = false; return; }
    for (const ball of game.balls) {
      if (ball.hp <= 0 || game.areAllies(ball, this.owner) || ball.heldBy) continue;
      const delta = Vec2.sub(this.pos, ball.pos);
      const dist = delta.length();
      if (dist <= this.radius && dist > 1) {
        const dir = delta.scale(1 / dist);
        const pullSpeed = 780 + (1 - dist / this.radius) * 620;
        const inwardSpeed = ball.vel.dot(dir);
        if (inwardSpeed < pullSpeed) ball.vel.add(Vec2.scale(dir, pullSpeed - inwardSpeed));
        ball.pos.add(Vec2.scale(dir, Math.min(dist, (430 + (1 - dist / this.radius) * 460) * dt)));
        ball.externalForceUntil = matchTime + 0.16;
      }
    }
    if (matchTime >= this.nextTick) {
      this.nextTick += 0.4;
      for (const ball of game.balls) {
        if (ball.hp <= 0 || game.areAllies(ball, this.owner)) continue;
        if (this.pos.distanceTo(ball.pos) <= this.radius) ball.takeDamage(2, game, this.owner, matchTime);
      }
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.strokeStyle = COLORS.voidPurple;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = COLORS.black;
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, 24, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = COLORS.voidPurple; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, 27, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = COLORS.cyan; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const a = this.spin + i * Math.PI * 2 / 3;
      ctx.beginPath();
      ctx.moveTo(this.pos.x + Math.cos(a) * 32, this.pos.y + Math.sin(a) * 32);
      ctx.lineTo(this.pos.x + Math.cos(a + 1.3) * 52, this.pos.y + Math.sin(a + 1.3) * 52);
      ctx.stroke();
    }
    ctx.restore();
  }
}

class BlackHoleMissileProjectile extends Projectile {
  constructor(owner, pos, direction) {
    super(owner); this.pos = pos.clone(); this.vel = safeNormalize(direction).scale(430); this.radius = 12;
  }
  explode(game, matchTime) { game.hazards.push(new BlackHoleHazardWeb(this.owner, this.pos, matchTime)); this.alive = false; }
  update(game, dt, matchTime) {
    this.pos.add(Vec2.scale(this.vel, dt));
    const a = game.arena;
    if (this.pos.x - this.radius <= a.left || this.pos.x + this.radius >= a.right || this.pos.y - this.radius <= a.top || this.pos.y + this.radius >= a.bottom) {
      this.pos.x = clamp(this.pos.x, a.left + this.radius, a.right - this.radius);
      this.pos.y = clamp(this.pos.y, a.top + this.radius, a.bottom - this.radius);
      this.explode(game, matchTime); return;
    }
    for (const ball of game.balls) {
      if (ball.hp <= 0 || game.areAllies(ball, this.owner)) continue;
      if (!circleHit(this.pos, this.radius, ball.pos, ball.radius)) continue;
      ball.takeDamage(10, game, this.owner, matchTime);
      this.explode(game, matchTime); return;
    }
  }
  draw(ctx) {
    const dir = safeNormalize(this.vel);
    ctx.save();
    ctx.fillStyle = COLORS.voidPurple; ctx.strokeStyle = COLORS.cyan; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(this.pos.x - dir.x * 22, this.pos.y - dir.y * 22); ctx.lineTo(this.pos.x, this.pos.y); ctx.stroke();
    ctx.restore();
  }
}

export class BlackHoleSkill extends Skill {
  constructor() { super(); this.nextFire = 1.3; this.cooldown = 4.0; }
  update(owner, game, dt, matchTime) {
    if (matchTime < this.nextFire) return;
    const enemy = game.nearestEnemy(owner); if (!enemy) return;
    this.nextFire = matchTime + this.cooldown;
    const dir = safeNormalize(Vec2.sub(enemy.pos, owner.pos));
    const start = Vec2.add(owner.pos, Vec2.scale(dir, owner.radius + 16));
    game.projectiles.push(new BlackHoleMissileProjectile(owner, start, dir));
  }
}

const FRUITS = {
  apple: { label: 'Apple/苹果', radius: 13, speed: 510, weight: 25 },
  watermelon: { label: 'Watermelon/西瓜', radius: 22, speed: 455, weight: 10, explosionRadius: 88 },
  peach: { label: 'Peach/水蜜桃', radius: 14, speed: 500, weight: 20 },
  grape: { label: 'Grape/葡萄串', radius: 15, speed: 500, weight: 10 },
  tangerine: { label: 'Tangerine/砂糖橘', radius: 11, speed: 650, weight: 20 },
  lychee: { label: 'Lychee/荔枝', radius: 12, speed: 500, weight: 15 }
};
function randomFruitKey() {
  const roll = Math.random() * 100; let running = 0;
  for (const [key, cfg] of Object.entries(FRUITS)) { running += cfg.weight; if (roll <= running) return key; }
  return 'apple';
}
function drawFruit(ctx, key, pos, radius, angle = 0) {
  ctx.save();
  if (key === 'apple') {
    ctx.fillStyle = COLORS.appleRed; ctx.beginPath(); ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COLORS.leafGreen; ctx.beginPath(); ctx.ellipse(pos.x + radius * .35, pos.y - radius - 3, radius * .35, radius * .18, -0.3, 0, Math.PI * 2); ctx.fill();
  } else if (key === 'watermelon') {
    ctx.fillStyle = COLORS.watermelonGreen; ctx.beginPath(); ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = COLORS.watermelonDark; ctx.lineWidth = 2;
    for (const off of [-.45, 0, .45]) { ctx.beginPath(); ctx.arc(pos.x, pos.y + off * radius * .2, radius * .8, .18, Math.PI - .18); ctx.stroke(); }
  } else if (key === 'peach') {
    ctx.fillStyle = COLORS.peachPink; ctx.beginPath(); ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffcdb0'; ctx.beginPath(); ctx.arc(pos.x + radius * .25, pos.y, radius * .65, 0, Math.PI * 2); ctx.fill();
  } else if (key === 'grape') {
    const offsets = [[-.35,-.45],[.35,-.45],[-.55,.1],[0,.1],[.55,.1],[-.25,.62],[.25,.62]];
    for (const [ox, oy] of offsets) { ctx.fillStyle = COLORS.grapePurple; ctx.beginPath(); ctx.arc(pos.x + ox * radius, pos.y + oy * radius, Math.max(3, radius * .38), 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  } else if (key === 'tangerine') {
    ctx.fillStyle = COLORS.tangerineOrange; ctx.beginPath(); ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e65f14'; ctx.lineWidth = 1;
    for (let i=0;i<6;i++){const a=angle+i*Math.PI*2/6;ctx.beginPath();ctx.moveTo(pos.x+Math.cos(a)*radius*.25,pos.y+Math.sin(a)*radius*.25);ctx.lineTo(pos.x+Math.cos(a)*radius*.82,pos.y+Math.sin(a)*radius*.82);ctx.stroke();}
  } else {
    ctx.fillStyle = COLORS.lycheePink; ctx.beginPath(); ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd7d7'; for (let i=0;i<8;i++){const a=angle+i*Math.PI*2/8;ctx.beginPath();ctx.arc(pos.x+Math.cos(a)*radius*.58,pos.y+Math.sin(a)*radius*.58,Math.max(1,radius*.1),0,Math.PI*2);ctx.fill();}
  }
  ctx.strokeStyle = COLORS.black; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
}

class GrapePelletProjectile extends Projectile {
  constructor(owner, pos, direction) { super(owner); this.pos = pos.clone(); this.vel = safeNormalize(direction).scale(610); this.radius = 5; this.bouncesLeft = 1; }
  update(game, dt, matchTime) {
    this.pos.add(Vec2.scale(this.vel, dt));
    let bounced = false; const a = game.arena;
    if (this.pos.x - this.radius <= a.left) { this.pos.x=a.left+this.radius; this.vel.x=Math.abs(this.vel.x); bounced=true; }
    if (this.pos.x + this.radius >= a.right) { this.pos.x=a.right-this.radius; this.vel.x=-Math.abs(this.vel.x); bounced=true; }
    if (this.pos.y - this.radius <= a.top) { this.pos.y=a.top+this.radius; this.vel.y=Math.abs(this.vel.y); bounced=true; }
    if (this.pos.y + this.radius >= a.bottom) { this.pos.y=a.bottom-this.radius; this.vel.y=-Math.abs(this.vel.y); bounced=true; }
    if (bounced) { this.bouncesLeft -= 1; if (this.bouncesLeft < 0) { this.alive=false; return; } }
    for (const ball of game.balls) { if (ball.hp<=0 || game.areAllies(ball,this.owner)) continue; if (circleHit(this.pos,this.radius,ball.pos,ball.radius)) { ball.takeDamage(1,game,this.owner,matchTime); this.alive=false; return; } }
  }
  draw(ctx){ctx.save();ctx.fillStyle=COLORS.grapePurple;ctx.beginPath();ctx.arc(this.pos.x,this.pos.y,this.radius,0,Math.PI*2);ctx.fill();ctx.strokeStyle=COLORS.black;ctx.stroke();ctx.restore();}
}

class FruitProjectile extends Projectile {
  constructor(owner, pos, direction, key) { super(owner); this.key=key; this.cfg=FRUITS[key]; this.pos=pos.clone(); this.direction=safeNormalize(direction); this.vel=this.direction.clone().scale(this.cfg.speed); this.radius=this.cfg.radius; this.angle=Math.random()*Math.PI*2; }
  burstGrapes(game){ for(let i=0;i<8;i++) game.projectiles.push(new GrapePelletProjectile(this.owner,this.pos,randomUnitVector())); }
  explodeWatermelon(game,matchTime){ for(const ball of game.balls){ if(ball.hp<=0||game.areAllies(ball,this.owner)) continue; if(this.pos.distanceTo(ball.pos)<=this.cfg.explosionRadius+ball.radius){ ball.takeDamage(20,game,this.owner,matchTime); const knock=safeNormalize(Vec2.sub(ball.pos,this.pos)); ball.vel=knock.scale(1320); ball.externalForceUntil=matchTime+0.62; } } }
  apply(ball,game,matchTime){
    if(this.key==='apple') ball.takeDamage(5,game,this.owner,matchTime);
    else if(this.key==='watermelon') this.explodeWatermelon(game,matchTime);
    else if(this.key==='peach'){ ball.takeDamage(3,game,this.owner,matchTime); ball.addSlow(0.8,3.0,matchTime); }
    else if(this.key==='grape'){ ball.takeDamage(10,game,this.owner,matchTime); this.burstGrapes(game); }
    else if(this.key==='tangerine') ball.takeDamage(3,game,this.owner,matchTime);
    else if(this.key==='lychee') ball.addDot(1,0.5,5.0,matchTime,'lychee');
  }
  update(game,dt,matchTime){
    this.pos.add(Vec2.scale(this.vel,dt)); this.angle+=9*dt; const a=game.arena;
    if(this.pos.x-this.radius<=a.left||this.pos.x+this.radius>=a.right||this.pos.y-this.radius<=a.top||this.pos.y+this.radius>=a.bottom){ if(this.key==='grape') this.burstGrapes(game); this.alive=false; return; }
    for(const ball of game.balls){ if(ball.hp<=0||game.areAllies(ball,this.owner)) continue; if(circleHit(this.pos,this.radius,ball.pos,ball.radius)){ this.apply(ball,game,matchTime); this.alive=false; return; } }
  }
  draw(ctx){ drawFruit(ctx,this.key,this.pos,this.radius,this.angle); }
}

export class FruitShooterSkill extends Skill {
  constructor(){ super(); this.nextVolley=1.0; this.cooldown=4.0; this.pending=[]; }
  update(owner,game,dt,matchTime){
    if(matchTime>=this.nextVolley){ const enemy=game.nearestEnemy(owner); if(enemy){ this.nextVolley=matchTime+this.cooldown; this.pending=[0,0.28,0.56].map(off=>matchTime+off); } }
    while(this.pending.length && matchTime>=this.pending[0]){
      this.pending.shift(); const enemy=game.nearestEnemy(owner); if(!enemy) continue;
      const dir=safeNormalize(Vec2.sub(enemy.pos,owner.pos)); const start=Vec2.add(owner.pos,Vec2.scale(dir,owner.radius+18));
      game.projectiles.push(new FruitProjectile(owner,start,dir,randomFruitKey()));
    }
  }
}

class VaseProjectile extends Projectile {
  constructor(owner,pos,direction){ super(owner); this.pos=pos.clone(); this.direction=safeNormalize(direction); this.vel=this.direction.clone().scale(1121); this.radius=13; this.angle=Math.random()*Math.PI*2; }
  update(game,dt,matchTime){
    this.pos.add(Vec2.scale(this.vel,dt)); this.angle+=8*dt; const a=game.arena;
    if(this.pos.x-this.radius<=a.left||this.pos.x+this.radius>=a.right||this.pos.y-this.radius<=a.top||this.pos.y+this.radius>=a.bottom){ this.alive=false; return; }
    for(const ball of game.balls){ if(ball.hp<=0||game.areAllies(ball,this.owner)) continue; if(circleHit(this.pos,this.radius,ball.pos,ball.radius)){ ball.pengciMarks=(ball.pengciMarks||0)+1; ball.nextPengciDecay=matchTime+6; this.alive=false; return; } }
  }
  draw(ctx){ const dir=safeNormalize(this.vel), perp=dir.perp(); ctx.save(); ctx.fillStyle=COLORS.vaseWhite; ctx.strokeStyle=COLORS.black; ctx.lineWidth=2; const p=this.pos; ctx.beginPath(); ctx.moveTo(p.x+dir.x*6+perp.x*5,p.y+dir.y*6+perp.y*5); ctx.lineTo(p.x+dir.x*6-perp.x*5,p.y+dir.y*6-perp.y*5); ctx.lineTo(p.x-dir.x*14-perp.x*10,p.y-dir.y*14-perp.y*10); ctx.lineTo(p.x-dir.x*14+perp.x*10,p.y-dir.y*14+perp.y*10); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.strokeStyle=COLORS.vaseBlue; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(p.x-perp.x*7,p.y-perp.y*7); ctx.lineTo(p.x+perp.x*7,p.y+perp.y*7); ctx.stroke(); ctx.restore(); }
}

export class PengciSkill extends Skill {
  constructor(){ super(); this.nextFire=0.9; this.cooldown=1.0; this.bodyCooldown=0.35; this.nextBody=new Map(); }
  update(owner,game,dt,matchTime){
    for(const ball of game.balls){ if((ball.pengciMarks||0)>0 && matchTime>=(ball.nextPengciDecay||Infinity)){ ball.pengciMarks=Math.max(0,ball.pengciMarks-1); ball.nextPengciDecay=matchTime+6; } }
    if(matchTime<this.nextFire) return; const enemy=game.nearestEnemy(owner); if(!enemy) return; this.nextFire=matchTime+this.cooldown; const dir=safeNormalize(Vec2.sub(enemy.pos,owner.pos)); const start=Vec2.add(owner.pos,Vec2.scale(dir,owner.radius+16)); game.projectiles.push(new VaseProjectile(owner,start,dir));
  }
  onBodyCollision(owner,other,game,matchTime){ const marks=other.pengciMarks||0; if(marks<=0) return false; const next=this.nextBody.get(other.uid)||0; if(matchTime<next) return false; this.nextBody.set(other.uid,matchTime+this.bodyCooldown); other.pengciMarks=0; other.nextPengciDecay=0; other.takeDamage(Math.pow(2,marks+1),game,owner,matchTime); return true; }
}

class ShieldProjectile extends Projectile {
  constructor(owner,pos,direction){ super(owner); this.pos=pos.clone(); this.vel=safeNormalize(direction).scale(520); this.radius=18; this.angle=Math.random()*Math.PI*2; }
  update(game,dt,matchTime){ this.pos.add(Vec2.scale(this.vel,dt)); this.angle+=14*dt; if(this.pos.x<game.arena.left-80||this.pos.x>game.arena.right+80||this.pos.y<game.arena.top-80||this.pos.y>game.arena.bottom+80){this.alive=false;return;} for(const ball of game.balls){ if(ball.hp<=0||game.areAllies(ball,this.owner)) continue; if(circleHit(this.pos,this.radius,ball.pos,ball.radius)){ const layers=this.owner.skill.shieldLayers||0; ball.takeDamage(Math.max(3,layers*3),game,this.owner,matchTime); this.alive=false; return; } } }
  draw(ctx){ ctx.save(); ctx.fillStyle=COLORS.shieldSteel; ctx.strokeStyle=COLORS.black; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(this.pos.x,this.pos.y,this.radius,0,Math.PI*2); ctx.fill(); ctx.stroke(); ctx.strokeStyle=COLORS.shieldBlue; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(this.pos.x,this.pos.y,this.radius*.62,0,Math.PI*2); ctx.stroke(); ctx.strokeStyle=COLORS.white; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(this.pos.x,this.pos.y); ctx.lineTo(this.pos.x+Math.cos(this.angle)*this.radius,this.pos.y+Math.sin(this.angle)*this.radius); ctx.stroke(); ctx.restore(); }
}

export class ShieldGuardSkill extends Skill {
  constructor(){ super(); this.shieldLayers=5; this.nextRegen=5; this.nextThrow=1.3; this.throwCooldown=4.0; }
  modifyIncomingDamage(owner,amount,source,game,matchTime){ if(this.shieldLayers>0 && amount>0){ this.shieldLayers-=1; game?.addFloatingText(owner.pos,'SHIELD','heal'); return 0; } return amount; }
  update(owner,game,dt,matchTime){ if(matchTime>=this.nextRegen){ this.nextRegen+=5; this.shieldLayers+=1; game.addFloatingText(owner.pos,'+🛡','heal'); } if(matchTime>=this.nextThrow){ const enemy=game.nearestEnemy(owner); if(enemy){ this.nextThrow=matchTime+this.throwCooldown; const dir=safeNormalize(Vec2.sub(enemy.pos,owner.pos)); const start=Vec2.add(owner.pos,Vec2.scale(dir,owner.radius+18)); game.projectiles.push(new ShieldProjectile(owner,start,dir)); } } }
  draw(owner,game,ctx){ ctx.save(); ctx.strokeStyle=COLORS.shieldBlue; ctx.lineWidth=2; for(let i=0;i<Math.min(8,this.shieldLayers);i++){ ctx.beginPath(); ctx.arc(owner.pos.x,owner.pos.y,owner.radius+6+i*2,0,Math.PI*2); ctx.stroke(); } ctx.restore(); }
}

class SniperBulletProjectile extends Projectile {
  constructor(owner,pos,direction){ super(owner); this.pos=pos.clone(); this.prev=pos.clone(); this.vel=safeNormalize(direction).scale(2200); this.radius=5; this.age=0; this.life=0.35; }
  update(game,dt,matchTime){ this.prev=this.pos.clone(); this.pos.add(Vec2.scale(this.vel,dt)); this.age+=dt; if(this.age>=this.life||this.pos.x<game.arena.left-120||this.pos.x>game.arena.right+120||this.pos.y<game.arena.top-120||this.pos.y>game.arena.bottom+120){this.alive=false;return;} for(const ball of game.balls){ if(ball.hp<=0||game.areAllies(ball,this.owner)) continue; if(distancePointToSegment(ball.pos,this.prev,this.pos)<=ball.radius+this.radius){ ball.takeDamage(50,game,this.owner,matchTime); this.alive=false; return; } } }
  draw(ctx){ ctx.save(); ctx.strokeStyle=COLORS.sniperGold; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(this.prev.x,this.prev.y); ctx.lineTo(this.pos.x,this.pos.y); ctx.stroke(); ctx.fillStyle=COLORS.white; ctx.beginPath(); ctx.arc(this.pos.x,this.pos.y,this.radius,0,Math.PI*2); ctx.fill(); ctx.restore(); }
}

export class SniperSkill extends Skill {
  constructor(){ super(); this.ammo=0; this.nextLoad=1.5; this.halfTriggered=false; }
  update(owner,game,dt,matchTime){ if(matchTime>=this.nextLoad){ this.nextLoad+=1.5; this.ammo+=1; } if(this.ammo>=5){ const enemy=game.nearestEnemy(owner); if(enemy){ this.ammo-=5; const dir=safeNormalize(Vec2.sub(enemy.pos,owner.pos)); const start=Vec2.add(owner.pos,Vec2.scale(dir,owner.radius+16)); game.projectiles.push(new SniperBulletProjectile(owner,start,dir)); } } }
  onDamageTaken(owner,amount,source,game,matchTime){ this.ammo=Math.max(0,this.ammo-1); if(!this.halfTriggered && owner.hp<owner.maxHp/2){ this.halfTriggered=true; this.ammo+=2; } }
  draw(owner,game,ctx){ ctx.save(); ctx.fillStyle=COLORS.sniperGold; ctx.font='bold 13px Arial'; ctx.textAlign='center'; ctx.fillText(`●${this.ammo}`,owner.pos.x,owner.pos.y-owner.radius-8); ctx.restore(); }
}

class SpellWaveProjectile extends Projectile {
  constructor(owner,pos,direction,empowered=false,target=null){ super(owner); this.pos=pos.clone(); this.prev=pos.clone(); this.vel=safeNormalize(direction).scale(empowered?610:540); this.radius=empowered?18:16; this.empowered=empowered; this.target=target; }
  update(game,dt,matchTime){ this.prev=this.pos.clone(); this.pos.add(Vec2.scale(this.vel,dt)); if(this.pos.x<game.arena.left-120||this.pos.x>game.arena.right+120||this.pos.y<game.arena.top-120||this.pos.y>game.arena.bottom+120){this.alive=false;return;} for(const ball of game.balls){ if(ball.hp<=0||game.areAllies(ball,this.owner)) continue; if(!circleHit(this.pos,this.radius,ball.pos,ball.radius)) continue; ball.takeDamage(3,game,this.owner,matchTime); ball.addStun(0.3,matchTime); ball.spellMarks=Math.min(5,(ball.spellMarks||0)+1); if(this.empowered){ ball.spellMarks=Math.max(0,(ball.spellMarks||0)-1); this.owner.heal(2,game); } this.alive=false; return; } }
  draw(ctx){ ctx.save(); ctx.strokeStyle=this.empowered?COLORS.spellCyan:COLORS.spellPurple; ctx.lineWidth=this.empowered?4:3; ctx.beginPath(); ctx.arc(this.pos.x,this.pos.y,this.radius,0,Math.PI*2); ctx.stroke(); ctx.restore(); }
}

export class SpellSkill extends Skill {
  constructor(){ super(); this.nextFire=0.55; this.cooldown=0.8; this.chainTarget=null; this.chainEnd=0; this.nextChainWave=0; }
  update(owner,game,dt,matchTime){
    if(this.chainTarget && (matchTime>=this.chainEnd || this.chainTarget.hp<=0 || (this.chainTarget.spellMarks||0)<=0)){ this.chainTarget=null; }
    if(this.chainTarget){ owner.addSlow(0.2,0.2,matchTime); this.chainTarget.addSlow(0.2,0.25,matchTime); if(matchTime>=this.nextChainWave){ this.nextChainWave=matchTime+0.6; const dir=safeNormalize(Vec2.sub(this.chainTarget.pos,owner.pos)); const start=Vec2.add(owner.pos,Vec2.scale(dir,owner.radius+16)); game.projectiles.push(new SpellWaveProjectile(owner,start,dir,true,this.chainTarget)); } return; }
    for(const ball of game.balls){ if(ball.hp>0&&!game.areAllies(ball,owner)&&(ball.spellMarks||0)>=5){ this.chainTarget=ball; this.chainEnd=matchTime+5; this.nextChainWave=matchTime; break; } }
    if(matchTime<this.nextFire) return; const enemy=game.nearestEnemy(owner); if(!enemy) return; this.nextFire=matchTime+this.cooldown; const dir=safeNormalize(Vec2.sub(enemy.pos,owner.pos)); const start=Vec2.add(owner.pos,Vec2.scale(dir,owner.radius+16)); game.projectiles.push(new SpellWaveProjectile(owner,start,dir,false));
  }
  draw(owner,game,ctx){ if(this.chainTarget){ ctx.save(); ctx.strokeStyle=COLORS.spellPurple; ctx.lineWidth=3; ctx.setLineDash([8,6]); ctx.beginPath(); ctx.moveTo(owner.pos.x,owner.pos.y); ctx.lineTo(this.chainTarget.pos.x,this.chainTarget.pos.y); ctx.stroke(); ctx.restore(); } }
}

class ArrowRainHazard extends Hazard {
  constructor(owner,pos,matchTime){ super(owner); this.pos=pos.clone(); this.created=matchTime; this.warn=0.4; this.radius=Math.floor(BALL_RADIUS*4.2); this.hit=false; this.end=matchTime+0.65; }
  update(game,dt,matchTime){ if(matchTime>=this.end){this.alive=false;return;} if(!this.hit && matchTime>=this.created+this.warn){ this.hit=true; for(const ball of game.balls){ if(ball.hp<=0||game.areAllies(ball,this.owner)) continue; if(this.pos.distanceTo(ball.pos)<=this.radius+ball.radius){ ball.takeDamage(3,game,this.owner,matchTime); ball.addSlow(0.8,3.0,matchTime); } } } }
  draw(ctx){ ctx.save(); ctx.strokeStyle=this.hit?COLORS.arrowGold:COLORS.arrowRainBlue; ctx.lineWidth=this.hit?5:2; ctx.beginPath(); ctx.arc(this.pos.x,this.pos.y,this.radius,0,Math.PI*2); ctx.stroke(); if(this.hit){ ctx.beginPath(); ctx.moveTo(this.pos.x,this.pos.y-this.radius); ctx.lineTo(this.pos.x,this.pos.y+this.radius); ctx.stroke(); } ctx.restore(); }
}
class CloudArrowProjectile extends Projectile {
  constructor(owner,pos,direction){ super(owner); this.pos=pos.clone(); this.prev=pos.clone(); this.direction=safeNormalize(direction); this.vel=this.direction.clone().scale(1550); this.radius=10; this.age=0; this.maxAge=0.95; this.hit=new Set(); }
  update(game,dt,matchTime){ this.prev=this.pos.clone(); this.pos.add(Vec2.scale(this.vel,dt)); this.age+=dt; if(this.age>=this.maxAge||this.pos.x<game.arena.left-240||this.pos.x>game.arena.right+240||this.pos.y<game.arena.top-240||this.pos.y>game.arena.bottom+240){this.alive=false;return;} for(const ball of game.balls){ if(ball.hp<=0||game.areAllies(ball,this.owner)||this.hit.has(ball.uid)) continue; if(distancePointToSegment(ball.pos,this.prev,this.pos)<=ball.radius+this.radius){ this.hit.add(ball.uid); ball.takeDamage(10,game,this.owner,matchTime); ball.addSlow(0.8,3.0,matchTime); const knock=safeNormalize(Vec2.sub(ball.pos,this.prev)); ball.vel=knock.scale(Math.max(ball.currentSpeed(matchTime),520)); ball.externalForceUntil=matchTime+0.18; } } }
  draw(ctx){ const dir=this.direction, perp=dir.perp(); ctx.save(); ctx.strokeStyle=COLORS.arrowRainBlue; ctx.lineWidth=9; ctx.beginPath(); ctx.moveTo(this.pos.x-dir.x*78,this.pos.y-dir.y*78); ctx.lineTo(this.pos.x,this.pos.y); ctx.stroke(); ctx.strokeStyle=COLORS.white; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(this.pos.x-dir.x*46,this.pos.y-dir.y*46); ctx.lineTo(this.pos.x,this.pos.y); ctx.stroke(); ctx.fillStyle=COLORS.arrowGold; ctx.strokeStyle=COLORS.black; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(this.pos.x+dir.x*20,this.pos.y+dir.y*20); ctx.lineTo(this.pos.x-dir.x*12+perp.x*10,this.pos.y-dir.y*12+perp.y*10); ctx.lineTo(this.pos.x-dir.x*12-perp.x*10,this.pos.y-dir.y*12-perp.y*10); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }
}

export class CatherineSkill extends Skill {
  constructor(){ super(); this.nextCast=2.0; this.cooldown=6.0; this.casting=false; this.castEnd=0; this.remaining=0; this.nextRain=0; }
  update(owner,game,dt,matchTime){
    if(this.casting){ owner.addStun(0.1,matchTime); if(this.remaining>0 && matchTime>=this.nextRain){ const enemy=game.nearestEnemy(owner); if(enemy) game.hazards.push(new ArrowRainHazard(owner,enemy.pos,matchTime)); this.remaining-=1; this.nextRain=matchTime+0.4; } if(matchTime>=this.castEnd){ this.casting=false; this.nextCast=matchTime+this.cooldown; const enemy=game.nearestEnemy(owner); if(enemy){ const dir=safeNormalize(Vec2.sub(enemy.pos,owner.pos)); const start=Vec2.add(owner.pos,Vec2.scale(dir,owner.radius+18)); game.projectiles.push(new CloudArrowProjectile(owner,start,dir)); } } return; }
    if(matchTime>=this.nextCast){ this.casting=true; this.remaining=15; this.nextRain=matchTime; this.castEnd=matchTime+6.0; }
  }
}


// ============================================================
// Round 3 field/control角色 + Python-like visual effects
// ============================================================

class PoisonFangHazardWeb extends Hazard {
  constructor(owner, pos, wall) {
    super(owner);
    this.pos = pos.clone();
    this.wall = wall;
    this.triggerRadius = 18;
    this.nextTrigger = new Map();
  }
  update(game, dt, matchTime) {
    for (const ball of game.balls) {
      if (ball.hp <= 0 || game.areAllies(ball, this.owner)) continue;
      if (this.pos.distanceTo(ball.pos) > ball.radius + this.triggerRadius) continue;
      const next = this.nextTrigger.get(ball.uid) ?? 0;
      if (matchTime < next) continue;
      this.nextTrigger.set(ball.uid, matchTime + 1.0);
      ball.addSlow(0.8, 3.0, matchTime);
      ball.addDot(1, 0.6, 3.0, matchTime, 'poison fang');
      game.addFloatingText(ball.pos, '毒', 'heal');
    }
  }
  draw(ctx) {
    const inward = this.wall === 'left' ? new Vec2(1, 0) : this.wall === 'right' ? new Vec2(-1, 0) : this.wall === 'top' ? new Vec2(0, 1) : new Vec2(0, -1);
    const perp = inward.perp();
    const tip = Vec2.add(this.pos, Vec2.scale(inward, 20));
    const b1 = Vec2.add(this.pos, Vec2.scale(perp, -10));
    const b2 = Vec2.add(this.pos, Vec2.scale(perp, 10));
    ctx.save();
    ctx.fillStyle = COLORS.poisonGreen;
    ctx.strokeStyle = COLORS.black;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

export class PoisonFangSkill extends Skill {
  onWallBounce(owner, wall, game, matchTime) {
    const a = game.arena;
    const p = wall === 'left' ? new Vec2(a.left, owner.pos.y) : wall === 'right' ? new Vec2(a.right, owner.pos.y) : wall === 'top' ? new Vec2(owner.pos.x, a.top) : new Vec2(owner.pos.x, a.bottom);
    game.hazards.push(new PoisonFangHazardWeb(owner, p, wall));
  }
}

class SpiderWebHazardWeb extends Hazard {
  constructor(owner, anchor, key) { super(owner); this.anchor = anchor.clone(); this.key = key; this.lastEnd = anchor.clone(); this.nextDamage = new Map(); }
  currentEnd() { if (this.owner?.hp > 0) this.lastEnd = this.owner.pos.clone(); return this.lastEnd; }
  update(game, dt, matchTime) {
    const end = this.currentEnd();
    for (const ball of game.balls) {
      if (ball.hp <= 0 || game.areAllies(ball, this.owner)) continue;
      if (distancePointToSegment(ball.pos, this.anchor, end) > ball.radius + 2) continue;
      const next = this.nextDamage.get(ball.uid) ?? 0;
      if (matchTime < next) continue;
      this.nextDamage.set(ball.uid, matchTime + 0.45);
      ball.takeDamage(1, game, this.owner, matchTime);
    }
  }
  draw(ctx) { const end = this.currentEnd(); ctx.save(); ctx.strokeStyle = COLORS.spiderPurple; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(this.anchor.x, this.anchor.y); ctx.lineTo(end.x, end.y); ctx.stroke(); ctx.strokeStyle = COLORS.white; ctx.lineWidth = 1; ctx.stroke(); ctx.restore(); }
}

export class SpiderSkill extends Skill {
  speedMultiplier(owner, matchTime) { return matchTime < 5 ? 1.5 : 1; }
  onWallBounce(owner, wall, game, matchTime) {
    const a = game.arena;
    const p = wall === 'left' ? new Vec2(a.left, owner.pos.y) : wall === 'right' ? new Vec2(a.right, owner.pos.y) : wall === 'top' ? new Vec2(owner.pos.x, a.top) : new Vec2(owner.pos.x, a.bottom);
    const bucket = wall === 'left' || wall === 'right' ? Math.floor((p.y - a.top) / 55) : Math.floor((p.x - a.left) / 55);
    const key = `${owner.uid}-${wall}-${bucket}`;
    game.spiderWebKeys ??= new Set();
    if (game.spiderWebKeys.has(key)) return;
    game.spiderWebKeys.add(key);
    game.hazards.push(new SpiderWebHazardWeb(owner, p, key));
  }
}

export class GasCanSkill extends Skill {
  constructor() { super(); this.nextStart = 2.0; this.phase = 'idle'; this.chargeEnd = 0; this.boostEnd = 0; this.hitCooldown = 0.38; this.nextHit = new Map(); }
  update(owner, game, dt, matchTime) {
    if (this.phase === 'idle' && matchTime >= this.nextStart) { this.phase = 'charge'; this.chargeEnd = matchTime + 1.0; owner.addStun(1.0, matchTime); }
    if (this.phase === 'charge' && matchTime >= this.chargeEnd) { this.phase = 'boost'; this.boostEnd = matchTime + 2.0; owner.radius = 42; owner.vel = safeNormalize(owner.vel).scale(owner.baseSpeed * 2.5); owner.externalForceUntil = this.boostEnd; }
    if (this.phase === 'boost') {
      owner.radius = 42;
      if (owner.vel.length() < owner.baseSpeed * 2.5 * 0.8) owner.vel = safeNormalize(owner.vel).scale(owner.baseSpeed * 2.5);
      for (const ball of game.balls) {
        if (ball.hp <= 0 || ball === owner || game.areAllies(ball, owner)) continue;
        if (!circleHit(owner.pos, owner.radius, ball.pos, ball.radius)) continue;
        const next = this.nextHit.get(ball.uid) ?? 0;
        if (matchTime < next) continue;
        this.nextHit.set(ball.uid, matchTime + this.hitCooldown);
        ball.takeDamage(10, game, owner, matchTime);
        const knock = safeNormalize(Vec2.sub(ball.pos, owner.pos));
        ball.vel = knock.scale(1350);
        ball.externalForceUntil = matchTime + 0.70;
      }
      if (matchTime >= this.boostEnd) { this.phase = 'idle'; owner.radius = owner.role.radius ?? BALL_RADIUS; this.nextStart = matchTime + 2.0; }
    }
  }
  speedMultiplier(owner, matchTime) { return this.phase === 'boost' ? 2.5 : 1; }
  draw(owner, game, ctx) {
    if (this.phase === 'idle') return;
    ctx.save();
    ctx.strokeStyle = this.phase === 'charge' ? COLORS.yellow : COLORS.orange;
    ctx.lineWidth = this.phase === 'charge' ? 3 : 6;
    ctx.beginPath(); ctx.arc(owner.pos.x, owner.pos.y, owner.radius + 7, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

export class HandSkill extends Skill {
  constructor() { super(); this.handRadius = 28; this.hold = null; this.holdEnd = 0; this.cooldownUntil = 0; this.handDir = new Vec2(0, -1); }
  handPos(owner, game) {
    const enemy = game.nearestEnemy(owner);
    if (enemy) this.handDir = safeNormalize(Vec2.sub(enemy.pos, owner.pos));
    return Vec2.add(owner.pos, Vec2.scale(this.handDir, owner.radius + 38));
  }
  update(owner, game, dt, matchTime) {
    const hp = this.handPos(owner, game);
    if (this.hold) {
      this.hold.pos = hp.clone();
      this.hold.vel = new Vec2(0, 0);
      this.hold.heldBy = owner;
      if (matchTime >= this.holdEnd || this.hold.hp <= 0 || owner.hp <= 0) {
        const target = this.hold;
        target.heldBy = null;
        const dir = randomUnitVector();
        target.vel = dir.scale(1150);
        target.externalForceUntil = matchTime + 2.0;
        target.throwWallDamageUntil = matchTime + 2.0;
        target.throwWallDamage = 5;
        target.nextThrowWallDamage = matchTime;
        this.hold = null;
        this.cooldownUntil = matchTime + 1.2;
      }
      return;
    }
    if (matchTime < this.cooldownUntil) return;
    for (const ball of game.balls) {
      if (ball.hp <= 0 || ball === owner || game.areAllies(ball, owner) || ball.heldBy) continue;
      if (!circleHit(hp, this.handRadius, ball.pos, ball.radius)) continue;
      this.hold = ball;
      this.holdEnd = matchTime + 1.0;
      ball.heldBy = owner;
      ball.addStun(1.0, matchTime);
      break;
    }
  }
  draw(owner, game, ctx) {
    const hp = this.handPos(owner, game);
    ctx.save();
    ctx.fillStyle = COLORS.handSkin; ctx.strokeStyle = COLORS.black; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(hp.x, hp.y, this.handRadius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const perp = this.handDir.perp();
    for (const off of [-14, -5, 5, 14]) { const base = Vec2.add(hp, Vec2.scale(perp, off)); ctx.beginPath(); ctx.ellipse(base.x + this.handDir.x * 15, base.y + this.handDir.y * 15, 5, 12, Math.atan2(this.handDir.y, this.handDir.x), 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    ctx.restore();
  }
}

class DragonPassHazardWeb extends Hazard {
  constructor(owner, arena, matchTime) {
    super(owner); this.created = matchTime; this.warn = 1.0; this.active = 2.8; this.trackWidth = Math.floor(BALL_RADIUS * 3.5); this.dragonLength = ARENA_SIZE * 4; this.hitCooldown = 0.18; this.nextHit = new Map(); this.drawTime = matchTime;
    const center = new Vec2((arena.left + arena.right) / 2, (arena.top + arena.bottom) / 2); const angle = Math.random() * Math.PI * 2; this.dir = new Vec2(Math.cos(angle), Math.sin(angle)); this.perp = this.dir.perp();
    this.trackCenter = Vec2.add(center, Vec2.scale(this.perp, (Math.random() * 2 - 1) * ARENA_SIZE * 0.32)); this.crossMargin = Math.hypot(arena.width, arena.height) / 2 + this.trackWidth + 40; this.warnHalf = this.crossMargin + 30;
    this.start = Vec2.add(this.trackCenter, Vec2.scale(this.dir, -this.crossMargin)); this.end = Vec2.add(this.trackCenter, Vec2.scale(this.dir, this.crossMargin + this.dragonLength));
  }
  segment(matchTime) { const t = clamp((matchTime - this.created - this.warn) / this.active, 0, 1); const head = this.start.lerp(this.end, t); const tail = Vec2.add(head, Vec2.scale(this.dir, -this.dragonLength)); return { tail, head }; }
  update(game, dt, matchTime) {
    this.drawTime = matchTime;
    if (matchTime >= this.created + this.warn + this.active) { this.alive = false; return; }
    if (matchTime < this.created + this.warn) return;
    const { tail, head } = this.segment(matchTime);
    for (const ball of game.balls) {
      if (ball.hp <= 0 || game.areAllies(ball, this.owner) || ball.heldBy) continue;
      if (distancePointToSegment(ball.pos, tail, head) > ball.radius + this.trackWidth / 2) continue;
      const next = this.nextHit.get(ball.uid) ?? 0;
      if (matchTime < next) continue;
      this.nextHit.set(ball.uid, matchTime + this.hitCooldown);
      ball.takeDamage(5, game, this.owner, matchTime);
      const knock = safeNormalize(Vec2.add(this.dir, Vec2.scale(this.perp, Math.random() * 0.9 - 0.45)));
      ball.vel = knock.scale(1240);
      ball.externalForceUntil = matchTime + 0.65;
    }
  }
  draw(ctx) {
    const a = Vec2.add(this.trackCenter, Vec2.scale(this.dir, -this.warnHalf)); const b = Vec2.add(this.trackCenter, Vec2.scale(this.dir, this.warnHalf));
    ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(120,70,25,.85)'; ctx.lineWidth = this.trackWidth; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.strokeStyle = COLORS.yellow; ctx.lineWidth = 3; ctx.stroke();
    if (this.drawTime >= this.created + this.warn) { const { tail, head } = this.segment(this.drawTime); ctx.strokeStyle = COLORS.red; ctx.lineWidth = this.trackWidth * 0.78; ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(head.x, head.y); ctx.stroke(); ctx.strokeStyle = COLORS.orange; ctx.lineWidth = this.trackWidth * 0.42; ctx.stroke(); const left = Vec2.add(Vec2.add(head, Vec2.scale(this.dir, -34)), Vec2.scale(this.perp, 22)); const right = Vec2.add(Vec2.add(head, Vec2.scale(this.dir, -34)), Vec2.scale(this.perp, -22)); ctx.fillStyle = COLORS.yellow; ctx.strokeStyle = COLORS.black; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(head.x + this.dir.x * 20, head.y + this.dir.y * 20); ctx.lineTo(left.x, left.y); ctx.lineTo(right.x, right.y); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    ctx.restore();
  }
}

export class DragonHeirSkill extends Skill {
  constructor() { super(); this.nextCast = 1.5; this.cooldown = 5.0; }
  update(owner, game, dt, matchTime) { if (matchTime < this.nextCast) return; this.nextCast = matchTime + this.cooldown; game.hazards.push(new DragonPassHazardWeb(owner, game.arena, matchTime)); }
}

class FootprintHazardWeb extends Hazard {
  constructor(owner, arena, matchTime) { super(owner); this.created = matchTime; this.warn = 1.0; this.stomp = 0.45; this.pos = randomPointInRect(arena, 118); this.dir = randomUnitVector(); this.perp = this.dir.perp(); this.footLength = 265; this.footWidth = 170; this.toeRadius = 28; this.hit = false; this.drawTime = matchTime; }
  inside(point, extra = 0) { const sole = Vec2.add(this.pos, Vec2.scale(this.dir, -12)); const rel = Vec2.sub(point, sole); const lx = rel.dot(this.perp); const ly = rel.dot(this.dir); if ((lx / (this.footWidth / 2 + extra)) ** 2 + (ly / (this.footLength / 2 + extra)) ** 2 <= 1) return true; const toeBase = Vec2.add(this.pos, Vec2.scale(this.dir, this.footLength * 0.43)); for (const [off, scale] of [[-0.36,0.82],[-0.12,1.0],[0.12,0.96],[0.36,0.78]]) { const c = Vec2.add(toeBase, Vec2.scale(this.perp, off * this.footWidth)); if (point.distanceTo(c) <= this.toeRadius * scale + extra) return true; } return false; }
  update(game, dt, matchTime) { this.drawTime = matchTime; if (matchTime >= this.created + this.warn + this.stomp) { this.alive = false; return; } if (!this.hit && matchTime >= this.created + this.warn) { this.hit = true; for (const ball of game.balls) { if (ball.hp <= 0 || game.areAllies(ball, this.owner)) continue; if (this.inside(ball.pos, ball.radius)) { ball.takeDamage(25, game, this.owner, matchTime); ball.vel = safeNormalize(Vec2.sub(ball.pos, this.pos)).scale(720); ball.externalForceUntil = matchTime + 0.25; } } } }
  draw(ctx) { const active = this.drawTime >= this.created + this.warn; ctx.save(); ctx.fillStyle = active ? COLORS.footPink : 'rgba(255,220,245,.28)'; ctx.strokeStyle = active ? COLORS.black : COLORS.footPink; ctx.lineWidth = active ? 2 : 3; const sole = Vec2.add(this.pos, Vec2.scale(this.dir, -12)); ctx.beginPath(); for (let i = 0; i < 40; i++) { const t = i / 40 * Math.PI * 2; const p = Vec2.add(Vec2.add(sole, Vec2.scale(this.perp, Math.cos(t) * this.footWidth / 2)), Vec2.scale(this.dir, Math.sin(t) * this.footLength / 2)); if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); } ctx.closePath(); if (active) ctx.fill(); ctx.stroke(); const toeBase = Vec2.add(this.pos, Vec2.scale(this.dir, this.footLength * 0.48)); for (const [off, scale] of [[-0.36,0.82],[-0.12,1.0],[0.12,0.96],[0.36,0.78]]) { const c = Vec2.add(toeBase, Vec2.scale(this.perp, off * this.footWidth)); ctx.beginPath(); ctx.arc(c.x, c.y, this.toeRadius * scale, 0, Math.PI * 2); if (active) ctx.fill(); ctx.stroke(); } ctx.restore(); }
}

export class JadeFootSkill extends Skill { constructor() { super(); this.nextCast = 1.5; this.cooldown = 6.0; } update(owner, game, dt, matchTime) { if (matchTime < this.nextCast) return; this.nextCast = matchTime + this.cooldown; game.hazards.push(new FootprintHazardWeb(owner, game.arena, matchTime)); } }

class WaveRingHazardWeb extends Hazard {
  constructor(owner, pos, matchTime) { super(owner); this.pos = pos.clone(); this.created = matchTime; this.growth = 430; this.width = 15; this.hit = new Set(); this.pushed = new Map(); this.drawTime = matchTime; this.despawn = null; }
  radiusAt(matchTime) { return 24 + Math.max(0, matchTime - this.created) * this.growth; }
  update(game, dt, matchTime) { this.drawTime = matchTime; const r = this.radiusAt(matchTime); if (this.despawn == null) { const corners = [new Vec2(game.arena.left,game.arena.top),new Vec2(game.arena.right,game.arena.top),new Vec2(game.arena.left,game.arena.bottom),new Vec2(game.arena.right,game.arena.bottom)]; this.despawn = Math.max(...corners.map(c => this.pos.distanceTo(c))) + BALL_RADIUS * 3; }
    for (const [uid, data] of [...this.pushed.entries()]) { const { ball, dir, end } = data; if (ball.hp <= 0 || matchTime >= end) { this.pushed.delete(uid); continue; } ball.vel = dir.clone().scale(Math.max(ball.currentSpeed(matchTime) * 2.2, 820)); ball.externalForceUntil = matchTime + 0.12; }
    if (r <= this.despawn) { for (const ball of game.balls) { if (ball.hp <= 0 || game.areAllies(ball, this.owner) || ball.heldBy || this.hit.has(ball.uid)) continue; const d = this.pos.distanceTo(ball.pos); if (Math.abs(d - r) <= ball.radius + this.width) { this.hit.add(ball.uid); ball.takeDamage(8, game, this.owner, matchTime); const dir = safeNormalize(Vec2.sub(ball.pos, this.pos)); ball.vel = dir.clone().scale(Math.max(ball.currentSpeed(matchTime) * 2.2, 820)); ball.externalForceUntil = matchTime + 0.5; this.pushed.set(ball.uid, { ball, dir, end: matchTime + 0.5 }); } } }
    if (r > this.despawn && this.pushed.size === 0) this.alive = false;
  }
  draw(ctx) { const r = this.radiusAt(this.drawTime); ctx.save(); ctx.strokeStyle = COLORS.waveBlue; ctx.lineWidth = this.width; ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, r, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = COLORS.white; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); }
}
export class WaveSkill extends Skill { constructor() { super(); this.nextCast = 1.2; this.cooldown = 4.0; } update(owner, game, dt, matchTime) { if (matchTime < this.nextCast) return; this.nextCast = matchTime + this.cooldown; game.hazards.push(new WaveRingHazardWeb(owner, owner.pos, matchTime)); } }

class FlowerbedHazardWeb extends Hazard {
  constructor(owner, pos) { super(owner); this.pos = pos.clone(); this.radius = 42; this.touching = new Set(); }
  update(game, dt, matchTime) { const nowTouching = new Set(); for (const ball of game.balls) { if (ball.hp <= 0 || ball === this.owner || game.areAllies(ball, this.owner)) continue; const touching = circleHit(this.pos, this.radius, ball.pos, ball.radius); if (touching) { nowTouching.add(ball.uid); if (!this.touching.has(ball.uid)) { ball.flowerbedSlow = Math.min(0.95, (ball.flowerbedSlow || 0) + 0.02); game.addFloatingText(ball.pos, '-SPD', 'damage'); } } } this.touching = nowTouching; }
  draw(ctx) { ctx.save(); ctx.strokeStyle = COLORS.flowerPink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = COLORS.flowerPink; for (let i = 0; i < 8; i++) { const a = i * Math.PI * 2 / 8; ctx.beginPath(); ctx.arc(this.pos.x + Math.cos(a) * 22, this.pos.y + Math.sin(a) * 22, 8, 0, Math.PI * 2); ctx.fill(); } ctx.fillStyle = COLORS.cressonPink; ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, 11, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
}

class CressonDoomWaveHazardWeb extends Hazard {
  constructor(owner, pos, matchTime) { super(owner); this.pos = pos.clone(); this.created = matchTime; this.growth = 2200; this.width = 26; this.hit = new Set(); this.drawTime = matchTime; this.despawn = null; }
  radiusAt(matchTime) { return 18 + Math.max(0, matchTime - this.created) * this.growth; }
  update(game, dt, matchTime) { this.drawTime = matchTime; const r = this.radiusAt(matchTime); if (this.despawn == null) { const corners = [new Vec2(game.arena.left,game.arena.top),new Vec2(game.arena.right,game.arena.top),new Vec2(game.arena.left,game.arena.bottom),new Vec2(game.arena.right,game.arena.bottom)]; this.despawn = Math.max(...corners.map(c => this.pos.distanceTo(c))) + BALL_RADIUS * 4; } for (const ball of game.balls) { if (ball.hp <= 0 || game.areAllies(ball, this.owner) || this.hit.has(ball.uid)) continue; const d = this.pos.distanceTo(ball.pos); if (Math.abs(d - r) <= ball.radius + this.width) { this.hit.add(ball.uid); ball.takeDamage(999, game, this.owner, matchTime); ball.vel = safeNormalize(Vec2.sub(ball.pos, this.pos)).scale(1500); ball.externalForceUntil = matchTime + 0.4; } } if (r > this.despawn) { for (const ball of game.balls) { if (ball.hp > 0 && !game.areAllies(ball, this.owner) && !this.hit.has(ball.uid)) { this.hit.add(ball.uid); ball.takeDamage(999, game, this.owner, matchTime); } } this.alive = false; } }
  draw(ctx) { const r = this.radiusAt(this.drawTime); ctx.save(); ctx.strokeStyle = COLORS.white; ctx.lineWidth = Math.max(2, this.width / 2); ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, r, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = COLORS.cressonPink; ctx.lineWidth = this.width; ctx.stroke(); ctx.strokeStyle = COLORS.waveBlue; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, r + 10, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
}

export class CressonSkill extends Skill {
  constructor() { super(); this.nextTeleport = 3.0; this.teleports = 0; this.doomed = false; }
  update(owner, game, dt, matchTime) {
    owner.vel = new Vec2(0, 0);
    if (!this.doomed && (this.teleports >= 20 || matchTime >= 60.0)) { this.doomed = true; game.hazards.push(new CressonDoomWaveHazardWeb(owner, owner.pos, matchTime)); }
    if (matchTime < this.nextTeleport) return;
    this.nextTeleport = matchTime + 3.0;
    this.teleports += 1;
    game.hazards.push(new FlowerbedHazardWeb(owner, owner.pos));
    owner.pos = randomPointInRect(game.arena, BALL_RADIUS + 10);
  }
}
