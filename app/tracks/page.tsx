import TrackBrowser from '@/components/tracks/TrackBrowser';
import { PageShell } from '@/components/ui/PageShell';
import { LinkButton } from '@/components/ui/Button';

export const metadata = {
  title: 'Track Library · Pixel Racer',
  description: 'Your saved tracks',
};

export default function TracksPage() {
  return (
    <PageShell
      title="Track library"
      subtitle="Tracks you have drawn or generated, saved on this device. Each keeps its own best times."
      back={{ href: '/', label: 'Menu' }}
      actions={<LinkButton href="/create-track" variant="primary" size="sm">Create track</LinkButton>}
      wide
    >
      <TrackBrowser />
    </PageShell>
  );
}
