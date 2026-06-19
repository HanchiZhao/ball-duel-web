export class Skill {
  update(owner, game, dt, matchTime) {}
  draw(owner, game, ctx) {}
  onBodyCollision(owner, other, game, matchTime) { return false; }
  onWallBounce(owner, wall, game, matchTime) {}
  onDamageTaken(owner, amount, source, game, matchTime) {}
  onDeath(owner, game, matchTime) {}
  modifyIncomingDamage(owner, amount, source, game, matchTime) { return amount; }
  immuneToControl(owner, matchTime) { return false; }
  speedMultiplier(owner, matchTime) { return 1; }
  currentRadius(owner, matchTime, baseRadius) { return baseRadius; }
  isUntargetable(owner, matchTime) { return false; }
  isHidden(owner, matchTime) { return false; }
  ignoresPhysicalCollision(owner, other, matchTime) { return false; }
}
