'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import TrackCard from './TrackCard';
import { listTracks, deleteTrack, stageTrack, subscribeTracks, type SavedTrack } from '@/lib/tracks';
import { LinkButton } from '@/components/ui/Button';

type Sort = 'newest' | 'plays' | 'length' | 'turns';

export function playTrack(router: ReturnType<typeof useRouter>, track: SavedTrack, mode: 'time-trial' | 'race' = 'time-trial') {
  stageTrack(track);
  router.push(`/play?mode=${mode}&custom=true`);
}

export default function TrackBrowser() {
  const router = useRouter();
  const [tracks, setTracks] = useState<SavedTrack[] | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('newest');

  useEffect(() => {
    setTracks(listTracks());
    return subscribeTracks(() => setTracks(listTracks()));
  }, []);

  const shown = useMemo(() => {
    if (!tracks) return [];
    const q = search.trim().toLowerCase();
    const filtered = q ? tracks.filter((t) => t.name.toLowerCase().includes(q) || t.author.toLowerCase().includes(q)) : tracks;
    const by: Record<Sort, (a: SavedTrack, b: SavedTrack) => number> = {
      newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
      plays: (a, b) => b.plays - a.plays,
      length: (a, b) => b.lengthM - a.lengthM,
      turns: (a, b) => b.turnCount - a.turnCount,
    };
    return [...filtered].sort(by[sort]);
  }, [tracks, search, sort]);

  const remove = (t: SavedTrack) => {
    if (confirm(`Delete "${t.name}"? Its saved times stay in your high scores.`)) deleteTrack(t.id);
  };

  return (
    <div>
      <div className="glass mb-6 flex flex-wrap items-center gap-3 p-3">
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your tracks" aria-label="Search tracks" className="input min-w-[180px] flex-1" />
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort by" className="input w-auto py-2">
          <option value="newest">Newest</option>
          <option value="plays">Most played</option>
          <option value="length">Longest</option>
          <option value="turns">Most turns</option>
        </select>
      </div>

      {tracks === null && <p className="py-12 text-center text-muted anim-pulse-soft">Loading…</p>}

      {tracks !== null && shown.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-lg">{search ? 'No tracks match that search' : 'No saved tracks yet'}</p>
          <p className="mt-1 text-sm text-muted">{search ? 'Try a different name.' : 'Draw a loop or generate one and save it here.'}</p>
          <LinkButton href="/create-track" variant="primary" className="mt-5">Create a track</LinkButton>
        </div>
      )}

      {shown.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((t) => <TrackCard key={t.id} track={t} onPlay={() => playTrack(router, t)} onDelete={() => remove(t)} />)}
        </div>
      )}
    </div>
  );
}
