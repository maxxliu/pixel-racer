/**
 * Procedural Track Generator
 * Generates random, playable racing tracks based on design principles
 */

import {
  Point2D,
  distance,
  calculateCentroid,
  sortPointsCounterClockwise,
  calculatePathLength
} from './TrackGeometryUtils';
import { validateTrack, hasSelfIntersections } from './TrackValidator';
import { laplacianSmooth, catmullRomSmooth, assignTrackProperties } from './PathProcessor';
import type { TrackWaypoint } from '@/lib/game/TrackBuilder';

export interface GenerationOptions {
  minPoints?: number;              // Minimum base points (default: 6)
  maxPoints?: number;              // Maximum base points (default: 10)
  worldSize?: number;              // World size for generation (default: 200)
  targetLapTime?: number;          // Target lap time in seconds (default: 75)
  difficulty?: 'easy' | 'medium' | 'hard' | 'expert';
  maxAttempts?: number;            // Max generation attempts (default: 10)
  includeCornerTemplates?: boolean; // Add signature corners (default: true)
}

interface CornerTemplate {
  name: string;
  points: Point2D[];  // Relative points forming the corner shape
  scale: number;      // Base scale multiplier
}

const DEFAULT_OPTIONS: Required<GenerationOptions> = {
  minPoints: 6,
  maxPoints: 10,
  worldSize: 200,
  targetLapTime: 75,
  difficulty: 'medium',
  maxAttempts: 10,
  includeCornerTemplates: true
};

// Corner templates based on real racing circuit designs
const CORNER_TEMPLATES: Record<string, CornerTemplate> = {
  hairpin: {
    name: 'Hairpin',
    points: [
      { x: 0, z: 0 },
      { x: 5, z: 15 },
      { x: 15, z: 25 },
      { x: 30, z: 25 },
      { x: 40, z: 15 },
      { x: 45, z: 0 }
    ],
    scale: 1.2
  },
  chicane: {
    name: 'Chicane',
    points: [
      { x: 0, z: 0 },
      { x: 15, z: 10 },
      { x: 25, z: 5 },
      { x: 40, z: 15 },
      { x: 55, z: 10 },
      { x: 70, z: 0 }
    ],
    scale: 0.8
  },
  sweeper: {
    name: 'Sweeper',
    points: [
      { x: 0, z: 0 },
      { x: 20, z: 5 },
      { x: 40, z: 15 },
      { x: 60, z: 20 },
      { x: 80, z: 15 },
      { x: 100, z: 0 }
    ],
    scale: 1.0
  },
  sCurve: {
    name: 'S-Curve',
    points: [
      { x: 0, z: 0 },
      { x: 15, z: 10 },
      { x: 30, z: 8 },
      { x: 45, z: -2 },
      { x: 60, z: -10 },
      { x: 75, z: -8 },
      { x: 90, z: 0 }
    ],
    scale: 0.9
  },
  kink: {
    name: 'Kink',
    points: [
      { x: 0, z: 0 },
      { x: 25, z: 8 },
      { x: 50, z: 0 }
    ],
    scale: 1.0
  }
};

/**
 * Generate a complete procedural track
 */
export function generateTrack(options: GenerationOptions = {}): TrackWaypoint[] | null {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    const track = attemptTrackGeneration(opts);
    if (track && track.length > 0) {
      return track;
    }
  }

  console.warn('Failed to generate valid track after max attempts');
  return null;
}

/**
 * Single attempt at track generation
 */
function attemptTrackGeneration(opts: Required<GenerationOptions>): TrackWaypoint[] | null {
  // Step 1: Generate random base points
  const numPoints = opts.minPoints + Math.floor(Math.random() * (opts.maxPoints - opts.minPoints + 1));
  let basePoints = generateBasePoints(numPoints, opts.worldSize);

  // Step 2: Sort counter-clockwise to prevent self-intersection
  basePoints = sortPointsCounterClockwise(basePoints);

  // Step 3: Insert corner templates at strategic locations
  if (opts.includeCornerTemplates) {
    basePoints = insertCornerTemplates(basePoints, opts.difficulty);
  }

  // Step 4: Add straights between corners
  basePoints = ensureMinimumStraights(basePoints, opts.worldSize);

  // Step 5: Smooth with Catmull-Rom interpolation
  let smoothPoints = catmullRomSmooth(basePoints, 5);

  // Step 6: Apply Laplacian smoothing
  smoothPoints = laplacianSmooth(smoothPoints, true, 0.3);
  smoothPoints = laplacianSmooth(smoothPoints, true, 0.2);

  // Step 7: Validate
  const validation = validateTrack(smoothPoints);
  if (!validation.isValid) {
    return null;
  }

  // Step 8: Assign track properties
  const waypoints = assignTrackProperties(smoothPoints);

  // Step 9: Adjust for difficulty
  return adjustDifficulty(waypoints, opts.difficulty);
}

/**
 * Generate random base points within world bounds
 */
function generateBasePoints(count: number, worldSize: number): Point2D[] {
  const points: Point2D[] = [];
  const margin = worldSize * 0.15;  // Keep points away from edges
  const minDistance = worldSize * 0.15;  // Minimum distance between points

  for (let i = 0; i < count; i++) {
    let attempts = 0;
    let point: Point2D;

    do {
      point = {
        x: margin + Math.random() * (worldSize - 2 * margin) - worldSize / 2,
        z: margin + Math.random() * (worldSize - 2 * margin) - worldSize / 2
      };
      attempts++;
    } while (
      attempts < 100 &&
      points.some(p => distance(p, point) < minDistance)
    );

    points.push(point);
  }

  return points;
}

/**
 * Insert corner templates at random positions
 */
function insertCornerTemplates(
  points: Point2D[],
  difficulty: GenerationOptions['difficulty']
): Point2D[] {
  const result = [...points];

  // Determine how many corners to insert based on difficulty
  const cornerCounts: Record<string, number> = {
    easy: 1,
    medium: 2,
    hard: 3,
    expert: 4
  };

  const numCorners = cornerCounts[difficulty || 'medium'];
  const availableTemplates = Object.values(CORNER_TEMPLATES);

  // Select random positions to insert corners
  const insertPositions: number[] = [];
  for (let i = 0; i < numCorners && i < points.length - 1; i++) {
    let pos: number;
    do {
      pos = 1 + Math.floor(Math.random() * (points.length - 2));
    } while (insertPositions.includes(pos) || insertPositions.includes(pos - 1) || insertPositions.includes(pos + 1));
    insertPositions.push(pos);
  }

  insertPositions.sort((a, b) => b - a); // Insert from end to preserve indices

  for (const pos of insertPositions) {
    const template = availableTemplates[Math.floor(Math.random() * availableTemplates.length)];
    const cornerPoints = transformCornerTemplate(
      template,
      result[pos - 1],
      result[pos],
      difficulty
    );

    // Replace the point with corner points
    result.splice(pos, 0, ...cornerPoints);
  }

  return result;
}

/**
 * Transform a corner template to fit between two points
 */
function transformCornerTemplate(
  template: CornerTemplate,
  startPoint: Point2D,
  endPoint: Point2D,
  difficulty: GenerationOptions['difficulty']
): Point2D[] {
  // Calculate transformation
  const dx = endPoint.x - startPoint.x;
  const dz = endPoint.z - startPoint.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx);

  // Scale based on distance and difficulty
  const difficultyScale = {
    easy: 1.2,
    medium: 1.0,
    hard: 0.8,
    expert: 0.7
  }[difficulty || 'medium'];

  const scale = (dist / 100) * template.scale * difficultyScale;

  // Transform template points
  return template.points.slice(1, -1).map(p => {
    // Rotate and scale
    const rx = p.x * Math.cos(angle) - p.z * Math.sin(angle);
    const rz = p.x * Math.sin(angle) + p.z * Math.cos(angle);

    return {
      x: startPoint.x + rx * scale,
      z: startPoint.z + rz * scale
    };
  });
}

/**
 * Ensure minimum straight sections between corners
 */
function ensureMinimumStraights(points: Point2D[], worldSize: number): Point2D[] {
  const minStraightLength = worldSize * 0.1;  // At least 10% of world size
  const result: Point2D[] = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const dist = distance(prev, curr);

    // If segment is long enough, add intermediate points for straight
    if (dist > minStraightLength * 3) {
      const numIntermediates = Math.floor(dist / minStraightLength) - 1;
      for (let j = 1; j <= numIntermediates; j++) {
        const t = j / (numIntermediates + 1);
        result.push({
          x: prev.x + t * (curr.x - prev.x),
          z: prev.z + t * (curr.z - prev.z)
        });
      }
    }

    result.push(curr);
  }

  return result;
}

/**
 * Adjust waypoints based on difficulty
 */
function adjustDifficulty(
  waypoints: TrackWaypoint[],
  difficulty: GenerationOptions['difficulty']
): TrackWaypoint[] {
  const widthModifier = {
    easy: 1.2,
    medium: 1.0,
    hard: 0.85,
    expert: 0.75
  }[difficulty || 'medium'];

  const speedModifier = {
    easy: 1.1,
    medium: 1.0,
    hard: 0.9,
    expert: 0.8
  }[difficulty || 'medium'];

  return waypoints.map(wp => ({
    ...wp,
    width: Math.max(10, Math.min(18, Math.round(wp.width * widthModifier))),
    speedLimit: Math.max(40, Math.min(180, Math.round(wp.speedLimit * speedModifier / 10) * 10))
  }));
}

/**
 * Generate a simple oval track (for testing or fallback)
 */
export function generateOvalTrack(
  worldSize: number = 200,
  aspectRatio: number = 1.5
): TrackWaypoint[] {
  const points: Point2D[] = [];
  const numPoints = 24;
  const radiusX = (worldSize * 0.4) * aspectRatio;
  const radiusZ = worldSize * 0.4;

  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    points.push({
      x: Math.cos(angle) * radiusX,
      z: Math.sin(angle) * radiusZ
    });
  }

  return assignTrackProperties(points);
}

/**
 * Generate a figure-8 track
 */
export function generateFigure8Track(worldSize: number = 200): TrackWaypoint[] {
  const points: Point2D[] = [];
  const numPoints = 32;
  const radius = worldSize * 0.25;

  for (let i = 0; i < numPoints; i++) {
    const t = (i / numPoints) * Math.PI * 2;
    // Lemniscate of Bernoulli (figure-8 curve)
    const scale = 1 / (1 + Math.sin(t) * Math.sin(t));
    points.push({
      x: Math.cos(t) * radius * scale * 1.5,
      z: Math.sin(t) * Math.cos(t) * radius * scale * 1.5
    });
  }

  // This will self-intersect, so we need to validate carefully
  const waypoints = assignTrackProperties(points);

  // Adjust center crossing to be a bridge/tunnel (visually)
  // For now, just return the waypoints
  return waypoints;
}

/**
 * Generate track with specific characteristics
 */
export function generateTrackWithCharacteristics(
  characteristics: {
    numHairpins?: number;
    numChicanes?: number;
    numSweepers?: number;
    straightPercentage?: number;
  },
  worldSize: number = 200
): TrackWaypoint[] | null {
  const {
    numHairpins = 1,
    numChicanes = 1,
    numSweepers = 2,
    straightPercentage = 0.3
  } = characteristics;

  // Build track by combining templates
  const segments: Point2D[][] = [];
  let currentAngle = 0;
  let currentPos: Point2D = { x: 0, z: 0 };

  const addStraight = (length: number) => {
    segments.push([
      currentPos,
      {
        x: currentPos.x + Math.cos(currentAngle) * length,
        z: currentPos.z + Math.sin(currentAngle) * length
      }
    ]);
    currentPos = segments[segments.length - 1][1];
  };

  const addCorner = (template: CornerTemplate, direction: 1 | -1) => {
    const transformed = template.points.map(p => ({
      x: currentPos.x + (p.x * Math.cos(currentAngle) - p.z * direction * Math.sin(currentAngle)),
      z: currentPos.z + (p.x * Math.sin(currentAngle) + p.z * direction * Math.cos(currentAngle))
    }));
    segments.push(transformed);
    currentPos = transformed[transformed.length - 1];
    currentAngle += direction * Math.PI * 0.5; // Approximate turn angle
  };

  // Build track segments
  const straightLength = worldSize * 0.15;

  for (let i = 0; i < numHairpins; i++) {
    addStraight(straightLength);
    addCorner(CORNER_TEMPLATES.hairpin, i % 2 === 0 ? 1 : -1);
  }

  for (let i = 0; i < numChicanes; i++) {
    addStraight(straightLength);
    addCorner(CORNER_TEMPLATES.chicane, 1);
  }

  for (let i = 0; i < numSweepers; i++) {
    addStraight(straightLength);
    addCorner(CORNER_TEMPLATES.sweeper, i % 2 === 0 ? 1 : -1);
  }

  // Close the track
  addStraight(straightLength);

  // Flatten segments
  const allPoints = segments.flat();

  // Validate and return
  const validation = validateTrack(allPoints);
  if (!validation.isValid) {
    return null;
  }

  return assignTrackProperties(allPoints);
}

/**
 * Get available corner template names
 */
export function getCornerTemplateNames(): string[] {
  return Object.keys(CORNER_TEMPLATES);
}

/**
 * Get corner template by name
 */
export function getCornerTemplate(name: string): CornerTemplate | null {
  return CORNER_TEMPLATES[name] || null;
}
