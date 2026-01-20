'use client';

import Link from 'next/link';
import type { Track } from '@/lib/supabase/types';
import { formatTrackLength, getDifficultyColor, getDifficultyLabel } from '@/lib/game/TrackSerializer';

interface TrackCardProps {
  track: Track;
  onPlay?: () => void;
}

export default function TrackCard({ track, onPlay }: TrackCardProps) {
  return (
    <div className="pixel-panel hover:translate-y-[-2px] transition-transform">
      {/* Thumbnail */}
      <div className="relative w-full h-32 bg-pixel-black mb-3 overflow-hidden border-2 border-pixel-gray">
        {track.thumbnail_svg ? (
          <div
            className="w-full h-full"
            dangerouslySetInnerHTML={{ __html: track.thumbnail_svg }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-pixel-gray text-xs font-pixel-body">No Preview</span>
          </div>
        )}

        {/* Difficulty Badge */}
        {track.difficulty && (
          <div
            className="absolute top-1 right-1 px-2 py-0.5 text-xs font-pixel"
            style={{
              backgroundColor: getDifficultyColor(track.difficulty),
              color: track.difficulty === 'easy' ? '#000' : '#fff'
            }}
          >
            {getDifficultyLabel(track.difficulty)}
          </div>
        )}
      </div>

      {/* Track Info */}
      <h3 className="font-pixel text-sm text-white truncate mb-1" title={track.name}>
        {track.name}
      </h3>
      <p className="text-xs font-pixel-body text-pixel-gray mb-3">
        by {track.author_name}
      </p>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 text-xs font-pixel-body mb-3">
        <div>
          <span className="text-pixel-gray">Length:</span>
          <span className="text-white ml-1">
            {track.track_length_m ? formatTrackLength(track.track_length_m) : '?'}
          </span>
        </div>
        <div>
          <span className="text-pixel-gray">Turns:</span>
          <span className="text-white ml-1">{track.turn_count || '?'}</span>
        </div>
        <div>
          <span className="text-pixel-gray">Plays:</span>
          <span className="text-white ml-1">{track.play_count}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onPlay}
          className="pixel-btn pixel-btn-primary text-xs flex-1"
        >
          Play
        </button>
        <Link
          href={`/tracks/${track.id}`}
          className="pixel-btn text-xs"
        >
          Info
        </Link>
      </div>
    </div>
  );
}
