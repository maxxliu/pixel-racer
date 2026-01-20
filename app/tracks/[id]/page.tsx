'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import TrackLeaderboard from '@/components/tracks/TrackLeaderboard';
import type { Track } from '@/lib/supabase/types';
import { formatTrackLength, getDifficultyColor, getDifficultyLabel } from '@/lib/game/TrackSerializer';

interface TrackDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function TrackDetailPage({ params }: TrackDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [track, setTrack] = useState<Track | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTrack = async () => {
      try {
        const response = await fetch(`/api/tracks/${id}`);

        if (!response.ok) {
          if (response.status === 404) {
            setError('Track not found');
          } else {
            throw new Error('Failed to fetch track');
          }
          return;
        }

        const data = await response.json();
        setTrack(data);
      } catch (err) {
        console.error('Error fetching track:', err);
        setError('Failed to load track');
      } finally {
        setLoading(false);
      }
    };

    fetchTrack();
  }, [id]);

  const handlePlay = () => {
    if (!track) return;

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

  if (loading) {
    return (
      <div className="min-h-screen bg-pixel-black flex items-center justify-center">
        <p className="text-pixel-gray font-pixel animate-blink">Loading track...</p>
      </div>
    );
  }

  if (error || !track) {
    return (
      <div className="min-h-screen bg-pixel-black flex flex-col items-center justify-center gap-4">
        <p className="text-red-400 font-pixel">{error || 'Track not found'}</p>
        <Link href="/tracks" className="pixel-btn">
          Back to Tracks
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pixel-black p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Link href="/tracks" className="pixel-btn text-sm">
            ← Back
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Track Preview */}
          <div className="pixel-panel">
            <div className="relative w-full aspect-square bg-pixel-black mb-4 overflow-hidden border-2 border-pixel-gray">
              {track.thumbnail_svg ? (
                <div
                  className="w-full h-full"
                  dangerouslySetInnerHTML={{ __html: track.thumbnail_svg }}
                />
              ) : (
                <svg
                  viewBox="-160 -160 320 320"
                  className="w-full h-full"
                >
                  <rect x="-160" y="-160" width="320" height="320" fill="#171717" />
                  <path
                    d={`M ${track.waypoints[0].x} ${track.waypoints[0].z} ${track.waypoints.slice(1).map(wp => `L ${wp.x} ${wp.z}`).join(' ')} Z`}
                    fill="none"
                    stroke="#dc2626"
                    strokeWidth="3"
                  />
                  <circle
                    cx={track.waypoints[0].x}
                    cy={track.waypoints[0].z}
                    r="5"
                    fill="#00e436"
                  />
                </svg>
              )}
            </div>

            <button
              onClick={handlePlay}
              className="pixel-btn pixel-btn-primary w-full text-lg"
            >
              Play Track
            </button>
          </div>

          {/* Track Info */}
          <div className="space-y-4">
            <div className="pixel-panel">
              <h1 className="text-xl font-pixel text-white mb-2">{track.name}</h1>
              <p className="text-pixel-gray font-pixel-body mb-4">
                by {track.author_name}
              </p>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <span className="text-pixel-gray font-pixel-body text-sm block">Length</span>
                  <span className="text-white font-pixel text-lg">
                    {track.track_length_m ? formatTrackLength(track.track_length_m) : '?'}
                  </span>
                </div>
                <div>
                  <span className="text-pixel-gray font-pixel-body text-sm block">Turns</span>
                  <span className="text-white font-pixel text-lg">{track.turn_count || '?'}</span>
                </div>
                <div>
                  <span className="text-pixel-gray font-pixel-body text-sm block">Difficulty</span>
                  {track.difficulty ? (
                    <span
                      className="font-pixel text-lg"
                      style={{ color: getDifficultyColor(track.difficulty) }}
                    >
                      {getDifficultyLabel(track.difficulty)}
                    </span>
                  ) : (
                    <span className="text-pixel-gray font-pixel text-lg">?</span>
                  )}
                </div>
                <div>
                  <span className="text-pixel-gray font-pixel-body text-sm block">Plays</span>
                  <span className="text-white font-pixel text-lg">{track.play_count}</span>
                </div>
              </div>

              <div className="text-xs text-pixel-gray font-pixel-body">
                Created {new Date(track.created_at).toLocaleDateString()}
              </div>
            </div>

            {/* Leaderboard */}
            <TrackLeaderboard trackId={track.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
