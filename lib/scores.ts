/**
 * Local results: every finished race on this device.
 */
const STORAGE_KEY = 'pixel-racer-scores-v3';

export type GameModeName = 'time-trial' | 'race';

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

/** Save a result and return its rank among same-track, same-mode, same-lap-count results. */
export function saveScore(entry: ScoreEntry): number {
  const scores = read();
  scores.push(entry);
  scores.sort((a, b) => a.time - b.time);
  write(scores);
  return getScores({ trackId: entry.trackId, mode: entry.gameMode, laps: entry.laps })
    .findIndex((s) => s.date === entry.date && s.playerName === entry.playerName && s.time === entry.time) + 1;
}

export function getScores(filter: { trackId?: string; mode?: GameModeName; laps?: number } = {}): RankedScore[] {
  return read()
    .filter((s) => (!filter.trackId || s.trackId === filter.trackId) && (!filter.mode || s.gameMode === filter.mode) && (!filter.laps || s.laps === filter.laps))
    .sort((a, b) => a.time - b.time)
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

export function clearScores(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
  listeners.forEach((l) => l());
}
