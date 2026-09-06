import TrackBrowser from '@/components/tracks/TrackBrowser';
import { PageShell } from '@/components/ui/PageShell';
import { LinkButton } from '@/components/ui/Button';

export const metadata = {
  title: 'Track Library · Pixel Racer',
  description: 'Browse and race community-created tracks',
};

export default function TracksPage() {
  return (
    <PageShell
      title="Track library"
      subtitle="Community circuits, each with its own leaderboard. Pick one and race."
      back={{ href: '/', label: 'Menu' }}
      actions={<LinkButton href="/create-track" variant="primary" size="sm">Create track</LinkButton>}
      wide
    >
      <TrackBrowser />
    </PageShell>
  );
}
