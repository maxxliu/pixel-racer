import type { ArcadeCar, CarInput } from '@/lib/game/ArcadeCar';
import { CAR_TUNING } from '@/lib/game/ArcadeCar';
import type { Road } from '@/lib/game/Road';

/**
 * A minimal centreline follower for tests: pursuit steering toward a look-ahead
 * point at `lateral`, throttle planned from the curvature ahead.
 */
export function driveAlong(car: ArcadeCar, road: Road, opts: { lateral?: number; speedScale?: number } = {}): CarInput {
  const v = Math.max(0, car.forwardSpeed);
  const lookahead = 7 + v * 0.5;
  const ahead = road.sampleAt(car.splineS + lookahead);
  const lat = opts.lateral ?? 0;
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
