/**
 * Curvature Analyzer
 * Analyzes track curvature to determine appropriate width and speed limits
 */

import { Point2D, distance, getTangentAtIndex } from './TrackGeometryUtils';

export interface CurvatureData {
  curvature: number;      // Curvature value (higher = tighter turn)
  suggestedWidth: number; // Suggested track width in meters
  suggestedSpeed: number; // Suggested speed limit in km/h
  turnType: 'straight' | 'gentle' | 'medium' | 'tight' | 'hairpin';
}

// Track width constants (in meters)
const MIN_WIDTH = 10;
const MAX_WIDTH = 18;
const STRAIGHT_WIDTH = 18;
const HAIRPIN_WIDTH = 10;

// Speed limit constants (in km/h)
const MAX_SPEED = 180;
const MIN_SPEED = 50;
const HAIRPIN_SPEED = 50;
const TIGHT_SPEED = 80;
const MEDIUM_SPEED = 120;
const GENTLE_SPEED = 150;
const STRAIGHT_SPEED = 180;

// Curvature thresholds
const CURVATURE_STRAIGHT = 0.01;
const CURVATURE_GENTLE = 0.03;
const CURVATURE_MEDIUM = 0.06;
const CURVATURE_TIGHT = 0.1;
// Anything above TIGHT is considered hairpin

/**
 * Calculate curvature at each point in the path
 * Curvature = 1/radius, calculated using three consecutive points
 */
export function calculateCurvature(points: Point2D[], closed: boolean = true): number[] {
  const n = points.length;
  if (n < 3) return new Array(n).fill(0);

  const curvatures: number[] = [];

  for (let i = 0; i < n; i++) {
    const prevIdx = closed ? (i - 1 + n) % n : Math.max(0, i - 1);
    const nextIdx = closed ? (i + 1) % n : Math.min(n - 1, i + 1);

    const p0 = points[prevIdx];
    const p1 = points[i];
    const p2 = points[nextIdx];

    const curvature = calculatePointCurvature(p0, p1, p2);
    curvatures.push(curvature);
  }

  return curvatures;
}

/**
 * Calculate curvature at a single point using Menger curvature formula
 */
function calculatePointCurvature(p0: Point2D, p1: Point2D, p2: Point2D): number {
  const a = distance(p0, p1);
  const b = distance(p1, p2);
  const c = distance(p0, p2);

  if (a < 1e-6 || b < 1e-6 || c < 1e-6) return 0;

  // Calculate area using cross product
  const area = Math.abs(
    (p1.x - p0.x) * (p2.z - p0.z) - (p2.x - p0.x) * (p1.z - p0.z)
  ) / 2;

  // Menger curvature = 4 * area / (a * b * c)
  const curvature = (4 * area) / (a * b * c);
  return curvature;
}

/**
 * Smooth curvature values using a moving average
 */
export function smoothCurvature(curvatures: number[], windowSize: number = 3): number[] {
  const n = curvatures.length;
  const smoothed: number[] = [];
  const halfWindow = Math.floor(windowSize / 2);

  for (let i = 0; i < n; i++) {
    let sum = 0;
    let count = 0;

    for (let j = -halfWindow; j <= halfWindow; j++) {
      const idx = (i + j + n) % n;
      sum += curvatures[idx];
      count++;
    }

    smoothed.push(sum / count);
  }

  return smoothed;
}

/**
 * Classify turn type based on curvature
 */
export function classifyTurnType(curvature: number): CurvatureData['turnType'] {
  if (curvature < CURVATURE_STRAIGHT) return 'straight';
  if (curvature < CURVATURE_GENTLE) return 'gentle';
  if (curvature < CURVATURE_MEDIUM) return 'medium';
  if (curvature < CURVATURE_TIGHT) return 'tight';
  return 'hairpin';
}

/**
 * Calculate suggested width based on curvature
 * Tighter curves get narrower width for challenge
 */
export function calculateSuggestedWidth(curvature: number): number {
  if (curvature < CURVATURE_STRAIGHT) return STRAIGHT_WIDTH;
  if (curvature >= CURVATURE_TIGHT) return HAIRPIN_WIDTH;

  // Linear interpolation between thresholds
  const t = (curvature - CURVATURE_STRAIGHT) / (CURVATURE_TIGHT - CURVATURE_STRAIGHT);
  return MAX_WIDTH - t * (MAX_WIDTH - MIN_WIDTH);
}

/**
 * Calculate suggested speed limit based on curvature
 */
export function calculateSuggestedSpeed(curvature: number): number {
  const turnType = classifyTurnType(curvature);

  switch (turnType) {
    case 'straight': return STRAIGHT_SPEED;
    case 'gentle': return GENTLE_SPEED;
    case 'medium': return MEDIUM_SPEED;
    case 'tight': return TIGHT_SPEED;
    case 'hairpin': return HAIRPIN_SPEED;
  }
}

/**
 * Analyze curvature for an entire track
 */
export function analyzeTrackCurvature(points: Point2D[]): CurvatureData[] {
  const rawCurvatures = calculateCurvature(points);
  const smoothedCurvatures = smoothCurvature(rawCurvatures, 5);

  return smoothedCurvatures.map(curvature => ({
    curvature,
    suggestedWidth: Math.round(calculateSuggestedWidth(curvature)),
    suggestedSpeed: Math.round(calculateSuggestedSpeed(curvature) / 10) * 10,
    turnType: classifyTurnType(curvature)
  }));
}

/**
 * Find significant corners in the track
 */
export function findCorners(points: Point2D[], minCurvature: number = CURVATURE_GENTLE): number[] {
  const curvatures = calculateCurvature(points);
  const smoothed = smoothCurvature(curvatures, 5);
  const corners: number[] = [];

  // Find local maxima of curvature that exceed threshold
  for (let i = 1; i < smoothed.length - 1; i++) {
    if (smoothed[i] >= minCurvature &&
        smoothed[i] > smoothed[i - 1] &&
        smoothed[i] >= smoothed[i + 1]) {
      corners.push(i);
    }
  }

  return corners;
}

/**
 * Count total turns by type
 */
export function countTurnsByType(points: Point2D[]): Record<CurvatureData['turnType'], number> {
  const curvatureData = analyzeTrackCurvature(points);
  const counts: Record<CurvatureData['turnType'], number> = {
    straight: 0,
    gentle: 0,
    medium: 0,
    tight: 0,
    hairpin: 0
  };

  // Group consecutive points of same turn type
  let currentType = curvatureData[0]?.turnType || 'straight';
  let inTurn = currentType !== 'straight';

  for (let i = 1; i < curvatureData.length; i++) {
    const prevType = curvatureData[i - 1].turnType;
    const currType = curvatureData[i].turnType;

    // Count transition into a turn
    if (prevType === 'straight' && currType !== 'straight') {
      inTurn = true;
    }
    // Count when turn type changes or ends
    else if (inTurn && (currType === 'straight' || currType !== prevType)) {
      counts[prevType]++;
      inTurn = currType !== 'straight';
    }
  }

  // Count final turn if track ends in one
  if (inTurn) {
    counts[curvatureData[curvatureData.length - 1].turnType]++;
  }

  return counts;
}

/**
 * Estimate difficulty based on curvature analysis
 */
export function estimateDifficulty(points: Point2D[]): 'easy' | 'medium' | 'hard' | 'expert' {
  const turnCounts = countTurnsByType(points);
  const totalTurns = turnCounts.tight + turnCounts.hairpin + turnCounts.medium;
  const difficultTurns = turnCounts.tight + turnCounts.hairpin;

  if (difficultTurns >= 5 || turnCounts.hairpin >= 3) return 'expert';
  if (difficultTurns >= 3 || totalTurns >= 8) return 'hard';
  if (difficultTurns >= 1 || totalTurns >= 5) return 'medium';
  return 'easy';
}

/**
 * Calculate average corner radius
 */
export function calculateAverageCornerRadius(points: Point2D[]): number {
  const curvatures = calculateCurvature(points);
  const cornerCurvatures = curvatures.filter(c => c > CURVATURE_GENTLE);

  if (cornerCurvatures.length === 0) return Infinity;

  const avgCurvature = cornerCurvatures.reduce((a, b) => a + b, 0) / cornerCurvatures.length;
  return 1 / avgCurvature; // Radius = 1 / curvature
}
