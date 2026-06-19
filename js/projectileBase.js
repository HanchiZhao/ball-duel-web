export class Projectile {
  constructor(owner) {
    this.owner = owner;
    this.alive = true;
  }
  update(game, dt, matchTime) {}
  draw(ctx) {}
}
