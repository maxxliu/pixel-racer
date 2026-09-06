/**
 * A forward-only road kept as a sliding window of samples. Implements `Road` so
 * the same car physics drives on it. Sample ids are global and monotonic
 * (id = s / spacing) so hints, obstacles and chunks stay valid as the window slides.
 */
import type { Road, SplineSample, NearestResult, Surface } from '../Road';
import { KERB_WIDTH, KERB_CURVATURE, WALL_OFFSET } from '../Road';
import type { Segment } from '../Collision';
import type { Vec2 } from '../types';
import { SegmentGenerator, type GeneratedChunk, type SegmentKind } from './SegmentGenerator';
import { ENDLESS_TUNING, type EndlessTuning } from './tuning';

export interface StreamChunk {
  id: number;
  firstId: number;
  lastId: number;
  sStart: number;
  sEnd: number;
  band: number;
  kind: SegmentKind;
}

export type StreamEvent =
  | { type: 'chunk'; chunk: StreamChunk }
  | { type: 'retire'; chunk: StreamChunk };

export class StreamTrack implements Road {
  public readonly spacing: number;
  /** Samples currently in the window; samples[i] has id firstId + i. */
  public readonly samples: SplineSample[] = [];
  /** Wall polylines parallel to `samples`. */
  public readonly leftWall: Vec2[] = [];
  public readonly rightWall: Vec2[] = [];
  /** wallsLeft[i] joins leftWall[i] → leftWall[i+1]; length = samples.length - 1. */
  public readonly wallsLeft: Segment[] = [];
  public readonly wallsRight: Segment[] = [];
  public readonly chunks: StreamChunk[] = [];
  public firstId = 0;
  private nextChunkId = 0;
  private lastHint = 0;
  private listeners: ((e: StreamEvent) => void)[] = [];
  public readonly generator: SegmentGenerator;

  constructor(seed: number, private readonly t: EndlessTuning = ENDLESS_TUNING) {
    this.spacing = t.spacing;
    this.generator = new SegmentGenerator(seed, t);
  }

  public on(listener: (e: StreamEvent) => void): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter((l) => l !== listener); };
  }

  private emit(e: StreamEvent): void {
    for (const l of this.listeners) l(e);
  }

  public get lastId(): number { return this.firstId + this.samples.length - 1; }
  public get firstS(): number { return this.samples.length ? this.samples[0].s : 0; }
  public get lastS(): number { return this.samples.length ? this.samples[this.samples.length - 1].s : 0; }

  public sampleById(id: number): SplineSample {
    const i = Math.min(this.samples.length - 1, Math.max(0, id - this.firstId));
    return this.samples[i];
  }

  /** Generate road until at least `s` metres exist. */
  public ensureAhead(s: number): void {
    while (this.lastS < s || this.samples.length < 2) {
      const g: GeneratedChunk = this.generator.next();
      this.append(g);
    }
  }

  private append(g: GeneratedChunk): void {
    const firstNew = this.firstId + this.samples.length;
    for (const smp of g.samples) {
      this.samples.push(smp);
      const off = smp.width / 2 + WALL_OFFSET;
      this.leftWall.push({ x: smp.x - smp.nx * off, z: smp.z - smp.nz * off });
      this.rightWall.push({ x: smp.x + smp.nx * off, z: smp.z + smp.nz * off });
      const n = this.samples.length;
      if (n >= 2) {
        this.wallsLeft.push(wallSegment(this.leftWall[n - 2], this.leftWall[n - 1], 1));
        this.wallsRight.push(wallSegment(this.rightWall[n - 2], this.rightWall[n - 1], -1));
      }
    }
    const chunk: StreamChunk = {
      id: this.nextChunkId++,
      firstId: firstNew,
      lastId: this.firstId + this.samples.length - 1,
      sStart: g.sStart,
      sEnd: g.sEnd,
      band: g.band,
      kind: g.kind,
    };
    this.chunks.push(chunk);
    this.emit({ type: 'chunk', chunk });
  }

  /** Drop chunks that end more than `windowBehind` behind `s`. */
  public trimBehind(s: number): void {
    const limit = s - this.t.windowBehind;
    while (this.chunks.length > 2 && this.chunks[0].sEnd < limit) {
      const chunk = this.chunks.shift()!;
      const drop = chunk.lastId - this.firstId + 1;
      this.samples.splice(0, drop);
      this.leftWall.splice(0, drop);
      this.rightWall.splice(0, drop);
      this.wallsLeft.splice(0, drop);
      this.wallsRight.splice(0, drop);
      this.firstId += drop;
      this.emit({ type: 'retire', chunk });
    }
  }

  // --- Road ---

  public halfWidthAt(id: number): number {
    return this.sampleById(id).width / 2;
  }

  public hasKerb(id: number): boolean {
    return Math.abs(this.sampleById(id).curvature) > KERB_CURVATURE;
  }

  public surfaceAt(id: number, lateral: number): Surface {
    const hw = this.halfWidthAt(id);
    const a = Math.abs(lateral);
    if (a <= hw) return 'asphalt';
    if (a <= hw + KERB_WIDTH && this.hasKerb(id)) return 'kerb';
    return 'grass';
  }

  public sampleAt(s: number): SplineSample {
    const n = this.samples.length;
    const f = (s - this.firstS) / this.spacing;
    const i = Math.min(n - 2, Math.max(0, Math.floor(f)));
    const u = Math.min(1, Math.max(0, f - i));
    const a = this.samples[i], b = this.samples[i + 1];
    const tx = a.tx + (b.tx - a.tx) * u, tz = a.tz + (b.tz - a.tz) * u;
    const tl = Math.hypot(tx, tz) || 1;
    return {
      x: a.x + (b.x - a.x) * u,
      z: a.z + (b.z - a.z) * u,
      tx: tx / tl, tz: tz / tl,
      nx: -tz / tl, nz: tx / tl,
      width: a.width + (b.width - a.width) * u,
      s: a.s + (b.s - a.s) * u,
      curvature: a.curvature + (b.curvature - a.curvature) * u,
    };
  }

  public headingAt(s: number): number {
    const p = this.sampleAt(s);
    return Math.atan2(p.tx, p.tz);
  }

  /** Largest |curvature| in [s, s + dist] within the window. */
  public maxCurvatureAhead(s: number, dist: number): number {
    const start = Math.max(0, Math.floor((s - this.firstS) / this.spacing));
    const count = Math.ceil(dist / this.spacing);
    let m = 0;
    for (let k = 0; k <= count && start + k < this.samples.length; k++) {
      const c = Math.abs(this.samples[start + k].curvature);
      if (c > m) m = c;
    }
    return m;
  }

  private nearestLocalIndex(x: number, z: number, hint: number | undefined): number {
    const n = this.samples.length;
    let best = -1;
    let bestD = Infinity;
    const h = hint !== undefined && hint >= this.firstId && hint <= this.lastId ? hint - this.firstId : -1;
    if (h >= 0) {
      for (let k = -12; k <= 12; k++) {
        const i = h + k;
        if (i < 0 || i >= n) continue;
        const s = this.samples[i];
        const d = (s.x - x) ** 2 + (s.z - z) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
      const w = this.samples[best].width;
      if (bestD > (w * 2) ** 2) best = -1;
    }
    if (best < 0) {
      bestD = Infinity;
      for (let i = 0; i < n; i++) {
        const s = this.samples[i];
        const d = (s.x - x) ** 2 + (s.z - z) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    return best;
  }

  public nearest(x: number, z: number, hint?: number): NearestResult {
    const n = this.samples.length;
    const best = this.nearestLocalIndex(x, z, hint ?? this.lastHint);
    const cur = this.samples[best];
    const prev = this.samples[Math.max(0, best - 1)];
    const next = this.samples[Math.min(n - 1, best + 1)];
    const projA = best > 0 ? project(x, z, prev, cur) : null;
    const projB = best < n - 1 ? project(x, z, cur, next) : null;
    let from: SplineSample, to: SplineSample, p: { t: number; x: number; z: number; d2: number };
    if (projA && (!projB || projA.d2 < projB.d2)) { from = prev; to = cur; p = projA; }
    else if (projB) { from = cur; to = next; p = projB; }
    else { from = cur; to = cur; p = { t: 0, x: cur.x, z: cur.z, d2: (x - cur.x) ** 2 + (z - cur.z) ** 2 }; }
    const s = from.s + p.t * (to.s - from.s);
    const tx = from.tx + (to.tx - from.tx) * p.t;
    const tz = from.tz + (to.tz - from.tz) * p.t;
    const tl = Math.hypot(tx, tz) || 1;
    const nx = -tz / tl, nz = tx / tl;
    const lateral = (x - p.x) * nx + (z - p.z) * nz;
    const index = this.firstId + best;
    this.lastHint = index;
    return { index, s, lateral, distance: Math.abs(lateral) };
  }

  public queryWalls(x: number, z: number, radius: number, out: Segment[] = []): Segment[] {
    out.length = 0;
    const i = this.nearestLocalIndex(x, z, this.lastHint);
    const reach = Math.ceil(radius / this.spacing) + 1;
    const lo = Math.max(0, i - reach);
    const hi = Math.min(this.wallsLeft.length - 1, i + reach);
    for (let k = lo; k <= hi; k++) {
      out.push(this.wallsLeft[k], this.wallsRight[k]);
    }
    return out;
  }
}

/** Wall segment a→b whose normal points toward the road. `roadSide` +1 = road on the right of a→b. */
function wallSegment(a: Vec2, b: Vec2, roadSide: 1 | -1): Segment {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  const tx = dx / len, tz = dz / len;
  // right normal of the direction = (-tz, tx)
  return { ax: a.x, az: a.z, bx: b.x, bz: b.z, nx: -tz * roadSide, nz: tx * roadSide };
}

function project(x: number, z: number, a: SplineSample, b: SplineSample) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len2 = dx * dx + dz * dz || 1;
  let t = ((x - a.x) * dx + (z - a.z) * dz) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = a.x + dx * t, pz = a.z + dz * t;
  return { t, x: px, z: pz, d2: (x - px) ** 2 + (z - pz) ** 2 };
}
