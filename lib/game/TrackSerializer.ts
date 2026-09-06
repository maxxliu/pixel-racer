/**
 * Track metadata helpers shared by the creator, browser and API.
 */
import type { TrackWaypoint } from '@/lib/game/types';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';
import { calculatePathLength, type Point2D } from '@/lib/track/TrackGeometryUtils';
import { estimateDifficulty, countTurnsByType } from '@/lib/track/CurvatureAnalyzer';

export interface TrackStats {
  trackLengthM: number;
  difficulty: Difficulty;
  turnCount: number;
}

export function computeTrackStats(waypoints: TrackWaypoint[]): TrackStats {
  const points: Point2D[] = waypoints.map((wp) => ({ x: wp.x, z: wp.z }));
  const trackLengthM = Math.round(calculatePathLength(points, true));
  const difficulty = estimateDifficulty(points);
  const turns = countTurnsByType(points);
  return { trackLengthM, difficulty, turnCount: turns.medium + turns.tight + turns.hairpin };
}

export function getDifficultyColor(difficulty: Difficulty | null | undefined): string {
  switch (difficulty) {
    case 'easy': return '#c8ff3d';
    case 'medium': return '#ffd166';
    case 'hard': return '#ff8a5b';
    case 'expert': return '#ff5c4d';
    default: return '#b7a9c9';
  }
}

export function getDifficultyLabel(difficulty: Difficulty | null | undefined): string {
  if (!difficulty) return 'Unrated';
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
}
