'use client';

import Link from 'next/link';
import type { TrackSummary } from '@/lib/supabase/types';
import { getDifficultyColor, getDifficultyLabel } from '@/lib/game/TrackSerializer';
import { formatTrackLength } from '@/lib/utils/format';
import { Button } from '@/components/ui/Button';
import { TrackThumbnail } from './TrackThumbnail';

interface TrackCardProps {
  track: TrackSummary;
  onPlay: () => void;
}

export default function TrackCard({ track, onPlay }: TrackCardProps) {
  return (
    <article className="glass flex flex-col overflow-hidden transition-transform hover:-translate-y-1">
      <Link href={`/tracks/${track.id}`} className="relative block aspect-[4/3] bg-surface" aria-label={`${track.name} details`}>
        <TrackThumbnail svg={track.thumbnail_svg} />
        {track.difficulty && (
          <span className="absolute right-2 top-2 rounded-md px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider text-ink" style={{ background: getDifficultyColor(track.difficulty) }}>
            {getDifficultyLabel(track.difficulty)}
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="truncate font-display text-lg font-bold italic" title={track.name}>{track.name}</h3>
        <p className="text-xs text-muted">by {track.author_name}</p>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div><dt className="text-muted">Length</dt><dd className="hud-num">{track.track_length_m ? formatTrackLength(track.track_length_m) : '?'}</dd></div>
          <div><dt className="text-muted">Turns</dt><dd className="hud-num">{track.turn_count ?? '?'}</dd></div>
          <div><dt className="text-muted">Plays</dt><dd className="hud-num">{track.play_count}</dd></div>
        </dl>
        <div className="mt-4 flex gap-2">
          <Button variant="primary" size="sm" className="flex-1" onClick={onPlay}>Play</Button>
          <Link href={`/tracks/${track.id}`} className="inline-flex items-center justify-center rounded-lg border border-cream/25 px-3 font-display text-xs font-bold uppercase tracking-wider hover:bg-cream/10">Info</Link>
        </div>
      </div>
    </article>
  );
}
