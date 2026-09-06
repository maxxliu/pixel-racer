import type { Segment } from './Collision';

/** One resampled point of a road centreline. */
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
  /** Sample id: an array index on a closed loop, a global monotonic id on a stream. */
  index: number;
  s: number;
  /** Signed lateral offset from centreline, positive = right of travel. */
  lateral: number;
  /** Distance to the centreline (abs lateral). */
  distance: number;
}

export type Surface = 'asphalt' | 'kerb' | 'grass';

export const KERB_WIDTH = 1.2;
export const WALL_OFFSET = 2.6; // from asphalt edge to wall face
export const KERB_CURVATURE = 0.011; // radius < ~90m gets kerbs

/**
 * What a car needs from the road it drives on. Implemented by the closed-loop
 * `TrackSpline` and by the forward-only `StreamTrack` of the endless mode.
 */
export interface Road {
  nearest(x: number, z: number, hint?: number): NearestResult;
  sampleAt(s: number): SplineSample;
  halfWidthAt(index: number): number;
  surfaceAt(index: number, lateral: number): Surface;
  hasKerb(index: number): boolean;
  headingAt(s: number): number;
  /** Wall segments that could touch a circle at (x, z). May contain duplicates. */
  queryWalls(x: number, z: number, radius: number, out?: Segment[]): Segment[];
}
