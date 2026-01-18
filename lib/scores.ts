const STORAGE_KEY = 'pixel-racer-scores';

export interface ScoreEntry {
  rank: number;
  playerName: string;
  gameMode: 'time-trial' | 'race';
  time: number;
  date: string;
  position?: number;
}

export function saveScore(entry: Omit<ScoreEntry, 'rank'>): void {
  if (typeof window === 'undefined') return;

  const stored = localStorage.getItem(STORAGE_KEY);
  let scores: ScoreEntry[] = [];

  if (stored) {
    try {
      scores = JSON.parse(stored);
    } catch {
      scores = [];
    }
  }

  scores.push({ ...entry, rank: 0 });
  scores.sort((a, b) => a.time - b.time);
  scores = scores.slice(0, 100); // Keep top 100 scores
  scores.forEach((s, i) => (s.rank = i + 1));

  localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
}

export function getScores(): ScoreEntry[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];

  try {
    const parsed = JSON.parse(stored) as ScoreEntry[];
    const sorted = parsed.sort((a, b) => a.time - b.time);
    return sorted.map((entry, idx) => ({
      ...entry,
      rank: idx + 1,
    }));
  } catch {
    return [];
  }
}

export function clearScores(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
