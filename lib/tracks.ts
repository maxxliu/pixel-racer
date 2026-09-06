/**
 * Local track library: custom tracks saved in the browser.
 */
import type { TrackWaypoint, StartPosition } from '@/lib/game/types';
import { computeTrackStats, type Difficulty } from '@/lib/game/TrackSerializer';
import { generateThumbnailSvg } from '@/lib/track/thumbnail';
import { validateWaypoints } from '@/lib/game/TrackSpline';

export const BUILTIN_TRACK_ID = 'sunset-circuit';

export interface SavedTrack {
  id: string;
  name: string;
  author: string;
  waypoints: TrackWaypoint[];
  startPosition: StartPosition;
  thumbnailSvg: string;
  lengthM: number;
  difficulty: Difficulty;
  turnCount: number;
  plays: number;
  createdAt: string;
}

const KEY = 'pixel-racer-tracks-v1';
const listeners = new Set<() => void>();

function read(): SavedTrack[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is SavedTrack =>
      !!t && typeof t === 'object' && typeof (t as SavedTrack).id === 'string' && !validateWaypoints((t as SavedTrack).waypoints),
    );
  } catch {
    return [];
  }
}

function write(tracks: SavedTrack[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(tracks));
  } catch {
    // storage full or unavailable
  }
  listeners.forEach((l) => l());
}

export function subscribeTracks(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function listTracks(): SavedTrack[] {
  return read().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getTrack(id: string): SavedTrack | null {
  return read().find((t) => t.id === id) ?? null;
}

export function saveTrack(input: { name: string; author: string; waypoints: TrackWaypoint[]; startPosition: StartPosition }): SavedTrack | { error: string } {
  const err = validateWaypoints(input.waypoints);
  if (err) return { error: err };
  const name = input.name.trim().slice(0, 60);
  const author = input.author.trim().slice(0, 30);
  if (!name || !author) return { error: 'Name and author are required' };
  const stats = computeTrackStats(input.waypoints);
  const track: SavedTrack = {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    author,
    waypoints: input.waypoints,
    startPosition: input.startPosition,
    thumbnailSvg: generateThumbnailSvg(input.waypoints),
    lengthM: stats.trackLengthM,
    difficulty: stats.difficulty,
    turnCount: stats.turnCount,
    plays: 0,
    createdAt: new Date().toISOString(),
  };
  write([track, ...read()]);
  return track;
}

export function deleteTrack(id: string): void {
  write(read().filter((t) => t.id !== id));
}

export function recordPlay(id: string): void {
  const tracks = read();
  const t = tracks.find((x) => x.id === id);
  if (!t) return;
  t.plays += 1;
  write(tracks);
}

/** Hand a track to the play page via sessionStorage. */
export function stageTrack(track: { id?: string; name?: string; waypoints: TrackWaypoint[]; startPosition?: StartPosition }): void {
  sessionStorage.setItem('customTrack', JSON.stringify({ id: track.id, name: track.name, waypoints: track.waypoints, startPosition: track.startPosition }));
  if (track.id) recordPlay(track.id);
}
