/**
 * Per-chunk road geometry for the stream track: asphalt, edge lines, kerbs and
 * walls, built when a chunk arrives and disposed when it retires.
 */
import * as THREE from 'three';
import { PALETTE } from '../palette';
import { KERB_WIDTH, type SplineSample } from '../Road';
import { makeAsphaltTexture } from '../TrackMeshBuilder';
import type { Vec2 } from '../types';
import type { StreamTrack, StreamChunk } from './StreamTrack';
import { ENDLESS_TUNING } from './tuning';

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

/** Open quad strip between two lateral offsets along a run of samples. */
function ribbon(
  samples: SplineSample[],
  latA: (s: SplineSample) => number,
  latB: (s: SplineSample) => number,
  y: number,
  color: ((s: SplineSample) => THREE.Color) | null,
  include: (s: SplineSample) => boolean = () => true,
  uvScale = 0,
): Strip {
  const strip = newStrip();
  const c = new THREE.Color();
  let vi = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const a = latA(s), b = latB(s);
    strip.positions.push(s.x + s.nx * a, y, s.z + s.nz * a, s.x + s.nx * b, y, s.z + s.nz * b);
    strip.normals.push(0, 1, 0, 0, 1, 0);
    if (uvScale > 0) strip.uvs.push(0, s.s / uvScale, 1, s.s / uvScale);
    if (color) { c.copy(color(s)); strip.colors.push(c.r, c.g, c.b, c.r, c.g, c.b); }
    if (i > 0 && include(samples[i - 1])) {
      const p = vi - 2;
      strip.indices.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
    }
    vi += 2;
  }
  return strip;
}

/** Wall strip along a polyline; `roadSide` +1 = road on the right of travel. */
function wallStrip(pts: Vec2[], roadSide: 1 | -1, sStart: number, spacing: number): Strip {
  const strip = newStrip();
  const red = new THREE.Color(PALETTE.wallRed);
  const white = new THREE.Color(PALETTE.wallWhite);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[Math.min(pts.length - 1, i + 1)];
    const prev = pts[Math.max(0, i - 1)];
    const dx = q.x - prev.x, dz = q.z - prev.z;
    const l = Math.hypot(dx, dz) || 1;
    const nx = (-dz / l) * roadSide, nz = (dx / l) * roadSide; // toward road
    const dist = sStart + i * spacing;
    const c = Math.floor(dist / 4) % 2 === 0 ? red : white;
    strip.positions.push(p.x, 0, p.z, p.x, WALL_HEIGHT, p.z, p.x - nx * 0.6, WALL_HEIGHT, p.z - nz * 0.6);
    strip.normals.push(nx, 0, nz, nx, 0.3, nz, 0, 1, 0);
    strip.colors.push(c.r, c.g, c.b, c.r, c.g, c.b, c.r * 0.85, c.g * 0.85, c.b * 0.85);
    if (i > 0) {
      const a = (i - 1) * 3, b = i * 3;
      strip.indices.push(a, a + 1, b, a + 1, b + 1, b);
      strip.indices.push(a + 1, a + 2, b + 1, a + 2, b + 2, b + 1);
    }
  }
  return strip;
}

interface ChunkMeshes {
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
}

export class StreamRoadMesh {
  public readonly group = new THREE.Group();
  private readonly chunks = new Map<number, ChunkMeshes>();
  private readonly asphaltTex: THREE.CanvasTexture;
  private readonly asphaltMat: THREE.MeshStandardMaterial;
  private readonly lineMat: THREE.MeshBasicMaterial;
  private readonly kerbMat: THREE.MeshStandardMaterial;
  private readonly wallMat: THREE.MeshStandardMaterial;
  private readonly decalMat: THREE.MeshBasicMaterial;
  private unsubscribe: (() => void) | null = null;

  constructor(scene: THREE.Scene, private readonly track: StreamTrack) {
    this.asphaltTex = makeAsphaltTexture();
    this.asphaltMat = new THREE.MeshStandardMaterial({ map: this.asphaltTex, roughness: 0.95, metalness: 0 });
    this.lineMat = new THREE.MeshBasicMaterial({ color: PALETTE.edgeLine, toneMapped: false });
    this.kerbMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
    this.wallMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    this.decalMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    scene.add(this.group);
    for (const chunk of track.chunks) this.build(chunk);
    this.unsubscribe = track.on((e) => {
      if (e.type === 'chunk') this.build(e.chunk);
      else this.retire(e.chunk);
    });
  }

  private build(chunk: StreamChunk): void {
    const track = this.track;
    // one sample of overlap backwards so consecutive chunks share an edge
    const lo = Math.max(track.firstId, chunk.firstId - 1) - track.firstId;
    const hi = chunk.lastId - track.firstId;
    const samples = track.samples.slice(lo, hi + 1);
    if (samples.length < 2) return;
    const geometries: THREE.BufferGeometry[] = [];
    const group = new THREE.Group();

    const road = toGeometry(ribbon(samples, (s) => -s.width / 2, (s) => s.width / 2, Y_ROAD, null, () => true, 9));
    const roadMesh = new THREE.Mesh(road, this.asphaltMat);
    roadMesh.receiveShadow = true;
    group.add(roadMesh);
    geometries.push(road);

    for (const side of [-1, 1] as const) {
      const g = toGeometry(ribbon(samples, (s) => side * (s.width / 2 - 0.45), (s) => side * (s.width / 2 - 0.15), Y_LINE, null));
      group.add(new THREE.Mesh(g, this.lineMat));
      geometries.push(g);
    }

    const red = new THREE.Color(PALETTE.kerbRed);
    const white = new THREE.Color(PALETTE.kerbWhite);
    const kerbColor = (s: SplineSample) => (Math.floor(s.s / 2) % 2 === 0 ? red : white);
    const hasKerb = (s: SplineSample) => Math.abs(s.curvature) > 0.011;
    if (samples.some(hasKerb)) {
      for (const side of [-1, 1] as const) {
        const strip = ribbon(samples, (s) => side * (s.width / 2 - 0.05), (s) => side * (s.width / 2 + KERB_WIDTH), Y_KERB, kerbColor, hasKerb);
        if (!strip.indices.length) continue;
        const g = toGeometry(strip);
        const m = new THREE.Mesh(g, this.kerbMat);
        m.receiveShadow = true;
        group.add(m);
        geometries.push(g);
      }
    }

    const left = track.leftWall.slice(lo, hi + 1);
    const right = track.rightWall.slice(lo, hi + 1);
    const sStart = samples[0].s;
    for (const [pts, side] of [[left, 1], [right, -1]] as const) {
      const g = toGeometry(wallStrip(pts, side, sStart, track.spacing));
      const m = new THREE.Mesh(g, this.wallMat);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
      geometries.push(g);
    }

    // start line where the player's grid is
    const start = ENDLESS_TUNING.playerStart;
    if (chunk.sStart <= start && chunk.sEnd > start) {
      const g = this.startLine(start - 3);
      group.add(new THREE.Mesh(g, this.decalMat));
      geometries.push(g);
    }

    this.group.add(group);
    this.chunks.set(chunk.id, { group, geometries });
  }

  private startLine(s0: number): THREE.BufferGeometry {
    const strip = newStrip();
    const dark = new THREE.Color(0x14101f);
    const light = new THREE.Color(0xfff4e6);
    const ref = this.track.sampleAt(s0);
    const hw = ref.width / 2;
    const cols = Math.max(6, Math.round(ref.width / 1.4));
    const cell = ref.width / cols;
    let vi = 0;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < cols; c++) {
        const col = (r + c) % 2 === 0 ? light : dark;
        const l0 = -hw + c * cell, l1 = l0 + cell;
        const a = this.track.sampleAt(s0 + r * cell);
        const b = this.track.sampleAt(s0 + (r + 1) * cell);
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
    return toGeometry(strip);
  }

  private retire(chunk: StreamChunk): void {
    const m = this.chunks.get(chunk.id);
    if (!m) return;
    this.group.remove(m.group);
    m.geometries.forEach((g) => g.dispose());
    this.chunks.delete(chunk.id);
  }

  public dispose(): void {
    this.unsubscribe?.();
    for (const m of this.chunks.values()) { this.group.remove(m.group); m.geometries.forEach((g) => g.dispose()); }
    this.chunks.clear();
    this.group.parent?.remove(this.group);
    this.asphaltTex.dispose();
    this.asphaltMat.dispose();
    this.lineMat.dispose();
    this.kerbMat.dispose();
    this.wallMat.dispose();
    this.decalMat.dispose();
  }
}
