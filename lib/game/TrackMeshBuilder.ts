import * as THREE from 'three';
import { PALETTE } from './palette';
import { TrackSpline, KERB_WIDTH, WALL_OFFSET } from './TrackSpline';
import type { Vec2 } from './types';

const Y_ROAD = 0.03;
const Y_LINE = 0.045;
const Y_DECAL = 0.05;
const Y_KERB = 0.055;
const WALL_HEIGHT = 0.95;

interface Strip {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

function newStrip(): Strip {
  return { positions: [], normals: [], uvs: [], colors: [], indices: [] };
}

function toGeometry(s: Strip): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(s.positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(s.normals, 3));
  if (s.uvs.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(s.uvs, 2));
  if (s.colors.length) g.setAttribute('color', new THREE.Float32BufferAttribute(s.colors, 3));
  g.setIndex(s.indices);
  g.computeBoundingSphere();
  return g;
}

function makeAsphaltTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#3a3548';
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 26;
    d[i] += n; d[i + 1] += n; d[i + 2] += n + 2;
  }
  ctx.putImageData(img, 0, 0);
  // faint darker tyre band down the middle
  const grad = ctx.createLinearGradient(0, 0, size, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.28, 'rgba(0,0,0,0.14)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.02)');
  grad.addColorStop(0.72, 'rgba(0,0,0,0.14)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Builds every static track mesh from a TrackSpline. */
export class TrackMeshBuilder {
  public readonly group = new THREE.Group();
  private readonly disposables: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];
  private lightMats: THREE.MeshStandardMaterial[] = [];

  constructor(private readonly spline: TrackSpline) {
    this.buildRoad();
    this.buildEdgeLines();
    this.buildKerbs();
    this.buildWalls();
    this.buildStartLine();
    this.buildGantry();
  }

  /** Quad strip between two lateral offsets along the whole loop. */
  private ribbon(
    latA: (i: number) => number,
    latB: (i: number) => number,
    y: number,
    color: ((i: number) => THREE.Color) | null,
    include: (i: number) => boolean = () => true,
    uvScale = 0,
  ): Strip {
    const strip = newStrip();
    const samples = this.spline.samples;
    const n = samples.length;
    let vi = 0;
    const c = new THREE.Color();
    for (let i = 0; i <= n; i++) {
      const idx = i % n;
      const s = samples[idx];
      const a = latA(idx), b = latB(idx);
      strip.positions.push(s.x + s.nx * a, y, s.z + s.nz * a, s.x + s.nx * b, y, s.z + s.nz * b);
      strip.normals.push(0, 1, 0, 0, 1, 0);
      if (uvScale > 0) {
        const v = (i === n ? this.spline.length : s.s) / uvScale;
        strip.uvs.push(0, v, 1, v);
      }
      if (color) {
        c.copy(color(idx));
        strip.colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
      if (i > 0 && include(idx === 0 ? n - 1 : idx - 1)) {
        const p = vi - 2;
        // (lo_i, hi_i, lo_i+1), (hi_i, hi_i+1, lo_i+1) → normals face +Y
        strip.indices.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
      }
      vi += 2;
    }
    return strip;
  }

  private buildRoad(): void {
    const strip = this.ribbon((i) => -this.spline.halfWidthAt(i), (i) => this.spline.halfWidthAt(i), Y_ROAD, null, () => true, 9);
    const geometry = toGeometry(strip);
    const tex = makeAsphaltTexture();
    const material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.disposables.push(geometry, material, tex);
  }

  private buildEdgeLines(): void {
    const mat = new THREE.MeshBasicMaterial({ color: PALETTE.edgeLine, toneMapped: false });
    const left = this.ribbon((i) => -this.spline.halfWidthAt(i) + 0.15, (i) => -this.spline.halfWidthAt(i) + 0.45, Y_LINE, null);
    const right = this.ribbon((i) => this.spline.halfWidthAt(i) - 0.45, (i) => this.spline.halfWidthAt(i) - 0.15, Y_LINE, null);
    for (const s of [left, right]) {
      const g = toGeometry(s);
      this.group.add(new THREE.Mesh(g, mat));
      this.disposables.push(g);
    }
    this.disposables.push(mat);
  }

  private buildKerbs(): void {
    const red = new THREE.Color(PALETTE.kerbRed);
    const white = new THREE.Color(PALETTE.kerbWhite);
    const color = (i: number) => (Math.floor(this.spline.samples[i].s / 2) % 2 === 0 ? red : white);
    const has = (i: number) => this.spline.hasKerb(i);
    const left = this.ribbon((i) => -this.spline.halfWidthAt(i) - KERB_WIDTH, (i) => -this.spline.halfWidthAt(i) + 0.05, Y_KERB, color, has);
    const right = this.ribbon((i) => this.spline.halfWidthAt(i) - 0.05, (i) => this.spline.halfWidthAt(i) + KERB_WIDTH, Y_KERB, color, has);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
    for (const s of [left, right]) {
      if (s.indices.length === 0) continue;
      const g = toGeometry(s);
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      this.group.add(m);
      this.disposables.push(g);
    }
    this.disposables.push(mat);
  }

  private buildWalls(): void {
    const strip = newStrip();
    const red = new THREE.Color(PALETTE.wallRed);
    const white = new THREE.Color(PALETTE.wallWhite);
    const addWall = (pts: Vec2[], roadSide: 1 | -1) => {
      // roadSide: which side of the polyline direction the road is on (+1 = right)
      let dist = 0;
      const base = strip.positions.length / 3;
      for (let i = 0; i <= pts.length; i++) {
        const p = pts[i % pts.length];
        const q = pts[(i + 1) % pts.length];
        const prev = pts[(i - 1 + pts.length) % pts.length];
        if (i > 0) dist += Math.hypot(p.x - prev.x, p.z - prev.z);
        const dx = q.x - prev.x, dz = q.z - prev.z;
        const l = Math.hypot(dx, dz) || 1;
        const nx = (-dz / l) * roadSide, nz = (dx / l) * roadSide; // toward road
        const c = Math.floor(dist / 4) % 2 === 0 ? red : white;
        // inner face bottom, inner face top, outer top (thickness 0.6)
        strip.positions.push(p.x, 0, p.z, p.x, WALL_HEIGHT, p.z, p.x - nx * 0.6, WALL_HEIGHT, p.z - nz * 0.6);
        strip.normals.push(nx, 0, nz, nx, 0.3, nz, 0, 1, 0);
        strip.colors.push(c.r, c.g, c.b, c.r, c.g, c.b, c.r * 0.85, c.g * 0.85, c.b * 0.85);
        if (i > 0) {
          const a = base + (i - 1) * 3, b = base + i * 3;
          // face (double-sided material so winding only affects lighting)
          strip.indices.push(a, a + 1, b, a + 1, b + 1, b);
          strip.indices.push(a + 1, a + 2, b + 1, a + 2, b + 2, b + 1);
        }
      }
    };
    addWall(this.spline.innerWall, 1);   // left wall runs with travel; road on its right
    addWall(this.spline.outerWall, -1);  // right wall; road on its left
    const g = toGeometry(strip);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.disposables.push(g, mat);
  }

  private buildStartLine(): void {
    const s0 = this.spline.samples[0];
    const hw = s0.width / 2;
    const cols = Math.max(6, Math.round(s0.width / 1.4));
    const rows = 3;
    const cell = s0.width / cols;
    const strip = newStrip();
    const dark = new THREE.Color(0x14101f);
    const light = new THREE.Color(0xfff4e6);
    let vi = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const col = (r + c) % 2 === 0 ? light : dark;
        const l0 = -hw + c * cell, l1 = l0 + cell;
        const a = this.spline.sampleAt(this.spline.length - 1 + r * cell);
        const b = this.spline.sampleAt(this.spline.length - 1 + (r + 1) * cell);
        strip.positions.push(
          a.x + a.nx * l0, Y_DECAL, a.z + a.nz * l0,
          a.x + a.nx * l1, Y_DECAL, a.z + a.nz * l1,
          b.x + b.nx * l0, Y_DECAL, b.z + b.nz * l0,
          b.x + b.nx * l1, Y_DECAL, b.z + b.nz * l1,
        );
        for (let k = 0; k < 4; k++) { strip.normals.push(0, 1, 0); strip.colors.push(col.r, col.g, col.b); }
        strip.indices.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
        vi += 4;
      }
    }
    const g = toGeometry(strip);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    this.group.add(new THREE.Mesh(g, mat));
    this.disposables.push(g, mat);
  }

  private buildGantry(): void {
    const s = this.spline.sampleAt(4);
    const off = s.width / 2 + WALL_OFFSET + 0.9;
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xf8f3ea, roughness: 0.5 });
    const barMat = new THREE.MeshStandardMaterial({ color: 0x2a2140, roughness: 0.6 });
    const poleGeo = new THREE.CylinderGeometry(0.22, 0.22, 7, 10);
    const height = 7;
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(s.x + s.nx * off * side, height / 2, s.z + s.nz * off * side);
      pole.castShadow = true;
      this.group.add(pole);
    }
    const span = off * 2;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(span + 0.4, 0.9, 0.7), barMat);
    bar.position.set(s.x, height - 0.2, s.z);
    bar.rotation.y = Math.atan2(s.tx, s.tz);
    bar.castShadow = true;
    this.group.add(bar);
    // banner text plane (colour block)
    const banner = new THREE.Mesh(new THREE.BoxGeometry(span * 0.6, 1.4, 0.2), new THREE.MeshStandardMaterial({ color: PALETTE.player, roughness: 0.6 }));
    banner.position.set(s.x - s.tx * 0.2, height - 1.4, s.z - s.tz * 0.2);
    banner.rotation.y = Math.atan2(s.tx, s.tz);
    this.group.add(banner);
    // start lights: 5 lamps facing the grid (backwards)
    const lampGeo = new THREE.SphereGeometry(0.28, 12, 12);
    for (let i = 0; i < 5; i++) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0x000000, emissiveIntensity: 2 });
      const lamp = new THREE.Mesh(lampGeo, mat);
      const lat = (i - 2) * 1.0;
      lamp.position.set(s.x + s.nx * lat - s.tx * 0.5, height - 0.2, s.z + s.nz * lat - s.tz * 0.5);
      this.group.add(lamp);
      this.lightMats.push(mat);
      this.disposables.push(mat);
    }
    this.disposables.push(poleMat, barMat, poleGeo, lampGeo, bar.geometry, banner.geometry, banner.material as THREE.Material);
  }

  /** count red lamps lit; `go` flips them all green. */
  public setStartLights(lit: number, go: boolean): void {
    this.lightMats.forEach((m, i) => {
      if (go) { m.color.setHex(0x0f3d1e); m.emissive.setHex(0x2dff6a); }
      else if (i < lit) { m.color.setHex(0x3d0f0f); m.emissive.setHex(0xff2d2d); }
      else { m.color.setHex(0x330000); m.emissive.setHex(0x000000); }
    });
  }

  public dispose(): void {
    this.group.parent?.remove(this.group);
    this.disposables.forEach((d) => d.dispose());
  }
}
