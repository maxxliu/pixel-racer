import Link from 'next/link';
import TrackBrowser from '@/components/tracks/TrackBrowser';

export const metadata = {
  title: 'Track Library - Pixel Racer',
  description: 'Browse and play community-created racing tracks'
};

export default function TracksPage() {
  return (
    <div className="min-h-screen bg-pixel-black p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-pixel text-white mb-2">Track Library</h1>
            <p className="text-pixel-gray font-pixel-body">
              Browse and play community-created tracks
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/create-track" className="pixel-btn pixel-btn-primary">
              Create Track
            </Link>
            <Link href="/" className="pixel-btn">
              Back
            </Link>
          </div>
        </div>

        {/* Track Browser */}
        <TrackBrowser />
      </div>
    </div>
  );
}
