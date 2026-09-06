/**
 * Seeded generator of a forward-only road: straights, sweepers, corners and
 * chicanes emitted as arc-length samples with clothoid-like curvature ramps.
 *
 * Self-intersection is impossible by construction: the heading is confined to a
 * cone around +Z, so z increases monotonically and any two stretches of road are
 * far apart in z. That is what lets the stream track find the nearest sample with
 * a local walk instead of a spatial hash.
 */
import type { SplineSample } from '../Road';
import { mulberry32 } from '@/lib/utils/rng';
import { ENDLESS_TUNING, bandAt, smoothstep, type EndlessTuning } from './tuning';

export type SegmentKind = 'straight' | 'sweeper' | 'corner' | 'chicane';

export interface GeneratedChunk {
  /** Samples continuing from the previous chunk (the previous last sample is not repeated). */
  samples: SplineSample[];
  band: number;
  kind: SegmentKind;
  sStart: number;
  sEnd: number;
}

interface BandProfile {
  weights: Record<SegmentKind, number>;
  sweeperRadius: [number, number];
  sweeperAngle: [number, number];
  cornerRadius: [number, number];
  cornerAngle: [number, number];
  straight: [number, number];
  width: [number, number];
}

const DEG = Math.PI / 180;

const BANDS: BandProfile[] = [
  { weights: { straight: 0.5, sweeper: 0.5, corner: 0, chicane: 0 }, sweeperRadius: [110, 220], sweeperAngle: [20 * DEG, 50 * DEG], cornerRadius: [60, 80], cornerAngle: [40 * DEG, 70 * DEG], straight: [50, 120], width: [15, 18] },
  { weights: { straight: 0.35, sweeper: 0.4, corner: 0.25, chicane: 0 }, sweeperRadius: [100, 200], sweeperAngle: [25 * DEG, 60 * DEG], cornerRadius: [50, 75], cornerAngle: [40 * DEG, 90 * DEG], straight: [45, 110], width: [13.5, 17] },
  { weights: { straight: 0.3, sweeper: 0.3, corner: 0.25, chicane: 0.15 }, sweeperRadius: [90, 180], sweeperAngle: [25 * DEG, 60 * DEG], cornerRadius: [40, 65], cornerAngle: [45 * DEG, 100 * DEG], straight: [40, 100], width: [12.5, 16] },
  { weights: { straight: 0.25, sweeper: 0.25, corner: 0.3, chicane: 0.2 }, sweeperRadius: [90, 170], sweeperAngle: [30 * DEG, 60 * DEG], cornerRadius: [34, 55], cornerAngle: [50 * DEG, 110 * DEG], straight: [40, 90], width: [11.5, 15] },
  { weights: { straight: 0.2, sweeper: 0.2, corner: 0.35, chicane: 0.25 }, sweeperRadius: [90, 160], sweeperAngle: [30 * DEG, 60 * DEG], cornerRadius: [32, 50], cornerAngle: [50 * DEG, 110 * DEG], straight: [40, 80], width: [10.5, 14] },
];

/** A piece of curvature programme: κ ramps 0→k over `ramp`, holds for `hold`, ramps back. */
interface Piece {
  k: number;
  ramp: number;
  hold: number;
}

function pieceLength(p: Piece): number {
  return p.ramp * 2 + p.hold;
}

function pieceCurvature(p: Piece, u: number): number {
  if (p.k === 0) return 0;
  if (u < p.ramp) return (p.k * u) / p.ramp;
  if (u < p.ramp + p.hold) return p.k;
  const v = pieceLength(p) - u;
  return v <= 0 ? 0 : (p.k * v) / p.ramp;
}

export class SegmentGenerator {
  private readonly rand: () => number;
  private x = 0;
  private z = 0;
  private heading = 0;
  private s = 0;
  private width: number;
  private started = false;
  private lastKinds: SegmentKind[] = [];

  constructor(public readonly seed: number, private readonly t: EndlessTuning = ENDLESS_TUNING) {
    this.rand = mulberry32(seed);
    this.width = t.openingWidth;
  }

  public get distance(): number { return this.s; }

  private range(r: [number, number]): number {
    return r[0] + (r[1] - r[0]) * this.rand();
  }

  private pickKind(p: BandProfile): SegmentKind {
    const kinds = Object.keys(p.weights) as SegmentKind[];
    // no three straights in a row, no three chicanes in a row
    const [a, b] = this.lastKinds.slice(-2);
    const banned = a && a === b ? a : null;
    let total = 0;
    for (const k of kinds) if (k !== banned) total += p.weights[k];
    let r = this.rand() * total;
    for (const k of kinds) {
      if (k === banned) continue;
      r -= p.weights[k];
      if (r <= 0) return k;
    }
    return 'straight';
  }

  /** Turn direction for an arc of `angle`, keeping the heading inside the cone. */
  private pickDirection(angle: number): 1 | -1 {
    const T = this.t;
    let dir: 1 | -1 = this.rand() < 0.5 ? 1 : -1;
    if (Math.abs(this.heading) > T.headingBiasFrom && this.rand() < 0.8) dir = this.heading > 0 ? -1 : 1;
    if (Math.abs(this.heading + dir * angle) > T.headingCone) dir = -dir as 1 | -1;
    return dir;
  }

  private clampAngle(angle: number, dir: number): number {
    // never leave the cone even after the flip
    const T = this.t;
    const room = T.headingCone - 0.02 - dir * this.heading;
    return Math.max(0.1, Math.min(angle, room));
  }

  private arcPieces(radius: number, angle: number, dir: number): Piece[] {
    const T = this.t;
    const ramp = Math.min(this.range([T.rampMin, T.rampMax]), (radius * angle) / 2);
    const k = dir / radius;
    const hold = Math.max(0, radius * angle - ramp);
    return [{ k, ramp, hold }];
  }

  /** Curvature programme for the next segment. */
  private planSegment(band: number): { pieces: Piece[]; kind: SegmentKind; width: number } {
    const T = this.t;
    const p = BANDS[Math.min(band, BANDS.length - 1)];
    if (!this.started) {
      this.started = true;
      return { pieces: [{ k: 0, ramp: 0, hold: T.openingStraight }], kind: 'straight', width: T.openingWidth };
    }
    const kind = this.pickKind(p);
    this.lastKinds.push(kind);
    if (this.lastKinds.length > 4) this.lastKinds.shift();
    const width = this.range(p.width);
    switch (kind) {
      case 'straight':
        return { pieces: [{ k: 0, ramp: 0, hold: this.range(p.straight) }], kind, width };
      case 'sweeper': {
        const radius = this.range(p.sweeperRadius);
        let angle = this.range(p.sweeperAngle);
        const dir = this.pickDirection(angle);
        angle = this.clampAngle(angle, dir);
        return { pieces: this.arcPieces(radius, angle, dir), kind, width };
      }
      case 'corner': {
        const radius = Math.max(T.minRadius, this.range(p.cornerRadius));
        let angle = this.range(p.cornerAngle);
        const dir = this.pickDirection(angle);
        angle = this.clampAngle(angle, dir);
        return { pieces: this.arcPieces(radius, angle, dir), kind, width };
      }
      case 'chicane': {
        const radius = Math.max(T.minRadius, this.range(p.cornerRadius) * 1.1);
        let angle = this.range([35 * DEG, 60 * DEG]);
        const dir = this.pickDirection(angle);
        angle = this.clampAngle(angle, dir);
        const link = { k: 0, ramp: 0, hold: this.range([0, 12]) };
        return { pieces: [...this.arcPieces(radius, angle, dir), link, ...this.arcPieces(radius, angle, -dir)], kind, width };
      }
    }
  }

  /** Generate the next chunk of road. */
  public next(): GeneratedChunk {
    const T = this.t;
    const band = bandAt(this.s, T);
    const plan = this.planSegment(band);
    const total = plan.pieces.reduce((a, p) => a + pieceLength(p), 0);
    const count = Math.max(1, Math.round(total / T.spacing));
    const w0 = this.width;
    const w1 = plan.width;
    const sStart = this.s;
    const samples: SplineSample[] = [];
    if (!samples.length && sStart === 0) {
      samples.push(this.sample(w0, 0));
    }
    const sub = 4; // integration sub-steps per sample
    const ds = T.spacing / sub;
    let u = 0; // distance into this segment
    for (let i = 0; i < count; i++) {
      for (let k = 0; k < sub; k++) {
        const kappa = this.curvatureAt(plan.pieces, u + ds / 2);
        // rotate about the midpoint for second-order accuracy
        const hMid = this.heading + kappa * ds / 2;
        this.x += Math.sin(hMid) * ds;
        this.z += Math.cos(hMid) * ds;
        this.heading += kappa * ds;
        u += ds;
      }
      this.s += T.spacing;
      const width = w0 + (w1 - w0) * smoothstep(u / total);
      samples.push(this.sample(width, this.curvatureAt(plan.pieces, u)));
    }
    this.width = w1;
    return { samples, band, kind: plan.kind, sStart, sEnd: this.s };
  }

  private curvatureAt(pieces: Piece[], u: number): number {
    let acc = 0;
    for (const p of pieces) {
      const len = pieceLength(p);
      if (u < acc + len) return pieceCurvature(p, u - acc);
      acc += len;
    }
    return 0;
  }

  private sample(width: number, curvature: number): SplineSample {
    const tx = Math.sin(this.heading), tz = Math.cos(this.heading);
    return { x: this.x, z: this.z, tx, tz, nx: -tz, nz: tx, width, s: this.s, curvature };
  }
}
