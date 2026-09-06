const STORAGE_KEY = 'pixel-racer-scores-v2';

export interface ScoreEntry {
  playerName: string;
  gameMode: 'time-trial' | 'race';
  time: number;
  date: string;
  position?: number;
  trackId?: string;
}

function read(): ScoreEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e): e is ScoreEntry =>
      !!e && typeof e === 'object' && typeof (e as ScoreEntry).playerName === 'string' && Number.isFinite((e as ScoreEntry).time),
    );
  } catch {
    return [];
  }
}

export function saveScore(entry: ScoreEntry): void {
  if (typeof window === 'undefined') return;
  const scores = read();
  scores.push(entry);
  scores.sort((a, b) => a.time - b.time);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores.slice(0, 200)));
  } catch {
    // storage full or unavailable
  }
}

/** Scores for one mode, best first, with 1-based rank within that mode. */
export function getScores(mode?: 'time-trial' | 'race'): (ScoreEntry & { rank: number })[] {
  const all = read().filter((s) => !mode || s.gameMode === mode).sort((a, b) => a.time - b.time);
  return all.map((s, i) => ({ ...s, rank: i + 1 }));
}

export function clearScores(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
