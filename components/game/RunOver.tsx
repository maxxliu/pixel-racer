'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RunResults } from '@/lib/game/endless/EndlessDirector';
import { saveScore, getScores, ENDLESS_TRACK_ID, ENDLESS_TRACK_NAME, type RankedScore } from '@/lib/scores';
import { formatTime } from '@/lib/utils/format';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Panel';
import { Kbd } from '@/components/ui/Kbd';

interface RunOverProps {
  results: RunResults;
  onPlayAgain: () => void;
  onMainMenu: () => void;
  isMobile?: boolean;
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.floor(m)} m`;
}

export default function RunOver({ results, onPlayAgain, onMainMenu, isMobile = false }: RunOverProps) {
  const [name, setName] = useState('');
  const [savedRank, setSavedRank] = useState<number | null>(null);
  const [board, setBoard] = useState<RankedScore[]>([]);
  const [shown, setShown] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);

  const loadBoard = useCallback(() => {
    setBoard(getScores({ mode: 'endless' }).slice(0, 8));
  }, []);

  useEffect(() => {
    try { setName(localStorage.getItem('pixel-racer-name') ?? ''); } catch { /* ignore */ }
    loadBoard();
    const t = setTimeout(() => nameRef.current?.focus(), 700);
    return () => clearTimeout(t);
  }, [loadBoard]);

  // the score rolls up over a second
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const dur = 1100;
    const tick = () => {
      const u = Math.min(1, (performance.now() - start) / dur);
      const e = 1 - Math.pow(1 - u, 3);
      setShown(Math.floor(results.score * e));
      if (u < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [results.score]);

  const submit = useCallback(() => {
    const clean = name.trim().slice(0, 20);
    if (!clean || savedRank !== null) return;
    try { localStorage.setItem('pixel-racer-name', clean); } catch { /* ignore */ }
    const rank = saveScore({
      playerName: clean,
      gameMode: 'endless',
      time: Math.round(results.time * 1000),
      bestLap: 0,
      laps: 0,
      date: new Date().toISOString(),
      trackId: ENDLESS_TRACK_ID,
      trackName: ENDLESS_TRACK_NAME,
      score: results.score,
      distance: results.distance,
    });
    setSavedRank(rank);
    loadBoard();
  }, [name, savedRank, results, loadBoard]);

  // one key to run again
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inInput = (e.target as HTMLElement | null)?.tagName === 'INPUT';
      if (e.code === 'Space' && !inInput) { e.preventDefault(); onPlayAgain(); }
      if (e.code === 'KeyR' && !inInput) { e.preventDefault(); onPlayAgain(); }
      if (e.code === 'Enter' && !inInput) { e.preventDefault(); onPlayAgain(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPlayAgain]);

  const stats: { label: string; value: string }[] = [
    { label: 'Distance', value: formatDistance(results.distance) },
    { label: 'Survived', value: formatTime(results.time * 1000, { precision: 2 }) },
    { label: 'Top speed', value: `${Math.round(results.topSpeed * 3.6)} km/h` },
    { label: 'Close calls', value: String(results.nearMisses) },
    { label: 'Best combo', value: String(results.bestCombo) },
    { label: 'Hits', value: String(results.hits) },
  ];

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-ink/80 backdrop-blur-md anim-fade-in">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center px-4 py-8">
        <div className="anim-slide-up text-center">
          <div className="text-label uppercase text-muted">Endless chase · caught</div>
          <div className={`text-display-xl italic hud-num ${results.isRecord ? 'text-lime' : 'text-cream'}`}>{shown.toLocaleString()}</div>
          <div className="mt-1 text-muted">points</div>
          {results.isRecord && <div className="mt-2 font-display text-sm font-bold uppercase tracking-wider text-lime anim-pop">New best score</div>}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="glass-solid p-5 anim-slide-up" style={{ animationDelay: '80ms' }}>
            <Label className="mb-3">Run</Label>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              {stats.map((s) => (
                <div key={s.label}>
                  <dt className="text-xs uppercase tracking-wider text-muted">{s.label}</dt>
                  <dd className="font-display text-xl font-bold hud-num">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="glass-solid p-5 anim-slide-up" style={{ animationDelay: '140ms' }}>
            <Label className="mb-3">Best scores on this device</Label>
            {board.length === 0 ? (
              <p className="text-sm text-muted">No saved runs yet. Save yours below.</p>
            ) : (
              <ol className="space-y-1 text-sm">
                {board.map((e) => (
                  <li key={`${e.date}-${e.score}`} className={`flex justify-between ${e.rank === savedRank ? 'text-lime' : ''}`}>
                    <span><span className="mr-2 text-muted hud-num">{e.rank}.</span>{e.playerName}<span className="ml-2 text-xs text-muted">{formatDistance(e.distance ?? 0)}</span></span>
                    <span className="hud-num">{(e.score ?? 0).toLocaleString()}</span>
                  </li>
                ))}
              </ol>
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
              <Button type="submit" variant="primary" disabled={!name.trim()}>Save score</Button>
            </form>
          ) : (
            <p className="text-sm text-lime">Saved. Rank #{savedRank} in Endless Chase on this device.</p>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row anim-slide-up" style={{ animationDelay: '260ms' }}>
          <Button variant="primary" size="lg" className="flex-1" onClick={onPlayAgain}>
            Run again{!isMobile && <span className="ml-2 opacity-70"><Kbd>Space</Kbd></span>}
          </Button>
          <Button size="lg" className="flex-1" onClick={onMainMenu}>Main menu</Button>
        </div>
      </div>
    </div>
  );
}
