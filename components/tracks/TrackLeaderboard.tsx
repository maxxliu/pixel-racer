'use client';

import { useState, useEffect } from 'react';
import type { LeaderboardEntry } from '@/lib/supabase/types';
import { formatLapTime } from '@/lib/game/TrackSerializer';

interface TrackLeaderboardProps {
  trackId: string;
  limit?: number;
}

export default function TrackLeaderboard({ trackId, limit = 10 }: TrackLeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gameMode, setGameMode] = useState<'time-trial' | 'race' | null>(null);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ limit: limit.toString() });
        if (gameMode) {
          params.set('mode', gameMode);
        }

        const response = await fetch(`/api/tracks/${trackId}/leaderboard?${params}`);

        if (!response.ok) {
          throw new Error('Failed to fetch leaderboard');
        }

        const data = await response.json();
        setEntries(data || []);
      } catch (err) {
        console.error('Error fetching leaderboard:', err);
        setError('Failed to load leaderboard');
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [trackId, limit, gameMode]);

  const getRankColor = (rank: number): string => {
    switch (rank) {
      case 1: return 'text-yellow-400';
      case 2: return 'text-gray-300';
      case 3: return 'text-orange-400';
      default: return 'text-pixel-gray';
    }
  };

  const getRankBadge = (rank: number): string => {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `#${rank}`;
    }
  };

  return (
    <div className="pixel-panel">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-pixel text-white text-sm">Leaderboard</h3>

        {/* Mode Filter */}
        <div className="flex gap-1">
          <button
            onClick={() => setGameMode(null)}
            className={`px-2 py-0.5 text-xs font-pixel-body border
              ${gameMode === null
                ? 'bg-pixel-red border-white text-white'
                : 'bg-transparent border-pixel-gray text-pixel-gray'
              }`}
          >
            All
          </button>
          <button
            onClick={() => setGameMode('time-trial')}
            className={`px-2 py-0.5 text-xs font-pixel-body border
              ${gameMode === 'time-trial'
                ? 'bg-pixel-red border-white text-white'
                : 'bg-transparent border-pixel-gray text-pixel-gray'
              }`}
          >
            TT
          </button>
          <button
            onClick={() => setGameMode('race')}
            className={`px-2 py-0.5 text-xs font-pixel-body border
              ${gameMode === 'race'
                ? 'bg-pixel-red border-white text-white'
                : 'bg-transparent border-pixel-gray text-pixel-gray'
              }`}
          >
            Race
          </button>
        </div>
      </div>

      {loading && (
        <p className="text-pixel-gray font-pixel-body text-sm animate-blink">
          Loading...
        </p>
      )}

      {error && (
        <p className="text-red-400 font-pixel-body text-sm">{error}</p>
      )}

      {!loading && !error && entries.length === 0 && (
        <p className="text-pixel-gray font-pixel-body text-sm">
          No times recorded yet. Be the first!
        </p>
      )}

      {!loading && entries.length > 0 && (
        <div className="space-y-2">
          {entries.map((entry, index) => (
            <div
              key={entry.id}
              className="flex items-center justify-between bg-pixel-black/50 px-2 py-1"
            >
              <div className="flex items-center gap-2">
                <span className={`font-pixel text-xs w-8 ${getRankColor(index + 1)}`}>
                  {getRankBadge(index + 1)}
                </span>
                <span className="font-pixel-body text-white text-sm truncate max-w-[100px]">
                  {entry.player_name}
                </span>
              </div>
              <div className="text-right">
                <span className="font-pixel text-xs text-white">
                  {formatLapTime(entry.time_ms)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
