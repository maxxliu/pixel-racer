'use client';

import { useEffect, useState } from 'react';
import { PageShell } from '@/components/ui/PageShell';
import { Button, LinkButton } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { formatTime } from '@/lib/utils/format';
import { getScores, clearScores, type RankedScore } from '@/lib/scores';

type Mode = 'time-trial' | 'race';

export default function LeaderboardPage() {
  const [mode, setMode] = useState<Mode>('time-trial');
  const [entries, setEntries] = useState<RankedScore[]>([]);

  useEffect(() => { setEntries(getScores({ mode })); }, [mode]);

  const clear = () => {
    if (confirm('Clear every local score on this device?')) {
      clearScores();
      setEntries([]);
    }
  };

  return (
    <PageShell
      title="High scores"
      subtitle="Every result saved on this device, across all tracks."
      back={{ href: '/', label: 'Menu' }}
      actions={entries.length > 0 ? <Button size="sm" variant="danger" onClick={clear}>Clear all</Button> : null}
    >
      <div className="mb-4 flex gap-1 rounded-lg bg-ink/60 p-1 w-fit">
        {(['time-trial', 'race'] as Mode[]).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
            className={`rounded-md px-4 py-2 font-display text-xs font-bold uppercase tracking-wider ${mode === m ? 'bg-coral text-ink' : 'text-muted hover:text-cream'}`}>
            {m === 'time-trial' ? 'Time trial' : 'Race'}
          </button>
        ))}
      </div>
      <Panel padded={false}>
        {entries.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-muted">No {mode === 'race' ? 'race' : 'time trial'} results yet.</p>
            <LinkButton href={`/play?mode=${mode}`} variant="primary" className="mt-4">Start racing</LinkButton>
          </div>
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">Local high scores</caption>
            <thead className="text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th scope="col" className="px-4 py-3">Rank</th>
                <th scope="col" className="px-4 py-3">Driver</th>
                <th scope="col" className="px-4 py-3">Track</th>
                {mode === 'race' && <th scope="col" className="px-4 py-3">Finish</th>}
                <th scope="col" className="px-4 py-3">Time</th>
                <th scope="col" className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={`${e.playerName}-${e.time}-${e.date}-${i}`} className="border-t border-cream/10">
                  <td className={`px-4 py-3 font-display font-bold hud-num ${e.rank === 1 ? 'text-sun' : e.rank === 2 ? 'text-cream' : e.rank === 3 ? 'text-[#ff8a5b]' : 'text-muted'}`}>#{e.rank}</td>
                  <td className="px-4 py-3">{e.playerName}</td>
                  <td className="px-4 py-3 text-muted">{e.trackName} · {e.laps} lap{e.laps === 1 ? '' : 's'}</td>
                  {mode === 'race' && <td className="px-4 py-3 text-muted">P{e.position ?? '-'}</td>}
                  <td className="px-4 py-3 hud-num text-sun">{formatTime(e.time)}</td>
                  <td className="px-4 py-3 text-muted">{new Date(e.date).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </PageShell>
  );
}
