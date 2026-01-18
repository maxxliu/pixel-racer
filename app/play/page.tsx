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
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') || 'time-trial';

  return <GameCanvas gameMode={mode as 'time-trial' | 'race'} />;
}

export default function PlayPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <PlayContent />
    </Suspense>
  );
}
