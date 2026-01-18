'use client';

import { useState, useEffect } from 'react';

interface LoadingScreenProps {
  progress?: number;
  message?: string;
}

const RETRO_TIPS = [
  'PRESS W TO ACCELERATE',
  'USE A/D TO STEER',
  'PRESS ESC TO PAUSE',
  'COMPLETE 3 LAPS TO WIN',
  'BEAT YOUR BEST LAP TIME',
  'PRESS R TO RESET CAR',
];

export default function LoadingScreen({ progress = 0, message = 'LOADING' }: LoadingScreenProps) {
  const [loadingDots, setLoadingDots] = useState('');
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    const dotsInterval = setInterval(() => {
      setLoadingDots((dots) => (dots.length >= 3 ? '' : dots + '.'));
    }, 400);
    return () => clearInterval(dotsInterval);
  }, []);

  useEffect(() => {
    const tipInterval = setInterval(() => {
      setTipIndex((i) => (i + 1) % RETRO_TIPS.length);
    }, 2000);
    return () => clearInterval(tipInterval);
  }, []);

  // Calculate number of segments filled (out of 20)
  const totalSegments = 20;
  const filledSegments = Math.floor((progress / 100) * totalSegments);

  return (
    <div className="loading-screen relative">
      {/* Scanlines */}
      <div className="absolute inset-0 scanlines" />

      {/* CRT vignette */}
      <div className="absolute inset-0 crt-vignette" />

      {/* Pixel grid background */}
      <div className="absolute inset-0 pixel-grid-bg opacity-20" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Title */}
        <h1 className="font-pixel text-3xl md:text-5xl text-pixel-cyan pixel-text-shadow mb-8 animate-pixel-pulse">
          PIXEL RACER
        </h1>

        {/* Pixel art loading bar */}
        <div className="mb-6">
          <div className="pixel-panel p-4">
            <div className="flex gap-1">
              {Array.from({ length: totalSegments }).map((_, i) => {
                let bgColor = 'bg-pixel-mid';
                if (i < filledSegments) {
                  if (i < totalSegments * 0.5) {
                    bgColor = 'bg-pixel-green';
                  } else if (i < totalSegments * 0.8) {
                    bgColor = 'bg-pixel-yellow';
                  } else {
                    bgColor = 'bg-pixel-red';
                  }
                }
                return (
                  <div
                    key={i}
                    className={`w-4 h-6 ${bgColor} transition-colors duration-100`}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Progress percentage */}
        <div className="font-pixel text-xl text-pixel-white mb-4">
          {Math.round(progress)}%
        </div>

        {/* Loading message with dots */}
        <div className="font-pixel text-sm text-pixel-orange mb-8">
          {message.toUpperCase()}{loadingDots}
        </div>

        {/* Animated pixel car */}
        <div className="mb-8 animate-bounce">
          <PixelCarLoading />
        </div>

        {/* Retro tip */}
        <div className="pixel-panel px-6 py-3">
          <div className="font-pixel text-[10px] text-pixel-cyan">
            TIP: {RETRO_TIPS[tipIndex]}
          </div>
        </div>

        {/* Bottom credits */}
        <div className="absolute bottom-8 font-pixel text-[8px] text-pixel-gray animate-blink">
          PRESS START
        </div>
      </div>
    </div>
  );
}

function PixelCarLoading() {
  return (
    <svg width="64" height="32" viewBox="0 0 64 32" style={{ imageRendering: 'pixelated' }}>
      {/* Car body */}
      <rect x="8" y="12" width="48" height="12" fill="#ff004d" />
      <rect x="16" y="6" width="28" height="6" fill="#ff004d" />
      {/* Windows */}
      <rect x="18" y="7" width="10" height="4" fill="#29adff" />
      <rect x="30" y="7" width="10" height="4" fill="#29adff" />
      {/* Wheels */}
      <rect x="12" y="22" width="8" height="8" fill="#1a1a2e" />
      <rect x="44" y="22" width="8" height="8" fill="#1a1a2e" />
      {/* Wheel highlights */}
      <rect x="14" y="24" width="3" height="3" fill="#4a4a6a" />
      <rect x="46" y="24" width="3" height="3" fill="#4a4a6a" />
      {/* Headlights */}
      <rect x="54" y="14" width="4" height="4" fill="#ffec27" />
      <rect x="54" y="19" width="4" height="4" fill="#ffec27" />
      {/* Exhaust */}
      <rect x="4" y="16" width="4" height="3" fill="#4a4a6a" />
    </svg>
  );
}
