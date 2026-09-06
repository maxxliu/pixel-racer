'use client';

import { useEffect, useState } from 'react';
import { getScores, subscribeScores, type RankedScore, type GameModeName } from '@/lib/scores';
import { formatTime } from '@/lib/utils/format';
import { Label } from '@/components/ui/Panel';

/** Best times set on this device for one track. */
export default function TrackLeaderboard({ trackId, limit = 10 }: { trackId: string; limit?: number }) {
  const [mode, setMode] = useState<GameModeName>('time-trial');
  const [entries, setEntries] = useState<RankedScore[]>([]);

  useEffect(() => {
    const load = () => setEntries(getScores({ trackId, mode }).slice(0, limit));
    load();
    return subscribeScores(load);
  }, [trackId, mode, limit]);

  return (
    <div className="glass p-5">
      <div className="mb-3 flex items-center justify-between">
        <Label>Best times</Label>
        <div className="flex gap-1 rounded-lg bg-ink/60 p-1">
          {(['time-trial', 'race'] as GameModeName[]).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
              className={`rounded-md px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-wider ${mode === m ? 'bg-coral text-ink' : 'text-muted hover:text-cream'}`}>
              {m === 'time-trial' ? 'Time trial' : 'Race'}
            </button>
          ))}
        </div>
      </div>
      {entries.length === 0 && <p className="text-sm text-muted">No times yet. Set the first one.</p>}
      {entries.length > 0 && (
        <ol className="space-y-1 text-sm">
          {entries.map((e) => (
            <li key={`${e.date}-${e.time}`} className="flex items-center justify-between rounded-md bg-ink/40 px-3 py-1.5">
              <span><span className={`mr-2 font-display font-bold hud-num ${e.rank === 1 ? 'text-sun' : e.rank === 2 ? 'text-cream' : e.rank === 3 ? 'text-[#ff8a5b]' : 'text-muted'}`}>{e.rank}</span>{e.playerName}<span className="ml-2 text-xs text-muted">{e.laps} lap{e.laps === 1 ? '' : 's'}</span></span>
              <span className="hud-num">{formatTime(e.time)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
