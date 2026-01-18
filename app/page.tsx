'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function Home() {
  const [showCar, setShowCar] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowCar(true), 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <main className="min-h-screen relative overflow-hidden bg-pixel-black">
      {/* Animated pixel grid background */}
      <div className="absolute inset-0 pixel-grid-bg opacity-30" />

      {/* Scanline overlay */}
      <div className="absolute inset-0 scanlines" />

      {/* CRT vignette */}
      <div className="absolute inset-0 crt-vignette" />

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-8">
        {/* Giant title with text shadow */}
        <div className="text-center mb-12">
          <h1 className="font-pixel text-4xl md:text-6xl lg:text-7xl text-pixel-cyan pixel-text-shadow mb-4 animate-pixel-pulse">
            PIXEL RACER
          </h1>
          <div className="font-pixel text-sm md:text-base text-pixel-orange animate-blink">
            INSERT COIN TO START
          </div>
        </div>

        {/* Chunky 8-bit menu buttons */}
        <div className="flex flex-col gap-4 mb-12">
          <Link href="/play?mode=time-trial" className="btn btn-primary text-center">
            TIME TRIAL
          </Link>
          <Link href="/play?mode=race" className="btn btn-secondary text-center">
            RACE VS AI
          </Link>
          <Link href="/leaderboard" className="btn btn-secondary text-center">
            HIGH SCORES
          </Link>
        </div>

        {/* Feature cards with pixel styling */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl w-full">
          <FeatureCard
            icon="🏎️"
            title="ARCADE"
            description="Classic arcade racing action"
          />
          <FeatureCard
            icon="👾"
            title="RETRO"
            description="Authentic 8-bit pixel graphics"
          />
          <FeatureCard
            icon="🏆"
            title="COMPETE"
            description="Beat the high score table"
          />
        </div>

        {/* Animated pixel car at bottom */}
        <div className={`absolute bottom-8 transition-all duration-1000 ${showCar ? 'left-1/2 -translate-x-1/2' : '-left-32'}`}>
          <PixelCar />
        </div>

        {/* Credits */}
        <div className="absolute bottom-4 font-pixel text-[8px] text-pixel-gray">
          © 2024 PIXEL RACER - PRESS START
        </div>
      </div>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="pixel-panel text-center">
      <div className="text-3xl mb-2">{icon}</div>
      <h3 className="font-pixel text-xs text-pixel-yellow mb-2">{title}</h3>
      <p className="font-pixel-body text-lg text-pixel-white">{description}</p>
    </div>
  );
}

function PixelCar() {
  return (
    <svg width="80" height="40" viewBox="0 0 80 40" className="animate-bounce">
      {/* Car body - chunky pixels */}
      <rect x="8" y="16" width="64" height="16" fill="#ff004d" />
      <rect x="16" y="8" width="40" height="8" fill="#ff004d" />
      {/* Windows */}
      <rect x="20" y="10" width="14" height="6" fill="#29adff" />
      <rect x="38" y="10" width="14" height="6" fill="#29adff" />
      {/* Wheels - square for pixel look */}
      <rect x="12" y="28" width="12" height="12" fill="#1a1a2e" />
      <rect x="56" y="28" width="12" height="12" fill="#1a1a2e" />
      {/* Wheel highlights */}
      <rect x="14" y="30" width="4" height="4" fill="#4a4a6a" />
      <rect x="58" y="30" width="4" height="4" fill="#4a4a6a" />
      {/* Headlights */}
      <rect x="68" y="20" width="4" height="4" fill="#ffec27" />
      <rect x="68" y="26" width="4" height="4" fill="#ffec27" />
      {/* Taillights */}
      <rect x="8" y="20" width="4" height="4" fill="#ff004d" />
      <rect x="8" y="26" width="4" height="4" fill="#ff004d" />
    </svg>
  );
}
