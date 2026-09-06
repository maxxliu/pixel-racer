import type { Road, Surface } from './Road';
import { circleVsSegment, sweptCircleVsSegment, circleVsCircle, type Segment } from './Collision';

export interface CarInput {
  throttle: number; // -1..1
  steer: number;    // -1..1, positive = right
  brake: boolean;
  handbrake: boolean;
}

export interface ImpactEvent {
  magnitude: number; // normal speed at impact, m/s
  x: number;
  z: number;
  other: 'wall' | 'car' | 'obstacle';
  /** Obstacle kind when `other` is 'obstacle'. */
  kind?: string;
}

export const CAR_TUNING = {
  maxSpeed: 58,          // m/s (~209 km/h)
  reverseSpeed: 12,
  maxAccel: 26,          // m/s² at standstill
  brakeDecel: 30,
  coastDecel: 2.5,
  dragCoef: 0.0032,      // v² drag
  gripAsphalt: 9,
  gripKerb: 7,
  gripGrass: 4.5,
  gripDrift: 3.2,
  grassSpeedFactor: 0.55,
  grassDrag: 4.5,
  maxYawRate: 2.1,       // rad/s
  driftYawGain: 1.35,
  steerRise: 7,          // input smoothing per second
  steerFall: 12,
  driftEnterSpeed: 9,
  handbrakeDecel: 5,
  boostSpeedFactor: 1.22,
  boostAccelFactor: 1.7,
  driftTiers: [0.9, 1.8, 2.9],   // seconds of charge
  boostDurations: [0.7, 1.15, 1.7],
  bodyRadius: 1.05,
  axleOffset: 1.15,
  restitution: 0.22,
  impactLoss: 0.35,
  carRadius: 1.35,
  slickGrip: 0.35,      // grip multiplier on an oil slick
  slickTraction: 0.5,   // throttle multiplier on an oil slick
};

let nextId = 1;

export class ArcadeCar {
  public readonly id = nextId++;
  public x = 0;
  public z = 0;
  public heading = 0;
  public vx = 0;
  public vz = 0;
  public prevX = 0;
  public prevZ = 0;
  public prevHeading = 0;
  public steer = 0;
  public throttle = 0;
  public braking = false;
  public handbrake = false;
  public surface: Surface = 'asphalt';
  public isDrifting = false;
  public driftCharge = 0;
  public driftDir = 0;
  public boostTime = 0;
  public boostTier = 0;
  public stuck = false;
  public ghostTime = 0;
  /** Seconds of reduced grip left (oil slick). */
  public slickTime = 0;
  /** Nearest spline sample index (hint for the next query). */
  public splineIndex = 0;
  public splineS = 0;
  public lateral = 0;
  public gear = 1;
  public rpm = 0.2;
  /** Longitudinal / lateral acceleration (car frame) for visual body tilt. */
  public accelF = 0;
  public accelL = 0;
  public wheelSpin = 0;
  public impacts: ImpactEvent[] = [];
  public lastImpactTime = -10;
  public onBoost: ((tier: number) => void) | null = null;
  public maxSpeedScale = 1;
  public isPlayer = false;
  private stuckTimer = 0;
  private time = 0;
  private lastVF = 0;
  private lastVL = 0;
  private readonly wallScratch: Segment[] = [];

  constructor(private readonly spline: Road) {}

  public get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }

  public get forwardSpeed(): number {
    return this.vx * Math.sin(this.heading) + this.vz * Math.cos(this.heading);
  }

  public get lateralSpeed(): number {
    // right = (-cos h, sin h)
    return this.vx * -Math.cos(this.heading) + this.vz * Math.sin(this.heading);
  }

  public get speedKmh(): number {
    return Math.abs(this.forwardSpeed) * 3.6;
  }

  public get slip(): number {
    return Math.abs(this.lateralSpeed);
  }

  public place(x: number, z: number, heading: number): void {
    this.x = this.prevX = x;
    this.z = this.prevZ = z;
    this.heading = this.prevHeading = heading;
    this.vx = this.vz = 0;
    this.steer = 0;
    this.isDrifting = false;
    this.driftCharge = 0;
    this.boostTime = 0;
    this.boostTier = 0;
    this.stuck = false;
    this.stuckTimer = 0;
    this.slickTime = 0;
    this.impacts.length = 0;
    const n = this.spline.nearest(x, z);
    this.splineIndex = n.index;
    this.splineS = n.s;
    this.lateral = n.lateral;
    this.surface = this.spline.surfaceAt(n.index, n.lateral);
    this.lastVF = this.lastVL = 0;
    this.gear = 1;
    this.rpm = 0.2;
  }

  public step(dt: number, input: CarInput, frozen = false): void {
    const T = CAR_TUNING;
    this.time += dt;
    this.prevX = this.x;
    this.prevZ = this.z;
    this.prevHeading = this.heading;
    this.impacts.length = 0;
    if (this.ghostTime > 0) this.ghostTime -= dt;
    if (this.slickTime > 0) this.slickTime = Math.max(0, this.slickTime - dt);
    const slick = this.slickTime > 0;

    if (frozen) {
      input = { throttle: 0, steer: 0, brake: true, handbrake: false };
    }

    // --- input smoothing (keyboard feels analogue) ---
    const targetSteer = Math.max(-1, Math.min(1, input.steer));
    const rate = Math.abs(targetSteer) > Math.abs(this.steer) ? T.steerRise : T.steerFall;
    const dS = targetSteer - this.steer;
    const maxD = rate * dt;
    this.steer += Math.abs(dS) > maxD ? Math.sign(dS) * maxD : dS;
    this.throttle = Math.max(-1, Math.min(1, input.throttle));
    this.braking = input.brake;
    this.handbrake = input.handbrake;

    // --- car frame ---
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx;
    let vf = this.vx * fx + this.vz * fz;
    let vl = this.vx * rx + this.vz * rz;
    const speed = Math.hypot(vf, vl);

    // --- boost ---
    if (this.boostTime > 0) {
      this.boostTime -= dt;
      if (this.boostTime <= 0) { this.boostTime = 0; this.boostTier = 0; }
    }
    const boosting = this.boostTime > 0;
    const maxSpeed = T.maxSpeed * this.maxSpeedScale * (boosting ? T.boostSpeedFactor : 1)
      * (this.surface === 'grass' ? T.grassSpeedFactor : 1);

    // --- longitudinal ---
    let accel = 0;
    if (this.throttle > 0) {
      const ratio = Math.max(0, vf) / maxSpeed;
      const curve = Math.max(0, 1 - Math.pow(Math.min(1, ratio), 2.2));
      accel += T.maxAccel * this.throttle * curve * (boosting ? T.boostAccelFactor : 1) * (slick ? T.slickTraction : 1);
      if (vf < 0) accel += T.brakeDecel; // braking out of reverse
    } else if (this.throttle < 0) {
      if (vf > 1) accel -= T.brakeDecel * -this.throttle;
      else {
        const ratio = Math.max(0, -vf) / T.reverseSpeed;
        accel -= T.maxAccel * 0.6 * -this.throttle * Math.max(0, 1 - ratio);
      }
    } else {
      accel -= Math.sign(vf) * Math.min(Math.abs(vf) / dt, T.coastDecel);
    }
    if (this.braking && Math.abs(vf) > 0.05) accel -= Math.sign(vf) * T.brakeDecel;
    // drag & surface
    accel -= Math.sign(vf) * T.dragCoef * vf * vf;
    if (this.surface === 'grass') accel -= Math.sign(vf) * T.grassDrag;
    if (this.surface === 'kerb') accel -= Math.sign(vf) * 0.8;
    // soft cap at max speed (boost can push slightly over then bleed off)
    if (vf > maxSpeed) accel -= (vf - maxSpeed) * 2.5;

    const prevVf = vf;
    vf += accel * dt;
    if (prevVf > 0 && vf < 0 && this.throttle >= 0 && !this.braking) vf = 0;
    if (this.throttle < 0 && vf < -T.reverseSpeed) vf = -T.reverseSpeed;

    // --- drift state ---
    const canDrift = Math.abs(vf) > T.driftEnterSpeed;
    if (this.handbrake && canDrift) {
      if (!this.isDrifting) {
        this.isDrifting = true;
        this.driftCharge = 0;
        this.driftDir = Math.sign(this.steer) || 0;
      }
    } else if (this.isDrifting) {
      // keep sliding while lateral speed is high; end when it settles or handbrake released
      if (!this.handbrake && (Math.abs(vl) < 2.5 || !canDrift)) {
        this.endDrift();
      } else if (!this.handbrake) {
        // handbrake released: let it settle out quickly
        this.endDrift();
      }
    }
    if (this.isDrifting) {
      if (this.handbrake) vf -= Math.sign(vf) * T.handbrakeDecel * dt;
      if (Math.abs(vl) > 1.5 || Math.abs(this.steer) > 0.3) {
        this.driftCharge += dt * (0.6 + Math.min(1, Math.abs(vl) / 8) * 0.8 + Math.abs(this.steer) * 0.4);
      }
    }

    // --- steering / yaw ---
    const absV = Math.abs(vf);
    const speedCurve = absV < 8 ? absV / 8 : 1 - 0.55 * Math.min(1, (absV - 8) / (T.maxSpeed - 8));
    let yawRate = this.steer * T.maxYawRate * speedCurve;
    if (this.isDrifting) yawRate *= T.driftYawGain;
    if (vf < -0.5) yawRate = -yawRate; // reversing flips steering geometry
    this.heading -= yawRate * dt;
    while (this.heading > Math.PI) this.heading -= Math.PI * 2;
    while (this.heading < -Math.PI) this.heading += Math.PI * 2;

    // --- lateral grip ---
    let grip = T.gripAsphalt;
    if (this.surface === 'kerb') grip = T.gripKerb;
    if (this.surface === 'grass') grip = T.gripGrass;
    if (this.isDrifting) grip = Math.min(grip, T.gripDrift);
    if (slick) grip *= T.slickGrip;
    // Yaw induces lateral velocity: the velocity vector stays put while the nose turns.
    const nfx = Math.sin(this.heading), nfz = Math.cos(this.heading);
    const nrx = -nfz, nrz = nfx;
    // rebuild world velocity from the *old* frame then re-decompose in the new frame
    let wx = fx * vf + rx * vl;
    let wz = fz * vf + rz * vl;
    vf = wx * nfx + wz * nfz;
    vl = wx * nrx + wz * nrz;
    vl *= Math.exp(-grip * dt);
    wx = nfx * vf + nrx * vl;
    wz = nfz * vf + nrz * vl;
    this.vx = wx;
    this.vz = wz;

    // --- integrate ---
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // --- track query & surface ---
    const near = this.spline.nearest(this.x, this.z, this.splineIndex);
    this.splineIndex = near.index;
    this.splineS = near.s;
    this.lateral = near.lateral;
    this.surface = this.spline.surfaceAt(near.index, near.lateral);

    // --- walls ---
    this.collideWalls();

    // --- derived ---
    this.accelF = (vf - this.lastVF) / dt;
    this.accelL = (vl - this.lastVL) / dt;
    this.lastVF = vf;
    this.lastVL = vl;
    this.wheelSpin += vf * dt / 0.36;
    this.updateGearbox(vf, dt);

    // --- stuck detection ---
    if (Math.abs(this.throttle) > 0.5 && speed < 0.8 && !frozen) {
      this.stuckTimer += dt;
    } else {
      this.stuckTimer = Math.max(0, this.stuckTimer - dt * 2);
    }
    this.stuck = this.stuckTimer > 1.5;
  }

  private endDrift(): void {
    const T = CAR_TUNING;
    this.isDrifting = false;
    let tier = 0;
    for (let i = 0; i < T.driftTiers.length; i++) if (this.driftCharge >= T.driftTiers[i]) tier = i + 1;
    if (tier > 0) {
      this.boostTier = tier;
      this.boostTime = T.boostDurations[tier - 1];
      this.onBoost?.(tier);
    }
    this.driftCharge = 0;
  }

  /** Grant a boost directly (start boost, pickups). */
  public giveBoost(tier: number, duration: number): void {
    this.boostTier = Math.max(this.boostTier, tier);
    this.boostTime = Math.max(this.boostTime, duration);
    this.onBoost?.(tier);
  }

  private updateGearbox(vf: number, dt: number): void {
    const s = Math.abs(vf) * 3.6;
    const thresholds = [0, 28, 62, 105, 150, 400];
    let g = 1;
    for (let i = 1; i < thresholds.length; i++) if (s >= thresholds[i]) g = i + 1;
    if (g > 5) g = 5;
    const lo = thresholds[g - 1], hi = thresholds[g];
    const ratio = Math.min(1, Math.max(0, (s - lo) / (hi - lo)));
    let target = 0.18 + ratio * 0.78;
    if (this.throttle <= 0) target *= 0.85;
    if (g !== this.gear) {
      this.rpm = Math.max(0.25, this.rpm - 0.3); // shift dip
      this.gear = g;
    }
    this.rpm += (target - this.rpm) * Math.min(1, dt * 9);
    if (vf < -0.5) this.gear = -1;
  }

  private collideWalls(): void {
    const T = CAR_TUNING;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const probes = [
      { x: this.x + fx * T.axleOffset, z: this.z + fz * T.axleOffset, px: this.prevX + fx * T.axleOffset, pz: this.prevZ + fz * T.axleOffset },
      { x: this.x - fx * T.axleOffset, z: this.z - fz * T.axleOffset, px: this.prevX - fx * T.axleOffset, pz: this.prevZ - fz * T.axleOffset },
    ];
    const moved = Math.hypot(this.x - this.prevX, this.z - this.prevZ);
    const segs = this.spline.queryWalls(this.x, this.z, T.bodyRadius + T.axleOffset + 1 + moved, this.wallScratch);
    let maxImpact = 0;
    let ix = 0, iz = 0;
    for (const seg of segs) {
      for (const p of probes) {
        // a fast, steep hit can put the probe behind the wall in one step: sweep the path too
        const hit = circleVsSegment(p.x, p.z, T.bodyRadius, seg) ?? sweptCircleVsSegment(p.px, p.pz, p.x, p.z, T.bodyRadius, seg);
        if (!hit) continue;
        this.x += hit.nx * hit.depth;
        this.z += hit.nz * hit.depth;
        p.x += hit.nx * hit.depth;
        p.z += hit.nz * hit.depth;
        const vn = this.vx * hit.nx + this.vz * hit.nz;
        if (vn < 0) {
          const impact = -vn;
          this.vx -= (1 + T.restitution) * vn * hit.nx;
          this.vz -= (1 + T.restitution) * vn * hit.nz;
          const loss = 1 - T.impactLoss * Math.min(1, impact / 18);
          this.vx *= loss;
          this.vz *= loss;
          if (impact > maxImpact) { maxImpact = impact; ix = hit.px; iz = hit.pz; }
        }
      }
    }
    if (maxImpact > 1.5 && this.time - this.lastImpactTime > 0.25) {
      this.lastImpactTime = this.time;
      this.impacts.push({ magnitude: maxImpact, x: ix, z: iz, other: 'wall' });
    }
  }

  /**
   * Collide the car body against a static circle (an obstacle). Returns the closing
   * speed (0 when not touching). `loss` is the fraction of speed removed on a hit.
   * Soft obstacles (cones) only bleed speed; solid ones (blocks) also deflect the car
   * so it glances off instead of stopping dead.
   */
  public collideCircle(cx: number, cz: number, radius: number, loss: number, kind: string, solid: boolean): number {
    const T = CAR_TUNING;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx;
    let closing = 0;
    let nx = 0, nz = 0;
    let touched = false;
    for (const off of [T.axleOffset, -T.axleOffset]) {
      const px = this.x + fx * off, pz = this.z + fz * off;
      const hit = circleVsCircle(cx, cz, radius, px, pz, T.bodyRadius);
      if (!hit) continue;
      touched = true;
      if (solid) {
        // hit normal points from the obstacle to the probe: keep the car outside it
        this.x += hit.nx * hit.depth;
        this.z += hit.nz * hit.depth;
      }
      const vn = this.vx * hit.nx + this.vz * hit.nz;
      if (-vn > closing) { closing = -vn; nx = hit.nx; nz = hit.nz; }
    }
    if (!touched) return 0;
    const fresh = this.time - this.lastImpactTime > 0.3;
    if (closing > 0.5 && fresh) {
      this.lastImpactTime = this.time;
      const speed = Math.hypot(this.vx, this.vz);
      const kept = speed * (1 - loss);
      if (solid && speed > 0.1) {
        // glance off: steer the velocity away from the obstacle, never straight back into it
        let side = nx * rx + nz * rz;
        if (Math.abs(side) < 0.25) side = side >= 0 ? 1 : -1;
        const dx = nx + rx * Math.sign(side) * 0.8;
        const dz = nz + rz * Math.sign(side) * 0.8;
        const dl = Math.hypot(dx, dz) || 1;
        let ux = this.vx / speed + (dx / dl) * 1.1;
        let uz = this.vz / speed + (dz / dl) * 1.1;
        const ul = Math.hypot(ux, uz) || 1;
        ux /= ul; uz /= ul;
        this.vx = ux * kept;
        this.vz = uz * kept;
      } else {
        this.vx *= 1 - loss;
        this.vz *= 1 - loss;
      }
      this.impacts.push({ magnitude: closing, x: cx, z: cz, other: 'obstacle', kind });
    } else if (solid && closing > 0.5) {
      // still leaning on it after the hit: bleed the component pushing into it
      this.vx += nx * closing;
      this.vz += nz * closing;
    }
    return closing;
  }

  /** Symmetric car-vs-car response. Call once per pair per step. */
  public static collide(a: ArcadeCar, b: ArcadeCar): void {
    if (a.ghostTime > 0 || b.ghostTime > 0) return;
    const T = CAR_TUNING;
    const hit = circleVsCircle(a.x, a.z, T.carRadius, b.x, b.z, T.carRadius);
    if (!hit) return;
    const half = hit.depth / 2;
    a.x -= hit.nx * half; a.z -= hit.nz * half;
    b.x += hit.nx * half; b.z += hit.nz * half;
    const rvx = b.vx - a.vx, rvz = b.vz - a.vz;
    const vn = rvx * hit.nx + rvz * hit.nz;
    if (vn < 0) {
      const j = -(1 + 0.3) * vn / 2;
      a.vx -= j * hit.nx; a.vz -= j * hit.nz;
      b.vx += j * hit.nx; b.vz += j * hit.nz;
      const mag = -vn;
      if (mag > 2) {
        const px = (a.x + b.x) / 2, pz = (a.z + b.z) / 2;
        if (a.time - a.lastImpactTime > 0.25) { a.lastImpactTime = a.time; a.impacts.push({ magnitude: mag, x: px, z: pz, other: 'car' }); }
        if (b.time - b.lastImpactTime > 0.25) { b.lastImpactTime = b.time; b.impacts.push({ magnitude: mag, x: px, z: pz, other: 'car' }); }
      }
    }
  }
}
