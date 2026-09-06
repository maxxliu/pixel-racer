/**
 * The rival: a kinematic car on the stream track driven by an explicit gap model.
 * Not a physics AI on purpose. The gap is the whole game, so it has to be readable
 * and tunable: mistakes close it decisively, clean driving lets it recede slowly,
 * and a pressure ramp shrinks the comfort gap until one slip is fatal.
 */
import type { CarVisualState } from '../CarMesh';
import type { CarFxState } from '../Effects';
import type { ImpactEvent } from '../ArcadeCar';
import type { Surface } from '../Road';
import type { StreamTrack } from './StreamTrack';
import { ENDLESS_TUNING, lerp, type EndlessTuning } from './tuning';

export interface PursuerTarget {
  splineS: number;
  splineIndex: number;
  forwardSpeed: number;
  lateral: number;
}

export type PursuerEvent =
  | { type: 'closing'; gap: number }
  | { type: 'surge'; heavy: boolean }
  | { type: 'caught'; gap: number };

export class Pursuer implements CarVisualState, CarFxState {
  // --- pose / visual state (read by the renderer) ---
  public x = 0;
  public z = 0;
  public heading = 0;
  public prevX = 0;
  public prevZ = 0;
  public prevHeading = 0;
  public vx = 0;
  public vz = 0;
  public accelF = 0;
  public accelL = 0;
  public lateralSpeed = 0;
  public wheelSpin = 0;
  public steer = 0;
  public braking = false;
  public throttle = 1;
  public handbrake = false;
  public isDrifting = false;
  public driftCharge = 0;
  public surface: Surface = 'asphalt';
  public boostTime = 0;
  public boostTier = 2;
  public impacts: ImpactEvent[] = [];

  // --- chase state ---
  public s: number;
  public lateral = 0;
  /** Speed along the road. */
  public v = 0;
  public vRef = 0;
  public gap: number;
  public desiredGap: number;
  public pressure = 0;
  public caught = false;
  private surgeSpeed = 0;
  private surgeTime = 0;
  private warned = false;
  /** Which side it pulls alongside on (+1 right, -1 left), 0 while it is still behind. */
  public overtakeSide: 0 | 1 | -1 = 0;
  private commitLeft = 0;
  private readonly line = new Map<number, number>();
  private listeners: ((e: PursuerEvent) => void)[] = [];

  constructor(private readonly track: StreamTrack, startS: number, private readonly t: EndlessTuning = ENDLESS_TUNING) {
    this.s = startS;
    this.gap = t.rivalStartGap;
    this.desiredGap = t.desiredGapStart;
    this.placeOnRoad();
    this.prevX = this.x; this.prevZ = this.z; this.prevHeading = this.heading;
  }

  public get speed(): number { return Math.hypot(this.vx, this.vz); }
  public get forwardSpeed(): number { return this.v; }
  public get slip(): number { return Math.abs(this.lateralSpeed); }

  /** 0 = at or beyond the comfort gap, 1 = alongside. */
  public get danger(): number {
    return Math.min(1, Math.max(0, 1 - this.gap / 18));
  }

  public on(listener: (e: PursuerEvent) => void): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter((l) => l !== listener); };
  }

  private emit(e: PursuerEvent): void {
    for (const l of this.listeners) l(e);
  }

  /** Highest speed the road ahead of `s` allows at speed `v`, planned like the race AI does. */
  public speedLimitAt(s: number, v: number, grip = 1): number {
    const T = this.t;
    const scan = (v * v) / (2 * T.rivalBrake) + 20;
    let limit = Infinity;
    for (let d = 0; d <= scan; d += 4) {
      const k = Math.abs(this.track.sampleAt(s + d).curvature);
      if (k < 1e-4) continue;
      const vc = Math.sqrt((T.rivalLatAccel * grip) / k);
      const allowed = Math.sqrt(vc * vc + 2 * T.rivalBrake * Math.max(0, d - 2));
      if (allowed < limit) limit = allowed;
    }
    return limit;
  }

  private cornerLimit(): number {
    const angry = this.surgeTime > 0 || this.commitLeft > 0;
    return this.speedLimitAt(this.s, this.v, angry ? this.t.surgeGrip : 1);
  }

  /** The player touched something: the rival smells blood. */
  public surge(heavy: boolean): void {
    const T = this.t;
    const s = heavy ? T.surgeHeavy : T.surgeLight;
    this.surgeSpeed = Math.max(this.surgeSpeed, s.speed);
    this.surgeTime = Math.max(this.surgeTime, s.time);
    this.emit({ type: 'surge', heavy });
  }

  /** Remember where the player drove so the rival follows the same line. */
  private recordLine(target: PursuerTarget): void {
    this.line.set(target.splineIndex, target.lateral);
    const oldest = Math.round(this.s / this.track.spacing) - 40;
    if (this.line.size > 600) for (const k of this.line.keys()) if (k < oldest) this.line.delete(k);
  }

  private placeOnRoad(): void {
    const p = this.track.sampleAt(this.s);
    const hw = p.width / 2;
    this.lateral = Math.max(-hw + 1.2, Math.min(hw - 1.2, this.lateral));
    this.x = p.x + p.nx * this.lateral;
    this.z = p.z + p.nz * this.lateral;
    this.heading = Math.atan2(p.tx, p.tz);
  }

  /**
   * @param target the player
   * @param distance run distance (drives the pressure ramp)
   * @param runTime seconds since GO (start grace)
   */
  public step(dt: number, target: PursuerTarget, distance: number, runTime: number): void {
    const T = this.t;
    if (this.caught || dt <= 0) return;
    this.prevX = this.x; this.prevZ = this.z; this.prevHeading = this.heading;
    this.recordLine(target);

    // pressure ramp → comfort gap and rates
    const p = Math.min(T.pressureMax, distance / T.pressureDistance);
    this.pressure = p;
    this.desiredGap = p <= 1
      ? lerp(T.desiredGapStart, T.desiredGapEnd, p)
      : lerp(T.desiredGapEnd, T.desiredGapFloor, (p - 1) / Math.max(1e-6, T.pressureMax - 1));
    const p1 = Math.min(1, p);
    const closeRate = lerp(T.closeRateStart, T.closeRateEnd, p1);
    const recedeRate = lerp(T.recedeRateStart, T.recedeRateEnd, p1);
    const paceMax = lerp(T.paceMaxStart, T.paceMaxEnd, p1);

    // the rival paces itself against a lagged copy of the player's speed
    const kRef = 1 - Math.exp(-dt / T.refTau);
    this.vRef += (Math.max(0, target.forwardSpeed) - this.vRef) * kRef;

    // the leash: never further back than maxGap, whatever the player does
    if (target.splineS - this.s > T.maxGap) {
      this.s = target.splineS - T.maxGap;
      this.v = Math.max(this.v, this.vRef);
    }
    this.gap = target.splineS - this.s;
    const err = this.gap - this.desiredGap;
    let rate = err > 0 ? closeRate : recedeRate;
    if (err > T.leashExtra) rate *= err > 50 ? 3 : 2;

    if (this.surgeTime > 0) { this.surgeTime -= dt; if (this.surgeTime <= 0) { this.surgeTime = 0; this.surgeSpeed = 0; } }
    // once alongside it commits: no backing off for a moment, it pushes through
    if (this.gap < T.commitGap) this.commitLeft = T.commitTime;
    else if (this.commitLeft > 0) this.commitLeft -= dt;
    // a surge is never softened by the urge to fall back: a mistake made while it is already
    // close is the one that gets you passed
    const pull = this.surgeTime > 0 ? Math.max(0, rate * err) : rate * err;
    let vTarget = this.vRef + pull + this.surgeSpeed;
    if (this.commitLeft > 0) vTarget = Math.max(vTarget, this.vRef + 2.5);
    vTarget = Math.max(T.recedeFloor * this.vRef, Math.min(paceMax, vTarget));
    // it corners hard, but it does corner: the road ahead caps its speed like it caps yours
    vTarget = Math.min(vTarget, this.cornerLimit());
    vTarget = Math.max(0, vTarget);

    const kV = 1 - Math.exp(-dt / T.rivalTau);
    let dv = (vTarget - this.v) * kV;
    const maxUp = T.rivalAccel * dt, maxDown = T.rivalAccel * 2 * dt;
    if (dv > maxUp) dv = maxUp;
    if (dv < -maxDown) dv = -maxDown;
    const prevV = this.v;
    this.v = Math.max(0, this.v + dv);
    // the corner limit is a hard cap: brake for it like a real car, never drift through it
    const limit = this.cornerLimit();
    if (this.v > limit) this.v = Math.max(limit, this.v - T.rivalBrake * dt);
    this.braking = this.v < prevV - 2.5 * dt;
    this.accelF = (this.v - prevV) / dt;

    // move along the road, following the player's recorded line; close in and it pulls alongside
    this.s += this.v * dt;
    const id = Math.round(this.s / this.track.spacing);
    let want = this.line.get(id) ?? this.line.get(id - 1) ?? this.line.get(id + 1) ?? this.lateral;
    const gapNow = target.splineS - this.s;
    if (gapNow < T.overtakeGap) {
      if (this.overtakeSide === 0) {
        const hw = this.track.sampleAt(target.splineS).width / 2;
        this.overtakeSide = hw - target.lateral >= target.lateral + hw ? 1 : -1;
      }
      const blend = Math.min(1, Math.max(0, (T.overtakeGap - gapNow) / (T.overtakeGap - 2)));
      want = want * (1 - blend) + (target.lateral + this.overtakeSide * 2.8) * blend;
    } else if (gapNow > T.overtakeGap + 2) {
      this.overtakeSide = 0;
    }
    const prevLateral = this.lateral;
    this.lateral += (want - this.lateral) * (1 - Math.exp(-dt * 4));
    this.placeOnRoad();
    this.lateralSpeed = (this.lateral - prevLateral) / dt;

    const sample = this.track.sampleAt(this.s);
    const roadHeading = Math.atan2(sample.tx, sample.tz);
    const dx = this.x - this.prevX, dz = this.z - this.prevZ;
    const moveHeading = Math.hypot(dx, dz) > 0.02 ? Math.atan2(dx, dz) : roadHeading;
    let dh = moveHeading - this.prevHeading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.heading = this.prevHeading + dh * Math.min(1, dt * 12);
    this.vx = dx / dt; this.vz = dz / dt;
    this.accelL = -this.v * this.v * sample.curvature;
    this.steer = Math.max(-1, Math.min(1, -sample.curvature * 30 - this.lateralSpeed * 0.05));
    this.wheelSpin += this.v * dt / 0.36;
    this.isDrifting = Math.abs(sample.curvature) * this.v * this.v > 11;
    this.boostTime = this.surgeTime > 0 ? 1 : 0;

    this.gap = target.splineS - this.s;
    if (!this.warned && this.gap < T.closingWarnGap && runTime > T.startGrace) { this.warned = true; this.emit({ type: 'closing', gap: this.gap }); }
    if (this.gap > T.closingWarnGap + 10) this.warned = false;
    if (this.gap < T.overtakeDistance && runTime > T.startGrace) {
      this.caught = true;
      this.emit({ type: 'caught', gap: this.gap });
    }
  }
}
