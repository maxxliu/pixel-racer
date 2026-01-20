/**
 * Path Processor
 * Converts raw drawing input into optimized track waypoints
 */

import { Point2D, distance, calculatePathLength } from './TrackGeometryUtils';
import { analyzeTrackCurvature } from './CurvatureAnalyzer';
import type { TrackWaypoint } from '@/lib/game/TrackBuilder';

export interface ProcessingOptions {
  simplificationTolerance?: number;  // Douglas-Peucker tolerance (default: 3m)
  smoothingIterations?: number;      // Laplacian smoothing passes (default: 2)
  minPointSpacing?: number;          // Minimum distance between points (default: 5m)
  autoClose?: boolean;               // Auto-close if endpoints are close (default: true)
  closeThreshold?: number;           // Distance for auto-close (default: 20m)
}

const DEFAULT_OPTIONS: Required<ProcessingOptions> = {
  simplificationTolerance: 3,
  smoothingIterations: 2,
  minPointSpacing: 5,
  autoClose: true,
  closeThreshold: 20
};

/**
 * Main function: Convert raw drawing points to track waypoints
 */
export function processDrawingToWaypoints(
  rawPoints: Point2D[],
  options: ProcessingOptions = {}
): TrackWaypoint[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (rawPoints.length < 3) {
    return [];
  }

  // Step 1: Remove duplicate/too-close points
  let points = filterMinDistance(rawPoints, opts.minPointSpacing / 2);

  // Step 2: Simplify path using Douglas-Peucker
  points = douglasPeucker(points, opts.simplificationTolerance);

  // Step 3: Apply Laplacian smoothing
  for (let i = 0; i < opts.smoothingIterations; i++) {
    points = laplacianSmooth(points, false);
  }

  // Step 4: Auto-close if endpoints are close enough
  if (opts.autoClose) {
    points = tryAutoClose(points, opts.closeThreshold);
  }

  // Step 5: Resample to ensure consistent point spacing
  points = resamplePath(points, opts.minPointSpacing, true);

  // Step 6: Final smoothing pass after resampling
  points = laplacianSmooth(points, true);

  // Step 7: Analyze curvature and assign widths/speed limits
  const waypoints = assignTrackProperties(points);

  return waypoints;
}

/**
 * Filter points that are too close together
 */
export function filterMinDistance(points: Point2D[], minDistance: number): Point2D[] {
  if (points.length === 0) return [];

  const filtered: Point2D[] = [points[0]];

  for (let i = 1; i < points.length; i++) {
    if (distance(points[i], filtered[filtered.length - 1]) >= minDistance) {
      filtered.push(points[i]);
    }
  }

  return filtered;
}

/**
 * Douglas-Peucker path simplification algorithm
 * Reduces number of points while preserving shape
 */
export function douglasPeucker(points: Point2D[], tolerance: number): Point2D[] {
  if (points.length <= 2) return points;

  // Find point with maximum distance from line between first and last
  let maxDist = 0;
  let maxIndex = 0;

  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }

  // If max distance is greater than tolerance, recursively simplify
  if (maxDist > tolerance) {
    const left = douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
    const right = douglasPeucker(points.slice(maxIndex), tolerance);

    // Combine results (avoiding duplicate point at split)
    return [...left.slice(0, -1), ...right];
  }

  // Otherwise, return just endpoints
  return [start, end];
}

/**
 * Calculate perpendicular distance from point to line
 */
function perpendicularDistance(point: Point2D, lineStart: Point2D, lineEnd: Point2D): number {
  const dx = lineEnd.x - lineStart.x;
  const dz = lineEnd.z - lineStart.z;
  const lineLengthSq = dx * dx + dz * dz;

  if (lineLengthSq === 0) {
    return distance(point, lineStart);
  }

  // Project point onto line
  const t = Math.max(0, Math.min(1,
    ((point.x - lineStart.x) * dx + (point.z - lineStart.z) * dz) / lineLengthSq
  ));

  const projection: Point2D = {
    x: lineStart.x + t * dx,
    z: lineStart.z + t * dz
  };

  return distance(point, projection);
}

/**
 * Laplacian smoothing
 * Moves each point toward the average of its neighbors
 */
export function laplacianSmooth(points: Point2D[], closed: boolean, factor: number = 0.25): Point2D[] {
  if (points.length < 3) return points;

  const smoothed: Point2D[] = [];
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const prev = closed ? points[(i - 1 + n) % n] : points[Math.max(0, i - 1)];
    const curr = points[i];
    const next = closed ? points[(i + 1) % n] : points[Math.min(n - 1, i + 1)];

    // Skip first and last points if not closed
    if (!closed && (i === 0 || i === n - 1)) {
      smoothed.push(curr);
      continue;
    }

    // Move toward average of neighbors
    const avgX = (prev.x + next.x) / 2;
    const avgZ = (prev.z + next.z) / 2;

    smoothed.push({
      x: curr.x + (avgX - curr.x) * factor,
      z: curr.z + (avgZ - curr.z) * factor
    });
  }

  return smoothed;
}

/**
 * Catmull-Rom spline smoothing for smoother curves
 */
export function catmullRomSmooth(points: Point2D[], segments: number = 10): Point2D[] {
  if (points.length < 4) return points;

  const result: Point2D[] = [];
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];

    for (let t = 0; t < segments; t++) {
      const s = t / segments;
      result.push(catmullRomPoint(p0, p1, p2, p3, s));
    }
  }

  return result;
}

/**
 * Calculate point on Catmull-Rom spline
 */
function catmullRomPoint(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, t: number): Point2D {
  const t2 = t * t;
  const t3 = t2 * t;

  const x = 0.5 * (
    (2 * p1.x) +
    (-p0.x + p2.x) * t +
    (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
    (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
  );

  const z = 0.5 * (
    (2 * p1.z) +
    (-p0.z + p2.z) * t +
    (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
    (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3
  );

  return { x, z };
}

/**
 * Try to auto-close the path if endpoints are close
 */
export function tryAutoClose(points: Point2D[], threshold: number): Point2D[] {
  if (points.length < 3) return points;

  const closureDistance = distance(points[0], points[points.length - 1]);

  if (closureDistance <= threshold && closureDistance > 0) {
    // Average the endpoints and use that as both start and end
    const avgX = (points[0].x + points[points.length - 1].x) / 2;
    const avgZ = (points[0].z + points[points.length - 1].z) / 2;

    const result = [...points];
    result[0] = { x: avgX, z: avgZ };
    result[result.length - 1] = { x: avgX, z: avgZ };

    return result.slice(0, -1); // Remove duplicate endpoint
  }

  return points;
}

/**
 * Resample path to have consistent point spacing
 */
export function resamplePath(
  points: Point2D[],
  targetSpacing: number,
  closed: boolean = true
): Point2D[] {
  const totalLength = calculatePathLength(points, closed);
  const numPoints = Math.max(8, Math.round(totalLength / targetSpacing));

  const resampled: Point2D[] = [];

  for (let i = 0; i < numPoints; i++) {
    const targetDist = (i / numPoints) * totalLength;
    resampled.push(interpolateAlongPath(points, targetDist, closed));
  }

  return resampled;
}

/**
 * Interpolate along path to find point at target distance
 */
function interpolateAlongPath(points: Point2D[], targetDist: number, closed: boolean): Point2D {
  let accumulatedDist = 0;
  const n = points.length;
  const segments = closed ? n : n - 1;

  for (let i = 0; i < segments; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const segmentLength = distance(p1, p2);

    if (accumulatedDist + segmentLength >= targetDist) {
      const t = (targetDist - accumulatedDist) / segmentLength;
      return {
        x: p1.x + t * (p2.x - p1.x),
        z: p1.z + t * (p2.z - p1.z)
      };
    }

    accumulatedDist += segmentLength;
  }

  return points[0];
}

/**
 * Assign track properties (width, speed limit) based on curvature analysis
 */
export function assignTrackProperties(points: Point2D[]): TrackWaypoint[] {
  const curvatureData = analyzeTrackCurvature(points);

  const waypoints: TrackWaypoint[] = points.map((point, i) => {
    const data = curvatureData[i];

    return {
      x: point.x,
      z: point.z,
      width: data.suggestedWidth,
      speedLimit: data.suggestedSpeed,
      isCheckpoint: false
    };
  });

  // Mark checkpoints at strategic locations (roughly every quarter of track)
  if (waypoints.length >= 4) {
    waypoints[0].isCheckpoint = true;
    const quarter = Math.floor(waypoints.length / 4);
    waypoints[quarter].isCheckpoint = true;
    waypoints[quarter * 2].isCheckpoint = true;
    waypoints[quarter * 3].isCheckpoint = true;
  }

  return waypoints;
}

/**
 * Convert screen coordinates to world coordinates
 */
export function screenToWorld(
  screenX: number,
  screenY: number,
  canvasWidth: number,
  canvasHeight: number,
  worldBounds: { minX: number; maxX: number; minZ: number; maxZ: number }
): Point2D {
  const worldWidth = worldBounds.maxX - worldBounds.minX;
  const worldHeight = worldBounds.maxZ - worldBounds.minZ;

  return {
    x: worldBounds.minX + (screenX / canvasWidth) * worldWidth,
    z: worldBounds.minZ + (screenY / canvasHeight) * worldHeight
  };
}

/**
 * Convert world coordinates to screen coordinates
 */
export function worldToScreen(
  worldX: number,
  worldZ: number,
  canvasWidth: number,
  canvasHeight: number,
  worldBounds: { minX: number; maxX: number; minZ: number; maxZ: number }
): { x: number; y: number } {
  const worldWidth = worldBounds.maxX - worldBounds.minX;
  const worldHeight = worldBounds.maxZ - worldBounds.minZ;

  return {
    x: ((worldX - worldBounds.minX) / worldWidth) * canvasWidth,
    y: ((worldZ - worldBounds.minZ) / worldHeight) * canvasHeight
  };
}
