/**
 * Obstacles on the streaming road: hand-designed patterns gated by difficulty
 * band, placed with fairness rules (a guaranteed clear lane, reaction-distance
 * spacing, no blind corners early, rest beats), plus collision, near-miss and
 * clean-pass detection against the player car.
 */
import type { ArcadeCar } from '../ArcadeCar';
import { CAR_TUNING } from '../ArcadeCar';
import { mulberry32 } from '@/lib/utils/rng';
import type { StreamTrack, StreamChunk } from './StreamTrack';
import { ENDLESS_TUNING, type EndlessTuning } from './tuning';

export type ObstacleKind = 'cones' | 'block' | 'oil' | 'boost';

export interface ObstacleSpec {
  radius: number;
  /** Fraction of speed removed on contact (solid kinds). */
  loss: number;
  /** Counts as a hazard: takes lane space, can be hit, can be near-missed. */
  solid: boolean;
  /** Physically blocks the car (blocks) rather than just bleeding speed (cones). */
  bounce: boolean;
}

export const OBSTACLE_SPECS: Record<ObstacleKind, ObstacleSpec> = {
  cones: { radius: 0.9, loss: 0.15, solid: true, bounce: false },
  block: { radius: 1.5, loss: 0.45, solid: true, bounce: true },
  oil: { radius: 2.2, loss: 0, solid: false, bounce: false },
  boost: { radius: 1.6, loss: 0, solid: false, bounce: false },
};

export interface Obstacle {
  id: number;
  kind: ObstacleKind;
  s: number;
  lateral: number;
  x: number;
  z: number;
  heading: number;
  radius: number;
  alive: boolean;
  hit: boolean;
  passed: boolean;
  patternId: number;
  /** Closest surface-to-surface approach of the player so far. */
  minClearance: number;
  /** Player speed at the closest approach. */
  speedAtClosest: number;
  chunkId: number;
}

export type ObstacleEvent =
  | { type: 'spawn'; obstacle: Obstacle }
  | { type: 'remove'; obstacle: Obstacle }
  | { type: 'hit'; obstacle: Obstacle; impact: number }
  | { type: 'smash'; obstacle: Obstacle }
  | { type: 'nearMiss'; obstacle: Obstacle; clearance: number }
  | { type: 'oil'; obstacle: Obstacle }
  | { type: 'boost'; obstacle: Obstacle }
  | { type: 'patternClear'; patternId: number; name: string };

/** One obstacle of a pattern: offset along the road and lateral as a fraction of half width (or metres from a wall). */
interface PatternItem {
  kind: ObstacleKind;
  ds: number;
  /** Lateral in half-width fractions, -1 = left edge, 1 = right edge. */
  lat?: number;
  /** Lateral as metres inset from the left (-) or right (+) wall edge of the asphalt. */
  edge?: number;
}

export interface PatternDef {
  name: string;
  minBand: number;
  length: number;
  items: PatternItem[];
  /** Mirrorable left/right. */
  mirror?: boolean;
  weight: number;
}

export const PATTERNS: PatternDef[] = [
  { name: 'cone-single', minBand: 0, length: 4, weight: 1.2, mirror: true, items: [{ kind: 'cones', ds: 0, lat: 0.45 }] },
  { name: 'cone-centre', minBand: 0, length: 4, weight: 0.8, items: [{ kind: 'cones', ds: 0, lat: 0 }] },
  { name: 'cone-line', minBand: 0, length: 14, weight: 1, mirror: true, items: [{ kind: 'cones', ds: 0, lat: 0.5 }, { kind: 'cones', ds: 5, lat: 0.5 }, { kind: 'cones', ds: 10, lat: 0.5 }] },
  { name: 'cone-diagonal', minBand: 1, length: 22, weight: 1, mirror: true, items: [{ kind: 'cones', ds: 0, lat: -0.6 }, { kind: 'cones', ds: 6, lat: -0.2 }, { kind: 'cones', ds: 12, lat: 0.2 }, { kind: 'cones', ds: 18, lat: 0.6 }] },
  { name: 'block-side', minBand: 1, length: 4, weight: 1.2, mirror: true, items: [{ kind: 'block', ds: 0, lat: 0.5 }] },
  { name: 'block-centre', minBand: 1, length: 4, weight: 0.8, items: [{ kind: 'block', ds: 0, lat: 0 }] },
  { name: 'gate', minBand: 1, length: 4, weight: 1.2, items: [{ kind: 'block', ds: 0, edge: -1.5 }, { kind: 'block', ds: 0, edge: 1.5 }] },
  { name: 'offset-gate', minBand: 2, length: 4, weight: 1, mirror: true, items: [{ kind: 'block', ds: 0, edge: -1.5 }, { kind: 'block', ds: 0, lat: 0.15 }] },
  { name: 'wide-block', minBand: 2, length: 4, weight: 0.9, mirror: true, items: [{ kind: 'block', ds: 0, edge: -1.5 }, { kind: 'block', ds: 0, edge: -4.5 }] },
  { name: 'slalom', minBand: 2, length: 48, weight: 1, mirror: true, items: [{ kind: 'block', ds: 0, lat: -0.4 }, { kind: 'block', ds: 22, lat: 0.4 }, { kind: 'block', ds: 44, lat: -0.4 }] },
  { name: 'oil-gate', minBand: 2, length: 22, weight: 0.9, items: [{ kind: 'oil', ds: 0, lat: 0 }, { kind: 'block', ds: 18, edge: -1.5 }, { kind: 'block', ds: 18, edge: 1.5 }] },
  { name: 'pincer-cones', minBand: 3, length: 12, weight: 1, items: [{ kind: 'cones', ds: 0, edge: -0.9 }, { kind: 'cones', ds: 0, edge: 0.9 }, { kind: 'cones', ds: 8, lat: 0 }] },
  { name: 'boost-gate', minBand: 3, length: 14, weight: 0.8, items: [{ kind: 'block', ds: 0, edge: -1.5 }, { kind: 'block', ds: 0, edge: 1.5 }, { kind: 'boost', ds: 10, lat: 0 }] },
  { name: 'double-gate', minBand: 4, length: 30, weight: 1, mirror: true, items: [{ kind: 'block', ds: 0, edge: -1.5 }, { kind: 'block', ds: 0, lat: 0.15 }, { kind: 'block', ds: 26, edge: 1.5 }, { kind: 'block', ds: 26, lat: -0.15 }] },
];

const CAR_HALF = CAR_TUNING.bodyRadius; // half the car's width, near enough
const ROW_GROUP = 6; // items within this many metres along the road share a row
const APPROACH = 7; // clearance is tracked within this distance along the road

interface PatternState {
  name: string;
  total: number;
  passed: number;
  hit: boolean;
  done: boolean;
}

export class ObstacleField {
  public readonly obstacles: Obstacle[] = [];
  private readonly rand: () => number;
  private listeners: ((e: ObstacleEvent) => void)[] = [];
  private nextId = 1;
  private nextPatternId = 1;
  private nextPatternS: number;
  private nextBoostS: number;
  private slot = 0;
  private recent: string[] = [];
  private readonly patterns = new Map<number, PatternState>();
  /** Index of the first obstacle that could still interact with the player. */
  private head = 0;
  /** Placement runs one chunk behind the newest so patterns may overflow into it. */
  private pendingChunk: StreamChunk | null = null;

  constructor(private readonly track: StreamTrack, seed: number, private readonly t: EndlessTuning = ENDLESS_TUNING) {
    this.rand = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    this.nextPatternS = t.quietStart;
    this.nextBoostS = t.boostCadence * 0.6;
  }

  public on(listener: (e: ObstacleEvent) => void): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter((l) => l !== listener); };
  }

  private emit(e: ObstacleEvent): void {
    for (const l of this.listeners) l(e);
  }

  // ------------------------------------------------------------------ placement

  private spacing(band: number): number {
    const T = this.t;
    const b = Math.min(band, T.patternSpacing.length - 1);
    return Math.max(T.patternSpacing[b], T.reactionTime * T.expectedSpeed[b] + T.reactionBase);
  }

  private maxCurvature(s0: number, s1: number): number {
    const from = Math.max(this.track.firstS, s0);
    return this.track.maxCurvatureAhead(from, Math.max(0, s1 - from));
  }

  private minHalfWidth(s0: number, s1: number): number {
    let hw = Infinity;
    for (let s = s0; s <= s1 + 1e-6; s += this.t.spacing) hw = Math.min(hw, this.track.sampleAt(s).width / 2);
    return hw;
  }

  private pickPattern(band: number): PatternDef | null {
    const pool = PATTERNS.filter((p) => p.minBand <= band && !this.recent.includes(p.name));
    if (!pool.length) return null;
    const total = pool.reduce((a, p) => a + p.weight, 0);
    let r = this.rand() * total;
    for (const p of pool) { r -= p.weight; if (r <= 0) return p; }
    return pool[pool.length - 1];
  }

  /** Concrete lateral positions for a pattern at a given half width; null if it can't be placed fairly. */
  private layout(p: PatternDef, hw: number, mirror: boolean): { kind: ObstacleKind; ds: number; lateral: number }[] | null {
    const T = this.t;
    const out: { kind: ObstacleKind; ds: number; lateral: number }[] = [];
    for (const it of p.items) {
      const r = OBSTACLE_SPECS[it.kind].radius;
      let lateral: number;
      if (it.edge !== undefined) lateral = it.edge < 0 ? -hw - it.edge : hw - it.edge; // edge: metres inset from that edge
      else lateral = (it.lat ?? 0) * (hw - r - 0.3);
      if (mirror) lateral = -lateral;
      // keep every obstacle on the asphalt
      lateral = Math.max(-hw + r, Math.min(hw - r, lateral));
      out.push({ kind: it.kind, ds: it.ds, lateral });
    }
    // every row of solid obstacles must leave a clear lane
    const rows = new Map<number, { lo: number; hi: number }[]>();
    for (const o of out) {
      if (!OBSTACLE_SPECS[o.kind].solid) continue;
      const key = Math.round(o.ds / ROW_GROUP);
      const r = OBSTACLE_SPECS[o.kind].radius;
      const list = rows.get(key) ?? [];
      list.push({ lo: o.lateral - r, hi: o.lateral + r });
      rows.set(key, list);
    }
    for (const spans of rows.values()) {
      spans.sort((a, b) => a.lo - b.lo);
      let cursor = -hw;
      let best = 0;
      for (const sp of spans) {
        best = Math.max(best, sp.lo - cursor);
        cursor = Math.max(cursor, sp.hi);
      }
      best = Math.max(best, hw - cursor);
      if (best < T.clearLane) return null;
    }
    return out;
  }

  private place(kind: ObstacleKind, s: number, lateral: number, patternId: number, chunkId: number): Obstacle {
    const p = this.track.sampleAt(s);
    const o: Obstacle = {
      id: this.nextId++, kind, s, lateral,
      x: p.x + p.nx * lateral, z: p.z + p.nz * lateral,
      heading: Math.atan2(p.tx, p.tz),
      radius: OBSTACLE_SPECS[kind].radius,
      alive: true, hit: false, passed: false, patternId,
      minClearance: Infinity, speedAtClosest: 0, chunkId,
    };
    this.obstacles.push(o);
    this.emit({ type: 'spawn', obstacle: o });
    return o;
  }

  /** Called for every new chunk of road. Lays out the previous chunk, which may spill into this one. */
  public populate(chunk: StreamChunk): void {
    const prev = this.pendingChunk;
    this.pendingChunk = chunk;
    if (prev) this.placeRange(prev, chunk.sEnd);
  }

  private placeRange(chunk: StreamChunk, limit: number): void {
    const T = this.t;
    const band = chunk.band;
    let s = Math.max(this.nextPatternS, chunk.sStart);
    while (s < chunk.sEnd) {
      // standalone boost pads on a fixed cadence, away from patterns
      if (s >= this.nextBoostS) {
        const hw = this.track.sampleAt(s).width / 2;
        const lat = (this.rand() - 0.5) * (hw - 2.5) * 2 * 0.6;
        const pid = this.nextPatternId++;
        this.place('boost', s, lat, pid, chunk.id);
        this.nextBoostS = s + T.boostCadence * (0.8 + this.rand() * 0.4);
        s += 20;
        continue;
      }
      const rest = band >= 3 && this.slot % T.restEvery === T.restEvery - 1;
      let placed = false;
      if (!rest) {
        for (let attempt = 0; attempt < 4 && !placed; attempt++) {
          const p = this.pickPattern(band);
          if (!p) break;
          const end = s + p.length;
          if (end > limit) continue;
          const kLimit = band < T.cornerBand ? T.blindCurvature : 0.045;
          if (this.maxCurvature(s - 60, end) > kLimit) break; // wait for a fairer stretch
          const hw = this.minHalfWidth(s, end);
          const mirror = !!p.mirror && this.rand() < 0.5;
          const items = this.layout(p, hw, mirror);
          if (!items) continue;
          const pid = this.nextPatternId++;
          const solid = items.filter((i) => OBSTACLE_SPECS[i.kind].solid).length;
          this.patterns.set(pid, { name: p.name, total: solid, passed: 0, hit: false, done: solid === 0 });
          for (const it of items) this.place(it.kind, s + it.ds, it.lateral, pid, chunk.id);
          this.recent.push(p.name);
          if (this.recent.length > 2) this.recent.shift();
          this.nextPatternS = end + this.spacing(band) + this.rand() * 16;
          this.slot++;
          placed = true;
        }
      }
      if (!placed) {
        // a rest beat costs one spacing; a corner or a tight width just nudges forward
        if (rest) { this.slot++; this.nextPatternS = s + this.spacing(band) * 0.8; }
        else this.nextPatternS = s + 10;
      }
      s = this.nextPatternS;
    }
  }

  /** Drop everything that lived on a retired chunk. */
  public retire(chunk: StreamChunk): void {
    let removed = 0;
    for (let i = 0; i < this.obstacles.length; i++) {
      const o = this.obstacles[i];
      if (o.chunkId > chunk.id) break;
      this.emit({ type: 'remove', obstacle: o });
      removed++;
    }
    if (removed) {
      this.obstacles.splice(0, removed);
      this.head = Math.max(0, this.head - removed);
    }
  }

  public reset(): void {
    for (const o of this.obstacles) this.emit({ type: 'remove', obstacle: o });
    this.obstacles.length = 0;
    this.patterns.clear();
    this.head = 0;
    this.slot = 0;
    this.recent = [];
    this.pendingChunk = null;
    this.nextPatternS = this.t.quietStart;
    this.nextBoostS = this.t.boostCadence * 0.6;
  }

  // ------------------------------------------------------------------ simulation

  /** Obstacles whose road position is within `range` of `s`. */
  public near(s: number, range: number): Obstacle[] {
    return this.obstacles.filter((o) => o.alive && Math.abs(o.s - s) < range);
  }

  /** A non-player thing (the rival) ran over an obstacle: it just breaks. */
  public smash(o: Obstacle): void {
    if (!o.alive) return;
    o.alive = false;
    this.emit({ type: 'smash', obstacle: o });
  }

  /** Resolve the player's interaction with nearby obstacles for one physics step. */
  public step(car: ArcadeCar): void {
    const T = this.t;
    const cs = car.splineS;
    // advance the head past obstacles that are well behind the car
    while (this.head < this.obstacles.length && this.obstacles[this.head].s < cs - 12) this.head++;
    for (let i = this.head; i < this.obstacles.length; i++) {
      const o = this.obstacles[i];
      if (o.s > cs + 12) break;
      if (!o.alive && o.kind !== 'block') continue;
      const spec = OBSTACLE_SPECS[o.kind];
      const along = cs - o.s;
      const dist = Math.hypot(car.x - o.x, car.z - o.z);

      if (!o.passed && Math.abs(along) < APPROACH) {
        const clearance = dist - o.radius - CAR_HALF;
        if (clearance < o.minClearance) { o.minClearance = clearance; o.speedAtClosest = car.speed; }
      }

      if (spec.solid && o.alive && dist < o.radius + CAR_TUNING.bodyRadius + CAR_TUNING.axleOffset) {
        const impact = car.collideCircle(o.x, o.z, o.radius, spec.loss, o.kind, spec.bounce);
        if (impact > 0.5 && !o.hit) {
          o.hit = true;
          if (o.kind === 'cones') o.alive = false;
          const ps = this.patterns.get(o.patternId);
          if (ps) ps.hit = true;
          this.emit({ type: 'hit', obstacle: o, impact });
        }
      } else if (o.kind === 'oil' && o.alive && dist < o.radius + 0.6) {
        if (car.slickTime <= 0.2) {
          car.slickTime = 1.2;
          this.emit({ type: 'oil', obstacle: o });
        }
      } else if (o.kind === 'boost' && o.alive && dist < o.radius + 1.0) {
        o.alive = false;
        car.giveBoost(1, 0.9);
        this.emit({ type: 'boost', obstacle: o });
      }

      if (!o.passed && along > o.radius + 2.5) {
        o.passed = true;
        if (spec.solid) {
          if (!o.hit && o.minClearance < T.nearMissDistance && o.speedAtClosest > T.nearMissSpeed) {
            this.emit({ type: 'nearMiss', obstacle: o, clearance: o.minClearance });
          }
          const ps = this.patterns.get(o.patternId);
          if (ps && !ps.done) {
            ps.passed++;
            if (ps.passed >= ps.total) {
              ps.done = true;
              if (!ps.hit) this.emit({ type: 'patternClear', patternId: o.patternId, name: ps.name });
              this.patterns.delete(o.patternId);
            }
          }
        }
      }
    }
  }
}
