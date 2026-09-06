'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import TrackCard from './TrackCard';
import TrackFilters, { type SortOption, type SortOrder } from './TrackFilters';
import type { TrackSummary, Difficulty } from '@/lib/supabase/types';
import { Button, LinkButton } from '@/components/ui/Button';

const PAGE = 12;

export function playTrack(router: ReturnType<typeof useRouter>, track: { id: string; waypoints: unknown; start_position: unknown; name?: string }, mode: 'time-trial' | 'race' = 'time-trial') {
  sessionStorage.setItem('customTrack', JSON.stringify({ id: track.id, name: track.name, waypoints: track.waypoints, startPosition: track.start_position }));
  fetch(`/api/tracks/${track.id}/play`, { method: 'POST' }).catch(() => undefined);
  router.push(`/play?mode=${mode}&custom=true`);
}

export default function TrackBrowser() {
  const router = useRouter();
  const [tracks, setTracks] = useState<TrackSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [sort, setSort] = useState<SortOption>('play_count');
  const [order, setOrder] = useState<SortOrder>('desc');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Filter changes reset to the first page in the same effect that fetches, so there is one request.
  useEffect(() => { setOffset(0); }, [difficulty, sort, order, debounced]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ sort, order, limit: String(PAGE), offset: String(offset) });
    if (difficulty) params.set('difficulty', difficulty);
    if (debounced) params.set('search', debounced);
    fetch(`/api/tracks?${params}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (res.status === 503) throw new Error('The track library is not connected to a database yet.');
        if (!res.ok) throw new Error('Failed to load tracks.');
        const data = await res.json();
        setTracks(data.tracks ?? []);
        setTotal(data.total ?? 0);
      })
      .catch((e: Error) => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [difficulty, sort, order, debounced, offset]);

  const play = async (t: TrackSummary) => {
    const res = await fetch(`/api/tracks/${t.id}`);
    if (!res.ok) { setError('Could not load that track.'); return; }
    playTrack(router, await res.json());
  };

  return (
    <div>
      <TrackFilters difficulty={difficulty} sort={sort} order={order} search={search}
        onDifficultyChange={setDifficulty} onSortChange={setSort} onOrderChange={setOrder} onSearchChange={setSearch} />

      {error && (
        <div className="glass mb-6 border-coral/40 p-5">
          <p className="text-coral">{error}</p>
          <p className="mt-1 text-sm text-muted">You can still draw and race your own tracks.</p>
          <LinkButton href="/create-track" variant="primary" size="sm" className="mt-3">Create a track</LinkButton>
        </div>
      )}

      {loading && !error && <p className="py-12 text-center text-muted anim-pulse-soft">Loading tracks…</p>}

      {!loading && !error && tracks.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-lg">No tracks found</p>
          <p className="mt-1 text-sm text-muted">{debounced ? 'Try a different search.' : 'Be the first to publish one.'}</p>
          <LinkButton href="/create-track" variant="primary" className="mt-5">Create a track</LinkButton>
        </div>
      )}

      {!loading && tracks.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tracks.map((t) => <TrackCard key={t.id} track={t} onPlay={() => void play(t)} />)}
          </div>
          {total > PAGE && (
            <div className="mt-8 flex items-center justify-center gap-3">
              <Button size="sm" onClick={() => setOffset(Math.max(0, offset - PAGE))} disabled={offset === 0}>Previous</Button>
              <span className="text-sm text-muted hud-num">{Math.floor(offset / PAGE) + 1} / {Math.ceil(total / PAGE)}</span>
              <Button size="sm" onClick={() => setOffset(offset + PAGE)} disabled={offset + PAGE >= total}>Next</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
