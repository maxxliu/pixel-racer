'use client';

import { useEffect, useState } from 'react';
import type { LeaderboardEntry } from '@/lib/supabase/types';
import { formatTime } from '@/lib/utils/format';
import { Label } from '@/components/ui/Panel';

type Mode = 'time-trial' | 'race' | null;

export default function TrackLeaderboard({ trackId, limit = 10 }: { trackId: string; limit?: number }) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('time-trial');

  useEffect(() => {
    const ctrl = new AbortController();
    setEntries(null);
    setError(null);
    const params = new URLSearchParams({ limit: String(limit) });
    if (mode) params.set('mode', mode);
    fetch(`/api/tracks/${trackId}/leaderboard?${params}`, { signal: ctrl.signal })
      .then(async (r) => { if (!r.ok) throw new Error('Failed to load leaderboard'); setEntries(await r.json()); })
      .catch((e: Error) => { if (e.name !== 'AbortError') setError(e.message); });
    return () => ctrl.abort();
  }, [trackId, limit, mode]);

  return (
    <div className="glass p-5">
      <div className="mb-3 flex items-center justify-between">
        <Label>Leaderboard</Label>
        <div className="flex gap-1 rounded-lg bg-ink/60 p-1">
          {([['time-trial', 'Time trial'], ['race', 'Race'], [null, 'All']] as [Mode, string][]).map(([m, label]) => (
            <button key={label} type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
              className={`rounded-md px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-wider ${mode === m ? 'bg-coral text-ink' : 'text-muted hover:text-cream'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-coral">{error}</p>}
      {!error && entries === null && <p className="text-sm text-muted anim-pulse-soft">Loading…</p>}
      {!error && entries && entries.length === 0 && <p className="text-sm text-muted">No times yet. Be the first.</p>}
      {!error && entries && entries.length > 0 && (
        <ol className="space-y-1 text-sm">
          {entries.map((e, i) => (
            <li key={e.id} className="flex items-center justify-between rounded-md bg-ink/40 px-3 py-1.5">
              <span><span className={`mr-2 font-display font-bold hud-num ${i === 0 ? 'text-sun' : i === 1 ? 'text-cream' : i === 2 ? 'text-[#ff8a5b]' : 'text-muted'}`}>{i + 1}</span>{e.player_name}</span>
              <span className="hud-num">{formatTime(e.time_ms)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
