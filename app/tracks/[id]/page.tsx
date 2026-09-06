'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import TrackLeaderboard from '@/components/tracks/TrackLeaderboard';
import { TrackThumbnail } from '@/components/tracks/TrackThumbnail';
import { playTrack } from '@/components/tracks/TrackBrowser';
import { getTrack, deleteTrack, subscribeTracks, type SavedTrack } from '@/lib/tracks';
import { getDifficultyColor, getDifficultyLabel } from '@/lib/game/TrackSerializer';
import { formatTrackLength } from '@/lib/utils/format';
import { PageShell } from '@/components/ui/PageShell';
import { Button, LinkButton } from '@/components/ui/Button';
import { Label } from '@/components/ui/Panel';

interface TrackDetailPageProps {
  params: { id: string };
}

export default function TrackDetailPage({ params }: TrackDetailPageProps) {
  const { id } = params;
  const router = useRouter();
  const [track, setTrack] = useState<SavedTrack | null | undefined>(undefined);

  useEffect(() => {
    const load = () => setTrack(getTrack(id));
    load();
    return subscribeTracks(load);
  }, [id]);

  const remove = () => {
    if (!track) return;
    if (confirm(`Delete "${track.name}"?`)) {
      deleteTrack(track.id);
      router.push('/tracks');
    }
  };

  return (
    <PageShell title={track?.name ?? (track === null ? 'Track not found' : 'Loading…')} subtitle={track ? `by ${track.author}` : undefined} back={{ href: '/tracks', label: 'Library' }}>
      {track === null && (
        <div className="glass p-6">
          <p className="text-muted">This track isn&apos;t saved on this device.</p>
          <LinkButton href="/tracks" className="mt-4">Back to library</LinkButton>
        </div>
      )}
      {track && (
        <div className="grid gap-5 md:grid-cols-2">
          <div className="glass overflow-hidden">
            <div className="aspect-square bg-surface">
              <TrackThumbnail svg={track.thumbnailSvg} />
            </div>
            <div className="flex gap-2 p-4">
              <Button variant="primary" size="lg" className="flex-1" onClick={() => playTrack(router, track, 'time-trial')}>Time trial</Button>
              <Button size="lg" className="flex-1" onClick={() => playTrack(router, track, 'race')}>Race vs AI</Button>
            </div>
          </div>
          <div className="space-y-5">
            <div className="glass p-5">
              <Label className="mb-3">Track info</Label>
              <dl className="grid grid-cols-2 gap-4">
                <div><dt className="text-xs text-muted">Length</dt><dd className="font-display text-xl font-bold hud-num">{formatTrackLength(track.lengthM)}</dd></div>
                <div><dt className="text-xs text-muted">Turns</dt><dd className="font-display text-xl font-bold hud-num">{track.turnCount}</dd></div>
                <div><dt className="text-xs text-muted">Difficulty</dt><dd className="font-display text-xl font-bold" style={{ color: getDifficultyColor(track.difficulty) }}>{getDifficultyLabel(track.difficulty)}</dd></div>
                <div><dt className="text-xs text-muted">Plays</dt><dd className="font-display text-xl font-bold hud-num">{track.plays}</dd></div>
              </dl>
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-muted">Saved {new Date(track.createdAt).toLocaleDateString()}</p>
                <Button variant="danger" size="sm" onClick={remove}>Delete</Button>
              </div>
            </div>
            <TrackLeaderboard trackId={track.id} />
          </div>
        </div>
      )}
    </PageShell>
  );
}
