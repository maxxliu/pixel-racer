/**
 * Procedural track generation.
 *
 * A track is a closed radial loop: r(θ) = R · (1 + Σ aₖ · sin(kθ + φₖ)) with a
 * few low harmonics, plus an optional "pinch" that turns one lobe into a
 * hairpin. Radial loops never self-intersect as long as r stays positive, so
 * generation is reliable; difficulty controls how wild the harmonics get.
 */
import type { TrackWaypoint } from '@/lib/game/types';
import type { Point2D } from './TrackGeometryUtils';
import { validateTrack } from './TrackValidator';
import { assignTrackProperties, resamplePath, laplacianSmooth } from './PathProcessor';

export type GenerationDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

export interface GenerationOptions {
  /** Approximate half-extent of the track in metres (default 200). */
  worldSize?: number;
  difficulty?: GenerationDifficulty;
  maxAttempts?: number;
  /** Seeded randomness for reproducible tracks. */
  seed?: number;
}

interface DifficultyProfile {
  harmonics: number;
  amplitude: number;
  pinch: number;
  spacing: number;
}

const PROFILES: Record<GenerationDifficulty, DifficultyProfile> = {
  easy:   { harmonics: 2, amplitude: 0.14, pinch: 0.0, spacing: 8 },
  medium: { harmonics: 3, amplitude: 0.2,  pinch: 0.25, spacing: 7 },
  hard:   { harmonics: 4, amplitude: 0.26, pinch: 0.4, spacing: 6 },
  expert: { harmonics: 5, amplitude: 0.3,  pinch: 0.55, spacing: 6 },
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function radialLoop(rand: () => number, profile: DifficultyProfile, worldSize: number, amplitudeScale: number): Point2D[] {
  const R = worldSize * 0.42;
  const harmonics: { k: number; a: number; phi: number }[] = [];
  for (let k = 2; k <= profile.harmonics + 1; k++) {
    harmonics.push({ k, a: (profile.amplitude * amplitudeScale * (0.5 + rand() * 0.5)) / (k - 1), phi: rand() * Math.PI * 2 });
  }
  const pinchAt = rand() * Math.PI * 2;
  const pinch = profile.pinch * amplitudeScale;
  const squash = 0.7 + rand() * 0.3; // slight ellipse
  const n = 240;
  const pts: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    let r = 1;
    for (const h of harmonics) r += h.a * Math.sin(h.k * th + h.phi);
    // a smooth inward notch: bell curve around pinchAt
    let d = Math.abs(((th - pinchAt + Math.PI) % (Math.PI * 2)) - Math.PI);
    d = Math.min(d, Math.PI * 2 - d);
    r -= pinch * Math.exp(-(d * d) / 0.18);
    r = Math.max(0.3, r);
    pts.push({ x: Math.cos(th) * R * r, z: Math.sin(th) * R * r * squash });
  }
  return pts;
}

export function generateTrack(options: GenerationOptions = {}): TrackWaypoint[] | null {
  const worldSize = options.worldSize ?? 200;
  const difficulty = options.difficulty ?? 'medium';
  const maxAttempts = options.maxAttempts ?? 12;
  const rand = mulberry32(options.seed ?? Math.floor(Math.random() * 2 ** 31));
  const profile = PROFILES[difficulty];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Each retry tones the shape down a little so it converges on something valid.
    const scale = 1 - attempt * 0.07;
    let pts = radialLoop(rand, profile, worldSize, scale);
    pts = resamplePath(pts, profile.spacing, true);
    pts = laplacianSmooth(pts, true, 0.25);
    const waypoints = assignTrackProperties(pts);
    const v = validateTrack(pts, waypoints.map((w) => w.width));
    if (v.isValid) return waypoints;
  }
  return null;
}

/** Simple oval; always valid. */
export function generateOvalTrack(worldSize = 200, aspectRatio = 1.5): TrackWaypoint[] {
  const points: Point2D[] = [];
  const numPoints = 64;
  const radiusX = worldSize * 0.4 * aspectRatio;
  const radiusZ = worldSize * 0.4;
  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    points.push({ x: Math.cos(angle) * radiusX, z: Math.sin(angle) * radiusZ });
  }
  return assignTrackProperties(points);
}
