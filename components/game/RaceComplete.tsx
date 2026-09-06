'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RaceResults } from '@/lib/game/Game';
import { saveScore } from '@/lib/scores';
import { formatTime, formatDelta, ordinal } from '@/lib/utils/format';
import { hex } from '@/lib/game/palette';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Panel';

interface LeaderboardEntry {
  id: string;
  player_name: string;
  time_ms: number;
}

interface RaceCompleteProps {
  results: RaceResults;
  trackId?: string;
  onPlayAgain: () => void;
  onMainMenu: () => void;
}

type Medal = 'gold' | 'silver' | 'bronze' | null;

/** Par times from track length: a clean lap averages roughly these speeds. */
function medalFor(results: RaceResults): Medal {
  const dist = results.trackLength * results.totalLaps;
  const avg = dist / (results.totalTime / 1000); // m/s
  if (avg >= 33) return 'gold';
  if (avg >= 27) return 'silver';
  if (avg >= 21) return 'bronze';
  return null;
}

const MEDAL_STYLE: Record<Exclude<Medal, null>, string> = {
  gold: 'from-sun to-[#ffb347] text-ink',
  silver: 'from-cream to-muted text-ink',
  bronze: 'from-[#ff8a5b] to-[#c96a3a] text-ink',
};

export default function RaceComplete({ results, trackId, onPlayAgain, onMainMenu }: RaceCompleteProps) {
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rank, setRank] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [board, setBoard] = useState<LeaderboardEntry[] | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const isRace = results.mode === 'race';
  const won = isRace && results.position === 1;
  const medal = !isRace ? medalFor(results) : null;
  const best = results.bestLap;

  useEffect(() => {
    try { setName(localStorage.getItem('pixel-racer-name') ?? ''); } catch { /* ignore */ }
    const t = setTimeout(() => nameRef.current?.focus(), 400);
    return () => clearTimeout(t);
  }, []);

  const fetchBoard = useCallback(async (signal?: AbortSignal) => {
    if (!trackId) return;
    try {
      const res = await fetch(`/api/tracks/${trackId}/leaderboard?limit=8&mode=${results.mode}`, { signal });
      if (!res.ok) { setBoard([]); return; }
      const data = (await res.json()) as LeaderboardEntry[];
      setBoard(Array.isArray(data) ? data : []);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setBoard([]);
    }
  }, [trackId, results.mode]);

  useEffect(() => {
    const ctrl = new AbortController();
    void fetchBoard(ctrl.signal);
    return () => ctrl.abort();
  }, [fetchBoard]);

  const submit = useCallback(async () => {
    const clean = name.trim().slice(0, 20);
    if (!clean || submitting) return;
    try { localStorage.setItem('pixel-racer-name', clean); } catch { /* ignore */ }
    saveScore({ playerName: clean, gameMode: results.mode, time: Math.round(results.totalTime), date: new Date().toISOString(), position: isRace ? results.position : undefined, trackId });
    setSaved(true);
    if (!trackId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tracks/${trackId}/leaderboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_name: clean, time_ms: Math.round(results.totalTime), lap_times: results.lapTimes.map(Math.round), game_mode: results.mode }),
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.rank === 'number') setRank(data.rank);
        void fetchBoard();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Could not submit (${res.status})`);
      }
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }, [name, submitting, results, isRace, trackId, fetchBoard]);

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-ink/80 backdrop-blur-md anim-fade-in">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center px-4 py-8">
        {/* hero */}
        <div className="anim-slide-up text-center">
          {isRace ? (
            <>
              <div className="text-label uppercase text-muted">Race finished</div>
              <div className={`text-display-xl italic ${won ? 'text-lime' : 'text-cream'}`}>{ordinal(results.position)}</div>
              <div className="mt-1 text-muted">{won ? 'You won the race!' : `Finished ${ordinal(results.position)} of ${results.standings.length}`}</div>
            </>
          ) : (
            <>
              <div className="text-label uppercase text-muted">Time trial complete</div>
              <div className="text-display-xl italic text-cream hud-num">{formatTime(results.totalTime)}</div>
              {medal ? (
                <div className={`mt-3 inline-block rounded-full bg-gradient-to-r px-4 py-1 font-display text-sm font-bold uppercase tracking-wider ${MEDAL_STYLE[medal]}`}>{medal} medal</div>
              ) : (
                <div className="mt-3 text-muted">Finish faster for a medal</div>
              )}
            </>
          )}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {/* laps */}
          <div className="glass-solid p-5 anim-slide-up" style={{ animationDelay: '80ms' }}>
            <Label className="mb-3">Laps</Label>
            <div className="space-y-2">
              {results.lapTimes.map((t, i) => {
                const d = t - best;
                const width = best > 0 ? Math.max(30, Math.min(100, (best / t) * 100)) : 100;
                return (
                  <div key={i} className="text-sm">
                    <div className="flex items-baseline justify-between">
                      <span className="text-muted">Lap {i + 1}</span>
                      <span className="hud-num">
                        <span className={t === best ? 'text-lime' : 'text-cream'}>{formatTime(t)}</span>
                        {t !== best && <span className="ml-2 text-xs text-coral">{formatDelta(d)}</span>}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-cream/10">
                      <div className={`h-full rounded-full ${t === best ? 'bg-lime' : 'bg-cream/50'}`} style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-between border-t border-cream/10 pt-2 text-sm">
                <span className="text-muted">Total</span>
                <span className="hud-num text-cream">{formatTime(results.totalTime)}</span>
              </div>
            </div>
          </div>

          {/* standings or leaderboard */}
          <div className="glass-solid p-5 anim-slide-up" style={{ animationDelay: '140ms' }}>
            {isRace ? (
              <>
                <Label className="mb-3">Standings</Label>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-muted">
                    <tr><th className="pb-2">#</th><th className="pb-2">Driver</th><th className="pb-2 text-right">Best</th><th className="pb-2 text-right">Gap</th></tr>
                  </thead>
                  <tbody>
                    {results.standings.map((s) => (
                      <tr key={s.name} className={s.isPlayer ? 'text-lime' : 'text-cream'}>
                        <td className="py-1 hud-num">{s.position}</td>
                        <td className="py-1"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: hex(s.color) }} />{s.name}</td>
                        <td className="py-1 text-right hud-num">{s.bestLap > 0 ? formatTime(s.bestLap) : '--'}</td>
                        <td className="py-1 text-right hud-num text-muted">{s.position === 1 ? '—' : `+${(s.gapMs / 1000).toFixed(1)}s`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <>
                <Label className="mb-3">{trackId ? 'Track leaderboard' : 'Best lap'}</Label>
                {trackId ? (
                  board === null ? <div className="text-sm text-muted">Loading…</div>
                  : board.length === 0 ? <div className="text-sm text-muted">No times yet. Set the first one.</div>
                  : (
                    <ol className="space-y-1 text-sm">
                      {board.map((e, i) => (
                        <li key={e.id} className="flex justify-between">
                          <span><span className="mr-2 text-muted hud-num">{i + 1}.</span>{e.player_name}</span>
                          <span className="hud-num">{formatTime(e.time_ms)}</span>
                        </li>
                      ))}
                    </ol>
                  )
                ) : (
                  <div>
                    <div className="text-3xl font-bold italic hud-num text-sun">{formatTime(best)}</div>
                    <div className="mt-2 text-xs text-muted">Play a library track to post times to its leaderboard.</div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* save */}
        <div className="glass-solid mt-4 p-5 anim-slide-up" style={{ animationDelay: '200ms' }}>
          {!saved ? (
            <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
              <label className="flex-1">
                <span className="mb-1 block text-xs uppercase tracking-wider text-muted">Driver name</span>
                <input ref={nameRef} className="input" value={name} maxLength={20} placeholder="Your name" onChange={(e) => setName(e.target.value)} />
              </label>
              <Button type="submit" variant="primary" disabled={!name.trim()}>Save time</Button>
            </form>
          ) : (
            <div className="text-sm">
              {rank ? <span className="text-lime">Posted to the leaderboard — rank #{rank}.</span>
                : error ? <span className="text-coral">Saved locally. Leaderboard: {error}</span>
                : submitting ? <span className="text-muted">Posting…</span>
                : <span className="text-muted">Saved to your local high scores.</span>}
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row anim-slide-up" style={{ animationDelay: '260ms' }}>
          <Button variant="primary" size="lg" className="flex-1" onClick={onPlayAgain}>Race again</Button>
          <Button size="lg" className="flex-1" onClick={onMainMenu}>Main menu</Button>
        </div>
      </div>
    </div>
  );
}
