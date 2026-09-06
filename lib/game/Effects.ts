import * as THREE from 'three';
import { PALETTE } from './palette';
import type { ArcadeCar } from './ArcadeCar';
import type { CarVisual } from './CarMesh';

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
  size: number; growth: number;
  gravity: number;
  color: THREE.Color;
}

const MAX_PARTICLES = 700;

/** One instanced quad pool for smoke, dust, sparks, boost flames and confetti. */
export class ParticleSystem {
  public readonly mesh: THREE.InstancedMesh;
  private readonly particles: Particle[] = [];
  private readonly pool: Particle[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly geo: THREE.PlaneGeometry;
  private readonly mat: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene) {
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, MAX_PARTICLES);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3);
    scene.add(this.mesh);
  }

  public spawn(opts: {
    x: number; y: number; z: number;
    vx?: number; vy?: number; vz?: number;
    life: number; size: number; growth?: number; gravity?: number;
    color: number; spread?: number;
  }): void {
    if (this.particles.length >= MAX_PARTICLES) return;
    const p = this.pool.pop() ?? { color: new THREE.Color() } as Particle;
    const sp = opts.spread ?? 0;
    p.x = opts.x + (Math.random() - 0.5) * sp;
    p.y = opts.y + (Math.random() - 0.5) * sp * 0.3;
    p.z = opts.z + (Math.random() - 0.5) * sp;
    p.vx = (opts.vx ?? 0) + (Math.random() - 0.5) * sp * 2;
    p.vy = (opts.vy ?? 0) + Math.random() * sp;
    p.vz = (opts.vz ?? 0) + (Math.random() - 0.5) * sp * 2;
    p.life = p.maxLife = opts.life * (0.7 + Math.random() * 0.6);
    p.size = opts.size * (0.7 + Math.random() * 0.6);
    p.growth = opts.growth ?? 0;
    p.gravity = opts.gravity ?? 0;
    p.color.setHex(opts.color);
    this.particles.push(p);
  }

  public update(dt: number, camera: THREE.Camera): void {
    let i = 0;
    for (let k = this.particles.length - 1; k >= 0; k--) {
      const p = this.particles[k];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(k, 1);
        this.pool.push(p);
        continue;
      }
      p.vy -= p.gravity * dt;
      p.vx *= 1 - dt * 1.5; p.vz *= 1 - dt * 1.5;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05) { p.y = 0.05; p.vy = Math.abs(p.vy) * 0.3; }
      const t = p.life / p.maxLife;
      const fade = t < 0.35 ? t / 0.35 : 1;
      const size = (p.size + p.growth * (p.maxLife - p.life)) * fade;
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.quaternion.copy(camera.quaternion);
      this.dummy.scale.setScalar(Math.max(0.001, size));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, p.color);
      i++;
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  public clear(): void {
    this.pool.push(...this.particles);
    this.particles.length = 0;
    this.mesh.count = 0;
  }

  public dispose(): void {
    this.mesh.parent?.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}

const MAX_SKID_QUADS = 2400;
const SKID_Y = 0.048;

/** Ring-buffer ribbon of skid quads; one per wheel pair keeps it simple. */
export class SkidMarks {
  private readonly geo: THREE.BufferGeometry;
  private readonly mesh: THREE.Mesh;
  private readonly positions: Float32Array;
  private readonly alphas: Float32Array;
  private head = 0;
  private filled = 0;
  private last = new Map<string, { lx: number; lz: number; rx: number; rz: number }>();

  constructor(scene: THREE.Scene) {
    this.positions = new Float32Array(MAX_SKID_QUADS * 4 * 3);
    this.alphas = new Float32Array(MAX_SKID_QUADS * 4);
    const indices = new Uint32Array(MAX_SKID_QUADS * 6);
    for (let q = 0; q < MAX_SKID_QUADS; q++) {
      const v = q * 4, i = q * 6;
      indices[i] = v; indices[i + 1] = v + 1; indices[i + 2] = v + 2;
      indices[i + 3] = v + 1; indices[i + 4] = v + 3; indices[i + 5] = v + 2;
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(new THREE.BufferAttribute(indices, 1));
    this.geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(0x120e1c) } },
      vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 color; varying float vA; void main(){ gl_FragColor = vec4(color, vA * 0.6); }`,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }

  /** Append a quad for a wheel track between the last and new positions of a wheel (width 0.3). */
  public add(key: string, x: number, z: number, heading: number, strength: number): void {
    const rx = -Math.cos(heading) * 0.16, rz = Math.sin(heading) * 0.16;
    const lx = x - rx, lz = z - rz, rxx = x + rx, rzz = z + rz;
    const prev = this.last.get(key);
    this.last.set(key, { lx, lz, rx: rxx, rz: rzz });
    if (!prev) return;
    if (Math.hypot(prev.lx - lx, prev.lz - lz) > 3) return; // teleport → start fresh
    const q = this.head;
    const v = q * 4 * 3;
    const p = this.positions;
    p[v] = prev.lx; p[v + 1] = SKID_Y; p[v + 2] = prev.lz;
    p[v + 3] = prev.rx; p[v + 4] = SKID_Y; p[v + 5] = prev.rz;
    p[v + 6] = lx; p[v + 7] = SKID_Y; p[v + 8] = lz;
    p[v + 9] = rxx; p[v + 10] = SKID_Y; p[v + 11] = rzz;
    const a = Math.min(1, strength);
    this.alphas.fill(a, q * 4, q * 4 + 4);
    this.head = (this.head + 1) % MAX_SKID_QUADS;
    this.filled = Math.min(MAX_SKID_QUADS, this.filled + 1);
    this.geo.setDrawRange(0, this.filled * 6);
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
  }

  public lift(key: string): void {
    this.last.delete(key);
  }

  public clear(): void {
    this.head = 0;
    this.filled = 0;
    this.last.clear();
    this.geo.setDrawRange(0, 0);
  }

  public dispose(): void {
    this.mesh.parent?.remove(this.mesh);
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** Convenience driver that emits particles/skids from a car's state each frame. */
export class CarEffects {
  private smokeAcc = 0;
  private dustAcc = 0;
  private boostAcc = 0;
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly particles: ParticleSystem, private readonly skids: SkidMarks, private readonly id: string) {}

  public update(dt: number, car: ArcadeCar, visual: CarVisual): void {
    const speed = car.speed;
    const slip = car.slip;
    const heading = car.heading;
    const fx = Math.sin(heading), fz = Math.cos(heading);
    // rear wheel world positions
    const wheels = visual.rearWheelsLocal.map((w) => this.tmp.copy(w).applyMatrix4(visual.group.matrixWorld).clone());
    const skidding = (car.isDrifting && speed > 4) || (slip > 4 && speed > 8) || (car.braking && speed > 12) || (car.handbrake && speed > 6);
    if (skidding && car.surface !== 'grass') {
      const strength = Math.min(1, 0.35 + slip / 10 + (car.braking ? 0.3 : 0));
      wheels.forEach((w, i) => this.skids.add(`${this.id}-${i}`, w.x, w.z, heading, strength));
    } else {
      wheels.forEach((_, i) => this.skids.lift(`${this.id}-${i}`));
    }
    // smoke
    if (skidding && car.surface !== 'grass') {
      this.smokeAcc += dt * (18 + slip * 3);
      while (this.smokeAcc > 1) {
        this.smokeAcc -= 1;
        const w = wheels[Math.floor(Math.random() * 2)];
        this.particles.spawn({ x: w.x, y: 0.2, z: w.z, vx: -fx * 2 + (Math.random() - 0.5), vy: 1.2, vz: -fz * 2, life: 0.9, size: 0.8, growth: 1.6, color: PALETTE.smoke, spread: 0.4 });
      }
    }
    // grass dust
    if (car.surface === 'grass' && speed > 5) {
      this.dustAcc += dt * (10 + speed * 0.6);
      while (this.dustAcc > 1) {
        this.dustAcc -= 1;
        const w = wheels[Math.floor(Math.random() * 2)];
        this.particles.spawn({ x: w.x, y: 0.15, z: w.z, vx: -fx * 3, vy: 2.5, vz: -fz * 3, life: 0.8, size: 0.7, growth: 1.8, gravity: 3, color: PALETTE.dust, spread: 0.6 });
      }
    }
    // drift sparks by tier
    if (car.isDrifting && car.driftCharge > 0.5 && speed > 6) {
      const tiers = [0.9, 1.8, 2.9];
      let tier = 0;
      for (let i = 0; i < tiers.length; i++) if (car.driftCharge >= tiers[i]) tier = i + 1;
      const color = tier === 0 ? 0xffffff : PALETTE.boost[tier - 1];
      this.boostAcc += dt * 28;
      while (this.boostAcc > 1) {
        this.boostAcc -= 1;
        const w = wheels[Math.floor(Math.random() * 2)];
        this.particles.spawn({ x: w.x, y: 0.15, z: w.z, vx: -fx * 6, vy: 3, vz: -fz * 6, life: 0.35, size: 0.28, gravity: 12, color, spread: 0.5 });
      }
    }
    // boost flames
    if (car.boostTime > 0) {
      const e = this.tmp.copy(visual.exhaustLocal).applyMatrix4(visual.group.matrixWorld);
      this.boostAcc += dt * 45;
      while (this.boostAcc > 1) {
        this.boostAcc -= 1;
        const color = PALETTE.boost[Math.max(0, car.boostTier - 1)];
        this.particles.spawn({ x: e.x, y: e.y, z: e.z, vx: -fx * 9 + car.vx * 0.5, vy: 0.5, vz: -fz * 9 + car.vz * 0.5, life: 0.28, size: 0.55, growth: -0.6, color, spread: 0.25 });
      }
    }
    // impacts
    for (const imp of car.impacts) {
      const n = Math.min(30, Math.round(imp.magnitude * 2));
      for (let i = 0; i < n; i++) {
        this.particles.spawn({ x: imp.x, y: 0.5, z: imp.z, vx: (Math.random() - 0.5) * 12, vy: 3 + Math.random() * 6, vz: (Math.random() - 0.5) * 12, life: 0.5, size: 0.2, gravity: 14, color: i % 3 === 0 ? 0xfff2c4 : PALETTE.spark });
      }
    }
  }

  public burst(x: number, z: number): void {
    const colors = [0xff5c4d, 0x3fb6ff, 0xc8ff3d, 0xffd166, 0xff7ab8, 0xfff7ef];
    for (let i = 0; i < 160; i++) {
      this.particles.spawn({ x, y: 1.5, z, vx: (Math.random() - 0.5) * 18, vy: 8 + Math.random() * 12, vz: (Math.random() - 0.5) * 18, life: 2.4, size: 0.35, gravity: 9, color: colors[i % colors.length] });
    }
  }
}
