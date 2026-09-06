import type { ArcadeCar, CarInput } from '../ArcadeCar';
import { CAR_TUNING } from '../ArcadeCar';
import type { TrackSpline } from '../TrackSpline';

export type AIPersonality = 'aggressive' | 'balanced' | 'defensive' | 'rookie';

export interface AIProfile {
  /** Lateral acceleration budget for cornering, m/s². */
  aLat: number;
  brakeDecel: number;
  maxSpeedFactor: number;
  /** Seconds of first-order input lag. */
  reaction: number;
  /** Preferred lateral offset (fraction of half width, -1 left .. 1 right). */
  lineBias: number;
  drifter: boolean;
  name: string;
}

export const AI_PROFILES: Record<AIPersonality, AIProfile> = {
  aggressive: { aLat: 11.5, brakeDecel: 26, maxSpeedFactor: 1.0, reaction: 0.06, lineBias: 0.25, drifter: true, name: 'Vega' },
  balanced:   { aLat: 10.0, brakeDecel: 24, maxSpeedFactor: 0.97, reaction: 0.09, lineBias: -0.2, drifter: false, name: 'Kato' },
  defensive:  { aLat: 8.8,  brakeDecel: 22, maxSpeedFactor: 0.93, reaction: 0.12, lineBias: 0.45, drifter: false, name: 'Rosa' },
  rookie:     { aLat: 7.5,  brakeDecel: 20, maxSpeedFactor: 0.88, reaction: 0.18, lineBias: -0.5, drifter: false, name: 'Bo' },
};

export const DIFFICULTY_SCALE: Record<'easy' | 'normal' | 'hard', number> = { easy: 0.9, normal: 1, hard: 1.06 };

export interface AIContext {
  others: ArcadeCar[];
  /** Player progress minus this car's progress, metres (positive = player ahead). */
  gapToPlayer: number;
}

export class AIDriver {
  public readonly profile: AIProfile;
  private steerLag = 0;
  private throttleLag = 0;
  private reverseTimer = 0;
  private reverseSteer = 0;
  private driftTimer = 0;
  private lineOffset: number;
  private wander = 0;
  private wanderTimer = 0;

  constructor(
    public readonly car: ArcadeCar,
    private readonly spline: TrackSpline,
    public readonly personality: AIPersonality,
    private readonly difficulty: number,
  ) {
    this.profile = AI_PROFILES[personality];
    this.lineOffset = this.profile.lineBias;
  }

  public reset(): void {
    this.steerLag = 0;
    this.throttleLag = 0;
    this.reverseTimer = 0;
    this.driftTimer = 0;
  }

  public think(dt: number, ctx: AIContext): CarInput {
    const car = this.car;
    const P = this.profile;
    const L = this.spline.length;

    // --- rubber band: behind the player → faster, ahead → a touch slower ---
    const band = Math.max(0.9, Math.min(1.1, 1 + ctx.gapToPlayer / 500));
    car.maxSpeedScale = P.maxSpeedFactor * this.difficulty * band;

    // --- stuck recovery ---
    if (car.stuck && this.reverseTimer <= 0) {
      this.reverseTimer = 1.1;
      this.reverseSteer = -Math.sign(this.steerLag || 1);
    }
    if (this.reverseTimer > 0) {
      this.reverseTimer -= dt;
      return { throttle: -1, steer: this.reverseSteer, brake: false, handbrake: false };
    }

    // --- slowly varying line wander so cars don't drive identical lines ---
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      this.wanderTimer = 2 + Math.random() * 3;
      this.wander = (Math.random() - 0.5) * 0.5;
    }

    // --- pursuit target on the spline ---
    const v = Math.max(0, car.forwardSpeed);
    const lookahead = 7 + v * 0.5;
    const ahead = this.spline.sampleAt(car.splineS + lookahead);
    const hw = ahead.width / 2;
    // hug the inside of upcoming corners (curvature > 0 = left turn = inside is left = negative lateral)
    const upcoming = this.spline.sampleAt(car.splineS + lookahead * 1.6).curvature;
    const cornerPull = -Math.sign(upcoming) * Math.min(1, Math.abs(upcoming) / 0.02) * 0.5;
    let targetLateral = (this.lineOffset * 0.35 + this.wander + cornerPull) * hw * 0.8;

    // --- avoidance: nudge away from cars just ahead ---
    let throttleCap = 1;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    for (const o of ctx.others) {
      const dx = o.x - car.x, dz = o.z - car.z;
      const along = dx * fx + dz * fz;
      if (along < 0 || along > 16) continue;
      const side = dx * -fz + dz * fx; // right-positive
      if (Math.abs(side) > 3.2) continue;
      const closeness = 1 - along / 16;
      targetLateral += (side >= 0 ? -1 : 1) * closeness * hw * 0.7;
      const closing = car.forwardSpeed - o.forwardSpeed;
      if (along < 7 && closing > 1) throttleCap = Math.min(throttleCap, 0.2);
    }
    targetLateral = Math.max(-hw * 0.85, Math.min(hw * 0.85, targetLateral));

    const tx = ahead.x + ahead.nx * targetLateral;
    const tz = ahead.z + ahead.nz * targetLateral;
    const dx = tx - car.x, dz = tz - car.z;
    const dl = Math.hypot(dx, dz) || 1;
    // signed angle: positive when target is to the left (heading increases to the left)
    const leftX = fz, leftZ = -fx;
    const angle = Math.atan2((dx * leftX + dz * leftZ) / dl, (dx * fx + dz * fz) / dl);
    let steer = -angle * 1.6; // steer positive = right
    // counter lateral slide a little so drifting AI don't spin
    steer -= car.lateralSpeed * 0.03;
    steer = Math.max(-1, Math.min(1, steer));
    if (Number.isNaN(steer)) steer = 0;

    // --- speed planning: scan ahead within braking distance ---
    const aLat = P.aLat * this.difficulty;
    const brake = P.brakeDecel;
    const scan = Math.min(L * 0.5, (v * v) / (2 * brake) + 30);
    let target = CAR_TUNING.maxSpeed * car.maxSpeedScale;
    const stepLen = 4;
    for (let d = 0; d <= scan; d += stepLen) {
      const s = this.spline.sampleAt(car.splineS + d);
      const k = Math.abs(s.curvature);
      const vCorner = k > 1e-4 ? Math.sqrt(aLat / k) : Infinity;
      const allowed = Math.sqrt(vCorner * vCorner + 2 * brake * Math.max(0, d - 2));
      if (allowed < target) target = allowed;
    }
    if (car.surface === 'grass') target = Math.min(target, 22);

    let throttle: number;
    let brakeNow = false;
    if (v > target + 2.5) { throttle = 0; brakeNow = true; }
    else if (v > target + 0.5) { throttle = 0; }
    else if (v > target - 2) { throttle = 0.45; }
    else { throttle = 1; }
    throttle = Math.min(throttle, throttleCap);

    // --- occasional show-off drift on tight corners ---
    let handbrake = false;
    if (P.drifter) {
      const k = Math.abs(this.spline.sampleAt(car.splineS + 8).curvature);
      if (this.driftTimer <= 0 && k > 0.045 && v > 16 && Math.random() < dt * 1.5) this.driftTimer = 0.55;
      if (this.driftTimer > 0) { this.driftTimer -= dt; handbrake = true; }
    }

    // --- reaction lag (first-order) ---
    const a = 1 - Math.exp(-dt / Math.max(0.01, P.reaction));
    this.steerLag += (steer - this.steerLag) * a;
    this.throttleLag += (throttle - this.throttleLag) * a;

    return { throttle: this.throttleLag, steer: this.steerLag, brake: brakeNow, handbrake };
  }
}
