import { WIDTH, HEIGHT, ARENA_SIZE, BALL_RADIUS, COLORS, MAX_MATCH_TIME } from './config.js';
import { Vec2, randomUnitVector, safeNormalize } from './vector.js';
import { Ball } from './ball.js';
import { FloatingText } from './effects.js';
import { circleHit, avoidAxisAligned, drawLeftText } from './utils.js';
import { ROLES } from './roleRegistry.js';

export class Game {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.callbacks = callbacks;
    this.arena = this.makeArena();
    this.balls = [];
    this.projectiles = [];
    this.hazards = [];
    this.spiderWebKeys = new Set();
    this.floatingTexts = [];
    this.running = false;
    this.paused = false;
    this.matchTime = 0;
    this.lastTimestamp = null;
    this.winnerText = '请选择模式和角色，然后开始。';
    this.teamColors = new Map();
    this.teamPalette = ['#74d6ff', '#ff6f7d', '#75ffab', '#ffd76f', '#c87bff', '#ff9f5f'];
  }

  makeArena() {
    const left = Math.round((WIDTH - ARENA_SIZE) / 2);
    const top = Math.round((HEIGHT - ARENA_SIZE) / 2 + 20);
    return { left, top, right: left + ARENA_SIZE, bottom: top + ARENA_SIZE, width: ARENA_SIZE, height: ARENA_SIZE };
  }

  startFromSetup(setup) {
    this.resetWorld();
    const entries = [];
    if (setup.mode === 'teams') {
      setup.teams.forEach((team, tIndex) => {
        const teamId = `TEAM_${tIndex + 1}`;
        this.teamColors.set(teamId, this.teamPalette[tIndex % this.teamPalette.length]);
        team.roles.forEach((roleId, pIndex) => entries.push({ roleId, teamId, label: `T${tIndex + 1}P${pIndex + 1}` }));
      });
    } else {
      setup.roles.forEach((roleId, i) => entries.push({ roleId, teamId: `FFA_${i + 1}`, label: `P${i + 1}` }));
    }

    const spawnPoints = this.spawnPoints(entries.length);
    entries.forEach((entry, i) => {
      const role = ROLES[entry.roleId] || ROLES.normal;
      const ball = new Ball(role, spawnPoints[i], entry.label, entry.teamId);
      ball.vel = avoidAxisAligned(randomUnitVector()).scale(ball.baseSpeed);
      this.balls.push(ball);
    });

    this.running = true;
    this.paused = false;
    this.matchTime = 0;
    this.lastTimestamp = null;
    this.winnerText = '战斗开始！';
    this.emitStatus();
    requestAnimationFrame(ts => this.loop(ts));
  }

  resetWorld() {
    this.balls = [];
    this.projectiles = [];
    this.hazards = [];
    this.spiderWebKeys = new Set();
    this.floatingTexts = [];
    this.teamColors.clear();
    this.running = false;
    this.paused = false;
    this.matchTime = 0;
    this.lastTimestamp = null;
    this.winnerText = '已重置。';
    this.emitStatus();
    this.draw();
  }

  spawnRole(roleId, pos, label, teamId = null, overrides = {}) {
    const role = ROLES[roleId] || ROLES.normal;
    const ball = new Ball(role, pos.clone(), label, teamId);
    if (overrides.hp != null) { ball.hp = overrides.hp; ball.maxHp = overrides.hp; }
    if (overrides.radius != null) ball.radius = overrides.radius;
    if (overrides.speed != null) { ball.baseSpeed = overrides.speed; ball.vel = safeNormalize(ball.vel).scale(overrides.speed); }
    if (overrides.color != null) ball.color = overrides.color;
    if (overrides.level != null && ball.skill) ball.skill.level = overrides.level;
    if (overrides.vel) ball.vel = overrides.vel.clone();
    ball.pos.x = Math.max(this.arena.left + ball.radius, Math.min(this.arena.right - ball.radius, ball.pos.x));
    ball.pos.y = Math.max(this.arena.top + ball.radius, Math.min(this.arena.bottom - ball.radius, ball.pos.y));
    this.balls.push(ball);
    return ball;
  }

  spawnPoints(n) {
    const center = new Vec2((this.arena.left + this.arena.right) / 2, (this.arena.top + this.arena.bottom) / 2);
    const ring = ARENA_SIZE * 0.33;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + i * Math.PI * 2 / Math.max(1, n);
      pts.push(new Vec2(center.x + Math.cos(a) * ring, center.y + Math.sin(a) * ring));
    }
    return pts;
  }

  togglePause() {
    if (!this.running) return;
    this.paused = !this.paused;
    this.winnerText = this.paused ? '已暂停。' : '继续战斗。';
    this.lastTimestamp = null;
    this.emitStatus();
    if (!this.paused) requestAnimationFrame(ts => this.loop(ts));
  }

  loop(timestamp) {
    if (!this.running || this.paused) {
      this.draw();
      return;
    }
    if (this.lastTimestamp == null) this.lastTimestamp = timestamp;
    const dt = Math.min(0.033, (timestamp - this.lastTimestamp) / 1000);
    this.lastTimestamp = timestamp;
    this.update(dt);
    this.draw();
    this.emitStatus();
    if (this.running) requestAnimationFrame(ts => this.loop(ts));
  }

  update(dt) {
    this.matchTime += dt;
    for (const ball of this.balls) ball.update(this, dt, this.matchTime);
    this.handleBallCollisions();

    for (const projectile of this.projectiles) projectile.update(this, dt, this.matchTime);
    this.projectiles = this.projectiles.filter(p => p.alive);

    for (const hazard of this.hazards) hazard.update(this, dt, this.matchTime);
    this.hazards = this.hazards.filter(h => h.alive);

    this.floatingTexts = this.floatingTexts.filter(t => t.update(dt));
    this.checkWinner();
  }

  handleBallCollisions() {
    for (let i = 0; i < this.balls.length; i++) {
      for (let j = i + 1; j < this.balls.length; j++) {
        const a = this.balls[i];
        const b = this.balls[j];
        if (a.hp <= 0 || b.hp <= 0) continue;
        if (a.skill.ignoresPhysicalCollision(a, b, this.matchTime) || b.skill.ignoresPhysicalCollision(b, a, this.matchTime)) continue;
        if (!circleHit(a.pos, a.radius, b.pos, b.radius)) continue;
        this.resolveOverlap(a, b);
        if (this.areAllies(a, b)) continue;
        a.skill.onBodyCollision(a, b, this, this.matchTime);
        b.skill.onBodyCollision(b, a, this, this.matchTime);
      }
    }
  }

  resolveOverlap(a, b) {
    const delta = Vec2.sub(b.pos, a.pos);
    const dist = Math.max(0.001, delta.length());
    const minDist = a.radius + b.radius;
    const overlap = minDist - dist;
    if (overlap <= 0) return;
    const normal = delta.scale(1 / dist);
    a.pos.add(Vec2.scale(normal, -overlap / 2));
    b.pos.add(Vec2.scale(normal, overlap / 2));
    const va = a.vel.clone();
    a.vel = b.vel.clone();
    b.vel = va;
  }

  areAllies(a, b) {
    return a?.teamId && b?.teamId && a.teamId === b.teamId;
  }

  nearestEnemy(owner) {
    let best = null;
    let bestDist = Infinity;
    for (const ball of this.balls) {
      if (ball.hp <= 0 || ball === owner || this.areAllies(ball, owner)) continue;
      if (ball.skill.isUntargetable(ball, this.matchTime)) continue;
      const d = owner.pos.distanceTo(ball.pos);
      if (d < bestDist) {
        bestDist = d;
        best = ball;
      }
    }
    return best;
  }

  addFloatingText(pos, text, kind) {
    this.floatingTexts.push(new FloatingText(pos, text, kind));
  }

  aliveTeamGroups() {
    const groups = new Map();
    for (const ball of this.balls) {
      if (ball.hp <= 0) continue;
      if (!groups.has(ball.teamId)) groups.set(ball.teamId, []);
      groups.get(ball.teamId).push(ball);
    }
    return groups;
  }

  checkWinner() {
    const groups = this.aliveTeamGroups();
    if (groups.size <= 1 && this.balls.length > 0) {
      const winner = [...groups.keys()][0];
      this.running = false;
      this.winnerText = winner ? `${winner} 获胜！` : '全部阵亡，平局。';
      return;
    }
    if (this.matchTime >= MAX_MATCH_TIME) {
      this.running = false;
      let bestTeam = null;
      let bestHp = -1;
      for (const [teamId, balls] of groups.entries()) {
        const hp = balls.reduce((sum, b) => sum + Math.max(0, b.hp), 0);
        if (hp > bestHp) {
          bestHp = hp;
          bestTeam = teamId;
        }
      }
      this.winnerText = bestTeam ? `时间到：${bestTeam} 以总血量 ${Math.round(bestHp)} 获胜。` : '时间到：平局。';
    }
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    this.drawBackground(ctx);
    for (const hazard of this.hazards) hazard.draw(ctx);
    for (const projectile of this.projectiles) projectile.draw(ctx);
    for (const ball of this.balls) ball.draw(ctx, this);
    for (const text of this.floatingTexts) text.draw(ctx);
    this.drawSidebar(ctx);
  }

  drawBackground(ctx) {
    ctx.save();
    ctx.fillStyle = '#151824';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = COLORS.arena;
    ctx.fillRect(this.arena.left, this.arena.top, this.arena.width, this.arena.height);
    ctx.lineWidth = 4;
    ctx.strokeStyle = COLORS.arenaLine;
    ctx.strokeRect(this.arena.left, this.arena.top, this.arena.width, this.arena.height);
    ctx.restore();
  }

  drawSidebar(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    ctx.fillRect(18, 88, 210, 560);
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.strokeRect(18, 88, 210, 560);
    drawLeftText(ctx, 'HP / Teams', 34, 104, COLORS.white, 'bold 16px Arial');
    let y = 132;
    for (const ball of this.balls) {
      const color = ball.teamColor(this);
      ctx.fillStyle = color;
      ctx.fillRect(34, y + 4, 10, 10);
      const hpText = `${ball.label} ${ball.role.zh}: ${Math.max(0, Math.round(ball.hp))}`;
      drawLeftText(ctx, hpText, 52, y, ball.hp > 0 ? COLORS.white : '#777', '12px Arial');
      y += 20;
    }
    ctx.restore();
  }

  emitStatus() {
    this.callbacks.onStatus?.({
      winnerText: this.winnerText,
      timeText: `${this.matchTime.toFixed(1)}s`,
      running: this.running,
      paused: this.paused
    });
  }
}
