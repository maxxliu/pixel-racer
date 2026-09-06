import { CatmullRomCurve3, Vector3 } from 'three';
import type { TrackWaypoint, StartPosition, Vec2 } from './types';
import { Segment, SegmentHash } from './Collision';

export interface SplineSample {
  x: number;
  z: number;
  /** Unit tangent (direction of travel). */
  tx: number;
  tz: number;
  /** Unit right-hand normal: right = (-tz, tx). Positive lateral = right of travel. */
  nx: number;
  nz: number;
  /** Full road width (asphalt) at this sample. */
  width: number;
  /** Arc length from the start line. */
  s: number;
  /** Signed curvature, positive = turning left. */
  curvature: number;
}

export interface NearestResult {
  index: number;
  s: number;
  /** Signed lateral offset from centreline, positive = right of travel. */
  lateral: number;
  /** Distance to the centreline (abs lateral). */
  distance: number;
}

export interface Gate {
  index: number;
  s: number;
  x: number;
  z: number;
  tx: number;
  tz: number;
  halfWidth: number;
}

export interface MinimapData {
  centerPath: string;
  innerPath: string;
  outerPath: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  start: { x: number; z: number; tx: number; tz: number };
}

export type Surface = 'asphalt' | 'kerb' | 'grass';

export const KERB_WIDTH = 1.2;
export const WALL_OFFSET = 2.6; // from asphalt edge to wall face
export const KERB_CURVATURE = 0.011; // radius < ~90m gets kerbs
const SAMPLE_SPACING = 2;
const GATE_COUNT = 7; // includes the start/finish gate at index 0
const HASH_CELL = 10;

export function validateWaypoints(waypoints: TrackWaypoint[] | undefined | null): string | null {
  if (!waypoints || !Array.isArray(waypoints)) return 'Track has no waypoints';
  if (waypoints.length < 6) return 'Track needs at least 6 waypoints';
  if (waypoints.length > 400) return 'Track has too many waypoints';
  let length = 0;
  for (let i = 0; i < waypoints.length; i++) {
    const a = waypoints[i];
    const b = waypoints[(i + 1) % waypoints.length];
    if (!Number.isFinite(a.x) || !Number.isFinite(a.z)) return `Waypoint ${i} has invalid coordinates`;
    if (!Number.isFinite(a.width) || a.width < 6 || a.width > 40) return `Waypoint ${i} has an invalid width`;
    if (Math.abs(a.x) > 2000 || Math.abs(a.z) > 2000) return `Waypoint ${i} is too far from the origin`;
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    if (d < 0.5) return `Waypoints ${i} and ${(i + 1) % waypoints.length} overlap`;
    length += d;
  }
  if (length < 60) return 'Track is too short';
  return null;
}

export class TrackSpline {
  public readonly samples: SplineSample[] = [];
  public readonly length: number;
  /** Arc length between consecutive samples. */
  public readonly spacing: number;
  public readonly start: StartPosition;
  public readonly gates: Gate[] = [];
  public readonly innerWall: Vec2[] = [];
  public readonly outerWall: Vec2[] = [];
  public readonly wallSegments: Segment[] = [];
  public readonly wallHash: SegmentHash;
  public readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Total curvature sign: +1 when the loop turns left overall (counter-clockwise seen from above). */
  public readonly winding: 1 | -1;
  private readonly hash = new Map<string, number[]>();
  private readonly queryScratch: number[] = [];

  constructor(public readonly waypoints: TrackWaypoint[], startOverride?: StartPosition) {
    const err = validateWaypoints(waypoints);
    if (err) throw new Error(err);

    const curve = new CatmullRomCurve3(
      waypoints.map((w) => new Vector3(w.x, 0, w.z)),
      true,
      'catmullrom',
      0.5,
    );

    // Dense uniform-in-t sampling, then resample by arc length.
    const denseCount = Math.max(400, Math.ceil(this.approxLength(curve) / 0.5));
    const dense: { x: number; z: number; t: number; w: number }[] = [];
    for (let i = 0; i < denseCount; i++) {
      const t = i / denseCount;
      const p = curve.getPoint(t);
      dense.push({ x: p.x, z: p.z, t, w: widthAtT(t, waypoints) });
    }
    let total = 0;
    const cum: number[] = [0];
    for (let i = 1; i <= denseCount; i++) {
      const a = dense[i - 1];
      const b = dense[i % denseCount];
      total += Math.hypot(b.x - a.x, b.z - a.z);
      cum.push(total);
    }
    this.length = total;

    const count = Math.max(24, Math.round(total / SAMPLE_SPACING));
    this.spacing = total / count;
    const raw: { x: number; z: number; w: number }[] = [];
    let di = 0;
    for (let i = 0; i < count; i++) {
      const target = (i / count) * total;
      while (di < denseCount - 1 && cum[di + 1] < target) di++;
      const a = dense[di];
      const b = dense[(di + 1) % denseCount];
      const segLen = cum[di + 1] - cum[di];
      const f = segLen > 1e-6 ? (target - cum[di]) / segLen : 0;
      raw.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, w: a.w + (b.w - a.w) * f });
    }

    // Rotate so the start is at index 0.
    const startIndex = this.findStartIndex(raw, waypoints, startOverride);
    const rotated = raw.slice(startIndex).concat(raw.slice(0, startIndex));

    let signedTurn = 0;
    for (let i = 0; i < count; i++) {
      const prev = rotated[(i - 1 + count) % count];
      const cur = rotated[i];
      const next = rotated[(i + 1) % count];
      let tx = next.x - prev.x;
      let tz = next.z - prev.z;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl; tz /= tl;
      // curvature from heading change between the two adjacent segments
      const h0 = Math.atan2(cur.x - prev.x, cur.z - prev.z);
      const h1 = Math.atan2(next.x - cur.x, next.z - cur.z);
      let dh = h1 - h0;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const ds = (Math.hypot(cur.x - prev.x, cur.z - prev.z) + Math.hypot(next.x - cur.x, next.z - cur.z)) / 2 || 1;
      const curvature = dh / ds; // heading = atan2(x, z); increasing heading turns left
      signedTurn += dh;
      this.samples.push({
        x: cur.x, z: cur.z, tx, tz, nx: -tz, nz: tx,
        width: cur.w, s: (i / count) * total, curvature,
      });
    }
    // Smooth curvature a little (3-tap) so kerb/AI decisions don't flicker.
    const smoothed = this.samples.map((_, i) => {
      const a = this.samples[(i - 1 + count) % count].curvature;
      const b = this.samples[i].curvature;
      const c = this.samples[(i + 1) % count].curvature;
      return (a + 2 * b + c) / 4;
    });
    smoothed.forEach((k, i) => { this.samples[i].curvature = k; });
    this.winding = signedTurn >= 0 ? 1 : -1;

    const s0 = this.samples[0];
    this.start = { x: s0.x, z: s0.z, rotation: Math.atan2(s0.tx, s0.tz) };

    this.bounds = this.computeBounds();
    this.buildHash();
    this.buildGates();
    this.buildWalls();
    this.wallHash = new SegmentHash(this.wallSegments, 12);
  }

  private approxLength(curve: CatmullRomCurve3): number {
    const pts = curve.getPoints(200);
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
    return len;
  }

  private findStartIndex(
    raw: { x: number; z: number }[],
    waypoints: TrackWaypoint[],
    startOverride?: StartPosition,
  ): number {
    let target: { x: number; z: number };
    if (startOverride && Number.isFinite(startOverride.x) && Number.isFinite(startOverride.z)) {
      target = startOverride;
    } else {
      const cp = waypoints.findIndex((w) => w.isCheckpoint);
      target = waypoints[cp >= 0 ? cp : 0];
    }
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < raw.length; i++) {
      const d = (raw[i].x - target.x) ** 2 + (raw[i].z - target.z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  private computeBounds() {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of this.samples) {
      const m = s.width / 2 + WALL_OFFSET + 2;
      minX = Math.min(minX, s.x - m); maxX = Math.max(maxX, s.x + m);
      minZ = Math.min(minZ, s.z - m); maxZ = Math.max(maxZ, s.z + m);
    }
    return { minX, maxX, minZ, maxZ };
  }

  private buildHash(): void {
    this.samples.forEach((s, i) => {
      const key = `${Math.floor(s.x / HASH_CELL)},${Math.floor(s.z / HASH_CELL)}`;
      const list = this.hash.get(key);
      if (list) list.push(i); else this.hash.set(key, [i]);
    });
  }

  private buildGates(): void {
    const n = this.samples.length;
    for (let g = 0; g < GATE_COUNT; g++) {
      const index = Math.round((g / GATE_COUNT) * n) % n;
      const s = this.samples[index];
      this.gates.push({ index, s: s.s, x: s.x, z: s.z, tx: s.tx, tz: s.tz, halfWidth: s.width / 2 });
    }
  }

  private buildWalls(): void {
    const n = this.samples.length;
    const build = (side: 1 | -1, out: Vec2[]) => {
      // Offset each sample; drop points where the offset polyline folds back on itself
      // (happens on the inside of corners tighter than the offset distance).
      const pts: Vec2[] = [];
      for (let i = 0; i < n; i++) {
        const s = this.samples[i];
        const off = s.width / 2 + WALL_OFFSET;
        const p = { x: s.x + s.nx * off * side, z: s.z + s.nz * off * side };
        if (pts.length > 0) {
          const q = pts[pts.length - 1];
          const dx = p.x - q.x, dz = p.z - q.z;
          if (dx * s.tx + dz * s.tz <= 0.05) continue; // folded: skip
        }
        pts.push(p);
      }
      // Wrap-around check between last and first.
      while (pts.length > 3) {
        const a = pts[pts.length - 1];
        const b = pts[0];
        const s0 = this.samples[0];
        if ((b.x - a.x) * s0.tx + (b.z - a.z) * s0.tz > 0.05) break;
        pts.pop();
      }
      // Chords across the inside of tight corners can cut inside the offset: push them back out.
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const q = pts[(i + 1) % pts.length];
          const mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2;
          for (const c of [p, q, { x: mx, z: mz }]) {
            const near = this.nearest(c.x, c.z);
            const want = this.samples[near.index].width / 2 + WALL_OFFSET;
            const deficit = want - near.distance;
            if (deficit > 0.05) {
              const sm = this.samples[near.index];
              const dir = side; // push away from the road on this wall's side
              p.x += sm.nx * dir * deficit; p.z += sm.nz * dir * deficit;
              q.x += sm.nx * dir * deficit; q.z += sm.nz * dir * deficit;
            }
          }
        }
      }
      out.push(...pts);
    };
    build(-1, this.innerWall); // left of travel
    build(1, this.outerWall);  // right of travel
    // Both walls are just "the wall on that side"; naming is by travel side, not by loop inside/outside.
    const addSegments = (pts: Vec2[], side: 1 | -1) => {
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const dx = b.x - a.x, dz = b.z - a.z;
        const len = Math.hypot(dx, dz) || 1;
        const tx = dx / len, tz = dz / len;
        // right normal of the wall direction = (-tz, tx). Road is on the -side.
        const nx = -tz * -side, nz = tx * -side;
        this.wallSegments.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, nx, nz });
      }
    };
    addSegments(this.innerWall, -1);
    addSegments(this.outerWall, 1);
  }

  public halfWidthAt(index: number): number {
    return this.samples[index].width / 2;
  }

  public sampleAt(s: number): SplineSample {
    const n = this.samples.length;
    let ss = s % this.length;
    if (ss < 0) ss += this.length;
    const f = (ss / this.length) * n;
    const i = Math.floor(f) % n;
    const j = (i + 1) % n;
    const a = this.samples[i], b = this.samples[j];
    const u = f - Math.floor(f);
    const tx = a.tx + (b.tx - a.tx) * u, tz = a.tz + (b.tz - a.tz) * u;
    const tl = Math.hypot(tx, tz) || 1;
    return {
      x: a.x + (b.x - a.x) * u,
      z: a.z + (b.z - a.z) * u,
      tx: tx / tl, tz: tz / tl,
      nx: -tz / tl, nz: tx / tl,
      width: a.width + (b.width - a.width) * u,
      s: ss,
      curvature: a.curvature + (b.curvature - a.curvature) * u,
    };
  }

  /**
   * Nearest point on the centreline. Walks locally from `hint` when given
   * (cheap, per-frame), otherwise uses the spatial hash.
   */
  public nearest(x: number, z: number, hint?: number): NearestResult {
    const n = this.samples.length;
    let best = -1;
    let bestD = Infinity;
    if (hint !== undefined && hint >= 0) {
      for (let k = -12; k <= 12; k++) {
        const i = (hint + k + n) % n;
        const s = this.samples[i];
        const d = (s.x - x) ** 2 + (s.z - z) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
      const w = this.samples[best].width;
      if (bestD > (w * 2) ** 2) best = -1; // lost it, fall back to global
    }
    if (best < 0) {
      bestD = Infinity;
      for (let r = 0; r <= 40 && best < 0; r++) {
        const cx = Math.floor(x / HASH_CELL), cz = Math.floor(z / HASH_CELL);
        for (let ix = cx - r; ix <= cx + r; ix++) {
          for (let iz = cz - r; iz <= cz + r; iz++) {
            if (Math.abs(ix - cx) !== r && Math.abs(iz - cz) !== r) continue;
            const list = this.hash.get(`${ix},${iz}`);
            if (!list) continue;
            for (const i of list) {
              const s = this.samples[i];
              const d = (s.x - x) ** 2 + (s.z - z) ** 2;
              if (d < bestD) { bestD = d; best = i; }
            }
          }
        }
        // After finding something at ring r, also check ring r+1 for a closer point.
        if (best >= 0 && r < 40) {
          const rr = r + 1;
          for (let ix = cx - rr; ix <= cx + rr; ix++) {
            for (let iz = cz - rr; iz <= cz + rr; iz++) {
              if (Math.abs(ix - cx) !== rr && Math.abs(iz - cz) !== rr) continue;
              const list = this.hash.get(`${ix},${iz}`);
              if (!list) continue;
              for (const i of list) {
                const s = this.samples[i];
                const d = (s.x - x) ** 2 + (s.z - z) ** 2;
                if (d < bestD) { bestD = d; best = i; }
              }
            }
          }
        }
      }
      if (best < 0) {
        for (let i = 0; i < n; i++) {
          const s = this.samples[i];
          const d = (s.x - x) ** 2 + (s.z - z) ** 2;
          if (d < bestD) { bestD = d; best = i; }
        }
      }
    }
    // Project onto the two adjacent segments for sub-sample precision.
    const cur = this.samples[best];
    const prev = this.samples[(best - 1 + n) % n];
    const next = this.samples[(best + 1) % n];
    const projA = project(x, z, prev, cur);
    const projB = project(x, z, cur, next);
    const useA = projA.d2 < projB.d2;
    const p = useA ? projA : projB;
    const from = useA ? prev : cur;
    const to = useA ? cur : next;
    let s = from.s + p.t * this.spacing;
    if (useA && best === 0) s = this.length - (1 - p.t) * this.spacing; // wrap segment
    if (s >= this.length) s -= this.length;
    const tx = from.tx + (to.tx - from.tx) * p.t;
    const tz = from.tz + (to.tz - from.tz) * p.t;
    const tl = Math.hypot(tx, tz) || 1;
    const nx = -tz / tl, nz = tx / tl;
    const lateral = (x - p.x) * nx + (z - p.z) * nz;
    return { index: best, s, lateral, distance: Math.abs(lateral) };
  }

  public surfaceAt(index: number, lateral: number): Surface {
    const hw = this.samples[index].width / 2;
    const a = Math.abs(lateral);
    if (a <= hw) return 'asphalt';
    if (a <= hw + KERB_WIDTH && this.hasKerb(index)) return 'kerb';
    return 'grass';
  }

  public hasKerb(index: number): boolean {
    return Math.abs(this.samples[index].curvature) > KERB_CURVATURE;
  }

  /** Grid slot behind the start line: 0 = pole. */
  public gridSlot(i: number): StartPosition {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const back = 6 + row * 7;
    const side = (col === 0 ? -1 : 1) * 2.4;
    const p = this.sampleAt(this.length - back);
    return {
      x: p.x + p.nx * side,
      z: p.z + p.nz * side,
      rotation: Math.atan2(p.tx, p.tz),
    };
  }

  /** Signed heading for the centreline at arc length s. */
  public headingAt(s: number): number {
    const p = this.sampleAt(s);
    return Math.atan2(p.tx, p.tz);
  }

  /** Largest |curvature| in [s, s + dist]. */
  public maxCurvatureAhead(s: number, dist: number): number {
    const n = this.samples.length;
    const start = Math.floor(((s % this.length) / this.length) * n);
    const count = Math.min(n, Math.ceil(dist / this.spacing));
    let m = 0;
    for (let k = 0; k < count; k++) {
      const c = Math.abs(this.samples[(start + k) % n].curvature);
      if (c > m) m = c;
    }
    return m;
  }

  public getMinimapData(): MinimapData {
    const n = this.samples.length;
    const step = Math.max(1, Math.floor(n / 160));
    const center: Vec2[] = [], left: Vec2[] = [], right: Vec2[] = [];
    for (let i = 0; i < n; i += step) {
      const s = this.samples[i];
      const hw = s.width / 2;
      center.push({ x: s.x, z: s.z });
      left.push({ x: s.x - s.nx * hw, z: s.z - s.nz * hw });
      right.push({ x: s.x + s.nx * hw, z: s.z + s.nz * hw });
    }
    // Outer ring is the one with the larger enclosed area, regardless of drawing direction.
    const areaL = Math.abs(signedArea(left)), areaR = Math.abs(signedArea(right));
    const outer = areaL > areaR ? left : right;
    const inner = areaL > areaR ? right : left;
    const s0 = this.samples[0];
    return {
      centerPath: toPath(center),
      innerPath: toPath(inner),
      outerPath: toPath(outer),
      bounds: this.bounds,
      start: { x: s0.x, z: s0.z, tx: s0.tx, tz: s0.tz },
    };
  }
}

function project(x: number, z: number, a: SplineSample, b: SplineSample) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len2 = dx * dx + dz * dz || 1;
  let t = ((x - a.x) * dx + (z - a.z) * dz) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = a.x + dx * t, pz = a.z + dz * t;
  return { t, x: px, z: pz, d2: (x - px) ** 2 + (z - pz) ** 2 };
}

/** Width interpolation matched to CatmullRomCurve3's uniform parameterisation (t*N maps to control index). */
export function widthAtT(t: number, waypoints: TrackWaypoint[]): number {
  const n = waypoints.length;
  const f = t * n;
  const i = Math.floor(f) % n;
  const u = f - Math.floor(f);
  const a = waypoints[i].width;
  const b = waypoints[(i + 1) % n].width;
  const smooth = u * u * (3 - 2 * u);
  return a + (b - a) * smooth;
}

function signedArea(pts: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.z - q.x * p.z;
  }
  return a / 2;
}

function toPath(pts: Vec2[]): string {
  if (pts.length === 0) return '';
  return `M ${pts[0].x.toFixed(1)} ${pts[0].z.toFixed(1)} ` +
    pts.slice(1).map((p) => `L ${p.x.toFixed(1)} ${p.z.toFixed(1)}`).join(' ') + ' Z';
}

/** The built-in circuit. */
export const DEFAULT_WAYPOINTS: TrackWaypoint[] = [
  { x: 0, z: 0, width: 16, speedLimit: 180, isCheckpoint: true },
  { x: 0, z: 40, width: 16, speedLimit: 180 },
  { x: 0, z: 80, width: 14, speedLimit: 120 },
  { x: 25, z: 100, width: 13, speedLimit: 90 },
  { x: 55, z: 115, width: 12, speedLimit: 70 },
  { x: 72, z: 105, width: 11, speedLimit: 55 },
  { x: 88, z: 118, width: 11, speedLimit: 55 },
  { x: 110, z: 108, width: 12, speedLimit: 65 },
  { x: 125, z: 95, width: 13, speedLimit: 100 },
  { x: 145, z: 75, width: 14, speedLimit: 130 },
  { x: 160, z: 50, width: 13, speedLimit: 100 },
  { x: 148, z: 30, width: 12, speedLimit: 70 },
  { x: 162, z: 10, width: 12, speedLimit: 70 },
  { x: 150, z: -10, width: 12, speedLimit: 85 },
  { x: 125, z: -30, width: 12, speedLimit: 55 },
  { x: 100, z: -48, width: 12, speedLimit: 45 },
  { x: 70, z: -58, width: 11, speedLimit: 38 },
  { x: 40, z: -55, width: 11, speedLimit: 40 },
  { x: 20, z: -42, width: 12, speedLimit: 55 },
  { x: 8, z: -25, width: 13, speedLimit: 90 },
  { x: 5, z: -12, width: 14, speedLimit: 120 },
];
