import { Skill } from '../skillBase.js';
import { Projectile } from '../projectileBase.js';
import { Hazard } from '../hazardBase.js';
import { ARENA_SIZE, BALL_RADIUS, BALL_SPEED, COLORS, NORMAL_BODY_COOLDOWN, NORMAL_BODY_DAMAGE } from '../config.js';
import { Vec2, randomUnitVector, safeNormalize } from '../vector.js';
import { circleHit, distancePointToSegment, randomPointInRect, clamp } from '../utils.js';
import { ParticleBurstEffect, PulseRingEffect } from '../effects.js';

function drawPaperPage(ctx, center, direction, width = 30, height = 22) {
  const dir = safeNormalize(direction);
  const perp = dir.perp();
  const pts = [
    Vec2.add(Vec2.add(center, Vec2.scale(dir, width / 2)), Vec2.scale(perp, height / 2)),
    Vec2.add(Vec2.add(center, Vec2.scale(dir, -width / 2)), Vec2.scale(perp, height / 2)),
    Vec2.add(Vec2.add(center, Vec2.scale(dir, -width / 2)), Vec2.scale(perp, -height / 2)),
    Vec2.add(Vec2.add(center, Vec2.scale(dir, width / 2)), Vec2.scale(perp, -height / 2))
  ];
  ctx.save();
  ctx.fillStyle = COLORS.paperWhite;
  ctx.strokeStyle = COLORS.paperEdge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const corner = pts[0];
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(corner.x - dir.x * 8, corner.y - dir.y * 8);
  ctx.lineTo(corner.x - perp.x * 8, corner.y - perp.y * 8);
  ctx.stroke();
  ctx.lineWidth = 1;
  for (const off of [-4, 4]) {
    const c = Vec2.add(center, Vec2.scale(perp, off));
    ctx.beginPath();
    ctx.moveTo(c.x - dir.x * 8, c.y - dir.y * 8);
    ctx.lineTo(c.x + dir.x * 8, c.y + dir.y * 8);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTinyFoot(ctx, center) {
  ctx.save();
  ctx.fillStyle = COLORS.footPink;
  ctx.strokeStyle = COLORS.black;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(center.x, center.y, 10, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(center.x - 9 + i * 6, center.y - 24, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}


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
      const knock = safeNormalize(Vec2.sub(ball.pos, p));
      ball.vel = knock.scale(Math.max(ball.currentSpeed(matchTime), 650));
      ball.externalForceUntil = matchTime + 0.18;
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
    ctx.arc(p.x + 4, p.y + 5, this.hammerRadius, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.black;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y, this.hammerRadius, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.yellow;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = COLORS.orange;
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = COLORS.white;
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
      const delta = Vec2.sub(drain.target.pos, owner.pos);
      const dist = delta.length();
      if (dist > 0) {
        const normal = delta.scale(1 / dist);
        const desired = owner.radius + drain.target.radius + 5;
        if (dist > desired) {
          const pull = Math.min((dist - desired) * 0.08, 4);
          owner.pos.add(Vec2.scale(normal, pull));
          drain.target.pos.add(Vec2.scale(normal, -pull));
        }
      }
      while (matchTime >= drain.next && drain.next <= drain.end) {
        drain.next += this.drainInterval;
        const actual = drain.target.takeDamage(this.drainDamage, game, owner, matchTime);
        if (actual > 0) owner.heal(this.drainHeal, game);
      }
    }
  }

  draw(owner, game, ctx) {
    const target = game.nearestEnemy(owner);
    const direction = target ? safeNormalize(Vec2.sub(target.pos, owner.pos)) : new Vec2(1, 0);
    const perp = direction.perp();
    ctx.save();
    ctx.lineCap = 'round';
    for (const side of [1, -1]) {
      const base = Vec2.add(Vec2.add(owner.pos, Vec2.scale(direction, 18)), Vec2.scale(perp, side * 8));
      const tip = Vec2.add(Vec2.add(owner.pos, Vec2.scale(direction, 44)), Vec2.scale(perp, side * 4));
      ctx.strokeStyle = COLORS.white;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
      ctx.strokeStyle = COLORS.darkRed;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(tip.x + direction.x * 5, tip.y + direction.y * 5); ctx.stroke();
    }
    for (const drain of this.activeDrains.values()) {
      if (drain.target?.hp > 0) {
        ctx.strokeStyle = COLORS.red;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(owner.pos.x, owner.pos.y); ctx.lineTo(drain.target.pos.x, drain.target.pos.y); ctx.stroke();
      }
    }
    ctx.restore();
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
    ctx.strokeStyle = COLORS.heal;
    ctx.lineWidth = 4;
    for (let i = 0; i < 4; i++) {
      const a = this.pulse + i * Math.PI * 2 / 4;
      ctx.beginPath();
      ctx.moveTo(this.pos.x + Math.cos(a) * 18, this.pos.y + Math.sin(a) * 18);
      ctx.lineTo(this.pos.x + Math.cos(a) * 34, this.pos.y + Math.sin(a) * 34);
      ctx.stroke();
    }
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
    const start = Vec2.add(owner.pos, Vec2.scale(dir, owner.radius + 18));
    game.projectiles.push(new HealingOrbProjectile(owner, start, dir));
  }
  draw(owner, game, ctx) {
    const top = new Vec2(owner.pos.x, owner.pos.y - owner.radius - 16);
    ctx.save();
    ctx.fillStyle = COLORS.huatuo;
    ctx.strokeStyle = COLORS.black;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(top.x, top.y, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = COLORS.white; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(top.x - 7, top.y); ctx.lineTo(top.x + 7, top.y); ctx.moveTo(top.x, top.y - 7); ctx.lineTo(top.x, top.y + 7); ctx.stroke();
    ctx.restore();
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
  immuneToControl(owner, matchTime) { return this.isPhased(owner, matchTime); }
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

  draw(owner, game, ctx) {
    const now = owner.lastMatchTime || 0;
    const phased = this.isPhased(owner, now);
    const color = phased ? COLORS.ghostPhase : COLORS.ghost;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = COLORS.black;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const a = now * 3.0 + i * Math.PI * 2 / 3;
      const p = Vec2.add(owner.pos, Vec2.scale(new Vec2(Math.cos(a), Math.sin(a)), owner.radius + 13));
      ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(owner.pos.x - 9, owner.pos.y - 7, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(owner.pos.x + 9, owner.pos.y - 7, 4, 0, Math.PI * 2); ctx.fill();
    if (phased) {
      ctx.strokeStyle = color;
      ctx.beginPath(); ctx.arc(owner.pos.x, owner.pos.y, owner.radius + 8, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = color;
      for (let i = 0; i < 6; i++) {
        const a = now * 5.0 + i * Math.PI * 2 / 6;
        const p = Vec2.add(owner.pos, Vec2.scale(new Vec2(Math.cos(a), Math.sin(a)), owner.radius + 23));
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
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
    this.maxHistory = 80;
    this.nextHit = new Map();
    this.colors = [COLORS.ribbonRed, COLORS.ribbonBlue, COLORS.ribbonGold];
    this.wavePhase = Math.random() * Math.PI * 2;
  }

  updateHistory(owner) {
    if (!this.history.length || this.history[this.history.length - 1].distanceTo(owner.pos) > 3) this.history.push(owner.pos.clone());
    if (this.history.length > this.maxHistory) this.history = this.history.slice(this.history.length - this.maxHistory);
  }

  update(owner, game, dt, matchTime) {
    this.wavePhase += dt * 5.0;
    this.updateHistory(owner);
    for (let i = 0; i < this.ribbonCount; i++) {
      const pts = this.ribbonPoints(owner, i, matchTime);
      for (const ball of game.balls) {
        if (ball.hp <= 0 || ball === owner || game.areAllies(ball, owner)) continue;
        const key = `${ball.uid}:${i}`;
        if (matchTime < (this.nextHit.get(key) ?? 0)) continue;
        let touching = false;
        for (let j = 1; j < pts.length; j++) {
          if (distancePointToSegment(ball.pos, pts[j - 1], pts[j]) <= ball.radius + 4) { touching = true; break; }
        }
        if (!touching) continue;
        this.nextHit.set(key, matchTime + this.hitCooldown);
        ball.takeDamage(this.damage, game, owner, matchTime);
      }
    }
  }

  ribbonPoints(owner, index, matchTime = owner.lastMatchTime || 0) {
    this.updateHistory(owner);
    if (!this.history.length) return [owner.pos.clone()];
    const pts = [owner.pos.clone()];
    let total = 0;
    let prev = owner.pos.clone();
    const phase = this.wavePhase + index * Math.PI * 2 / 3;
    const sideShift = (index - 1) * 8;
    const reversed = [...this.history].reverse();
    for (let k = 0; k < reversed.length; k++) {
      let base = reversed[k].clone();
      const step = prev.distanceTo(base);
      if (total + step > this.ribbonLength) {
        if (step > 0) base = prev.lerp(base, (this.ribbonLength - total) / step);
        pts.push(base);
        break;
      }
      total += step;
      const direction = prev.distanceTo(base) > 0 ? safeNormalize(Vec2.sub(prev, base)) : safeNormalize(owner.vel);
      const perp = direction.perp();
      const wave = Math.sin(k * 0.75 + phase + matchTime * 7.0) * (5 + k * 0.08);
      pts.push(Vec2.add(base, Vec2.scale(perp, sideShift + wave)));
      prev = base;
      if (total >= this.ribbonLength) break;
    }
    if (pts.length < 2) {
      const back = safeNormalize(owner.vel).scale(-this.ribbonLength);
      pts.push(Vec2.add(owner.pos, Vec2.add(back, new Vec2(index * 5 - 5, 0))));
    }
    return pts;
  }

  draw(owner, game, ctx) {
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < this.ribbonCount; i++) {
      const pts = this.ribbonPoints(owner, i, owner.lastMatchTime || 0);
      if (pts.length < 2) continue;
      ctx.strokeStyle = this.colors[i];
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);
      ctx.stroke();
      ctx.strokeStyle = COLORS.white;
      ctx.lineWidth = 1;
      ctx.stroke();
      const tail = pts[pts.length - 1];
      ctx.fillStyle = this.colors[i];
      ctx.beginPath(); ctx.arc(tail.x, tail.y, 6, 0, Math.PI * 2); ctx.fill();
    }
    const knot = Vec2.add(owner.pos, Vec2.scale(safeNormalize(owner.vel), -(owner.radius - 2)));
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.black;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(knot.x, knot.y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
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
        this.snapshots.set(ball.uid, { zone: this.zoneOf(ball.pos, ball.radius), pos: ball.pos.clone() });
        ball.addStun(this.freezeDuration, matchTime);
      }
    }
    if (!this.resolved && matchTime >= this.created + this.freezeDuration) {
      this.resolved = true;
      const ownerZone = this.snapshots.get(this.owner.uid)?.zone ?? this.zoneOf(this.owner.pos, this.owner.radius);
      for (const ball of game.balls) {
        if (ball.hp <= 0 || ball === this.owner || game.areAllies(ball, this.owner)) continue;
        const targetZone = this.snapshots.get(ball.uid)?.zone ?? this.zoneOf(ball.pos, ball.radius);
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
    ctx.strokeStyle = COLORS.iceRing;
    ctx.lineWidth = 2;
    for (const data of this.snapshots.values()) {
      ctx.beginPath();
      ctx.arc(data.pos.x, data.pos.y, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
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

  draw(owner, game, ctx) {
    const handle = new Vec2(owner.pos.x, owner.pos.y - owner.radius - 8);
    ctx.save();
    ctx.fillStyle = COLORS.ice;
    ctx.strokeStyle = COLORS.black;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(handle.x, handle.y, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = COLORS.iceRing;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(owner.pos.x - 12, owner.pos.y - 8); ctx.lineTo(owner.pos.x + 12, owner.pos.y - 8); ctx.stroke();
    ctx.restore();
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
      ball.addPaperSlow(0.5, 4.0, matchTime);
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
    const start = Vec2.add(owner.pos, Vec2.scale(dir, owner.radius + 18));
    game.projectiles.push(new PaperProjectile(owner, start, dir));
  }

  draw(owner, game, ctx) {
    const center = new Vec2(owner.pos.x + owner.radius * 0.72, owner.pos.y - owner.radius * 0.68);
    drawPaperPage(ctx, center, new Vec2(1, -0.25), 24, 18);
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

  draw(owner, game, ctx) {
    const y = owner.pos.y - 10;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = COLORS.black;
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(owner.pos.x - 24, y); ctx.lineTo(owner.pos.x + 24, y); ctx.stroke();
    ctx.strokeStyle = COLORS.ninjaGreen;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(owner.pos.x - 24, y); ctx.lineTo(owner.pos.x + 24, y); ctx.stroke();
    ctx.restore();
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
        const outwardSpeed = ball.vel.dot(Vec2.scale(dir, -1));
        if (outwardSpeed > 0) ball.vel.add(Vec2.scale(dir, outwardSpeed));
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

  draw(owner, game, ctx) {
    ctx.save();
    ctx.strokeStyle = COLORS.voidPurple;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(owner.pos.x, owner.pos.y, owner.radius + 10, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = COLORS.black;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(owner.pos.x, owner.pos.y, owner.radius + 4, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = COLORS.voidPurple;
    for (const angle of [0.2, 2.3, 4.5]) {
      const p = new Vec2(owner.pos.x + Math.cos(angle) * (owner.radius + 11), owner.pos.y + Math.sin(angle) * (owner.radius + 11));
      ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
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
    else if(this.key==='peach'){ ball.takeDamage(3,game,this.owner,matchTime); ball.addFruitSlow(0.20,3.0,matchTime); }
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

  draw(owner, game, ctx) {
    const target = game.nearestEnemy(owner);
    const dir = target ? safeNormalize(Vec2.sub(target.pos, owner.pos)) : new Vec2(1, 0);
    const perp = dir.perp();
    const barrelStart = Vec2.add(owner.pos, Vec2.scale(dir, owner.radius + 4));
    const barrelEnd = Vec2.add(owner.pos, Vec2.scale(dir, owner.radius + 35));
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = COLORS.tangerineOrange;
    ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(barrelStart.x, barrelStart.y); ctx.lineTo(barrelEnd.x, barrelEnd.y); ctx.stroke();
    ctx.strokeStyle = COLORS.black; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = COLORS.black; ctx.beginPath(); ctx.arc(barrelEnd.x, barrelEnd.y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COLORS.orange; ctx.beginPath(); ctx.arc(barrelEnd.x, barrelEnd.y, 5, 0, Math.PI * 2); ctx.fill();
    const basket = Vec2.add(owner.pos, Vec2.scale(dir, -(owner.radius + 12)));
    ctx.fillStyle = '#965a2d'; ctx.strokeStyle = COLORS.black; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(basket.x, basket.y, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const keys = ['apple', 'watermelon', 'peach', 'grape', 'tangerine', 'lychee'];
    for (let i = 0; i < keys.length; i++) {
      const a = i * Math.PI * 2 / keys.length;
      const off = Vec2.add(Vec2.scale(perp, Math.cos(a) * 15), Vec2.scale(dir, Math.sin(a) * 7));
      drawFruit(ctx, keys[i], Vec2.add(basket, off), 5, a);
    }
    ctx.restore();
  }
}

class VaseProjectile extends Projectile {
  constructor(owner,pos,direction){ super(owner); this.pos=pos.clone(); this.direction=safeNormalize(direction); this.vel=this.direction.clone().scale(1121); this.radius=13; this.angle=Math.random()*Math.PI*2; }
  update(game,dt,matchTime){
    this.pos.add(Vec2.scale(this.vel,dt)); this.angle+=8*dt; const a=game.arena;
    if(this.pos.x-this.radius<=a.left||this.pos.x+this.radius>=a.right||this.pos.y-this.radius<=a.top||this.pos.y+this.radius>=a.bottom){ this.alive=false; return; }
    for(const ball of game.balls){ if(ball.hp<=0||game.areAllies(ball,this.owner)) continue; if(circleHit(this.pos,this.radius,ball.pos,ball.radius)){ ball.addPengciMark(matchTime); this.alive=false; return; } }
  }
  draw(ctx){ const dir=safeNormalize(this.vel), perp=dir.perp(); ctx.save(); ctx.fillStyle=COLORS.vaseWhite; ctx.strokeStyle=COLORS.black; ctx.lineWidth=2; const p=this.pos; ctx.beginPath(); ctx.moveTo(p.x+dir.x*6+perp.x*5,p.y+dir.y*6+perp.y*5); ctx.lineTo(p.x+dir.x*6-perp.x*5,p.y+dir.y*6-perp.y*5); ctx.lineTo(p.x-dir.x*14-perp.x*10,p.y-dir.y*14-perp.y*10); ctx.lineTo(p.x-dir.x*14+perp.x*10,p.y-dir.y*14+perp.y*10); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.strokeStyle=COLORS.vaseBlue; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(p.x-perp.x*7,p.y-perp.y*7); ctx.lineTo(p.x+perp.x*7,p.y+perp.y*7); ctx.stroke(); ctx.restore(); }
}

export class PengciSkill extends Skill {
  constructor(){ super(); this.nextFire=0.9; this.cooldown=1.0; this.bodyCooldown=0.35; this.nextBody=new Map(); }
  update(owner,game,dt,matchTime){
    if(matchTime<this.nextFire) return; const enemy=game.nearestEnemy(owner); if(!enemy) return; this.nextFire=matchTime+this.cooldown; const dir=safeNormalize(Vec2.sub(enemy.pos,owner.pos)); const start=Vec2.add(owner.pos,Vec2.scale(dir,owner.radius+18)); game.projectiles.push(new VaseProjectile(owner,start,dir));
  }
  onBodyCollision(owner,other,game,matchTime){ const marks=other.pengciMarks||0; if(marks<=0) return false; const next=this.nextBody.get(other.uid)||0; if(matchTime<next) return false; this.nextBody.set(other.uid,matchTime+this.bodyCooldown); other.clearPengciMarks(); other.takeDamage(Math.pow(2,marks+1),game,owner,matchTime); const knock=safeNormalize(Vec2.sub(other.pos,owner.pos)); other.vel=knock.scale(Math.max(other.currentSpeed(matchTime),640)); other.externalForceUntil=matchTime+0.22; return true; }

  draw(owner, game, ctx) {
    const target = game.nearestEnemy(owner);
    const dir = target ? safeNormalize(Vec2.sub(target.pos, owner.pos)) : new Vec2(1, 0);
    const perp = dir.perp();
    const sign = Vec2.add(owner.pos, Vec2.scale(dir, -(owner.radius + 14)));
    ctx.save();
    ctx.fillStyle = COLORS.ribbonGold;
    ctx.strokeStyle = COLORS.black;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect?.(sign.x - 17, sign.y - 11, 34, 22, 5);
    if (!ctx.roundRect) ctx.rect(sign.x - 17, sign.y - 11, 34, 22);
    ctx.fill(); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(owner.pos.x - dir.x * owner.radius, owner.pos.y - dir.y * owner.radius); ctx.lineTo(sign.x + dir.x * 10, sign.y + dir.y * 10); ctx.stroke();
    const vase = Vec2.add(Vec2.add(owner.pos, Vec2.scale(dir, owner.radius + 18)), Vec2.scale(perp, 11));
    ctx.fillStyle = COLORS.vaseWhite; ctx.strokeStyle = COLORS.black; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(vase.x, vase.y, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = COLORS.vaseBlue; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(vase.x, vase.y, 5, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

class ShieldProjectile extends Projectile {
  constructor(owner,pos,direction){ super(owner); this.pos=pos.clone(); this.vel=safeNormalize(direction).scale(520); this.radius=18; this.angle=Math.random()*Math.PI*2; }
  update(game,dt,matchTime){ this.pos.add(Vec2.scale(this.vel,dt)); this.angle+=14*dt; if(this.pos.x<game.arena.left-80||this.pos.x>game.arena.right+80||this.pos.y<game.arena.top-80||this.pos.y>game.arena.bottom+80){this.alive=false;return;} for(const ball of game.balls){ if(ball.hp<=0||game.areAllies(ball,this.owner)) continue; if(circleHit(this.pos,this.radius,ball.pos,ball.radius)){ const layers=this.owner.skill.shieldLayers||0; ball.takeDamage(Math.max(3,layers*3),game,this.owner,matchTime); this.alive=false; return; } } }
  draw(ctx){ ctx.save(); ctx.fillStyle=COLORS.shieldSteel; ctx.strokeStyle=COLORS.black; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(this.pos.x,this.pos.y,this.radius,0,Math.PI*2); ctx.fill(); ctx.stroke(); ctx.strokeStyle=COLORS.shieldBlue; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(this.pos.x,this.pos.y,this.radius*.62,0,Math.PI*2); ctx.stroke(); ctx.strokeStyle=COLORS.white; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(this.pos.x,this.pos.y); ctx.lineTo(this.pos.x+Math.cos(this.angle)*this.radius,this.pos.y+Math.sin(this.angle)*this.radius); ctx.stroke(); ctx.restore(); }
}

export class ShieldGuardSkill extends Skill {
  constructor(){ super(); this.shieldLayers=5; this.nextRegen=5; this.nextThrow=1.3; this.throwCooldown=4.0; }
  modifyIncomingDamage(owner,amount,source,game,matchTime){ if(this.shieldLayers>0 && amount>0){ this.shieldLayers-=1; owner.hitFlashTimer=0.08; return 0; } return amount; }
  update(owner,game,dt,matchTime){ while(matchTime>=this.nextRegen){ this.nextRegen+=5; this.shieldLayers+=1; } if(matchTime>=this.nextThrow){ const enemy=game.nearestEnemy(owner); if(enemy){ this.nextThrow=matchTime+this.throwCooldown; const dir=safeNormalize(Vec2.sub(enemy.pos,owner.pos)); const start=Vec2.add(owner.pos,Vec2.scale(dir,owner.radius+22)); game.projectiles.push(new ShieldProjectile(owner,start,dir)); } } }
  draw(owner, game, ctx) {
    ctx.save();
    ctx.strokeStyle = COLORS.shieldBlue;
    ctx.lineWidth = 1;
    for (let i = 0; i < Math.min(this.shieldLayers, 8); i++) {
      ctx.beginPath(); ctx.arc(owner.pos.x, owner.pos.y, owner.radius + 6 + i * 3, 0, Math.PI * 2); ctx.stroke();
    }
    const c = new Vec2(owner.pos.x - owner.radius - 18, owner.pos.y);
    const pts = [[0,-18],[15,-7],[10,15],[0,22],[-10,15],[-15,-7]].map(([x,y]) => new Vec2(c.x+x,c.y+y));
    ctx.fillStyle = COLORS.shieldSteel; ctx.strokeStyle = COLORS.black; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

}

class SniperBulletProjectile extends Projectile {
  constructor(owner,pos,direction){ super(owner); this.pos=pos.clone(); this.prev=pos.clone(); this.vel=safeNormalize(direction).scale(2200); this.radius=5; this.age=0; this.life=0.35; }
  update(game,dt,matchTime){ this.prev=this.pos.clone(); this.pos.add(Vec2.scale(this.vel,dt)); this.age+=dt; if(this.age>=this.life||this.pos.x<game.arena.left-120||this.pos.x>game.arena.right+120||this.pos.y<game.arena.top-120||this.pos.y>game.arena.bottom+120){this.alive=false;return;} for(const ball of game.balls){ if(ball.hp<=0||game.areAllies(ball,this.owner)) continue; if(distancePointToSegment(ball.pos,this.prev,this.pos)<=ball.radius+this.radius){ ball.takeDamage(50,game,this.owner,matchTime); this.alive=false; return; } } }
  draw(ctx){ ctx.save(); ctx.strokeStyle=COLORS.sniperGold; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(this.prev.x,this.prev.y); ctx.lineTo(this.pos.x,this.pos.y); ctx.stroke(); ctx.fillStyle=COLORS.white; ctx.beginPath(); ctx.arc(this.pos.x,this.pos.y,this.radius,0,Math.PI*2); ctx.fill(); ctx.restore(); }
}

export class SniperSkill extends Skill {
  constructor(){ super(); this.ammo=0; this.nextLoad=1.5; this.halfTriggered=false; }
  update(owner,game,dt,matchTime){ while(matchTime>=this.nextLoad){ this.nextLoad+=1.5; this.ammo+=1; } if(this.ammo>=5){ const enemy=game.nearestEnemy(owner); if(enemy){ this.ammo-=5; const dir=safeNormalize(Vec2.sub(enemy.pos,owner.pos)); const start=Vec2.add(owner.pos,Vec2.scale(dir,owner.radius+18)); game.projectiles.push(new SniperBulletProjectile(owner,start,dir)); } } }
  onDamageTaken(owner,amount,source,game,matchTime){ this.ammo=Math.max(0,this.ammo-1); if(!this.halfTriggered && owner.hp<owner.maxHp/2){ this.halfTriggered=true; this.ammo+=2; } }
  draw(owner, game, ctx) {
    const target = game.nearestEnemy(owner);
    const dir = target ? safeNormalize(Vec2.sub(target.pos, owner.pos)) : new Vec2(1, 0);
    const perp = dir.perp();
    const start = Vec2.add(owner.pos, Vec2.scale(dir, owner.radius + 4));
    const end = Vec2.add(owner.pos, Vec2.scale(dir, owner.radius + 50));
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = COLORS.sniperBrown; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
    ctx.strokeStyle = COLORS.black; ctx.lineWidth = 2; ctx.stroke();
    const scope = Vec2.add(Vec2.add(owner.pos, Vec2.scale(dir, owner.radius + 23)), Vec2.scale(perp, 8));
    ctx.fillStyle = COLORS.sniperGold; ctx.beginPath(); ctx.arc(scope.x, scope.y, 6, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < Math.min(this.ammo, 7); i++) {
      const a = -Math.PI / 2 + i * 0.45;
      const p = new Vec2(owner.pos.x + Math.cos(a) * (owner.radius + 14), owner.pos.y + Math.sin(a) * (owner.radius + 14));
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

}

class SpellWaveProjectile extends Projectile {
  constructor(owner, pos, direction, extra = false) {
    super(owner);
    this.pos = pos.clone();
    this.direction = safeNormalize(direction);
    this.extra = extra;
    this.vel = this.direction.clone().scale(extra ? 610 : 540);
    this.radius = extra ? 18 : 16;
    this.age = 0;
  }
  update(game, dt, matchTime) {
    this.age += dt;
    this.pos.add(Vec2.scale(this.vel, dt));
    if (this.pos.x < game.arena.left - 110 || this.pos.x > game.arena.right + 110 || this.pos.y < game.arena.top - 110 || this.pos.y > game.arena.bottom + 110) { this.alive = false; return; }
    for (const ball of game.balls) {
      if (ball.hp <= 0 || game.areAllies(ball, this.owner) || ball.heldBy) continue;
      if (!circleHit(this.pos, this.radius, ball.pos, ball.radius)) continue;
      this.alive = false;
      ball.takeDamage(3, game, this.owner, matchTime);
      ball.addStun(0.3, matchTime);
      const skill = this.owner.skill;
      if (skill instanceof SpellSkill) skill.onShockwaveHit(this.owner, ball, matchTime, game, this.extra);
      return;
    }
  }
  draw(ctx) {
    const perp = this.direction.perp();
    const color = this.extra ? COLORS.spellChain : COLORS.spellCyan;
    const back = Vec2.add(this.pos, Vec2.scale(this.direction, -8));
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const center = Vec2.add(back, Vec2.scale(this.direction, -i * 12));
      const width = this.radius * (1.9 - i * 0.35) * [1.0, 0.68, 0.36][i];
      ctx.beginPath();
      ctx.arc(center.x, center.y, width, -1.15, 1.15);
      ctx.stroke();
    }
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, 5, 0, Math.PI * 2); ctx.fill();
    const note = Vec2.add(Vec2.add(this.pos, Vec2.scale(this.direction, -14)), Vec2.scale(perp, 13));
    ctx.fillStyle = COLORS.spellPurple;
    ctx.beginPath(); ctx.arc(note.x, note.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = COLORS.spellPurple; ctx.beginPath(); ctx.moveTo(note.x, note.y); ctx.lineTo(note.x, note.y - 17); ctx.stroke();
    ctx.restore();
  }
}

export class SpellSkill extends Skill {
  constructor() {
    super();
    this.cooldown = 0.8;
    this.extraCooldown = 0.6;
    this.chainMaxDuration = 5.0;
    this.nextFire = 0.55;
    this.nextExtraFire = 0.95;
    this.stacksByUid = new Map();
    this.chainedTargetUid = null;
    this.chainEnd = 0;
    this.pulse = 0;
  }
  speedMultiplier(owner, matchTime) { return this.chainedTargetUid != null ? 0.2 : 1.0; }
  findBallByUid(game, uid) { return game.balls.find(b => b.uid === uid && b.hp > 0) || null; }
  onShockwaveHit(owner, target, matchTime, game, extra = false) {
    const uid = target.uid;
    const old = this.stacksByUid.get(uid) || 0;
    if (extra && this.chainedTargetUid === uid) {
      const next = Math.max(0, old - 1);
      this.stacksByUid.set(uid, next);
      target.spellMarks = next;
      owner.heal(2, game);
      if (next <= 0) this.chainedTargetUid = null;
    } else {
      const next = Math.min(5, old + 1);
      this.stacksByUid.set(uid, next);
      target.spellMarks = next;
      if (next >= 5) {
        this.chainedTargetUid = uid;
        this.chainEnd = matchTime + this.chainMaxDuration;
        this.nextExtraFire = matchTime;
      }
    }
  }
  updateChain(owner, matchTime, game) {
    if (this.chainedTargetUid == null) return null;
    const target = this.findBallByUid(game, this.chainedTargetUid);
    if (!target) { this.chainedTargetUid = null; return null; }
    if ((this.stacksByUid.get(target.uid) || 0) <= 0) { this.chainedTargetUid = null; target.spellMarks = 0; return null; }
    if (matchTime >= this.chainEnd) { this.stacksByUid.set(target.uid, 0); target.spellMarks = 0; this.chainedTargetUid = null; return null; }
    target.addSlow(0.2, 0.16, matchTime);
    return target;
  }
  update(owner, game, dt, matchTime) {
    this.pulse += dt * 7.0;
    for (const ball of game.balls) {
      if (ball.hp <= 0 && this.stacksByUid.has(ball.uid)) { this.stacksByUid.delete(ball.uid); ball.spellMarks = 0; }
    }
    let chainTarget = this.updateChain(owner, matchTime, game);
    while (matchTime >= this.nextFire) {
      this.nextFire += this.cooldown;
      const enemy = game.nearestEnemy(owner);
      if (!enemy) break;
      const dir = safeNormalize(Vec2.sub(enemy.pos, owner.pos));
      const start = Vec2.add(owner.pos, Vec2.scale(dir, owner.radius + 20));
      game.projectiles.push(new SpellWaveProjectile(owner, start, dir, false));
    }
    chainTarget = this.updateChain(owner, matchTime, game);
    while (chainTarget && matchTime >= this.nextExtraFire) {
      this.nextExtraFire += this.extraCooldown;
      const dir = safeNormalize(Vec2.sub(chainTarget.pos, owner.pos));
      const start = Vec2.add(owner.pos, Vec2.scale(dir, owner.radius + 20));
      game.projectiles.push(new SpellWaveProjectile(owner, start, dir, true));
      chainTarget = this.updateChain(owner, matchTime, game);
    }
  }
  draw(owner, game, ctx) {
    ctx.save();
    ctx.lineCap = 'round';
    for (const [i, offset] of [-15, 0, 15].entries()) {
      const y = owner.pos.y - owner.radius - 18 + i * 8;
      ctx.strokeStyle = COLORS.spellCyan; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(owner.pos.x - 26, y); ctx.lineTo(owner.pos.x + 26, y + offset * 0.12); ctx.stroke();
    }
    const note = new Vec2(owner.pos.x + owner.radius + 18, owner.pos.y - owner.radius * 0.45);
    ctx.fillStyle = COLORS.spellPurple; ctx.beginPath(); ctx.arc(note.x, note.y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = COLORS.spellPurple; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(note.x, note.y); ctx.lineTo(note.x, note.y - 24); ctx.stroke();
    ctx.strokeStyle = COLORS.spellCyan; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(owner.pos.x, owner.pos.y, owner.radius + 12, 0, Math.PI * 2); ctx.stroke();
    const target = this.findBallByUid(game, this.chainedTargetUid);
    if (target) {
      ctx.strokeStyle = COLORS.spellChain; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(owner.pos.x, owner.pos.y); ctx.lineTo(target.pos.x, target.pos.y); ctx.stroke();
      ctx.strokeStyle = COLORS.white; ctx.lineWidth = 1; ctx.stroke();
      for (const t of [0.25, 0.5, 0.75]) {
        const p = owner.pos.lerp(target.pos, t);
        const r = 4 + Math.round(2 * Math.sin(this.pulse + t * Math.PI * 2));
        ctx.fillStyle = COLORS.spellPurple; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(3, r), 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = COLORS.spellChain; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(target.pos.x, target.pos.y, target.radius + 12, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
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

  draw(owner, game, ctx) {
    const dir = owner.vel.length() > 0 ? safeNormalize(owner.vel) : new Vec2(1, 0);
    const perp = dir.perp();
    const bow = Vec2.add(owner.pos, Vec2.scale(perp, owner.radius + 14));
    ctx.save();
    ctx.strokeStyle = COLORS.catherinePurple;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(bow.x, bow.y, 25, -1.1, 1.1); ctx.stroke();
    ctx.strokeStyle = COLORS.arrowGold;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(bow.x - dir.x * 20, bow.y - dir.y * 20); ctx.lineTo(bow.x + dir.x * 20, bow.y + dir.y * 20); ctx.stroke();
    ctx.restore();
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

  draw(owner, game, ctx) {
    const p1 = new Vec2(owner.pos.x, owner.pos.y - owner.radius - 4);
    const p2 = new Vec2(owner.pos.x - 10, owner.pos.y - owner.radius + 14);
    const p3 = new Vec2(owner.pos.x + 10, owner.pos.y - owner.radius + 14);
    ctx.save(); ctx.fillStyle = COLORS.poisonGreen; ctx.strokeStyle = COLORS.black; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
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

  draw(owner, game, ctx) {
    ctx.save(); ctx.strokeStyle = COLORS.spiderPurple; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (const angle of [0.35, 0.75, -0.35, -0.75]) {
      for (const side of [-1, 1]) {
        const dir = new Vec2(Math.cos(angle) * side, Math.sin(angle));
        const s = Vec2.add(owner.pos, Vec2.scale(dir, owner.radius + 2));
        const e = Vec2.add(owner.pos, Vec2.scale(dir, owner.radius + 20));
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke();
      }
    }
    ctx.restore();
  }
}

export class GasCanSkill extends Skill {
  constructor() { super(); this.nextStart = 2.0; this.phase = 'idle'; this.chargeEnd = 0; this.boostEnd = 0; this.hitCooldown = 0.38; this.nextHit = new Map(); }
  update(owner, game, dt, matchTime) {
    if (this.phase === 'idle' && matchTime >= this.nextStart) { this.phase = 'charge'; this.chargeEnd = matchTime + 1.0; owner.radius = 42; }
    if (this.phase === 'charge' && matchTime >= this.chargeEnd) { this.phase = 'boost'; this.boostEnd = matchTime + 2.0; this.nextStart = matchTime + 5.0; owner.radius = 42; owner.vel = randomUnitVector().scale(owner.currentSpeed(matchTime)); owner.externalForceUntil = matchTime + 0.22; }
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
      if (matchTime >= this.boostEnd) { this.phase = 'idle'; owner.radius = owner.role.radius ?? BALL_RADIUS; }
    }
  }
  speedMultiplier(owner, matchTime) { return this.phase === 'boost' ? 2.5 : 1; }
  currentRadius(owner, matchTime, baseRadius) { return this.phase === 'charge' || this.phase === 'boost' ? 42 : baseRadius; }
  draw(owner, game, ctx) {
    const boosting = this.phase === 'boost';
    const charging = this.phase === 'charge';
    const w = (boosting || charging) ? 54 : 38;
    const h = (boosting || charging) ? 66 : 44;
    const x = owner.pos.x - w / 2;
    const y = owner.pos.y - h / 2;
    ctx.save();
    ctx.fillStyle = charging ? COLORS.yellow : boosting ? COLORS.orange : COLORS.gasOrange;
    ctx.strokeStyle = COLORS.black;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect?.(x, y, w, h, 10);
    if (!ctx.roundRect) ctx.rect(x, y, w, h);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#b4b4be'; ctx.strokeStyle = COLORS.black; ctx.lineWidth = 2;
    const vx = owner.pos.x - w * 0.225, vy = y - 7, vw = w * 0.45, vh = 10;
    ctx.beginPath(); ctx.roundRect?.(vx, vy, vw, vh, 4); if (!ctx.roundRect) ctx.rect(vx, vy, vw, vh); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = COLORS.black; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 8, owner.pos.y); ctx.lineTo(x + w - 8, owner.pos.y); ctx.stroke();
    if (boosting) {
      const dir = safeNormalize(owner.vel);
      const perp = dir.perp();
      const tail = Vec2.add(owner.pos, Vec2.scale(dir, -(h * 0.45 + 8)));
      for (const [scale, color, width] of [[30, COLORS.yellow, 12], [44, COLORS.orange, 8], [60, COLORS.red, 5]]) {
        const tip = Vec2.add(tail, Vec2.scale(dir, -scale));
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.moveTo(tail.x + perp.x * width, tail.y + perp.y * width); ctx.lineTo(tail.x - perp.x * width, tail.y - perp.y * width); ctx.lineTo(tip.x, tip.y); ctx.closePath(); ctx.fill();
      }
    }
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
      break;
    }
  }
  draw(owner, game, ctx) {
    const hp = this.handPos(owner, game);
    ctx.save();
    ctx.fillStyle = COLORS.handSkin; ctx.strokeStyle = COLORS.black; ctx.lineWidth = 2;
    const wristStart = Vec2.add(owner.pos, Vec2.scale(this.handDir, owner.radius + 3));
    const wristEnd = Vec2.add(hp, Vec2.scale(this.handDir, -this.handRadius));
    ctx.lineWidth = 8; ctx.strokeStyle = COLORS.handSkin; ctx.beginPath(); ctx.moveTo(wristStart.x, wristStart.y); ctx.lineTo(wristEnd.x, wristEnd.y); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = COLORS.black; ctx.stroke();
    ctx.lineWidth = 2;
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
    if (this.drawTime >= this.created + this.warn) { const { tail, head } = this.segment(this.drawTime); ctx.strokeStyle = COLORS.red; ctx.lineWidth = this.trackWidth * 0.78; ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(head.x, head.y); ctx.stroke(); ctx.strokeStyle = COLORS.orange; ctx.lineWidth = this.trackWidth * 0.42; ctx.stroke(); ctx.fillStyle = COLORS.yellow; for (let i = 0; i <= 10; i++) { const p = tail.lerp(head, i / 10); ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill(); } const left = Vec2.add(Vec2.add(head, Vec2.scale(this.dir, -34)), Vec2.scale(this.perp, 22)); const right = Vec2.add(Vec2.add(head, Vec2.scale(this.dir, -34)), Vec2.scale(this.perp, -22)); ctx.fillStyle = COLORS.yellow; ctx.strokeStyle = COLORS.black; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(head.x + this.dir.x * 20, head.y + this.dir.y * 20); ctx.lineTo(left.x, left.y); ctx.lineTo(right.x, right.y); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    ctx.restore();
  }
}

export class DragonHeirSkill extends Skill {
  constructor() { super(); this.nextCast = 1.5; this.cooldown = 5.0; }
  update(owner, game, dt, matchTime) { if (matchTime < this.nextCast) return; this.nextCast = matchTime + this.cooldown; game.hazards.push(new DragonPassHazardWeb(owner, game.arena, matchTime)); }

  draw(owner, game, ctx) {
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = COLORS.yellow; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(owner.pos.x - 14, owner.pos.y - owner.radius - 4); ctx.lineTo(owner.pos.x - 24, owner.pos.y - owner.radius - 20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(owner.pos.x + 14, owner.pos.y - owner.radius - 4); ctx.lineTo(owner.pos.x + 24, owner.pos.y - owner.radius - 20); ctx.stroke();
    ctx.strokeStyle = COLORS.orange; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(owner.pos.x - owner.radius, owner.pos.y + 4); ctx.lineTo(owner.pos.x - owner.radius - 22, owner.pos.y + 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(owner.pos.x + owner.radius, owner.pos.y + 4); ctx.lineTo(owner.pos.x + owner.radius + 22, owner.pos.y + 12); ctx.stroke();
    ctx.restore();
  }
}

class FootprintHazardWeb extends Hazard {
  constructor(owner, arena, matchTime) { super(owner); this.created = matchTime; this.warn = 1.0; this.stomp = 0.45; this.pos = randomPointInRect(arena, 118); this.dir = randomUnitVector(); this.perp = this.dir.perp(); this.footLength = 265; this.footWidth = 170; this.toeRadius = 28; this.hit = false; this.drawTime = matchTime; }
  inside(point, extra = 0) { const sole = Vec2.add(this.pos, Vec2.scale(this.dir, -12)); const rel = Vec2.sub(point, sole); const lx = rel.dot(this.perp); const ly = rel.dot(this.dir); if ((lx / (this.footWidth / 2 + extra)) ** 2 + (ly / (this.footLength / 2 + extra)) ** 2 <= 1) return true; const toeBase = Vec2.add(this.pos, Vec2.scale(this.dir, this.footLength * 0.43)); for (const [off, scale] of [[-0.36,0.82],[-0.12,1.0],[0.12,0.96],[0.36,0.78]]) { const c = Vec2.add(toeBase, Vec2.scale(this.perp, off * this.footWidth)); if (point.distanceTo(c) <= this.toeRadius * scale + extra) return true; } return false; }
  update(game, dt, matchTime) { this.drawTime = matchTime; if (matchTime >= this.created + this.warn + this.stomp) { this.alive = false; return; } if (!this.hit && matchTime >= this.created + this.warn) { this.hit = true; for (const ball of game.balls) { if (ball.hp <= 0 || game.areAllies(ball, this.owner)) continue; if (this.inside(ball.pos, ball.radius)) { ball.takeDamage(25, game, this.owner, matchTime); ball.vel = safeNormalize(Vec2.sub(ball.pos, this.pos)).scale(720); ball.externalForceUntil = matchTime + 0.25; } } } }
  draw(ctx) { const active = this.drawTime >= this.created + this.warn; ctx.save(); ctx.fillStyle = active ? COLORS.footPink : 'rgba(255,220,245,.28)'; ctx.strokeStyle = active ? COLORS.black : COLORS.footPink; ctx.lineWidth = active ? 2 : 3; const sole = Vec2.add(this.pos, Vec2.scale(this.dir, -12)); ctx.beginPath(); for (let i = 0; i < 40; i++) { const t = i / 40 * Math.PI * 2; const p = Vec2.add(Vec2.add(sole, Vec2.scale(this.perp, Math.cos(t) * this.footWidth / 2)), Vec2.scale(this.dir, Math.sin(t) * this.footLength / 2)); if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); } ctx.closePath(); if (active) ctx.fill(); ctx.stroke(); const toeBase = Vec2.add(this.pos, Vec2.scale(this.dir, this.footLength * 0.48)); for (const [off, scale] of [[-0.36,0.82],[-0.12,1.0],[0.12,0.96],[0.36,0.78]]) { const c = Vec2.add(toeBase, Vec2.scale(this.perp, off * this.footWidth)); ctx.beginPath(); ctx.arc(c.x, c.y, this.toeRadius * scale, 0, Math.PI * 2); if (active) ctx.fill(); ctx.stroke(); } ctx.restore(); }
}

export class JadeFootSkill extends Skill { constructor() { super(); this.nextCast = 1.5; this.cooldown = 6.0; } update(owner, game, dt, matchTime) { if (matchTime < this.nextCast) return; this.nextCast = matchTime + this.cooldown; game.hazards.push(new FootprintHazardWeb(owner, game.arena, matchTime)); } 
  draw(owner, game, ctx) {
    drawTinyFoot(ctx, new Vec2(owner.pos.x + owner.radius + 14, owner.pos.y));
  }
}

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
export class WaveSkill extends Skill { constructor() { super(); this.nextCast = 1.2; this.cooldown = 4.0; } update(owner, game, dt, matchTime) { if (matchTime < this.nextCast) return; this.nextCast = matchTime + this.cooldown; game.hazards.push(new WaveRingHazardWeb(owner, owner.pos, matchTime)); } 
  draw(owner, game, ctx) {
    ctx.save(); ctx.strokeStyle = COLORS.waveBlue; ctx.lineWidth = 3;
    for (const [r, s, e, w] of [[owner.radius + 7, 0.2, 2.6, 3], [owner.radius + 13, 3.3, 5.8, 2]]) {
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.arc(owner.pos.x, owner.pos.y, r, s, e); ctx.stroke();
    }
    ctx.restore();
  }
}

class FlowerbedHazardWeb extends Hazard {
  constructor(owner, pos) { super(owner); this.pos = pos.clone(); this.radius = 42; this.touching = new Set(); }
  update(game, dt, matchTime) { const nowTouching = new Set(); for (const ball of game.balls) { if (ball.hp <= 0 || ball === this.owner) continue; const touching = circleHit(this.pos, this.radius, ball.pos, ball.radius); if (touching) { nowTouching.add(ball.uid); if (!this.touching.has(ball.uid)) { ball.flowerbedSlow = Math.min(0.95, (ball.flowerbedSlow || 0) + 0.02); } } } this.touching = nowTouching; }
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
    owner.externalForceUntil = 0;
    while (matchTime >= this.nextTeleport && !this.doomed) {
      game.hazards.push(new FlowerbedHazardWeb(owner, owner.pos));
      owner.pos = randomPointInRect(game.arena, owner.radius + 8);
      owner.vel = new Vec2(0, 0);
      this.teleports += 1;
      this.nextTeleport += 3.0;
      if (this.teleports >= 20 || matchTime >= 60.0) {
        this.doomed = true;
        game.hazards.push(new CressonDoomWaveHazardWeb(owner, owner.pos, matchTime));
        break;
      }
    }
  }

  draw(owner, game, ctx) {
    this.jitterPhase = (this.jitterPhase ?? Math.random() * Math.PI * 2) + 0.35;
    ctx.save();
    ctx.fillStyle = COLORS.cressonPink;
    for (let i = 0; i < 7; i++) {
      const a = this.jitterPhase + i * Math.PI * 2 / 7;
      const off = new Vec2(Math.cos(a * 2.1), Math.sin(a * 1.7)).scale(2 + Math.random() * 4);
      const p = Vec2.add(Vec2.add(owner.pos, Vec2.scale(new Vec2(Math.cos(a), Math.sin(a)), owner.radius + 10)), off);
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = COLORS.flowerPink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(owner.pos.x, owner.pos.y, owner.radius + 9, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

// ============================================================
// Round 4 summon / growth / control roles
// ============================================================

export class SlimeSkill extends Skill {
  constructor(level = 0) {
    super();
    this.level = level;
    this.splitDone = false;
    this.bodyCooldown = NORMAL_BODY_COOLDOWN;
    this.lastHit = new Map();
  }
  stats() {
    return [
      { hp: 30, radius: 30, damage: 5 },
      { hp: 10, radius: 22, damage: 5 },
      { hp: 5, radius: 16, damage: 3 }
    ][this.level] || { hp: 5, radius: 16, damage: 3 };
  }
  onBodyCollision(owner, other, game, matchTime) {
    const next = this.lastHit.get(other.uid) ?? 0;
    if (matchTime < next) return false;
    this.lastHit.set(other.uid, matchTime + this.bodyCooldown);
    const dmg = this.stats().damage;
    other.takeDamage(dmg, game, owner, matchTime);
    return true;
  }
  onDeath(owner, game, matchTime) {
    if (this.splitDone || this.level >= 2) return;
    this.splitDone = true;
    const nextLevel = this.level + 1;
    const nextStats = [
      { hp: 30, radius: 30 },
      { hp: 10, radius: 22 },
      { hp: 5, radius: 16 }
    ][nextLevel];
    for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI * 2 / 3 + (Math.random() * 0.5 - 0.25);
      const dir = new Vec2(Math.cos(angle), Math.sin(angle));
      const pos = Vec2.add(owner.pos, Vec2.scale(dir, owner.radius + nextStats.radius + 4));
      const child = game.spawnRole('slime', pos, `${owner.label}.${i + 1}`, owner.teamId, {
        hp: nextStats.hp,
        radius: nextStats.radius,
        speed: BALL_SPEED * 0.95,
        level: nextLevel,
        vel: safeNormalize(Vec2.add(dir, Vec2.scale(randomUnitVector(), 0.35))).scale(BALL_SPEED * 0.95)
      });
      child.skill.level = nextLevel;
    }
  }

  draw(owner, game, ctx) {
    const r = owner.radius;
    ctx.save();
    ctx.strokeStyle = COLORS.slimeDark;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(owner.pos.x, owner.pos.y, r + 4, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = COLORS.white;
    ctx.lineWidth = 1;
    for (const [ox, oy] of [[-0.55,-0.55],[0.55,-0.40],[-0.45,0.45],[0.48,0.55]]) {
      const c = new Vec2(owner.pos.x + ox * r, owner.pos.y + oy * r);
      ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(2, Math.floor(r * 0.13)), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
}

export class GuardSkill extends Skill {
  constructor() {
    super();
    this.damage = 2;
    this.cooldown = NORMAL_BODY_COOLDOWN;
    this.lastHit = new Map();
  }
  onBodyCollision(owner, other, game, matchTime) {
    const next = this.lastHit.get(other.uid) ?? 0;
    if (matchTime < next) return false;
    this.lastHit.set(other.uid, matchTime + this.cooldown);
    other.takeDamage(this.damage, game, owner, matchTime);
    const knock = safeNormalize(Vec2.sub(other.pos, owner.pos));
    other.vel = knock.scale(Math.max(other.currentSpeed(matchTime), 520));
    other.externalForceUntil = matchTime + 0.15;
    return true;
  }

  draw(owner, game, ctx) {
    ctx.save();
    const shield = new Vec2(owner.pos.x - owner.radius - 10, owner.pos.y);
    ctx.fillStyle = COLORS.guardNavy; ctx.strokeStyle = COLORS.black; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(shield.x, shield.y, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const s = new Vec2(owner.pos.x + owner.radius + 4, owner.pos.y + 8);
    const e = new Vec2(owner.pos.x + owner.radius + 30, owner.pos.y - 10);
    ctx.strokeStyle = COLORS.swordSilver; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke();
    ctx.strokeStyle = COLORS.black; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }
}

export class KingSkill extends Skill {
  constructor() {
    super();
    this.damage = 3;
    this.cooldown = NORMAL_BODY_COOLDOWN;
    this.lastHit = new Map();
    this.initialSummoned = false;
    this.nextSummon = 7.5;
    this.guardCount = 0;
    this.guards = [];
  }
  summonGuard(owner, game, matchTime) {
    this.guardCount += 1;
    const dir = randomUnitVector();
    const guardRadius = 24;
    const pos = Vec2.add(owner.pos, Vec2.scale(dir, owner.radius + guardRadius + 12));
    const guard = game.spawnRole('guard', pos, `${owner.label}G${this.guardCount}`, owner.teamId, {
      hp: 30,
      radius: guardRadius,
      speed: BALL_SPEED * 0.92,
      vel: safeNormalize(Vec2.add(dir, Vec2.scale(randomUnitVector(), 0.35))).scale(BALL_SPEED * 0.92)
    });
    this.guards.push(guard);
    return guard;
  }
  update(owner, game, dt, matchTime) {
    this.guards = this.guards.filter(g => g.hp > 0);
    if (!this.initialSummoned) {
      this.initialSummoned = true;
      this.summonGuard(owner, game, matchTime);
      this.summonGuard(owner, game, matchTime);
      this.nextSummon = matchTime + 7.5;
    }
    while (matchTime >= this.nextSummon) {
      this.nextSummon += 7.5;
      this.summonGuard(owner, game, matchTime);
    }
  }
  onBodyCollision(owner, other, game, matchTime) {
    const next = this.lastHit.get(other.uid) ?? 0;
    if (matchTime < next) return false;
    this.lastHit.set(other.uid, matchTime + this.cooldown);
    other.takeDamage(this.damage, game, owner, matchTime);
    return true;
  }
  onDeath(owner, game, matchTime) {
    for (const ball of game.balls) {
      if (ball !== owner && ball.hp > 0 && game.areAllies(ball, owner) && ball.role.id === 'guard') {
        ball.takeDamage(ball.hp, game, owner, matchTime);
        ball.deathProcessed = true;
      }
    }
  }
  draw(owner, game, ctx) {
    const b = new Vec2(owner.pos.x, owner.pos.y - owner.radius - 8);
    const pts = [new Vec2(-20,8), new Vec2(-14,-10), new Vec2(-4,4), new Vec2(0,-14), new Vec2(4,4), new Vec2(14,-10), new Vec2(20,8)].map(p => new Vec2(b.x+p.x, b.y+p.y));
    ctx.save(); ctx.fillStyle = COLORS.kingGold; ctx.strokeStyle = COLORS.black; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.fill(); ctx.stroke(); ctx.restore();
  }

}

export class LiBaiSkill extends Skill {
  constructor() {
    super();
    this.nextDrink = 1.0;
    this.drinkCooldown = 6.0;
    this.damageBucket = 0;
    this.rageEnd = 0;
    this.lastHit = new Map();
  }
  update(owner, game, dt, matchTime) {
    if (matchTime >= this.nextDrink) {
      this.nextDrink = matchTime + this.drinkCooldown;
      owner.heal(10, game);
    }
  }
  onDamageTaken(owner, amount, source, game, matchTime) {
    this.damageBucket += amount;
    while (this.damageBucket >= 30) {
      this.damageBucket -= 30;
      this.rageEnd = Math.max(this.rageEnd, matchTime + 3.0);
    }
  }
  speedMultiplier(owner, matchTime) { return matchTime < this.rageEnd ? 3.0 : 1.0; }
  onBodyCollision(owner, other, game, matchTime) {
    if (matchTime >= this.rageEnd) return false;
    const next = this.lastHit.get(other.uid) ?? 0;
    if (matchTime < next) return false;
    this.lastHit.set(other.uid, matchTime + NORMAL_BODY_COOLDOWN);
    other.takeDamage(8, game, owner, matchTime);
    const knock = safeNormalize(Vec2.sub(other.pos, owner.pos));
    other.vel = knock.scale(980);
    other.externalForceUntil = matchTime + 0.32;
    return true;
  }
  draw(owner, game, ctx) {
    const g = new Vec2(owner.pos.x + owner.radius + 14, owner.pos.y - owner.radius * 0.25);
    ctx.save();
    ctx.fillStyle = COLORS.winePurple; ctx.strokeStyle = COLORS.black; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(g.x, g.y, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(g.x, g.y - 13, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (owner.lastMatchTime < this.rageEnd) {
      ctx.strokeStyle = COLORS.red; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(owner.pos.x, owner.pos.y, owner.radius + 13, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = COLORS.orange;
      for (const a of [0.2, 1.7, 3.2, 4.7]) {
        ctx.beginPath(); ctx.moveTo(owner.pos.x + Math.cos(a) * (owner.radius + 15), owner.pos.y + Math.sin(a) * (owner.radius + 15)); ctx.lineTo(owner.pos.x + Math.cos(a) * (owner.radius + 30), owner.pos.y + Math.sin(a) * (owner.radius + 30)); ctx.stroke();
      }
    }
    ctx.restore();
  }

}

class PoopBowlHazardWeb extends Hazard {
  constructor(owner, pos) { super(owner); this.pos = pos.clone(); this.radius = 20; this.bob = Math.random() * Math.PI * 2; }
  update(game, dt, matchTime) {
    this.bob += dt * 4.5;
    if (!this.owner || this.owner.hp <= 0) { this.alive = false; return; }
    if (circleHit(this.pos, this.radius, this.owner.pos, this.owner.radius)) {
      this.alive = false;
      if (this.owner.skill instanceof ChiFoodGodSkill) {
        this.owner.skill.eaten += 1;
        this.owner.skill.damageBonus += 1;
        this.owner.heal(6, game);
      }
    }
  }
  draw(ctx) {
    const y = this.pos.y + Math.sin(this.bob) * 3;
    ctx.save();
    ctx.fillStyle = COLORS.bowlCream; ctx.strokeStyle = COLORS.black; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(this.pos.x, y + 9, 22, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = COLORS.poopBrown;
    ctx.beginPath(); ctx.arc(this.pos.x - 8, y - 2, 8, 0, Math.PI * 2); ctx.arc(this.pos.x + 7, y - 3, 8, 0, Math.PI * 2); ctx.arc(this.pos.x, y - 13, 7, 0, Math.PI * 2); ctx.arc(this.pos.x, y - 22, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

class FartRingHazardWeb extends Hazard {
  constructor(owner, pos, radius, damage, matchTime) { super(owner); this.pos = pos.clone(); this.radius = radius; this.damage = damage; this.created = matchTime; this.end = matchTime + 0.65; this.hit = new Set(); this.drawTime = matchTime; }
  update(game, dt, matchTime) {
    this.drawTime = matchTime;
    if (matchTime >= this.end || !this.owner || this.owner.hp <= 0) { this.alive = false; return; }
    for (const ball of game.balls) {
      if (ball.hp <= 0 || game.areAllies(ball, this.owner) || this.hit.has(ball.uid)) continue;
      if (!circleHit(this.pos, this.radius, ball.pos, ball.radius)) continue;
      this.hit.add(ball.uid);
      ball.takeDamage(this.damage, game, this.owner, matchTime);
      ball.addSlow(0.7, 2.0, matchTime);
    }
  }
  draw(ctx) {
    const progress = clamp((this.drawTime - this.created) / 0.65, 0, 1);
    const r = Math.max(8, this.radius * (0.35 + 0.65 * progress));
    ctx.save(); ctx.strokeStyle = COLORS.fartGreen; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = COLORS.fartDark; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, Math.max(2, r - 22), 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 7; i++) {
      const a = progress * Math.PI * 2 * 1.6 + i * Math.PI * 2 / 7;
      const x = this.pos.x + Math.cos(a) * r;
      const y = this.pos.y + Math.sin(a) * r;
      ctx.fillStyle = COLORS.fartGreen; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = COLORS.fartDark; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  }
}

export class ChiFoodGodSkill extends Skill {
  constructor() {
    super(); this.spawnedBowls = false; this.eaten = 0; this.damageBonus = 0; this.nextFart = 1.0; this.fartCooldown = 2.0; this.lastHit = new Map();
  }
  update(owner, game, dt, matchTime) {
    if (!this.spawnedBowls) {
      this.spawnedBowls = true;
      for (let i = 0; i < 5; i++) {
        let pos = randomPointInRect(game.arena, 50);
        for (let attempt = 0; attempt < 30; attempt++) {
          const tooCloseOwner = pos.distanceTo(owner.pos) < owner.radius + 65;
          const tooCloseBowl = game.hazards.some(h => h instanceof PoopBowlHazardWeb && h.pos.distanceTo(pos) < 48);
          if (!tooCloseOwner && !tooCloseBowl) break;
          pos = randomPointInRect(game.arena, 50);
        }
        game.hazards.push(new PoopBowlHazardWeb(owner, pos));
      }
    }
    while (matchTime >= this.nextFart) {
      this.nextFart += this.fartCooldown;
      game.hazards.push(new FartRingHazardWeb(owner, owner.pos, 125, 1 + this.damageBonus, matchTime));
    }
  }
  onBodyCollision(owner, other, game, matchTime) {
    const next = this.lastHit.get(other.uid) ?? 0; if (matchTime < next) return false;
    this.lastHit.set(other.uid, matchTime + NORMAL_BODY_COOLDOWN);
    other.takeDamage(2 + this.damageBonus, game, owner, matchTime);
    return true;
  }
  draw(owner, game, ctx) {
    this.gasSpin = (this.gasSpin ?? Math.random() * Math.PI * 2) + 0.08;
    const mouthW = owner.radius + 22;
    const mouth = new Vec2(owner.pos.x, owner.pos.y + owner.radius + 5);
    ctx.save();
    ctx.fillStyle = COLORS.black;
    ctx.beginPath(); ctx.ellipse(mouth.x, mouth.y, mouthW / 2, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = COLORS.white; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mouth.x, mouth.y, (mouthW - 4) / 2, 0, Math.PI); ctx.stroke();
    const s = new Vec2(owner.pos.x + owner.radius * 0.72, owner.pos.y - owner.radius * 0.25);
    const e = new Vec2(owner.pos.x + owner.radius + 30, owner.pos.y - owner.radius - 10);
    ctx.strokeStyle = '#b4b4be'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke();
    ctx.fillStyle = COLORS.bowlCream; ctx.strokeStyle = COLORS.black; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(e.x, e.y, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const a = this.gasSpin + i * Math.PI * 2 / 3;
      const q = new Vec2(owner.pos.x + Math.cos(a) * (owner.radius + 18), owner.pos.y + Math.sin(a) * (owner.radius + 18));
      ctx.fillStyle = COLORS.fartGreen; ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = COLORS.fartDark; ctx.stroke();
    }
    ctx.restore();
  }

}

class GlitchTextProjectile extends Projectile {
  constructor(owner, pos, direction) { super(owner); this.pos = pos.clone(); this.vel = safeNormalize(direction).scale(245); this.radius = 12; this.text = ['#@~', '%*$', '&Ⅲ', '!?%', '@#&', '～$*'][Math.floor(Math.random() * 6)]; }
  update(game, dt, matchTime) {
    this.pos.add(Vec2.scale(this.vel, dt));
    if (this.pos.x < game.arena.left - 40 || this.pos.x > game.arena.right + 40 || this.pos.y < game.arena.top - 40 || this.pos.y > game.arena.bottom + 40) { this.alive = false; return; }
    for (const ball of game.balls) {
      if (ball.hp <= 0 || game.areAllies(ball, this.owner)) continue;
      if (!circleHit(this.pos, this.radius, ball.pos, ball.radius)) continue;
      ball.takeDamage(1, game, this.owner, matchTime); this.alive = false; return;
    }
  }
  draw(ctx) { ctx.save(); ctx.fillStyle = COLORS.glitchPurple; ctx.strokeStyle = COLORS.black; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center'; ctx.strokeText(this.text, this.pos.x, this.pos.y); ctx.fillText(this.text, this.pos.x, this.pos.y); ctx.restore(); }
}

export class AnnoyingOrangeSkill extends Skill {
  constructor() { super(); this.nextFire = 0.4; this.cooldown = 0.2; }
  update(owner, game, dt, matchTime) {
    while (matchTime >= this.nextFire) {
      this.nextFire += this.cooldown;
      const enemy = game.nearestEnemy(owner); if (!enemy) break;
      const dir = safeNormalize(Vec2.sub(enemy.pos, owner.pos));
      const start = Vec2.add(owner.pos, Vec2.scale(dir, owner.radius + 17));
      game.projectiles.push(new GlitchTextProjectile(owner, start, dir));
    }
  }

  draw(owner, game, ctx) {
    ctx.save();
    ctx.strokeStyle = COLORS.annoyingOrange; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(owner.pos.x, owner.pos.y, owner.radius + 5, 0, Math.PI * 2); ctx.stroke();
    const left = new Vec2(owner.pos.x - 14, owner.pos.y - owner.radius - 5);
    const right = new Vec2(owner.pos.x + 14, owner.pos.y - owner.radius - 5);
    ctx.fillStyle = COLORS.white; ctx.beginPath(); ctx.arc(left.x, left.y, 6, 0, Math.PI * 2); ctx.arc(right.x, right.y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COLORS.black; ctx.beginPath(); ctx.arc(left.x, left.y, 3, 0, Math.PI * 2); ctx.arc(right.x, right.y, 3, 0, Math.PI * 2); ctx.fill();
    const mouth = new Vec2(owner.pos.x, owner.pos.y + owner.radius + 8);
    ctx.strokeStyle = COLORS.black; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(mouth.x, mouth.y, 16, 0, Math.PI); ctx.stroke();
    ctx.restore();
  }
}

export class QuicksilverSkill extends Skill {
  constructor() {
    super();
    this.boundTarget = null;
    this.boundOffset = new Vec2(0, 0);
    this.bindStartPos = null;
    this.bindDirection = new Vec2(1, 0);
    this.wallDamageDone = false;
    this.bindCooldown = 2.0;
    this.nextBindTime = 0.0;
  }
  onBodyCollision(owner, target, game, matchTime) {
    if (this.boundTarget || target.hp <= 0 || target.heldBy || matchTime < this.nextBindTime) return false;
    const originalVel = owner.preCollisionVel || owner.vel;
    this.bindDirection = safeNormalize(originalVel);
    this.boundTarget = target;
    this.boundOffset = Vec2.scale(this.bindDirection, owner.radius + target.radius + 3);
    this.bindStartPos = owner.pos.clone();
    this.wallDamageDone = false;
    target.heldBy = owner;
    target.vel = new Vec2(0, 0);
    target.pos = Vec2.add(owner.pos, this.boundOffset);
    owner.vel = this.bindDirection.clone().scale(owner.currentSpeed(matchTime));
    owner.externalForceUntil = matchTime + 0.18;
    return true;
  }
  releaseTarget() {
    if (this.boundTarget) this.boundTarget.heldBy = null;
    this.boundTarget = null;
  }
  reboundDirection(owner, target, game, wall = null) {
    const direction = this.bindDirection.clone();
    if (wall === 'left' || wall === 'right') direction.x *= -1;
    else if (wall === 'top' || wall === 'bottom') direction.y *= -1;
    else {
      const a = game.arena;
      const minX = Math.min(owner.pos.x - owner.radius, target.pos.x - target.radius);
      const maxX = Math.max(owner.pos.x + owner.radius, target.pos.x + target.radius);
      const minY = Math.min(owner.pos.y - owner.radius, target.pos.y - target.radius);
      const maxY = Math.max(owner.pos.y + owner.radius, target.pos.y + target.radius);
      if (minX <= a.left || maxX >= a.right) direction.x *= -1;
      if (minY <= a.top || maxY >= a.bottom) direction.y *= -1;
    }
    return safeNormalize(direction);
  }
  crashIntoWall(owner, matchTime, game, wall = null) {
    const target = this.boundTarget;
    if (!target) return;
    if (!this.wallDamageDone && owner.hp > 0 && target.hp > 0) {
      this.wallDamageDone = true;
      const dist = this.bindStartPos ? owner.pos.distanceTo(this.bindStartPos) : 0;
      const ratio = dist / (ARENA_SIZE / 2);
      const currentSpeed = Math.max(owner.vel.length(), owner.currentSpeed(matchTime));
      const speedRatio = currentSpeed / BALL_SPEED;
      target.takeDamage(Math.max(1, ratio * speedRatio * 10), game, owner, matchTime);
    }
    const throwDir = randomUnitVector();
    const rebound = this.reboundDirection(owner, target, game, wall);
    this.nextBindTime = matchTime + this.bindCooldown;
    this.releaseTarget();
    if (target.hp > 0) {
      target.vel = throwDir.scale(1350);
      target.externalForceUntil = matchTime + 0.75;
    }
    owner.vel = rebound.scale(Math.max(owner.currentSpeed(matchTime), BALL_SPEED * 1.35));
    owner.externalForceUntil = matchTime + 0.35;
    const a = game.arena;
    owner.pos.x = clamp(owner.pos.x, a.left + owner.radius, a.right - owner.radius);
    owner.pos.y = clamp(owner.pos.y, a.top + owner.radius, a.bottom - owner.radius);
    if (target.hp > 0) {
      target.pos.x = clamp(target.pos.x, a.left + target.radius, a.right - target.radius);
      target.pos.y = clamp(target.pos.y, a.top + target.radius, a.bottom - target.radius);
    }
  }
  onWallBounce(owner, wall, game, matchTime) { if (this.boundTarget) this.crashIntoWall(owner, matchTime, game, wall); }
  update(owner, game, dt, matchTime) {
    const target = this.boundTarget;
    if (!target) return;
    if (owner.hp <= 0 || target.hp <= 0) { this.nextBindTime = matchTime + this.bindCooldown; this.releaseTarget(); return; }
    const speed = owner.currentSpeed(matchTime);
    owner.vel = this.bindDirection.clone().scale(speed);
    target.pos = Vec2.add(owner.pos, this.boundOffset);
    target.vel = owner.vel.clone();
    const a = game.arena;
    const minX = Math.min(owner.pos.x - owner.radius, target.pos.x - target.radius);
    const maxX = Math.max(owner.pos.x + owner.radius, target.pos.x + target.radius);
    const minY = Math.min(owner.pos.y - owner.radius, target.pos.y - target.radius);
    const maxY = Math.max(owner.pos.y + owner.radius, target.pos.y + target.radius);
    let wall = null;
    if (minX <= a.left) wall = 'left'; else if (maxX >= a.right) wall = 'right'; else if (minY <= a.top) wall = 'top'; else if (maxY >= a.bottom) wall = 'bottom';
    if (wall) this.crashIntoWall(owner, matchTime, game, wall);
  }
  draw(owner, game, ctx) {
    const direction = owner.vel.length() > 0 ? safeNormalize(owner.vel) : new Vec2(1, 0);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = COLORS.quicksilverBlue;
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const start = Vec2.add(owner.pos, Vec2.scale(direction, -(owner.radius + 8 + i * 12)));
      const end = Vec2.add(start, Vec2.scale(direction, -16));
      ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
    }
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(owner.pos.x, owner.pos.y, owner.radius + 8, 0, Math.PI * 2); ctx.stroke();
    if (this.boundTarget && this.boundTarget.hp > 0) {
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(owner.pos.x, owner.pos.y); ctx.lineTo(this.boundTarget.pos.x, this.boundTarget.pos.y); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.boundTarget.pos.x, this.boundTarget.pos.y, this.boundTarget.radius + 7, 0, Math.PI * 2); ctx.stroke();
      const arrowTip = Vec2.add(owner.pos, Vec2.scale(this.bindDirection, owner.radius + 36));
      ctx.strokeStyle = COLORS.white; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(owner.pos.x + this.bindDirection.x * owner.radius, owner.pos.y + this.bindDirection.y * owner.radius); ctx.lineTo(arrowTip.x, arrowTip.y); ctx.stroke();
    }
    ctx.restore();
  }
}

class SwordSaintStrikeHazardWeb extends Hazard {
  constructor(owner, center, radius, matchTime) {
    super(owner);
    this.pos = center.clone();
    this.radius = radius;
    this.created = matchTime;
    this.firstDone = false;
    this.secondDone = false;
    this.drawTime = matchTime;
  }
  strike(game, matchTime, label) {
    for (const ball of game.balls) {
      if (ball.hp <= 0 || game.areAllies(ball, this.owner) || ball.heldBy) continue;
      if (this.pos.distanceTo(ball.pos) <= this.radius + ball.radius) {
        ball.takeDamage(20, game, this.owner, matchTime);
        const knock = safeNormalize(Vec2.sub(ball.pos, this.pos));
        ball.vel = knock.scale(1250);
        ball.externalForceUntil = matchTime + 0.45;
      }
    }
  }
  update(game, dt, matchTime) {
    this.drawTime = matchTime;
    if (!this.firstDone) { this.firstDone = true; this.strike(game, matchTime, 'sky sword'); }
    if (!this.secondDone && matchTime >= this.created + 0.5) { this.secondDone = true; this.strike(game, matchTime, 'round slash'); }
    if (matchTime >= this.created + 1.15) this.alive = false;
  }
  draw(ctx) {
    const elapsed = this.drawTime - this.created;
    ctx.save();
    ctx.strokeStyle = COLORS.swordAura;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2); ctx.stroke();
    const top = new Vec2(this.pos.x, this.pos.y - 150 + Math.min(elapsed, 0.35) * 280);
    const tip = new Vec2(this.pos.x, this.pos.y + 42);
    ctx.strokeStyle = COLORS.swordSilver; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    ctx.strokeStyle = COLORS.black; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = COLORS.kingGold; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(this.pos.x - 38, this.pos.y - 10); ctx.lineTo(this.pos.x + 38, this.pos.y - 10); ctx.stroke();
    if (elapsed >= 0.5) {
      const a = elapsed * 10;
      const p1 = new Vec2(this.pos.x + Math.cos(a) * this.radius, this.pos.y + Math.sin(a) * this.radius);
      const p2 = new Vec2(this.pos.x - Math.cos(a) * this.radius, this.pos.y - Math.sin(a) * this.radius);
      ctx.strokeStyle = COLORS.swordSilver; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      ctx.strokeStyle = COLORS.white; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
}

export class SwordSaintSkill extends Skill {
  constructor() {
    super();
    this.cooldown = 4.0;
    this.nextCast = this.cooldown;
    this.state = 'idle';
    this.chargeDuration = 0.5;
    this.fullComboDuration = 1.15;
    this.aimStart = 0;
    this.chargeStart = 0;
    this.resumeMoveTime = null;
    this.resumeMoveDone = true;
    this.lockedTarget = null;
    this.lockedCenter = null;
    this.rangeRadius = Math.floor(BALL_RADIUS * 4.8);
  }
  isUntargetable(owner, matchTime) { return this.state === 'aim' || this.state === 'charge'; }
  isHidden(owner, matchTime) { return this.state === 'aim' || this.state === 'charge'; }
  ignoresPhysicalCollision(owner, other, matchTime) { return this.isUntargetable(owner, matchTime); }
  modifyIncomingDamage(owner, amount, source, game, matchTime) { return this.isUntargetable(owner, matchTime) ? 0 : amount; }
  update(owner, game, dt, matchTime) {
    if (this.state === 'idle') {
      if (!this.resumeMoveDone && this.resumeMoveTime != null && matchTime >= this.resumeMoveTime) {
        owner.vel = randomUnitVector().scale(owner.currentSpeed(matchTime));
        owner.externalForceUntil = matchTime + 0.2;
        this.resumeMoveDone = true;
        this.resumeMoveTime = null;
        return;
      }
      const target = game.nearestEnemy(owner);
      if (target && matchTime >= this.nextCast) {
        this.state = 'aim';
        this.aimStart = matchTime;
        this.lockedTarget = target;
        owner.vel = new Vec2(0, 0);
        owner.externalForceUntil = matchTime + 1.55;
      }
      return;
    }
    if (this.state === 'aim') {
      owner.vel = new Vec2(0, 0);
      if (!this.lockedTarget || this.lockedTarget.hp <= 0) this.lockedTarget = game.nearestEnemy(owner);
      if (matchTime >= this.aimStart + 1.0) {
        this.lockedCenter = this.lockedTarget && this.lockedTarget.hp > 0 ? this.lockedTarget.pos.clone() : randomPointInRect(game.arena, BALL_RADIUS);
        this.state = 'charge';
        this.chargeStart = matchTime;
      }
      return;
    }
    if (this.state === 'charge') {
      owner.vel = new Vec2(0, 0);
      if (matchTime >= this.chargeStart + this.chargeDuration) {
        const c = this.lockedCenter.clone();
        c.x = clamp(c.x, game.arena.left + owner.radius, game.arena.right - owner.radius);
        c.y = clamp(c.y, game.arena.top + owner.radius, game.arena.bottom - owner.radius);
        owner.pos = c;
        owner.externalForceUntil = matchTime + 0.25;
        game.hazards.push(new SwordSaintStrikeHazardWeb(owner, c, this.rangeRadius, matchTime));
        this.state = 'idle';
        this.resumeMoveTime = matchTime + this.fullComboDuration;
        this.resumeMoveDone = false;
        this.nextCast = this.resumeMoveTime + this.cooldown;
        this.lockedTarget = null;
        this.lockedCenter = null;
      }
    }
  }
  draw(owner, game, ctx) {
    ctx.save();
    if (!this.isHidden(owner, owner.lastMatchTime || 0)) {
      ctx.strokeStyle = COLORS.swordSilver; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(owner.pos.x + owner.radius + 8, owner.pos.y + owner.radius + 8); ctx.lineTo(owner.pos.x + owner.radius + 28, owner.pos.y - owner.radius - 12); ctx.stroke();
      ctx.strokeStyle = COLORS.black; ctx.lineWidth = 1; ctx.stroke();
    }
    if (this.state === 'aim' && this.lockedTarget && this.lockedTarget.hp > 0) {
      ctx.strokeStyle = COLORS.swordAura; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(owner.pos.x, owner.pos.y); ctx.lineTo(this.lockedTarget.pos.x, this.lockedTarget.pos.y); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.lockedTarget.pos.x, this.lockedTarget.pos.y, this.lockedTarget.radius + 12, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = COLORS.white; ctx.beginPath(); ctx.arc(owner.pos.x, owner.pos.y, owner.radius + 14, 0, Math.PI * 2); ctx.stroke();
    } else if (this.state === 'charge' && this.lockedCenter) {
      ctx.strokeStyle = COLORS.swordAura; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(this.lockedCenter.x, this.lockedCenter.y, this.rangeRadius, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = COLORS.white; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(this.lockedCenter.x, this.lockedCenter.y, this.rangeRadius * 0.55, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = COLORS.swordSilver; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(this.lockedCenter.x, this.lockedCenter.y - 125); ctx.lineTo(this.lockedCenter.x, this.lockedCenter.y); ctx.stroke();
    }
    ctx.restore();
  }
}
