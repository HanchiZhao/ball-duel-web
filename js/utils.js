import { Vec2, randomUnitVector, safeNormalize } from './vector.js';

export function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

export function randRange(a, b) {
  return a + Math.random() * (b - a);
}

export function circleHit(pos1, r1, pos2, r2) {
  return pos1.distanceTo(pos2) <= r1 + r2;
}

export function distancePointToSegment(point, a, b) {
  const ab = Vec2.sub(b, a);
  const lenSq = ab.lengthSq();
  if (lenSq <= 1e-9) return point.distanceTo(a);
  const t = clamp(Vec2.sub(point, a).dot(ab) / lenSq, 0, 1);
  const closest = new Vec2(a.x + ab.x * t, a.y + ab.y * t);
  return point.distanceTo(closest);
}

export function randomPointInRect(rect, margin = 0) {
  return new Vec2(
    randRange(rect.left + margin, rect.right - margin),
    randRange(rect.top + margin, rect.bottom - margin)
  );
}

export function avoidAxisAligned(vec, minComponent = 0.18) {
  const dir = safeNormalize(vec);
  if (Math.abs(dir.x) < minComponent) dir.x = (Math.random() < 0.5 ? -1 : 1) * minComponent;
  if (Math.abs(dir.y) < minComponent) dir.y = (Math.random() < 0.5 ? -1 : 1) * minComponent;
  return dir.normalize();
}

export function jitterWallBounceVelocity(vel, wall) {
  const speed = vel.length();
  if (speed <= 0) return randomUnitVector().scale(1);
  const angle = randRange(1, 5) * (Math.random() < 0.5 ? -1 : 1) * Math.PI / 180;
  const newVel = vel.rotated(angle);
  if (wall === 'left') newVel.x = Math.abs(newVel.x);
  if (wall === 'right') newVel.x = -Math.abs(newVel.x);
  if (wall === 'top') newVel.y = Math.abs(newVel.y);
  if (wall === 'bottom') newVel.y = -Math.abs(newVel.y);
  return newVel.normalize().scale(speed);
}

export function drawCenteredText(ctx, text, x, y, color = '#fff', font = '16px sans-serif') {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function drawLeftText(ctx, text, x, y, color = '#fff', font = '14px sans-serif') {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(text, x, y);
  ctx.restore();
}
