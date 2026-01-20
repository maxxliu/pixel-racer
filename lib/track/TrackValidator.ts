/**
 * Track Validator
 * Validates tracks for playability (closed loop, no self-intersection, minimum requirements)
 */

import {
  Point2D,
  distance,
  segmentsIntersect,
  calculatePathLength,
  calculateBounds
} from './TrackGeometryUtils';
import { analyzeTrackCurvature, estimateDifficulty } from './CurvatureAnalyzer';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  stats: TrackStats;
}

export interface ValidationError {
  type: 'self_intersection' | 'too_short' | 'too_few_points' | 'not_closed' | 'too_narrow' | 'invalid_geometry';
  message: string;
  location?: Point2D;
}

export interface ValidationWarning {
  type: 'very_tight_turn' | 'too_long' | 'asymmetric' | 'no_straights';
  message: string;
  location?: Point2D;
}

export interface TrackStats {
  length: number;           // Total track length in meters
  pointCount: number;       // Number of waypoints
  turnCount: number;        // Number of significant turns
  avgWidth: number;         // Average track width
  minWidth: number;         // Minimum track width
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  bounds: { width: number; height: number };
  isClosed: boolean;
}

// Validation constants
const MIN_TRACK_LENGTH = 200;        // Minimum 200m track
const MAX_TRACK_LENGTH = 5000;       // Maximum 5km track
const MIN_POINT_COUNT = 8;           // Minimum waypoints
const MAX_CLOSURE_DISTANCE = 20;     // Max distance for auto-closure (meters)
const MIN_SEGMENT_LENGTH = 4;        // Minimum distance between waypoints (with tolerance for resampling)
const MIN_TRACK_WIDTH = 8;           // Absolute minimum width
const INTERSECTION_SKIP_COUNT = 2;   // Skip adjacent segments when checking

/**
 * Full track validation
 */
export function validateTrack(points: Point2D[], widths?: number[]): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Basic checks
  if (points.length < MIN_POINT_COUNT) {
    errors.push({
      type: 'too_few_points',
      message: `Track needs at least ${MIN_POINT_COUNT} waypoints (has ${points.length})`
    });
  }

  // Check if closed
  const closureDistance = points.length >= 2
    ? distance(points[0], points[points.length - 1])
    : Infinity;
  const isClosed = closureDistance <= MAX_CLOSURE_DISTANCE;

  if (!isClosed) {
    errors.push({
      type: 'not_closed',
      message: `Track is not closed. Gap distance: ${closureDistance.toFixed(1)}m (max: ${MAX_CLOSURE_DISTANCE}m)`,
      location: points[points.length - 1]
    });
  }

  // Check track length
  const length = calculatePathLength(points, isClosed);
  if (length < MIN_TRACK_LENGTH) {
    errors.push({
      type: 'too_short',
      message: `Track is too short: ${length.toFixed(0)}m (min: ${MIN_TRACK_LENGTH}m)`
    });
  }
  if (length > MAX_TRACK_LENGTH) {
    warnings.push({
      type: 'too_long',
      message: `Track is very long: ${length.toFixed(0)}m. Consider simplifying.`
    });
  }

  // Check for self-intersection
  const intersections = findSelfIntersections(points, isClosed);
  for (const intersection of intersections) {
    errors.push({
      type: 'self_intersection',
      message: `Track intersects itself`,
      location: intersection
    });
  }

  // Check segment lengths
  for (let i = 0; i < points.length - 1; i++) {
    const segLength = distance(points[i], points[i + 1]);
    if (segLength < MIN_SEGMENT_LENGTH) {
      errors.push({
        type: 'invalid_geometry',
        message: `Segment ${i} is too short (${segLength.toFixed(1)}m)`,
        location: points[i]
      });
    }
  }

  // Check widths if provided
  if (widths && widths.length > 0) {
    const minWidth = Math.min(...widths);
    if (minWidth < MIN_TRACK_WIDTH) {
      errors.push({
        type: 'too_narrow',
        message: `Track is too narrow at some points: ${minWidth.toFixed(1)}m (min: ${MIN_TRACK_WIDTH}m)`
      });
    }
  }

  // Analyze curvature for warnings and stats
  const curvatureData = analyzeTrackCurvature(points);
  const hairpinCount = curvatureData.filter(c => c.turnType === 'hairpin').length;
  const straightCount = curvatureData.filter(c => c.turnType === 'straight').length;
  const turnCount = curvatureData.filter(c => c.turnType !== 'straight').length;

  if (hairpinCount > points.length * 0.3) {
    warnings.push({
      type: 'very_tight_turn',
      message: `Track has many very tight turns (${hairpinCount}). May be difficult to drive.`
    });
  }

  if (straightCount === 0 && points.length > 10) {
    warnings.push({
      type: 'no_straights',
      message: 'Track has no straight sections. Consider adding some for variety.'
    });
  }

  // Calculate stats
  const bounds = calculateBounds(points);
  const avgWidth = widths && widths.length > 0
    ? widths.reduce((a, b) => a + b, 0) / widths.length
    : 14;
  const minWidth = widths && widths.length > 0
    ? Math.min(...widths)
    : 14;

  const stats: TrackStats = {
    length,
    pointCount: points.length,
    turnCount: Math.round(turnCount / 5), // Approximate number of distinct turns
    avgWidth,
    minWidth,
    difficulty: estimateDifficulty(points),
    bounds: { width: bounds.width, height: bounds.height },
    isClosed
  };

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    stats
  };
}

/**
 * Find self-intersection points
 */
export function findSelfIntersections(points: Point2D[], closed: boolean = true): Point2D[] {
  const intersections: Point2D[] = [];
  const n = points.length;

  // Check each pair of non-adjacent segments
  for (let i = 0; i < n - 1; i++) {
    const seg1 = { start: points[i], end: points[i + 1] };

    // Start checking from segments that are not adjacent
    const startJ = i + INTERSECTION_SKIP_COUNT + 1;
    const endJ = closed ? n : n - 1;

    for (let j = startJ; j < endJ; j++) {
      const nextJ = j === n - 1 && closed ? 0 : j + 1;

      // Skip if this would check adjacent segments (for closed loops)
      if (closed && i === 0 && j === n - 1) continue;

      if (nextJ >= n && !closed) continue;

      const seg2 = { start: points[j], end: points[nextJ] };

      if (segmentsIntersect(seg1, seg2)) {
        // Calculate approximate intersection point
        const midX = (seg1.start.x + seg1.end.x + seg2.start.x + seg2.end.x) / 4;
        const midZ = (seg1.start.z + seg1.end.z + seg2.start.z + seg2.end.z) / 4;
        intersections.push({ x: midX, z: midZ });
      }
    }
  }

  return intersections;
}

/**
 * Quick check if track has self-intersections
 */
export function hasSelfIntersections(points: Point2D[], closed: boolean = true): boolean {
  return findSelfIntersections(points, closed).length > 0;
}

/**
 * Check if a new point would cause self-intersection
 */
export function wouldCauseIntersection(
  existingPoints: Point2D[],
  newPoint: Point2D,
  closed: boolean = false
): boolean {
  if (existingPoints.length < 2) return false;

  const lastPoint = existingPoints[existingPoints.length - 1];
  const newSegment = { start: lastPoint, end: newPoint };

  // Check against all existing segments except the last one (adjacent)
  for (let i = 0; i < existingPoints.length - 2; i++) {
    const seg = { start: existingPoints[i], end: existingPoints[i + 1] };
    if (segmentsIntersect(newSegment, seg)) {
      return true;
    }
  }

  // If closing the loop, check the closing segment too
  if (closed && existingPoints.length >= 3) {
    const closingSegment = { start: newPoint, end: existingPoints[0] };
    for (let i = 1; i < existingPoints.length - 2; i++) {
      const seg = { start: existingPoints[i], end: existingPoints[i + 1] };
      if (segmentsIntersect(closingSegment, seg)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if track can be auto-closed
 */
export function canAutoClose(points: Point2D[]): boolean {
  if (points.length < MIN_POINT_COUNT - 1) return false;

  const closureDistance = distance(points[0], points[points.length - 1]);
  if (closureDistance > MAX_CLOSURE_DISTANCE) return false;

  // Check if closing would cause intersection
  return !wouldCauseIntersection(points.slice(1), points[0], false);
}

/**
 * Suggest fixes for common issues
 */
export function suggestFixes(validation: ValidationResult): string[] {
  const suggestions: string[] = [];

  for (const error of validation.errors) {
    switch (error.type) {
      case 'too_short':
        suggestions.push('Draw a longer track path');
        break;
      case 'too_few_points':
        suggestions.push('Add more detail to your track');
        break;
      case 'not_closed':
        suggestions.push('Bring the end of the track closer to the start');
        break;
      case 'self_intersection':
        suggestions.push('Avoid crossing over the track path');
        break;
      case 'too_narrow':
        suggestions.push('Widen the tight sections of the track');
        break;
    }
  }

  return [...new Set(suggestions)]; // Remove duplicates
}
