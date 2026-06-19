export class Hazard {
  constructor(owner) {
    this.owner = owner;
    this.alive = true;
  }
  update(game, dt, matchTime) {}
  draw(ctx) {}
}
