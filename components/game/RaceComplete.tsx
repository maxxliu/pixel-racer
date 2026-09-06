'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RaceResults } from '@/lib/game/Game';
import { saveScore, getScores, type RankedScore } from '@/lib/scores';
import { formatTime, formatDelta, ordinal } from '@/lib/utils/format';
import { hex } from '@/lib/game/palette';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Panel';

interface RaceCompleteProps {
  results: RaceResults;
  trackId: string;
  trackName: string;
  onPlayAgain: () => void;
  onMainMenu: () => void;
}

type Medal = 'gold' | 'silver' | 'bronze' | null;

/** Par times from track length: a clean lap averages roughly these speeds. */
function medalFor(results: RaceResults): Medal {
  const dist = results.trackLength * results.totalLaps;
  const avg = dist / (results.totalTime / 1000);
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

export default function RaceComplete({ results, trackId, trackName, onPlayAgain, onMainMenu }: RaceCompleteProps) {
  const [name, setName] = useState('');
  const [savedRank, setSavedRank] = useState<number | null>(null);
  const [board, setBoard] = useState<RankedScore[]>([]);
  const nameRef = useRef<HTMLInputElement>(null);

  const isRace = results.mode === 'race';
  const won = isRace && results.position === 1;
  const medal = !isRace ? medalFor(results) : null;
  const best = results.bestLap;

  const loadBoard = useCallback(() => {
    setBoard(getScores({ trackId, mode: results.mode, laps: results.totalLaps }).slice(0, 8));
  }, [trackId, results.mode, results.totalLaps]);

  useEffect(() => {
    try { setName(localStorage.getItem('pixel-racer-name') ?? ''); } catch { /* ignore */ }
    loadBoard();
    const t = setTimeout(() => nameRef.current?.focus(), 400);
    return () => clearTimeout(t);
  }, [loadBoard]);

  const submit = useCallback(() => {
    const clean = name.trim().slice(0, 20);
    if (!clean || savedRank !== null) return;
    try { localStorage.setItem('pixel-racer-name', clean); } catch { /* ignore */ }
    const rank = saveScore({
      playerName: clean,
      gameMode: results.mode,
      time: Math.round(results.totalTime),
      bestLap: Math.round(results.bestLap),
      laps: results.totalLaps,
      date: new Date().toISOString(),
      position: isRace ? results.position : undefined,
      trackId,
      trackName,
    });
    setSavedRank(rank);
    loadBoard();
  }, [name, savedRank, results, isRace, trackId, trackName, loadBoard]);

  const previousBest = board.find((b) => savedRank === null || b.rank !== savedRank);
  const isNewRecord = savedRank === 1;

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-ink/80 backdrop-blur-md anim-fade-in">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center px-4 py-8">
        <div className="anim-slide-up text-center">
          {isRace ? (
            <>
              <div className="text-label uppercase text-muted">Race finished · {trackName}</div>
              <div className={`text-display-xl italic ${won ? 'text-lime' : 'text-cream'}`}>{ordinal(results.position)}</div>
              <div className="mt-1 text-muted">{won ? 'You won the race!' : `Finished ${ordinal(results.position)} of ${results.standings.length}`}</div>
            </>
          ) : (
            <>
              <div className="text-label uppercase text-muted">Time trial · {trackName}</div>
              <div className="text-display-xl italic text-cream hud-num">{formatTime(results.totalTime)}</div>
              {medal ? (
                <div className={`mt-3 inline-block rounded-full bg-gradient-to-r px-4 py-1 font-display text-sm font-bold uppercase tracking-wider ${MEDAL_STYLE[medal]}`}>{medal} medal</div>
              ) : (
                <div className="mt-3 text-muted">Finish faster for a medal</div>
              )}
            </>
          )}
          {isNewRecord && <div className="mt-2 font-display text-sm font-bold uppercase tracking-wider text-lime anim-pop">New track record</div>}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
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
                <Label className="mb-3">Best times · {results.totalLaps} lap{results.totalLaps === 1 ? '' : 's'}</Label>
                {board.length === 0 ? (
                  <p className="text-sm text-muted">No saved times on this track yet. {previousBest ? '' : 'Save yours below.'}</p>
                ) : (
                  <ol className="space-y-1 text-sm">
                    {board.map((e) => (
                      <li key={`${e.date}-${e.time}`} className={`flex justify-between ${e.rank === savedRank ? 'text-lime' : ''}`}>
                        <span><span className="mr-2 text-muted hud-num">{e.rank}.</span>{e.playerName}</span>
                        <span className="hud-num">{formatTime(e.time)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            )}
          </div>
        </div>

        <div className="glass-solid mt-4 p-5 anim-slide-up" style={{ animationDelay: '200ms' }}>
          {savedRank === null ? (
            <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); submit(); }}>
              <label className="flex-1">
                <span className="mb-1 block text-xs uppercase tracking-wider text-muted">Driver name</span>
                <input ref={nameRef} className="input" value={name} maxLength={20} placeholder="Your name" onChange={(e) => setName(e.target.value)} />
              </label>
              <Button type="submit" variant="primary" disabled={!name.trim()}>Save time</Button>
            </form>
          ) : (
            <p className="text-sm text-lime">Saved. Rank #{savedRank} on {trackName} for {results.mode === 'race' ? 'race' : 'time trial'} results on this device.</p>
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
