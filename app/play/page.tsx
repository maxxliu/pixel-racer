'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import LoadingScreen from '@/components/game/LoadingScreen';

const GameCanvas = dynamic(() => import('@/components/game/GameCanvas'), {
  ssr: false,
  loading: () => <LoadingScreen />,
});

function PlayContent() {
  const params = useSearchParams();
  const mode = params.get('mode') === 'race' ? 'race' : 'time-trial';
  const custom = params.get('custom') === 'true';
  const laps = Number(params.get('laps'));
  const lapsOverride = process.env.NODE_ENV !== 'production' && Number.isFinite(laps) && laps >= 1 ? Math.floor(laps) : undefined;
  return <GameCanvas gameMode={mode} customTrack={custom} lapsOverride={lapsOverride} />;
}

export default function PlayPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <PlayContent />
    </Suspense>
  );
}
