import type { TrackWaypoint, StartPosition } from '@/lib/game/types';
import { validateWaypoints } from '@/lib/game/TrackSpline';

export const LIMITS = {
  nameMax: 60,
  authorMax: 30,
  playerMax: 20,
  waypointsMax: 400,
  searchMax: 60,
  listLimitMax: 50,
  offsetMax: 10000,
  timeMinMs: 5000,
  timeMaxMs: 3_600_000,
  lapMinMs: 1000,
};

export function parseIntParam(value: string | null, def: number, min: number, max: number): number {
  if (value === null || value === '') return def;
  const n = Number(value);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** Strip characters that have meaning in PostgREST filter strings. */
export function sanitizeSearch(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[%_,.()\\"'*]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LIMITS.searchMax);
  return cleaned.length > 0 ? cleaned : null;
}

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

export function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const s = value.replace(CONTROL_CHARS, '').trim().slice(0, max);
  return s.length > 0 ? s : null;
}

export function validateDifficulty(value: unknown): 'easy' | 'medium' | 'hard' | 'expert' | null {
  return value === 'easy' || value === 'medium' || value === 'hard' || value === 'expert' ? value : null;
}

export function validateGameMode(value: unknown): 'time-trial' | 'race' | null {
  return value === 'time-trial' || value === 'race' ? value : null;
}

export function validateTrackWaypoints(value: unknown): { waypoints: TrackWaypoint[] } | { error: string } {
  if (!Array.isArray(value)) return { error: 'waypoints must be an array' };
  if (value.length > LIMITS.waypointsMax) return { error: `Track has more than ${LIMITS.waypointsMax} waypoints` };
  const out: TrackWaypoint[] = [];
  for (let i = 0; i < value.length; i++) {
    const w = value[i] as Record<string, unknown>;
    if (!w || typeof w !== 'object') return { error: `Waypoint ${i} is invalid` };
    const x = Number(w.x), z = Number(w.z), width = Number(w.width);
    const speedLimit = Number.isFinite(Number(w.speedLimit)) ? Math.min(300, Math.max(20, Number(w.speedLimit))) : 100;
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(width)) return { error: `Waypoint ${i} has invalid numbers` };
    out.push({
      x: Math.round(x * 10) / 10,
      z: Math.round(z * 10) / 10,
      width: Math.round(width * 10) / 10,
      speedLimit: Math.round(speedLimit),
      isCheckpoint: w.isCheckpoint === true,
    });
  }
  const err = validateWaypoints(out);
  if (err) return { error: err };
  return { waypoints: out };
}

export function validateStartPosition(value: unknown): StartPosition | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const x = Number(v.x), z = Number(v.z), rotation = Number(v.rotation);
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(rotation)) return null;
  if (Math.abs(x) > 2000 || Math.abs(z) > 2000) return null;
  return { x, z, rotation };
}

export function validateLapTimes(value: unknown, totalMs: number): number[] | null | { error: string } {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) return { error: 'lap_times is invalid' };
  const laps: number[] = [];
  for (const v of value) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < LIMITS.lapMinMs) return { error: 'lap_times contains an invalid lap' };
    laps.push(Math.round(n));
  }
  const sum = laps.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - totalMs) > Math.max(500, totalMs * 0.02)) return { error: 'lap_times do not add up to time_ms' };
  return laps;
}
