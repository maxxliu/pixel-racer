import * as THREE from 'three';
import type { ArcadeCar } from './ArcadeCar';
import { interpolatePose } from './CarMesh';
import { CAR_TUNING } from './ArcadeCar';
import type { CameraMode } from '@/lib/settings';

const MODES: CameraMode[] = ['chase', 'far', 'hood'];

export class CameraRig {
  public mode: CameraMode = 'chase';
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private fov = 66;
  private shake = 0;
  private rumble = 0;
  private roll = 0;
  private introT = 0;
  private initialised = false;
  private readonly tmpF = new THREE.Vector3();
  private readonly tmpR = new THREE.Vector3();
  private readonly tmpT = new THREE.Vector3();
  private readonly tmpL = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(private readonly camera: THREE.PerspectiveCamera, mode: CameraMode = 'chase') {
    this.mode = mode;
  }

  public cycle(): CameraMode {
    this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    return this.mode;
  }

  public addShake(amount: number): void {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  public setRumble(amount: number): void {
    this.rumble = amount;
  }

  public snapTo(car: ArcadeCar): void {
    this.initialised = false;
    this.introT = 0;
    this.update(car, 1, 0.016, false);
  }

  /**
   * @param countdown while true the camera does a slow sweep-in that settles into the chase view.
   */
  public update(car: ArcadeCar, alpha: number, dt: number, countdown: boolean): void {
    const pose = interpolatePose(car, alpha);
    const f = this.tmpF.set(Math.sin(pose.heading), 0, Math.cos(pose.heading));
    const r = this.tmpR.set(-f.z, 0, f.x);
    const speed = Math.max(0, car.forwardSpeed);
    const speedN = Math.min(1, speed / CAR_TUNING.maxSpeed);
    const boosting = car.boostTime > 0;

    let dist: number, height: number, targetFov: number, lookAhead: number;
    switch (this.mode) {
      case 'far':
        dist = 13 + speedN * 3; height = 5.6 + speedN * 0.8; targetFov = 60 + speedN * 8; lookAhead = 0.3; break;
      case 'hood':
        dist = -1.2; height = 1.05; targetFov = 74 + speedN * 14; lookAhead = 0.5; break;
      default:
        dist = 8.4 + speedN * 3.2; height = 3.2 + speedN * 1.1; targetFov = 62 + speedN * 15; lookAhead = 0.32;
    }
    if (boosting) targetFov += 8;

    // Intro sweep during the countdown: orbit from the side to behind.
    let sideAngle = 0;
    if (countdown) {
      this.introT = Math.min(1, this.introT + dt / 3.2);
      const e = 1 - Math.pow(1 - this.introT, 3);
      sideAngle = (1 - e) * 1.25;
      dist += (1 - e) * 3;
      height += (1 - e) * 1.2;
    } else {
      this.introT = 1;
    }

    const cosA = Math.cos(sideAngle), sinA = Math.sin(sideAngle);
    const back = this.tmpT.copy(f).multiplyScalar(-cosA).addScaledVector(r, sinA);
    const target = this.tmpL.set(pose.x, 0, pose.z).addScaledVector(back, dist);
    target.y = height;

    // look-at: ahead along velocity + steer bias
    const vx = car.vx, vz = car.vz;
    const lookX = pose.x + (this.mode === 'hood' ? f.x * 12 : vx * lookAhead + f.x * 2.5) + r.x * car.steer * (0.8 + speedN * 1.6);
    const lookZ = pose.z + (this.mode === 'hood' ? f.z * 12 : vz * lookAhead + f.z * 2.5) + r.z * car.steer * (0.8 + speedN * 1.6);
    const lookY = this.mode === 'hood' ? 1.0 : 1.1;

    if (!this.initialised) {
      this.pos.copy(target);
      this.look.set(lookX, lookY, lookZ);
      this.initialised = true;
    }
    const kPos = 1 - Math.exp(-dt * (this.mode === 'hood' ? 40 : countdown ? 3.5 : 7.5));
    const kLook = 1 - Math.exp(-dt * (this.mode === 'hood' ? 40 : 11));
    this.pos.lerp(target, kPos);
    this.look.x += (lookX - this.look.x) * kLook;
    this.look.y += (lookY - this.look.y) * kLook;
    this.look.z += (lookZ - this.look.z) * kLook;

    // shake: decaying impact + surface rumble
    this.shake = Math.max(0, this.shake - dt * 3.2);
    const sh = this.shake * 0.35 + this.rumble * 0.06 * speedN;
    const t = performance.now() * 0.001;
    const ox = (Math.sin(t * 61.3) + Math.sin(t * 37.7)) * sh;
    const oy = (Math.sin(t * 53.1) + Math.sin(t * 29.3)) * sh;

    this.camera.position.set(this.pos.x + ox, this.pos.y + oy, this.pos.z + ox * 0.5);
    this.camera.lookAt(this.look);
    // roll while drifting
    const targetRoll = car.isDrifting ? -car.lateralSpeed * 0.006 : 0;
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 6);
    this.camera.rotateZ(this.roll);

    this.fov += (targetFov - this.fov) * Math.min(1, dt * 5);
    if (Math.abs(this.camera.fov - this.fov) > 0.05) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
    void this.up;
  }
}
