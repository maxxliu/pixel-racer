/**
 * Track Geometry Utilities
 * Core geometric operations for track creation and validation
 */

export interface Point2D {
  x: number;
  z: number;
}

export interface Segment {
  start: Point2D;
  end: Point2D;
}

/**
 * Calculate distance between two points
 */
export function distance(p1: Point2D, p2: Point2D): number {
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Calculate squared distance (faster for comparisons)
 */
export function distanceSquared(p1: Point2D, p2: Point2D): number {
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;
  return dx * dx + dz * dz;
}

/**
 * Calculate the cross product of vectors (p2-p1) and (p3-p1)
 * Returns positive if p3 is to the left of the line p1->p2
 */
export function crossProduct(p1: Point2D, p2: Point2D, p3: Point2D): number {
  return (p2.x - p1.x) * (p3.z - p1.z) - (p2.z - p1.z) * (p3.x - p1.x);
}

/**
 * Check if two line segments intersect
 * Uses the cross product method
 */
export function segmentsIntersect(seg1: Segment, seg2: Segment): boolean {
  const d1 = crossProduct(seg2.start, seg2.end, seg1.start);
  const d2 = crossProduct(seg2.start, seg2.end, seg1.end);
  const d3 = crossProduct(seg1.start, seg1.end, seg2.start);
  const d4 = crossProduct(seg1.start, seg1.end, seg2.end);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  // Check collinear cases
  if (d1 === 0 && onSegment(seg2.start, seg1.start, seg2.end)) return true;
  if (d2 === 0 && onSegment(seg2.start, seg1.end, seg2.end)) return true;
  if (d3 === 0 && onSegment(seg1.start, seg2.start, seg1.end)) return true;
  if (d4 === 0 && onSegment(seg1.start, seg2.end, seg1.end)) return true;

  return false;
}

/**
 * Check if point q lies on segment pr
 */
function onSegment(p: Point2D, q: Point2D, r: Point2D): boolean {
  return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) &&
         q.z <= Math.max(p.z, r.z) && q.z >= Math.min(p.z, r.z);
}

/**
 * Get the intersection point of two line segments (if it exists)
 */
export function getSegmentIntersection(seg1: Segment, seg2: Segment): Point2D | null {
  const x1 = seg1.start.x, z1 = seg1.start.z;
  const x2 = seg1.end.x, z2 = seg1.end.z;
  const x3 = seg2.start.x, z3 = seg2.start.z;
  const x4 = seg2.end.x, z4 = seg2.end.z;

  const denom = (x1 - x2) * (z3 - z4) - (z1 - z2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return null; // Parallel lines

  const t = ((x1 - x3) * (z3 - z4) - (z1 - z3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (z1 - z3) - (z1 - z2) * (x1 - x3)) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      x: x1 + t * (x2 - x1),
      z: z1 + t * (z2 - z1)
    };
  }

  return null;
}

/**
 * Calculate the perpendicular distance from a point to a line segment
 */
export function pointToSegmentDistance(point: Point2D, seg: Segment): number {
  const dx = seg.end.x - seg.start.x;
  const dz = seg.end.z - seg.start.z;
  const lengthSq = dx * dx + dz * dz;

  if (lengthSq === 0) {
    return distance(point, seg.start);
  }

  const t = Math.max(0, Math.min(1,
    ((point.x - seg.start.x) * dx + (point.z - seg.start.z) * dz) / lengthSq
  ));

  const projection: Point2D = {
    x: seg.start.x + t * dx,
    z: seg.start.z + t * dz
  };

  return distance(point, projection);
}

/**
 * Calculate the centroid of a polygon
 */
export function calculateCentroid(points: Point2D[]): Point2D {
  if (points.length === 0) return { x: 0, z: 0 };

  let sumX = 0, sumZ = 0;
  for (const p of points) {
    sumX += p.x;
    sumZ += p.z;
  }

  return {
    x: sumX / points.length,
    z: sumZ / points.length
  };
}

/**
 * Calculate the angle from centroid to a point (for sorting counter-clockwise)
 */
export function angleFromCentroid(point: Point2D, centroid: Point2D): number {
  return Math.atan2(point.z - centroid.z, point.x - centroid.x);
}

/**
 * Sort points counter-clockwise around their centroid
 */
export function sortPointsCounterClockwise(points: Point2D[]): Point2D[] {
  if (points.length < 3) return points;

  const centroid = calculateCentroid(points);
  return [...points].sort((a, b) =>
    angleFromCentroid(a, centroid) - angleFromCentroid(b, centroid)
  );
}

/**
 * Calculate the total length of a path
 */
export function calculatePathLength(points: Point2D[], closed: boolean = true): number {
  if (points.length < 2) return 0;

  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += distance(points[i - 1], points[i]);
  }

  if (closed && points.length > 2) {
    length += distance(points[points.length - 1], points[0]);
  }

  return length;
}

/**
 * Interpolate along a path by distance
 */
export function interpolateAlongPath(
  points: Point2D[],
  targetDistance: number,
  closed: boolean = true
): Point2D {
  const totalLength = calculatePathLength(points, closed);
  const normalizedDist = ((targetDistance % totalLength) + totalLength) % totalLength;

  let accumulatedDist = 0;
  const n = closed ? points.length : points.length - 1;

  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const segmentLength = distance(p1, p2);

    if (accumulatedDist + segmentLength >= normalizedDist) {
      const t = (normalizedDist - accumulatedDist) / segmentLength;
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
 * Get the tangent direction at a point along the path
 */
export function getTangentAtIndex(points: Point2D[], index: number, closed: boolean = true): Point2D {
  const n = points.length;

  let prevIndex = index - 1;
  let nextIndex = index + 1;

  if (closed) {
    prevIndex = (prevIndex + n) % n;
    nextIndex = nextIndex % n;
  } else {
    prevIndex = Math.max(0, prevIndex);
    nextIndex = Math.min(n - 1, nextIndex);
  }

  const dx = points[nextIndex].x - points[prevIndex].x;
  const dz = points[nextIndex].z - points[prevIndex].z;
  const length = Math.sqrt(dx * dx + dz * dz);

  if (length < 1e-10) return { x: 1, z: 0 };

  return {
    x: dx / length,
    z: dz / length
  };
}

/**
 * Get the normal (perpendicular) direction at a point
 */
export function getNormalAtIndex(points: Point2D[], index: number, closed: boolean = true): Point2D {
  const tangent = getTangentAtIndex(points, index, closed);
  return {
    x: -tangent.z,
    z: tangent.x
  };
}

/**
 * Calculate the bounding box of points
 */
export function calculateBounds(points: Point2D[]): {
  minX: number; maxX: number; minZ: number; maxZ: number;
  width: number; height: number;
} {
  if (points.length === 0) {
    return { minX: 0, maxX: 0, minZ: 0, maxZ: 0, width: 0, height: 0 };
  }

  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }

  return {
    minX, maxX, minZ, maxZ,
    width: maxX - minX,
    height: maxZ - minZ
  };
}

/**
 * Check if a point is inside a polygon using ray casting
 */
export function isPointInPolygon(point: Point2D, polygon: Point2D[]): boolean {
  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, zi = polygon[i].z;
    const xj = polygon[j].x, zj = polygon[j].z;

    if (((zi > point.z) !== (zj > point.z)) &&
        (point.x < (xj - xi) * (point.z - zi) / (zj - zi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}
