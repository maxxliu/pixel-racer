/**
 * Local results: every finished race on this device.
 */
const STORAGE_KEY = 'pixel-racer-scores-v3';

export type GameModeName = 'time-trial' | 'race' | 'endless';

export interface ScoreEntry {
  playerName: string;
  gameMode: GameModeName;
  /** Total race time in ms. */
  time: number;
  bestLap: number;
  laps: number;
  date: string;
  position?: number;
  trackId: string;
  trackName: string;
  /** Endless mode: points and metres. Ranked by score, highest first. */
  score?: number;
  distance?: number;
}

export interface RankedScore extends ScoreEntry {
  rank: number;
}

const listeners = new Set<() => void>();

function read(): ScoreEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e): e is ScoreEntry =>
      !!e && typeof e === 'object' && typeof (e as ScoreEntry).playerName === 'string' && Number.isFinite((e as ScoreEntry).time) && typeof (e as ScoreEntry).trackId === 'string',
    );
  } catch {
    return [];
  }
}

function write(scores: ScoreEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores.slice(0, 500)));
  } catch {
    // storage full or unavailable
  }
  listeners.forEach((l) => l());
}

export function subscribeScores(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Endless runs rank by score (highest first); timed modes by time (lowest first). */
export function compareScores(a: ScoreEntry, b: ScoreEntry): number {
  if (a.gameMode === 'endless' || b.gameMode === 'endless') return (b.score ?? 0) - (a.score ?? 0);
  return a.time - b.time;
}

/** Save a result and return its rank among same-track, same-mode, same-lap-count results. */
export function saveScore(entry: ScoreEntry): number {
  const scores = read();
  scores.push(entry);
  scores.sort(compareScores);
  write(scores);
  return getScores({ trackId: entry.trackId, mode: entry.gameMode, laps: entry.laps })
    .findIndex((s) => s.date === entry.date && s.playerName === entry.playerName && s.time === entry.time) + 1;
}

export function getScores(filter: { trackId?: string; mode?: GameModeName; laps?: number } = {}): RankedScore[] {
  return read()
    .filter((s) => (!filter.trackId || s.trackId === filter.trackId) && (!filter.mode || s.gameMode === filter.mode) && (!filter.laps || s.laps === filter.laps))
    .sort(compareScores)
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

export const ENDLESS_TRACK_ID = 'endless-road';
export const ENDLESS_TRACK_NAME = 'Endless Road';

/** Best endless score on this device (0 when none). */
export function getBestEndlessScore(): number {
  const top = getScores({ mode: 'endless' })[0];
  return top?.score ?? 0;
}

export function clearScores(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
  listeners.forEach((l) => l());
}
