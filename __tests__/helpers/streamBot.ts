import type { ArcadeCar, CarInput } from '@/lib/game/ArcadeCar';
import { CAR_TUNING } from '@/lib/game/ArcadeCar';
import type { Road } from '@/lib/game/Road';
import type { Obstacle } from '@/lib/game/endless/ObstacleField';
import { OBSTACLE_SPECS } from '@/lib/game/endless/ObstacleField';
import { ENDLESS_TUNING } from '@/lib/game/endless/tuning';

/** Corner speed limit at `s` for a car doing `v`, using the rival's grip and braking budget. */
export function cornerLimitAt(road: Road, s: number, v: number): number {
  const T = ENDLESS_TUNING;
  const scan = (v * v) / (2 * T.rivalBrake) + 20;
  let limit = Infinity;
  for (let d = 0; d <= scan; d += 4) {
    const k = Math.abs(road.sampleAt(s + d).curvature);
    if (k < 1e-4) continue;
    const vc = Math.sqrt(T.rivalLatAccel / k);
    const allowed = Math.sqrt(vc * vc + 2 * T.rivalBrake * Math.max(0, d - 2));
    if (allowed < limit) limit = allowed;
  }
  return limit;
}

/** Lateral of the widest clear lane through the next row of solid obstacles, or null if the road is clear. */
export function clearLane(car: ArcadeCar, road: Road, obstacles: Obstacle[], lookahead = 70): number | null {
  const ahead = obstacles.filter((o) => o.alive && OBSTACLE_SPECS[o.kind].solid && o.s > car.splineS - 4 && o.s < car.splineS + lookahead);
  if (!ahead.length) return null;
  const first = Math.min(...ahead.map((o) => o.s));
  const row = ahead.filter((o) => o.s < first + 8);
  const hw = road.sampleAt(first).width / 2 - 1.6;
  const spans = row.map((o) => ({ lo: o.lateral - o.radius - 2.2, hi: o.lateral + o.radius + 2.2 })).sort((a, b) => a.lo - b.lo);
  let cursor = -hw;
  let best: { lo: number; hi: number } | null = null;
  const consider = (lo: number, hi: number) => {
    if (hi - lo <= 0) return;
    if (!best || hi - lo > best.hi - best.lo + 0.5 || (Math.abs(hi - lo - (best.hi - best.lo)) <= 0.5 && Math.abs((lo + hi) / 2 - car.lateral) < Math.abs((best.lo + best.hi) / 2 - car.lateral))) best = { lo, hi };
  };
  for (const sp of spans) { consider(cursor, Math.min(sp.lo, hw)); cursor = Math.max(cursor, sp.hi); }
  consider(cursor, hw);
  if (!best) return 0;
  const b: { lo: number; hi: number } = best;
  return Math.max(b.lo, Math.min(b.hi, car.lateral));
}

/**
 * A minimal centreline follower for tests: pursuit steering toward a look-ahead
 * point at `lateral`, throttle planned from the curvature ahead.
 */
export function driveAlong(car: ArcadeCar, road: Road, opts: { lateral?: number; speedScale?: number; avoid?: Obstacle[] } = {}): CarInput {
  const v = Math.max(0, car.forwardSpeed);
  const lookahead = 7 + v * 0.5;
  const ahead = road.sampleAt(car.splineS + lookahead);
  const lane = opts.avoid ? clearLane(car, road, opts.avoid) : null;
  const lat = lane ?? opts.lateral ?? 0;
  const tx = ahead.x + ahead.nx * lat, tz = ahead.z + ahead.nz * lat;
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  const dx = tx - car.x, dz = tz - car.z;
  const dl = Math.hypot(dx, dz) || 1;
  const leftX = fz, leftZ = -fx;
  const angle = Math.atan2((dx * leftX + dz * leftZ) / dl, (dx * fx + dz * fz) / dl);
  let steer = -angle * 1.6 - car.lateralSpeed * 0.03;
  steer = Math.max(-1, Math.min(1, steer));

  const aLat = 10;
  const brake = 24;
  const scan = (v * v) / (2 * brake) + 30;
  let target = CAR_TUNING.maxSpeed * (opts.speedScale ?? 1);
  for (let d = 0; d <= scan; d += 4) {
    const k = Math.abs(road.sampleAt(car.splineS + d).curvature);
    const vCorner = k > 1e-4 ? Math.sqrt(aLat / k) : Infinity;
    const allowed = Math.sqrt(vCorner * vCorner + 2 * brake * Math.max(0, d - 2));
    if (allowed < target) target = allowed;
  }
  let throttle = 1;
  let brakeNow = false;
  if (v > target + 2.5) { throttle = 0; brakeNow = true; }
  else if (v > target + 0.5) throttle = 0;
  else if (v > target - 2) throttle = 0.45;
  return { throttle, steer, brake: brakeNow, handbrake: false };
}
