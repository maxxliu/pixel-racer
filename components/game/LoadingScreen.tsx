'use client';

import { useEffect, useState } from 'react';
import { Kbd } from '@/components/ui/Kbd';

interface LoadingScreenProps {
  progress?: number;
  message?: string;
}

const TIPS: React.ReactNode[] = [
  <>Hold <Kbd>Space</Kbd> in a corner to drift. Release for a boost.</>,
  <>Longer drifts charge bigger boosts: blue, orange, then purple sparks.</>,
  <>Press the throttle just as the lights go green for a perfect start.</>,
  <>Grass is slow. Kerbs are fine. Walls hurt.</>,
  <><Kbd>C</Kbd> cycles the camera. <Kbd>R</Kbd> respawns at the last checkpoint.</>,
  <>Every checkpoint must be passed in order for a lap to count.</>,
  <>Endless Chase: every wall scrape and every obstacle hands the rival metres. Touch nothing.</>,
  <>Endless Chase: pass obstacles within a whisker for a Close Call and a bigger multiplier.</>,
  <>Endless Chase: a hit resets your multiplier. Three clean patterns bring it back a tier.</>,
];

export default function LoadingScreen({ progress = 0, message = 'Loading' }: LoadingScreenProps) {
  const [tip, setTip] = useState(0);
  useEffect(() => {
    setTip(Math.floor(Math.random() * TIPS.length));
    const id = setInterval(() => setTip((t) => (t + 1) % TIPS.length), 2600);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-ink px-6 text-center" role="status" aria-live="polite">
      <div className="mb-8 font-display text-display-l italic">
        <span className="text-coral">PIXEL</span>
        <span className="text-cream">RACER</span>
      </div>
      <div className="w-full max-w-sm">
        <div className="h-3 overflow-hidden rounded-full bg-cream/10">
          <div className="h-full rounded-full bg-gradient-to-r from-coral via-sun to-lime transition-[width] duration-200" style={{ width: `${Math.max(4, Math.min(100, progress))}%` }} />
        </div>
        <div className="mt-3 flex justify-between font-display text-xs uppercase tracking-widest text-muted">
          <span>{message}</span>
          <span className="hud-num">{Math.round(progress)}%</span>
        </div>
      </div>
      <p className="mt-10 max-w-md text-sm text-muted">{TIPS[tip]}</p>
    </div>
  );
}
