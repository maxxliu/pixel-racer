/**
 * Instanced visuals for the obstacle field: cone clusters, hazard-striped blocks,
 * oil slicks and boost pads, with slot recycling and debris on hits.
 */
import * as THREE from 'three';
import { PALETTE } from '../palette';
import type { ParticleSystem } from '../Effects';
import type { ObstacleField, Obstacle, ObstacleKind } from './ObstacleField';

const CAPACITY: Record<ObstacleKind, number> = { cones: 200, block: 160, oil: 48, boost: 48 };

function merge(parts: { geo: THREE.BufferGeometry; color: number; x?: number; y?: number; z?: number }[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const c = new THREE.Color();
  let base = 0;
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    c.setHex(p.color);
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i) + (p.x ?? 0), pos.getY(i) + (p.y ?? 0), pos.getZ(i) + (p.z ?? 0));
      normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      colors.push(c.r, c.g, c.b);
      indices.push(base + i);
    }
    base += pos.count;
    if (g !== p.geo) g.dispose();
    p.geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  out.setIndex(indices);
  out.computeBoundingSphere();
  return out;
}

function coneCluster(): THREE.BufferGeometry {
  const parts: { geo: THREE.BufferGeometry; color: number; x?: number; y?: number; z?: number }[] = [];
  const spots = [[0, 0], [-0.75, -0.45], [0.7, -0.5]];
  for (const [x, z] of spots) {
    parts.push({ geo: new THREE.ConeGeometry(0.34, 0.95, 8).translate(0, 0.475, 0), color: PALETTE.hazardOrange, x, z });
    parts.push({ geo: new THREE.CylinderGeometry(0.24, 0.27, 0.16, 8).translate(0, 0.55, 0), color: PALETTE.hazardWhite, x, z });
    parts.push({ geo: new THREE.BoxGeometry(0.62, 0.05, 0.62), color: 0x2a2140, x, y: 0.025, z });
  }
  return merge(parts);
}

function stripedBlock(): THREE.BufferGeometry {
  const parts: { geo: THREE.BufferGeometry; color: number; x?: number; y?: number; z?: number }[] = [];
  const w = 2.6, h = 1.0, d = 1.3;
  parts.push({ geo: new THREE.BoxGeometry(w, h, d), color: PALETTE.block, y: h / 2 });
  // four diagonal-ish stripes as thin slabs on the front and back faces
  for (let i = 0; i < 4; i++) {
    const color = i % 2 === 0 ? PALETTE.hazardOrange : PALETTE.hazardWhite;
    const x = -w / 2 + (i + 0.5) * (w / 4);
    parts.push({ geo: new THREE.BoxGeometry(w / 4 - 0.04, h * 0.6, 0.04), color, x, y: h * 0.55, z: d / 2 + 0.02 });
    parts.push({ geo: new THREE.BoxGeometry(w / 4 - 0.04, h * 0.6, 0.04), color, x, y: h * 0.55, z: -d / 2 - 0.02 });
  }
  parts.push({ geo: new THREE.BoxGeometry(w + 0.1, 0.08, d + 0.1), color: PALETTE.hazardWhite, y: h + 0.04 });
  return merge(parts);
}

function oilDecal(): THREE.BufferGeometry {
  return merge([{ geo: new THREE.CircleGeometry(2.1, 18).rotateX(-Math.PI / 2), color: PALETTE.oil, y: 0.06 }]);
}

function boostPad(): THREE.BufferGeometry {
  const parts: { geo: THREE.BufferGeometry; color: number; x?: number; y?: number; z?: number }[] = [];
  parts.push({ geo: new THREE.BoxGeometry(2.8, 0.06, 3.2), color: 0x1a1030, y: 0.05 });
  // three chevrons pointing forward (+z)
  for (let i = 0; i < 3; i++) {
    const z = -1.0 + i * 0.9;
    parts.push({ geo: new THREE.BoxGeometry(1.2, 0.05, 0.28).rotateY(0.6).translate(-0.45, 0.09, z), color: PALETTE.boostPad });
    parts.push({ geo: new THREE.BoxGeometry(1.2, 0.05, 0.28).rotateY(-0.6).translate(0.45, 0.09, z), color: PALETTE.boostPad });
  }
  return merge(parts);
}

export class ObstacleMeshes {
  public readonly group = new THREE.Group();
  private readonly meshes: Record<ObstacleKind, THREE.InstancedMesh>;
  private readonly free: Record<ObstacleKind, number[]> = { cones: [], block: [], oil: [], boost: [] };
  private readonly slotOf = new Map<number, { kind: ObstacleKind; slot: number }>();
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpP = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  private readonly boostMat: THREE.MeshStandardMaterial;
  private readonly disposables: (THREE.BufferGeometry | THREE.Material)[] = [];
  private unsubscribe: (() => void) | null = null;
  private time = 0;

  constructor(scene: THREE.Scene, private readonly field: ObstacleField, private readonly particles: ParticleSystem) {
    const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    const oilMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.5, transparent: true, opacity: 0.9, depthWrite: false });
    this.boostMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: PALETTE.boostPad, emissiveIntensity: 0.5 });
    const geos = { cones: coneCluster(), block: stripedBlock(), oil: oilDecal(), boost: boostPad() };
    const mk = (kind: ObstacleKind, mat: THREE.Material) => {
      const m = new THREE.InstancedMesh(geos[kind], mat, CAPACITY[kind]);
      m.frustumCulled = false;
      m.castShadow = kind === 'cones' || kind === 'block';
      m.receiveShadow = true;
      for (let i = 0; i < CAPACITY[kind]; i++) { m.setMatrixAt(i, this.hidden); this.free[kind].push(i); }
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceMatrix.needsUpdate = true;
      this.group.add(m);
      return m;
    };
    this.meshes = { cones: mk('cones', solidMat), block: mk('block', solidMat), oil: mk('oil', oilMat), boost: mk('boost', this.boostMat) };
    this.meshes.oil.renderOrder = 1;
    this.disposables.push(geos.cones, geos.block, geos.oil, geos.boost, solidMat, oilMat, this.boostMat);
    scene.add(this.group);
    for (const o of field.obstacles) if (o.alive) this.show(o);
    this.unsubscribe = field.on((e) => {
      switch (e.type) {
        case 'spawn': this.show(e.obstacle); break;
        case 'remove': this.hide(e.obstacle); break;
        case 'boost': this.hide(e.obstacle); break;
        case 'smash': this.debris(e.obstacle); this.hide(e.obstacle); break;
        case 'hit':
          if (e.obstacle.kind === 'cones') { this.debris(e.obstacle); this.hide(e.obstacle); }
          break;
        default: break;
      }
    });
  }

  private show(o: Obstacle): void {
    const slot = this.free[o.kind].pop();
    if (slot === undefined) return;
    this.tmpP.set(o.x, 0, o.z);
    this.tmpQ.setFromAxisAngle(this.yAxis, o.heading);
    this.tmpM.compose(this.tmpP, this.tmpQ, this.one);
    const m = this.meshes[o.kind];
    m.setMatrixAt(slot, this.tmpM);
    m.instanceMatrix.needsUpdate = true;
    this.slotOf.set(o.id, { kind: o.kind, slot });
  }

  private hide(o: Obstacle): void {
    const s = this.slotOf.get(o.id);
    if (!s) return;
    const m = this.meshes[s.kind];
    m.setMatrixAt(s.slot, this.hidden);
    m.instanceMatrix.needsUpdate = true;
    this.free[s.kind].push(s.slot);
    this.slotOf.delete(o.id);
  }

  /** Cones fly. */
  private debris(o: Obstacle): void {
    for (let i = 0; i < 18; i++) {
      this.particles.spawn({
        x: o.x, y: 0.5, z: o.z,
        vx: (Math.random() - 0.5) * 10, vy: 4 + Math.random() * 7, vz: (Math.random() - 0.5) * 10,
        life: 0.9, size: 0.35, gravity: 16, color: i % 3 === 0 ? PALETTE.hazardWhite : PALETTE.hazardOrange, spread: 0.6,
      });
    }
  }

  public update(dt: number): void {
    this.time += dt;
    this.boostMat.emissiveIntensity = 0.45 + Math.sin(this.time * 6) * 0.3;
  }

  public dispose(): void {
    this.unsubscribe?.();
    this.group.parent?.remove(this.group);
    for (const m of Object.values(this.meshes)) m.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
