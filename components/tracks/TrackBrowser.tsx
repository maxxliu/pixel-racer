'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import TrackCard from './TrackCard';
import TrackFilters, { SortOption, SortOrder } from './TrackFilters';
import type { Track, Difficulty } from '@/lib/supabase/types';

interface TrackBrowserProps {
  initialTracks?: Track[];
}

export default function TrackBrowser({ initialTracks = [] }: TrackBrowserProps) {
  const router = useRouter();
  const [tracks, setTracks] = useState<Track[]>(initialTracks);
  const [loading, setLoading] = useState(initialTracks.length === 0);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [sort, setSort] = useState<SortOption>('play_count');
  const [order, setOrder] = useState<SortOrder>('desc');
  const [search, setSearch] = useState('');

  // Pagination
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 12;

  // Fetch tracks
  const fetchTracks = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        sort,
        order,
        limit: limit.toString(),
        offset: offset.toString()
      });

      if (difficulty) {
        params.set('difficulty', difficulty);
      }

      if (search) {
        params.set('search', search);
      }

      const response = await fetch(`/api/tracks?${params}`);

      if (!response.ok) {
        throw new Error('Failed to fetch tracks');
      }

      const data = await response.json();
      setTracks(data.tracks || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Error fetching tracks:', err);
      setError('Failed to load tracks. The database may not be configured.');
    } finally {
      setLoading(false);
    }
  }, [difficulty, sort, order, search, offset]);

  // Fetch on filter/sort change
  useEffect(() => {
    fetchTracks();
  }, [fetchTracks]);

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0);
  }, [difficulty, sort, order, search]);

  // Play track
  const handlePlayTrack = (track: Track) => {
    // Store track data in sessionStorage
    const trackData = {
      id: track.id,
      waypoints: track.waypoints,
      startPosition: track.start_position
    };

    sessionStorage.setItem('customTrack', JSON.stringify(trackData));

    // Increment play count
    fetch(`/api/tracks/${track.id}/play`, { method: 'POST' }).catch(console.error);

    router.push('/play?mode=time-trial&custom=true');
  };

  return (
    <div>
      {/* Filters */}
      <TrackFilters
        difficulty={difficulty}
        sort={sort}
        order={order}
        search={search}
        onDifficultyChange={setDifficulty}
        onSortChange={setSort}
        onOrderChange={setOrder}
        onSearchChange={setSearch}
      />

      {/* Error State */}
      {error && (
        <div className="pixel-panel bg-red-900/30 mb-6">
          <p className="text-red-400 font-pixel-body">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <p className="text-pixel-gray font-pixel animate-blink">Loading tracks...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && tracks.length === 0 && (
        <div className="text-center py-12">
          <p className="text-pixel-gray font-pixel-body text-lg mb-4">No tracks found</p>
          <p className="text-pixel-gray font-pixel-body text-sm mb-6">
            {search ? 'Try a different search term' : 'Be the first to create one!'}
          </p>
          <button
            onClick={() => router.push('/create-track')}
            className="pixel-btn pixel-btn-primary"
          >
            Create Track
          </button>
        </div>
      )}

      {/* Track Grid */}
      {!loading && tracks.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {tracks.map((track) => (
              <TrackCard
                key={track.id}
                track={track}
                onPlay={() => handlePlayTrack(track)}
              />
            ))}
          </div>

          {/* Pagination */}
          {total > limit && (
            <div className="flex justify-center gap-2 mt-8">
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="pixel-btn text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-4 py-2 font-pixel-body text-pixel-gray">
                {Math.floor(offset / limit) + 1} / {Math.ceil(total / limit)}
              </span>
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= total}
                className="pixel-btn text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
