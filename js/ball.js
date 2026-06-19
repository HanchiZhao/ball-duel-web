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
    this.stunResumeVel = null;
    this.slowEffects = [];
    this.paperSlowEffects = [];
    this.fruitSlowEffects = [];
    this.dotEffects = [];
    this.stuckPapers = [];
    this.pengciMarks = 0;
    this.nextPengciMarkDecay = 0;
    this.spellMarks = 0;
    this.flowerbedSlow = 0;
    this.throwWallDamageUntil = 0;
    this.throwWallDamage = 0;
    this.nextThrowWallDamage = 0;
    this.lastMatchTime = 0;
    this.hitFlashTimer = 0;
    this.preCollisionVel = this.vel.clone();
    this.deathProcessed = false;
  }

  currentSpeed(matchTime) {
    let mult = 1;
    this.slowEffects = this.slowEffects.filter(s => s.end > matchTime);
    this.paperSlowEffects = this.paperSlowEffects.filter(s => s.end > matchTime);
    this.fruitSlowEffects = this.fruitSlowEffects.filter(s => s.end > matchTime);
    if (this.slowEffects.length) mult = Math.min(mult, ...this.slowEffects.map(s => s.multiplier));
    if (this.paperSlowEffects.length) {
      const total = Math.min(this.paperSlowEffects.reduce((sum, s) => sum + s.slowAmount, 0), 0.70);
      mult = Math.min(mult, 1 - total);
    }
    if (this.fruitSlowEffects.length) {
      const total = Math.min(this.fruitSlowEffects.reduce((sum, s) => sum + s.slowAmount, 0), 0.90);
      mult = Math.min(mult, 1 - total);
    }
    if ((this.flowerbedSlow || 0) > 0) mult = Math.min(mult, Math.max(0.05, 1 - this.flowerbedSlow));
    if (matchTime < this.stunUntil) mult = 0;
    mult *= this.skill.speedMultiplier(this, matchTime);
    return this.baseSpeed * mult;
  }

  controlImmuneNow(matchTime) {
    return !!this.skill.immuneToControl?.(this, matchTime);
  }

  addSlow(multiplier, duration, matchTime) {
    if (this.controlImmuneNow(matchTime)) return;
    this.slowEffects.push({ multiplier, end: matchTime + duration });
  }

  addPaperSlow(slowAmount, duration, matchTime) {
    if (this.controlImmuneNow(matchTime)) return;
    this.paperSlowEffects.push({ slowAmount, end: matchTime + duration });
  }

  addFruitSlow(slowAmount, duration, matchTime) {
    if (this.controlImmuneNow(matchTime)) return;
    this.fruitSlowEffects.push({ slowAmount, end: matchTime + duration });
  }

  addStun(duration, matchTime) {
    if (this.controlImmuneNow(matchTime)) return;
    if (this.vel.length() > 0 && (!this.stunResumeVel || matchTime >= this.stunUntil)) this.stunResumeVel = this.vel.clone();
    this.stunUntil = Math.max(this.stunUntil, matchTime + duration);
  }

  addDot(damage, interval, duration, matchTime, sourceName = 'dot') {
    if (this.controlImmuneNow(matchTime)) return;
    this.dotEffects.push({ damage, interval, end: matchTime + duration, next: matchTime + interval, sourceName });
  }

  addPengciMark(matchTime) {
    if (this.controlImmuneNow(matchTime)) return;
    this.pengciMarks = (this.pengciMarks || 0) + 1;
    if (this.pengciMarks === 1 || this.nextPengciMarkDecay <= matchTime) this.nextPengciMarkDecay = matchTime + 6.0;
  }

  clearPengciMarks() {
    this.pengciMarks = 0;
    this.nextPengciMarkDecay = 0;
  }

  addStuckPaper(duration, matchTime, incomingDirection) {
    if (this.controlImmuneNow(matchTime)) return;
    const dir = safeNormalize(incomingDirection);
    const attach = Vec2.scale(dir, -1).rotated((Math.random() * 1.10) - 0.55);
    const angle = Math.atan2(attach.y, attach.x);
    this.stuckPapers.push({
      end: matchTime + duration,
      angle,
      direction: attach,
      spin: 0
    });
  }

  takeDamage(amount, game, source = null, matchTime = this.lastMatchTime) {
    if (this.hp <= 0 || amount <= 0) return 0;
    const actual = Math.max(0, this.skill.modifyIncomingDamage(this, amount, source, game, matchTime));
    if (actual <= 0) {
      this.hitFlashTimer = 0.08;
      return 0;
    }
    const wasAlive = this.hp > 0;
    this.hp = Math.max(0, this.hp - actual);
    this.hitFlashTimer = 0.12;
    const text = Math.abs(actual - Math.round(actual)) < 0.05 ? `-${Math.round(actual)}` : `-${actual.toFixed(1)}`;
    game?.addFloatingText(this.pos, text, 'damage');
    this.skill.onDamageTaken(this, actual, source, game, matchTime);
    if (wasAlive && this.hp <= 0 && !this.deathProcessed) {
      this.deathProcessed = true;
      this.skill.onDeath(this, game, matchTime);
    }
    return actual;
  }

  heal(amount, game) {
    if (this.hp <= 0 || amount <= 0) return 0;
    this.hp += amount;
    return amount;
  }

  update(game, dt, matchTime) {
    this.lastMatchTime = matchTime;
    this.radius = this.skill.currentRadius?.(this, matchTime, this.role.radius ?? BALL_RADIUS) ?? (this.role.radius ?? BALL_RADIUS);
    this.slowEffects = this.slowEffects.filter(s => matchTime <= s.end);
    this.paperSlowEffects = this.paperSlowEffects.filter(s => matchTime <= s.end);
    this.fruitSlowEffects = this.fruitSlowEffects.filter(s => matchTime <= s.end);
    this.stuckPapers = this.stuckPapers.filter(p => matchTime <= p.end);
    this.dotEffects = this.dotEffects.filter(dot => {
      while (matchTime >= dot.next && dot.next <= dot.end && this.hp > 0) {
        dot.next += dot.interval;
        this.takeDamage(dot.damage, game, dot.sourceName, matchTime);
      }
      return matchTime <= dot.end;
    });

    while ((this.pengciMarks || 0) > 0 && matchTime >= this.nextPengciMarkDecay) {
      this.pengciMarks -= 1;
      if (this.pengciMarks > 0) this.nextPengciMarkDecay += 6.0;
      else this.nextPengciMarkDecay = 0;
    }

    this.skill.update(this, game, dt, matchTime);

    if (this.hp <= 0 || this.heldBy) return;
    if (matchTime < this.stunUntil) {
      if (this.vel.length() > 0 && !this.stunResumeVel) this.stunResumeVel = this.vel.clone();
      this.vel = new Vec2(0, 0);
      return;
    }

    if (matchTime > this.externalForceUntil) {
      const speed = this.currentSpeed(matchTime);
      if (this.stunResumeVel && this.vel.length() <= 0) {
        this.vel = safeNormalize(this.stunResumeVel).scale(speed);
        this.stunResumeVel = null;
      }
      if (this.vel.length() <= 0) this.vel = randomUnitVector().scale(speed);
      else this.vel = safeNormalize(this.vel).scale(speed);
    }

    this.pos.add(Vec2.scale(this.vel, dt));
    this.keepInsideArena(game, matchTime);
    this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
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
      game?.addWallSpark(this.pos, wall, this.color);
      this.skill.onWallBounce(this, wall, game, matchTime);
    }
  }


  drawBodyLayer(ctx, game) {
    if (this.hp <= 0) return;
    if (this.skill.isHidden?.(this, this.lastMatchTime)) return;
    const phased = this.skill.isUntargetable(this, this.lastMatchTime);
    ctx.save();
    this.drawStatusAuras(ctx, phased);
    ctx.beginPath();
    ctx.arc(this.pos.x + 5, this.pos.y + 6, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.black;
    ctx.fill();
    if (phased) ctx.globalAlpha = 0.60;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.hitFlashTimer > 0 ? COLORS.red : this.color;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.white;
    ctx.stroke();
    ctx.restore();
  }

  drawSkillLayer(ctx, game) {
    if (this.hp <= 0) return;
    this.skill.draw(this, game, ctx);
  }

  drawOverlayLayer(ctx, game) {
    if (this.hp <= 0) return;
    if (this.skill.isHidden?.(this, this.lastMatchTime)) return;
    this.drawStuckPapers(ctx);
    this.drawPengciMarks(ctx);
    this.drawSpellMarks(ctx);
  }

  drawHpLayer(ctx, game) {
    if (this.hp <= 0) return;
    if (this.skill.isHidden?.(this, this.lastMatchTime)) return;
    ctx.save();
    ctx.font = 'bold 22px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,.72)';
    ctx.fillStyle = COLORS.black;
    const hpText = String(Math.round(this.hp));
    ctx.strokeText(hpText, this.pos.x, this.pos.y - 2);
    ctx.fillText(hpText, this.pos.x, this.pos.y - 2);
    ctx.font = '12px Arial, sans-serif';
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = 'rgba(0,0,0,.7)';
    ctx.lineWidth = 3;
    ctx.strokeText(this.label, this.pos.x, this.pos.y + this.radius + 13);
    ctx.fillText(this.label, this.pos.x, this.pos.y + this.radius + 13);
    ctx.restore();
  }

  draw(ctx, game) {
    if (this.hp <= 0) return;
    if (this.skill.isHidden?.(this, this.lastMatchTime)) return;
    const phased = this.skill.isUntargetable(this, this.lastMatchTime);
    ctx.save();
    this.drawStatusAuras(ctx, phased);
    ctx.beginPath();
    ctx.arc(this.pos.x + 5, this.pos.y + 6, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.black;
    ctx.fill();
    if (phased) ctx.globalAlpha = 0.60;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.hitFlashTimer > 0 ? COLORS.red : (phased ? COLORS.ghostPhase : this.color);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.white;
    ctx.stroke();
    ctx.globalAlpha = 1;

    this.drawRoleDecoration(ctx);
    this.skill.draw(this, game, ctx);
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

    this.drawPengciMarks(ctx);
    this.drawSpellMarks(ctx);

    ctx.font = '12px Arial, sans-serif';
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = 'rgba(0,0,0,.7)';
    ctx.lineWidth = 3;
    ctx.strokeText(this.label, this.pos.x, this.pos.y + this.radius + 13);
    ctx.fillText(this.label, this.pos.x, this.pos.y + this.radius + 13);
    ctx.restore();
  }



  drawPengciMarks(ctx) {
    if ((this.pengciMarks || 0) <= 0) return;
    const visible = Math.min(this.pengciMarks, 8);
    const rr = this.radius + 15;
    ctx.save();
    for (let i = 0; i < visible; i++) {
      const a = -Math.PI / 2 + i * Math.PI * 2 / Math.max(visible, 1);
      const x = this.pos.x + Math.cos(a) * rr;
      const y = this.pos.y + Math.sin(a) * rr;
      ctx.fillStyle = COLORS.ribbonGold;
      ctx.strokeStyle = COLORS.black;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = COLORS.vaseBlue; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y); ctx.stroke();
    }
    if (this.pengciMarks > visible) {
      ctx.font = '12px Arial, sans-serif'; ctx.fillStyle = COLORS.ribbonGold; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`x${this.pengciMarks}`, this.pos.x, this.pos.y + this.radius + 31);
    }
    ctx.restore();
  }

  drawSpellMarks(ctx) {
    if ((this.spellMarks || 0) <= 0 && !(this.stunUntil > this.lastMatchTime)) return;
    ctx.save();
    const visible = Math.min(this.spellMarks || 0, 5);
    const rr = this.radius + 27;
    for (let i = 0; i < visible; i++) {
      const a = Math.PI / 2 + i * Math.PI * 2 / Math.max(visible, 1);
      const x = this.pos.x + Math.cos(a) * rr;
      const y = this.pos.y + Math.sin(a) * rr;
      ctx.fillStyle = COLORS.spellPurple; ctx.strokeStyle = COLORS.black; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = COLORS.spellCyan; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); ctx.stroke();
    }
    if ((this.spellMarks || 0) > visible) {
      ctx.font = '12px Arial, sans-serif'; ctx.fillStyle = COLORS.spellPurple; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`咒x${this.spellMarks}`, this.pos.x, this.pos.y - this.radius - 34);
    }
    if (this.stunUntil > this.lastMatchTime) {
      for (const a of [0, 2.1, 4.2]) {
        const x = this.pos.x + Math.cos(a) * (this.radius + 38);
        const y = this.pos.y + Math.sin(a) * (this.radius + 38);
        ctx.fillStyle = COLORS.yellow; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  drawStatusAuras(ctx, phased) {
    const x = this.pos.x, y = this.pos.y, r = this.radius;
    const t = this.lastMatchTime || 0;
    ctx.save();
    ctx.lineWidth = 2;
    if (phased) {
      ctx.strokeStyle = 'rgba(150,175,255,.55)';
      ctx.setLineDash([7, 6]);
      ctx.beginPath();
      ctx.arc(x, y, r + 8 + Math.sin(t * 6) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      for (let i = 0; i < 3; i++) {
        const a = t * 2.4 + i * Math.PI * 2 / 3;
        ctx.fillStyle = 'rgba(210,235,255,.20)';
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * (r + 14), y + Math.sin(a) * (r + 8), 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (this.slowEffects.length > 0 || (this.flowerbedSlow || 0) > 0) {
      ctx.strokeStyle = 'rgba(130,220,255,.30)';
      ctx.beginPath();
      ctx.arc(x, y, r + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (this.stunUntil > t) {
      ctx.strokeStyle = 'rgba(255,220,80,.62)';
      for (let i = 0; i < 3; i++) {
        const a = t * 5 + i * Math.PI * 2 / 3;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * (r + 9), y + Math.sin(a) * (r + 9), 3.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawStuckPapers(ctx) {
    if (!this.stuckPapers.length) return;
    ctx.save();
    for (const paper of this.stuckPapers) {
      const dir = paper.direction ? safeNormalize(paper.direction) : new Vec2(Math.cos(paper.angle), Math.sin(paper.angle));
      const cx = this.pos.x + dir.x * (this.radius + 8);
      const cy = this.pos.y + dir.y * (this.radius + 8);
      const angle = paper.angle + paper.spin;
      const w = 25, h = 18;
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
    // Python-sync mode: role decorations are drawn by each Skill.draw(), not by this generic overlay.
  }

  teamColor(game) {
    if (!this.teamId) return COLORS.white;
    return game.teamColors.get(this.teamId) || COLORS.white;
  }
}
