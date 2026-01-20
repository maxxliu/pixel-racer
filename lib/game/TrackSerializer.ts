/**
 * Track Serializer
 * Serialize/deserialize tracks for database storage and sharing
 */

import type { TrackWaypoint, MinimapData } from './TrackBuilder';
import type { Track, TrackInsert, Difficulty } from '@/lib/supabase/types';
import { calculatePathLength, calculateBounds, Point2D } from '@/lib/track/TrackGeometryUtils';
import { estimateDifficulty, countTurnsByType } from '@/lib/track/CurvatureAnalyzer';

export interface SerializedTrack {
  name: string;
  authorName: string;
  waypoints: TrackWaypoint[];
  startPosition: { x: number; z: number; rotation: number };
  thumbnailSvg?: string;
  trackLengthM?: number;
  difficulty?: Difficulty;
  turnCount?: number;
}

/**
 * Serialize track data for database storage
 */
export function serializeTrack(
  name: string,
  authorName: string,
  waypoints: TrackWaypoint[],
  startPosition: { x: number; z: number; rotation: number },
  minimapData?: MinimapData
): TrackInsert {
  const points: Point2D[] = waypoints.map(wp => ({ x: wp.x, z: wp.z }));

  // Calculate track statistics
  const trackLength = calculatePathLength(points, true);
  const difficulty = estimateDifficulty(points);
  const turnCounts = countTurnsByType(points);
  const turnCount = turnCounts.medium + turnCounts.tight + turnCounts.hairpin;

  // Generate thumbnail SVG if minimap data provided
  let thumbnailSvg: string | undefined;
  if (minimapData) {
    thumbnailSvg = generateThumbnailSvg(minimapData);
  }

  return {
    name,
    author_name: authorName,
    waypoints,
    start_position: startPosition,
    thumbnail_svg: thumbnailSvg || null,
    track_length_m: Math.round(trackLength),
    difficulty,
    turn_count: turnCount,
    is_public: true
  };
}

/**
 * Deserialize track data from database
 */
export function deserializeTrack(track: Track): SerializedTrack {
  return {
    name: track.name,
    authorName: track.author_name,
    waypoints: track.waypoints,
    startPosition: track.start_position,
    thumbnailSvg: track.thumbnail_svg || undefined,
    trackLengthM: track.track_length_m || undefined,
    difficulty: track.difficulty || undefined,
    turnCount: track.turn_count || undefined
  };
}

/**
 * Generate SVG thumbnail from minimap data
 */
export function generateThumbnailSvg(minimapData: MinimapData, size: number = 200): string {
  const { centerPath, innerPath, outerPath, bounds } = minimapData;

  // Calculate viewBox with padding
  const padding = 10;
  const width = bounds.maxX - bounds.minX + padding * 2;
  const height = bounds.maxZ - bounds.minZ + padding * 2;
  const viewBox = `${bounds.minX - padding} ${bounds.minZ - padding} ${width} ${height}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${size}" height="${size}">
  <rect x="${bounds.minX - padding}" y="${bounds.minZ - padding}" width="${width}" height="${height}" fill="#171717"/>
  <path d="${outerPath}" fill="none" stroke="#404040" stroke-width="2"/>
  <path d="${innerPath}" fill="none" stroke="#404040" stroke-width="2"/>
  <path d="${centerPath}" fill="none" stroke="#737373" stroke-width="1" stroke-dasharray="4,4"/>
</svg>`;
}

/**
 * Generate minimap SVG path from waypoints
 */
export function generateMinimapPath(waypoints: TrackWaypoint[]): string {
  if (waypoints.length === 0) return '';

  let path = `M ${waypoints[0].x} ${waypoints[0].z}`;

  for (let i = 1; i < waypoints.length; i++) {
    path += ` L ${waypoints[i].x} ${waypoints[i].z}`;
  }

  path += ' Z';
  return path;
}

/**
 * Calculate start position from waypoints
 * Places start at first checkpoint or first waypoint
 */
export function calculateStartPosition(waypoints: TrackWaypoint[]): { x: number; z: number; rotation: number } {
  if (waypoints.length === 0) {
    return { x: 0, z: 0, rotation: 0 };
  }

  // Find first checkpoint or use first waypoint
  const startIndex = waypoints.findIndex(wp => wp.isCheckpoint) || 0;
  const startWp = waypoints[startIndex];
  const nextWp = waypoints[(startIndex + 1) % waypoints.length];

  // Calculate rotation based on direction to next waypoint
  const dx = nextWp.x - startWp.x;
  const dz = nextWp.z - startWp.z;
  const rotation = Math.atan2(dx, dz);

  return {
    x: startWp.x,
    z: startWp.z,
    rotation
  };
}

/**
 * Validate track data before serialization
 */
export function validateTrackData(waypoints: TrackWaypoint[]): { valid: boolean; error?: string } {
  if (!waypoints || waypoints.length < 8) {
    return { valid: false, error: 'Track needs at least 8 waypoints' };
  }

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    if (typeof wp.x !== 'number' || typeof wp.z !== 'number') {
      return { valid: false, error: `Invalid coordinates at waypoint ${i}` };
    }
    if (typeof wp.width !== 'number' || wp.width < 8 || wp.width > 25) {
      return { valid: false, error: `Invalid width at waypoint ${i}` };
    }
    if (typeof wp.speedLimit !== 'number' || wp.speedLimit < 30 || wp.speedLimit > 300) {
      return { valid: false, error: `Invalid speed limit at waypoint ${i}` };
    }
  }

  return { valid: true };
}

/**
 * Compress waypoints for more efficient storage
 * Rounds coordinates to reduce precision
 */
export function compressWaypoints(waypoints: TrackWaypoint[]): TrackWaypoint[] {
  return waypoints.map(wp => ({
    x: Math.round(wp.x * 10) / 10,
    z: Math.round(wp.z * 10) / 10,
    width: Math.round(wp.width),
    speedLimit: Math.round(wp.speedLimit / 5) * 5,
    isCheckpoint: wp.isCheckpoint
  }));
}

/**
 * Export track as JSON string
 */
export function exportTrackJson(
  name: string,
  authorName: string,
  waypoints: TrackWaypoint[]
): string {
  const startPosition = calculateStartPosition(waypoints);
  const compressed = compressWaypoints(waypoints);

  return JSON.stringify({
    version: 1,
    name,
    author: authorName,
    waypoints: compressed,
    startPosition
  }, null, 2);
}

/**
 * Import track from JSON string
 */
export function importTrackJson(json: string): SerializedTrack | null {
  try {
    const data = JSON.parse(json);

    if (!data.waypoints || !Array.isArray(data.waypoints)) {
      return null;
    }

    const validation = validateTrackData(data.waypoints);
    if (!validation.valid) {
      console.error('Track validation failed:', validation.error);
      return null;
    }

    return {
      name: data.name || 'Imported Track',
      authorName: data.author || 'Unknown',
      waypoints: data.waypoints,
      startPosition: data.startPosition || calculateStartPosition(data.waypoints)
    };
  } catch (e) {
    console.error('Failed to parse track JSON:', e);
    return null;
  }
}

/**
 * Create a shareable track URL
 */
export function createShareableUrl(trackId: string, baseUrl: string = ''): string {
  return `${baseUrl}/tracks/${trackId}`;
}

/**
 * Format track length for display
 */
export function formatTrackLength(lengthM: number): string {
  if (lengthM >= 1000) {
    return `${(lengthM / 1000).toFixed(2)} km`;
  }
  return `${Math.round(lengthM)} m`;
}

/**
 * Format lap time for display
 */
export function formatLapTime(timeMs: number): string {
  const minutes = Math.floor(timeMs / 60000);
  const seconds = Math.floor((timeMs % 60000) / 1000);
  const ms = Math.floor((timeMs % 1000) / 10);

  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }
  return `${seconds}.${ms.toString().padStart(2, '0')}`;
}

/**
 * Get difficulty color for display
 */
export function getDifficultyColor(difficulty: Difficulty): string {
  switch (difficulty) {
    case 'easy': return '#00e436';    // Green
    case 'medium': return '#fbbf24';  // Yellow
    case 'hard': return '#ea580c';    // Orange
    case 'expert': return '#dc2626';  // Red
    default: return '#737373';        // Gray
  }
}

/**
 * Get difficulty label
 */
export function getDifficultyLabel(difficulty: Difficulty): string {
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
}
