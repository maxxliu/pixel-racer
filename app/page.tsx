'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

interface GlobalLeaderboardEntry {
  id: string;
  playerName: string;
  timeMs: number;
  gameMode: string;
  createdAt: string;
  trackId: string;
  trackName: string;
}

function formatTime(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const centiseconds = Math.floor((ms % 1000) / 10);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
}

export default function Home() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [scores, setScores] = useState<GlobalLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchScores() {
      try {
        const res = await fetch('/api/leaderboard/global?limit=10');
        if (res.ok) {
          const data = await res.json();
          setScores(data);
        }
      } catch (error) {
        console.error('Failed to fetch leaderboard:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchScores();
  }, []);

  return (
    <main className={`min-h-screen relative overflow-hidden ${isDarkMode ? 'bg-[#0a0a12]' : 'bg-[#87CEEB]'}`}>
      {/* Retro racing background */}
      <RacingBackground isDarkMode={isDarkMode} />

      {/* Dark/Light mode toggle - bottom right */}
      <button
        onClick={() => setIsDarkMode(!isDarkMode)}
        className="absolute bottom-4 right-4 z-20 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-2 font-pixel text-xs text-white hover:bg-black/70 transition-colors flex items-center gap-2"
      >
        {isDarkMode ? (
          <>
            <span className="text-yellow-300">☀</span> DAY
          </>
        ) : (
          <>
            <span className="text-blue-200">☾</span> NIGHT
          </>
        )}
      </button>

      {/* Main content - centered */}
      <div className="relative z-10 flex flex-col items-center min-h-screen p-8" style={{ paddingTop: '30vh' }}>
        {/* Giant title with cloud-like styling */}
        <div className="text-center mb-6">
          <h1 className="font-pixel text-4xl md:text-6xl lg:text-7xl text-white mb-4"
              style={{
                textShadow: `
                  0 4px 0 rgba(200, 220, 240, 0.8),
                  0 8px 0 rgba(180, 200, 220, 0.5),
                  0 12px 8px rgba(100, 140, 180, 0.3),
                  0 0 20px rgba(255, 255, 255, 0.5),
                  0 0 40px rgba(255, 255, 255, 0.3)
                `
              }}>
            PIXEL RACER
          </h1>
        </div>

        {/* Frosted glass menu panel */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 shadow-lg">
          <div className="flex flex-col sm:flex-row flex-wrap gap-4 justify-center">
            <Link href="/play?mode=time-trial" className="btn btn-primary text-center">
              TIME TRIAL
            </Link>
            <Link href="/play?mode=race" className="btn btn-secondary text-center">
              RACE VS AI
            </Link>
            <Link href="/create-track" className="btn btn-secondary text-center">
              CREATE TRACK
            </Link>
            <Link href="/tracks" className="btn btn-secondary text-center">
              TRACK LIBRARY
            </Link>
          </div>
        </div>
      </div>

      {/* Leaderboard panel - fixed right side on lg+ screens */}
      <div className="hidden lg:block lg:fixed lg:right-4 lg:top-1/2 lg:-translate-y-1/2 lg:w-80 xl:w-96 z-10">
        <div className="bg-black/70 backdrop-blur-md border-2 border-white/10 rounded-lg overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/10 bg-white/5">
            <h2 className="font-pixel text-sm text-yellow-400 text-center pixel-text-shadow">
              HIGH SCORES
            </h2>
          </div>

          {/* Scores container */}
          <div className="p-3 max-h-[50vh] overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center">
                <div className="font-pixel text-[10px] text-pixel-gray animate-pulse">
                  LOADING...
                </div>
              </div>
            ) : scores.length === 0 ? (
              <div className="py-8 text-center">
                <div className="font-pixel text-[10px] text-pixel-gray">
                  NO RECORDS YET
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {scores.slice(0, 10).map((score, index) => (
                  <div
                    key={score.id}
                    className={`flex items-center gap-3 p-2 rounded transition-colors ${
                      index === 0
                        ? 'bg-yellow-500/15 border-l-2 border-yellow-400'
                        : index === 1
                        ? 'bg-gray-400/10 border-l-2 border-gray-400'
                        : index === 2
                        ? 'bg-orange-500/15 border-l-2 border-orange-500'
                        : 'hover:bg-white/5 border-l-2 border-transparent'
                    }`}
                  >
                    {/* Rank */}
                    <span className={`font-pixel text-[10px] w-5 ${
                      index === 0 ? 'text-yellow-400'
                      : index === 1 ? 'text-gray-400'
                      : index === 2 ? 'text-orange-400'
                      : 'text-gray-600'
                    }`}>
                      {index + 1}.
                    </span>

                    {/* Player name */}
                    <span className={`font-pixel text-[10px] flex-1 truncate ${
                      index === 0 ? 'text-yellow-300'
                      : index === 1 ? 'text-gray-300'
                      : index === 2 ? 'text-orange-300'
                      : 'text-white/80'
                    }`}>
                      {score.playerName}
                    </span>

                    {/* Time */}
                    <span className={`font-pixel text-[10px] tabular-nums ${
                      index === 0 ? 'text-yellow-400'
                      : index === 1 ? 'text-gray-400'
                      : index === 2 ? 'text-orange-400'
                      : 'text-white/60'
                    }`}>
                      {formatTime(score.timeMs)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer link */}
          <div className="px-4 py-3 border-t border-white/10">
            <Link
              href="/leaderboard"
              className="block font-pixel text-[9px] text-gray-500 hover:text-yellow-400 text-center transition-colors"
            >
              VIEW ALL SCORES →
            </Link>
          </div>
        </div>
      </div>

      {/* Credits */}
      <div className="absolute bottom-4 left-4 z-10 font-pixel text-[8px] text-pixel-gray">
        © 2024 PIXEL RACER
      </div>
    </main>
  );
}

function RacingBackground({ isDarkMode }: { isDarkMode: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Configuration
    const config = {
      roadWidth: 2000,
      segmentLength: 200,
      rumbleLength: 3,
      lanes: 3,
      cameraHeight: 1000,
      cameraDepth: 0.84,
      drawDistance: 100,
      fogDensity: 5,
      curveStrength: 2000,
      carWidth: 250,
      carHeight: 140,
      carScreenY: 0.65,
    };

    // Color palettes for day and night modes - high contrast road vs grass
    const dayColors = {
      sky: '#87CEEB',
      skyGradient: ['#1a4d7c', '#4A90D9', '#87CEEB', '#b8dff5', '#d4ecfc'],
      horizon: '#e0f0ff',
      fog: '#c5dff5',
      road: { dark: '#555555', light: '#777777' },  // Grey asphalt - clearly different from green
      rumble: { dark: '#dc2626', light: '#ffffff' },
      lane: '#ffffff',
      grass: { dark: '#15803d', light: '#4ade80' },  // Higher contrast green stripes
      sun: true,
      stars: false,
    };

    const nightColors = {
      sky: '#0a0a12',
      skyGradient: ['#0a0a12', '#12121f', '#1a1a2e', '#252540', '#2d1f3d'],
      horizon: '#1a1a2e',
      fog: '#1a1a2e',
      road: { dark: '#4a4a4a', light: '#5a5a5a' },  // Grey asphalt
      rumble: { dark: '#dc2626', light: '#ffffff' },
      lane: '#ffffff',
      grass: { dark: '#14532d', light: '#22c55e' },  // Higher contrast night grass
      sun: false,
      stars: true,
    };

    const colors = isDarkMode ? nightColors : dayColors;

    // Curve sections for the track
    const curveSections = [
      { start: 0, end: 15, curve: 0 },
      { start: 15, end: 35, curve: 0.5 },
      { start: 35, end: 50, curve: 0 },
      { start: 50, end: 70, curve: -0.7 },
      { start: 70, end: 85, curve: 0.3 },
      { start: 85, end: 100, curve: 0 },
    ];

    // Get curve for segment
    function getCurve(index: number): number {
      const normalizedIndex = (index % config.drawDistance) / config.drawDistance * 100;
      for (const section of curveSections) {
        if (normalizedIndex >= section.start && normalizedIndex < section.end) {
          return section.curve;
        }
      }
      return 0;
    }

    // Road segments
    interface Segment {
      index: number;
      p1: { world: { z: number }; camera: { x: number; y: number; z: number }; screen: { x: number; y: number; w: number; scale: number } };
      p2: { world: { z: number }; camera: { x: number; y: number; z: number }; screen: { x: number; y: number; w: number; scale: number } };
      color: { road: string; grass: string; rumble: string };
      curve: number;
    }

    const segments: Segment[] = [];
    const trackLength = config.segmentLength * config.drawDistance;

    // Build road segments
    const grassStripeWidth = 5; // Wider stripes for visible mowed grass effect
    for (let i = 0; i < config.drawDistance; i++) {
      const rumbleDark = Math.floor(i / config.rumbleLength) % 2 === 0;
      const grassDark = Math.floor(i / grassStripeWidth) % 2 === 0;
      segments.push({
        index: i,
        p1: { world: { z: i * config.segmentLength }, camera: { x: 0, y: 0, z: 0 }, screen: { x: 0, y: 0, w: 0, scale: 0 } },
        p2: { world: { z: (i + 1) * config.segmentLength }, camera: { x: 0, y: 0, z: 0 }, screen: { x: 0, y: 0, w: 0, scale: 0 } },
        color: {
          road: rumbleDark ? colors.road.dark : colors.road.light,
          grass: grassDark ? colors.grass.dark : colors.grass.light,
          rumble: rumbleDark ? colors.rumble.dark : colors.rumble.light,
        },
        curve: getCurve(i),
      });
    }

    // Barriers on both sides - extended all the way to horizon
    interface Barrier {
      z: number;
      side: 'left' | 'right';
    }
    const barriers: Barrier[] = [];
    for (let i = 0; i < 50; i++) {
      barriers.push({ z: i * 500 + 200, side: 'left' });
      barriers.push({ z: i * 500 + 200, side: 'right' });
    }

    // AI Cars
    interface AICar {
      z: number;
      lane: number;
      speed: number;
      color: string;
      stripeColor: string;
    }

    // AI cars - positive speed means slower than player (player catches up)
    // Only use lanes -1 (left) and 1 (right), not center lane 0 where player is
    const aiCars: AICar[] = [
      { z: 2000, lane: -1, speed: 100, color: '#2563eb', stripeColor: '#ffffff' },
      { z: 4000, lane: 1, speed: 90, color: '#ea580c', stripeColor: '#ffffff' },
      { z: 6000, lane: -1, speed: 110, color: '#0d9488', stripeColor: '#fbbf24' },
      { z: 8000, lane: 1, speed: 85, color: '#7c3aed', stripeColor: '#ffffff' },
      { z: 10000, lane: -1, speed: 95, color: '#dc2626', stripeColor: '#000000' },
    ];

    // Grandstands - now span multiple Z positions for 3D depth
    interface Grandstand {
      zStart: number;
      zEnd: number;
      side: 'left' | 'right';
      height: number;
    }

    const grandstands: Grandstand[] = [
      { zStart: 1500, zEnd: 3500, side: 'left', height: 1.0 },
      { zStart: 1500, zEnd: 3000, side: 'right', height: 0.9 },
      { zStart: 7000, zEnd: 10000, side: 'left', height: 1.1 },
      { zStart: 13000, zEnd: 16000, side: 'right', height: 1.0 },
    ];

    // Animation state
    let position = 0;
    const speed = 150;
    let animationId: number;

    // Project 3D to 2D with curve offset
    function project(
      p: { world: { z: number }; camera: { x: number; y: number; z: number }; screen: { x: number; y: number; w: number; scale: number } },
      cameraX: number,
      cameraY: number,
      cameraZ: number,
      width: number,
      height: number,
      dx: number = 0
    ) {
      p.camera.x = dx - cameraX;
      p.camera.y = config.cameraHeight - cameraY;
      p.camera.z = p.world.z - cameraZ;

      if (p.camera.z <= 0) {
        p.screen.scale = 0;
        return;
      }

      p.screen.scale = config.cameraDepth / p.camera.z;
      p.screen.x = Math.round(width / 2 + p.screen.scale * p.camera.x * width / 2);
      p.screen.y = Math.round(height / 2 + p.screen.scale * p.camera.y * height / 2);
      p.screen.w = Math.round(p.screen.scale * config.roadWidth * width / 2);
    }

    // Draw a polygon
    function polygon(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number, color: string) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.lineTo(x4, y4);
      ctx.closePath();
      ctx.fill();
    }

    // Draw 8-bit pixel cloud
    function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
      const pixelSize = Math.max(4, Math.floor(size / 10));
      const ps = pixelSize;

      // Cloud pixel pattern (each 1 = white pixel)
      // Pattern creates a fluffy cloud shape
      const pattern = [
        [0,0,0,1,1,1,0,0,0,0,0,0],
        [0,0,1,1,1,1,1,0,1,1,0,0],
        [0,1,1,1,1,1,1,1,1,1,1,0],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [0,1,1,1,1,1,1,1,1,1,1,0],
        [0,0,1,1,1,1,1,1,1,1,0,0],
      ];

      const cloudWidth = pattern[0].length * ps;
      const cloudHeight = pattern.length * ps;
      const startX = x - cloudWidth / 2;
      const startY = y - cloudHeight / 2;

      // Draw highlight (top edge, slightly brighter)
      ctx.fillStyle = 'rgba(255, 255, 255, 1)';
      for (let row = 0; row < pattern.length; row++) {
        for (let col = 0; col < pattern[row].length; col++) {
          if (pattern[row][col] === 1) {
            // Check if this is a top-edge pixel
            const isTop = row === 0 || pattern[row - 1]?.[col] !== 1;
            ctx.fillStyle = isTop ? 'rgba(255, 255, 255, 1)' : 'rgba(240, 248, 255, 0.95)';
            ctx.fillRect(startX + col * ps, startY + row * ps, ps, ps);
          }
        }
      }

      // Add subtle shadow at bottom
      ctx.fillStyle = 'rgba(200, 220, 240, 0.6)';
      for (let col = 0; col < pattern[0].length; col++) {
        // Find bottom pixel in this column
        for (let row = pattern.length - 1; row >= 0; row--) {
          if (pattern[row][col] === 1) {
            ctx.fillRect(startX + col * ps, startY + row * ps + ps * 0.6, ps, ps * 0.4);
            break;
          }
        }
      }
    }

    // Draw AI car - positioned on the ground (screenY is road surface)
    function drawAICar(
      ctx: CanvasRenderingContext2D,
      screenX: number,
      screenY: number,
      scale: number,
      color: string,
      stripeColor: string,
      width: number
    ) {
      const carW = scale * 600 * width / 2;
      const carH = scale * 350 * width / 2;

      if (carW < 5) return;

      // Ground level is screenY, car sits on top of it
      const groundY = screenY;

      // Shadow on ground
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(screenX, groundY, carW * 0.4, carH * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();

      // Wheels (on ground)
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(screenX - carW * 0.42, groundY - carH * 0.25, carW * 0.12, carH * 0.25);
      ctx.fillRect(screenX + carW * 0.30, groundY - carH * 0.25, carW * 0.12, carH * 0.25);

      // Body (above wheels)
      ctx.fillStyle = color;
      ctx.fillRect(screenX - carW * 0.38, groundY - carH * 0.55, carW * 0.76, carH * 0.35);
      ctx.fillRect(screenX - carW * 0.32, groundY - carH * 0.75, carW * 0.64, carH * 0.22);

      // Stripe
      ctx.fillStyle = stripeColor;
      ctx.fillRect(screenX - carW * 0.04, groundY - carH * 0.75, carW * 0.08, carH * 0.55);

      // Windshield
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(screenX - carW * 0.22, groundY - carH * 0.72, carW * 0.44, carH * 0.1);

      // Rear lights
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(screenX - carW * 0.32, groundY - carH * 0.35, carW * 0.12, carH * 0.06);
      ctx.fillRect(screenX + carW * 0.20, groundY - carH * 0.35, carW * 0.12, carH * 0.06);
    }

    // Seeded random for deterministic crowd
    function seededRandom(seed: number): number {
      const x = Math.sin(seed * 9999) * 10000;
      return x - Math.floor(x);
    }

    // Draw 3D grandstand section between two projected points
    function drawGrandstand3D(
      ctx: CanvasRenderingContext2D,
      // Front edge (closer to camera)
      frontX: number, frontY: number, frontW: number, frontScale: number,
      // Back edge (further from camera)
      backX: number, backY: number, backW: number, backScale: number,
      side: 'left' | 'right',
      standHeight: number,
      canvasWidth: number,
      seedBase: number
    ) {
      if (frontScale < 0.00001 || backScale < 0.00001) return;

      const heightFront = frontScale * 800 * standHeight * canvasWidth / 2;
      const heightBack = backScale * 800 * standHeight * canvasWidth / 2;

      if (heightFront < 3) return;

      // Calculate grandstand edges based on road width
      const offsetFront = frontW * 1.25;
      const offsetBack = backW * 1.25;
      const standWidthFront = frontW * 1.0;
      const standWidthBack = backW * 1.0;

      let innerFrontX: number, outerFrontX: number, innerBackX: number, outerBackX: number;

      if (side === 'left') {
        innerFrontX = frontX - offsetFront;
        outerFrontX = innerFrontX - standWidthFront;
        innerBackX = backX - offsetBack;
        outerBackX = innerBackX - standWidthBack;
      } else {
        innerFrontX = frontX + offsetFront;
        outerFrontX = innerFrontX + standWidthFront;
        innerBackX = backX + offsetBack;
        outerBackX = innerBackX + standWidthBack;
      }

      // Skip if off screen
      if (side === 'left' && outerFrontX > canvasWidth) return;
      if (side === 'right' && innerFrontX < 0) return;

      // Colors
      const baseColor = isDarkMode ? '#2a2a3a' : '#4a5a6a';
      const outerWallColor = isDarkMode ? '#3a3a4a' : '#5a6a7a';
      const backWallColor = isDarkMode ? '#252535' : '#3a4a5a';
      const tierTopColors = isDarkMode
        ? ['#3a3a4a', '#454555', '#505060', '#5a5a6a', '#656575']
        : ['#7080900', '#8090a0', '#90a0b0', '#a0b0c0', '#b0c0d0'];
      const tierFrontColor = isDarkMode ? '#3a3a4a' : '#607080';
      const crowdColors = ['#ef4444', '#3b82f6', '#fbbf24', '#22c55e', '#f97316', '#a855f7', '#ec4899', '#14b8a6'];

      // Draw back wall first (closes off the back of the stand)
      ctx.fillStyle = backWallColor;
      ctx.beginPath();
      ctx.moveTo(innerBackX, backY);
      ctx.lineTo(innerBackX, backY - heightBack);
      ctx.lineTo(outerBackX, backY - heightBack);
      ctx.lineTo(outerBackX, backY);
      ctx.closePath();
      ctx.fill();

      // Draw solid outer wall (the outside face away from track)
      ctx.fillStyle = outerWallColor;
      ctx.beginPath();
      ctx.moveTo(outerFrontX, frontY);
      ctx.lineTo(outerFrontX, frontY - heightFront);
      ctx.lineTo(outerBackX, backY - heightBack);
      ctx.lineTo(outerBackX, backY);
      ctx.closePath();
      ctx.fill();

      // Draw solid base/foundation (top surface at ground level)
      ctx.fillStyle = baseColor;
      ctx.beginPath();
      ctx.moveTo(innerFrontX, frontY);
      ctx.lineTo(outerFrontX, frontY);
      ctx.lineTo(outerBackX, backY);
      ctx.lineTo(innerBackX, backY);
      ctx.closePath();
      ctx.fill();

      // Draw 5 tiers with perspective
      const numTiers = 5;
      for (let tier = 0; tier < numTiers; tier++) {
        const tierRatio = tier / numTiers;
        const nextTierRatio = (tier + 1) / numTiers;

        // Tier heights with perspective
        const tierBottomFront = frontY - heightFront * tierRatio;
        const tierTopFront = frontY - heightFront * nextTierRatio;
        const tierBottomBack = backY - heightBack * tierRatio;
        const tierTopBack = backY - heightBack * nextTierRatio;

        // Tier X positions - each tier steps from inner toward outer
        // No direction flip needed - (outer - inner) already has correct sign for each side
        const stepBack = tier / numTiers;
        const nextStepBack = (tier + 1) / numTiers;
        const tierInnerFrontX = innerFrontX + (outerFrontX - innerFrontX) * stepBack;
        const tierOuterFrontX = innerFrontX + (outerFrontX - innerFrontX) * nextStepBack;
        const tierInnerBackX = innerBackX + (outerBackX - innerBackX) * stepBack;
        const tierOuterBackX = innerBackX + (outerBackX - innerBackX) * nextStepBack;

        // Draw top surface of tier (the seating area)
        ctx.fillStyle = tierTopColors[tier % tierTopColors.length];
        ctx.beginPath();
        ctx.moveTo(tierInnerFrontX, tierTopFront);
        ctx.lineTo(tierOuterFrontX, tierTopFront);
        ctx.lineTo(tierOuterBackX, tierTopBack);
        ctx.lineTo(tierInnerBackX, tierTopBack);
        ctx.closePath();
        ctx.fill();

        // Draw front face of tier (vertical riser) - only the inner edge faces the track
        ctx.fillStyle = tierFrontColor;
        ctx.beginPath();
        ctx.moveTo(tierInnerFrontX, tierBottomFront);
        ctx.lineTo(tierInnerFrontX, tierTopFront);
        ctx.lineTo(tierOuterFrontX, tierTopFront);
        ctx.lineTo(tierOuterFrontX, tierBottomFront);
        ctx.closePath();
        ctx.fill();

        // Draw inner side face of tier (the riser between tiers, facing track)
        ctx.fillStyle = isDarkMode ? '#2a2a3a' : '#506070';
        ctx.beginPath();
        ctx.moveTo(tierInnerFrontX, tierBottomFront);
        ctx.lineTo(tierInnerFrontX, tierTopFront);
        ctx.lineTo(tierInnerBackX, tierTopBack);
        ctx.lineTo(tierInnerBackX, tierBottomBack);
        ctx.closePath();
        ctx.fill();

        // Draw crowd on the seating surface (deterministic based on seed)
        const dotSpacing = Math.max(3, heightFront * 0.08);
        const cols = Math.max(1, Math.floor(Math.abs(tierOuterFrontX - tierInnerFrontX) / dotSpacing));
        const rows = Math.max(1, Math.floor(Math.abs(tierTopBack - tierTopFront) / (dotSpacing * 0.4)));

        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const seed = seedBase + tier * 1000 + row * 100 + col;
            if (seededRandom(seed) < 0.85) {
              const colRatio = (col + 0.5) / cols;
              const rowRatio = (row + 0.5) / rows;

              // Interpolate position on the tier surface
              const leftX = tierInnerFrontX + (tierInnerBackX - tierInnerFrontX) * rowRatio;
              const rightX = tierOuterFrontX + (tierOuterBackX - tierOuterFrontX) * rowRatio;
              const dotX = leftX + (rightX - leftX) * colRatio;
              const topY = tierTopFront + (tierTopBack - tierTopFront) * rowRatio;
              const dotY = topY + dotSpacing * 0.2;

              const dotSize = Math.max(2, dotSpacing * 0.4 * (1 - rowRatio * 0.3));
              const colorIdx = Math.floor(seededRandom(seed + 0.5) * crowdColors.length);
              ctx.fillStyle = crowdColors[colorIdx];
              ctx.fillRect(dotX - dotSize / 2, dotY - dotSize / 2, dotSize, dotSize);
            }
          }
        }
      }
    }

    // Render loop
    function render() {
      if (!canvas || !ctx) return;
      const width = canvas.width;
      const height = canvas.height;

      // Clear with grass color (bottom half will be overwritten by road segments)
      ctx.fillStyle = colors.grass.dark;
      ctx.fillRect(0, 0, width, height);

      // Draw sky gradient from top to horizon
      const skyGradient = ctx.createLinearGradient(0, 0, 0, height * 0.5);
      skyGradient.addColorStop(0, colors.skyGradient[0]);
      skyGradient.addColorStop(0.25, colors.skyGradient[1]);
      skyGradient.addColorStop(0.5, colors.skyGradient[2]);
      skyGradient.addColorStop(0.75, colors.skyGradient[3]);
      skyGradient.addColorStop(1, colors.skyGradient[4]);
      ctx.fillStyle = skyGradient;
      ctx.fillRect(0, 0, width, height * 0.5);

      // Horizon line - subtle band
      ctx.fillStyle = isDarkMode ? 'rgba(255, 100, 80, 0.1)' : 'rgba(255, 255, 255, 0.15)';
      ctx.fillRect(0, height * 0.49, width, height * 0.02);

      // Night mode: Draw stars
      if (colors.stars) {
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 80; i++) {
          const x = (Math.sin(i * 567.8) * 0.5 + 0.5) * width;
          const y = (Math.sin(i * 234.5) * 0.5 + 0.5) * height * 0.4;
          const size = (Math.sin(i * 123.4) * 0.5 + 0.5) * 1.5 + 0.5;
          const flicker = Math.sin(Date.now() * 0.003 + i) * 0.3 + 0.7;
          ctx.globalAlpha = flicker * 0.8;
          ctx.fillRect(x, y, size, size);
        }
        ctx.globalAlpha = 1;

        // 8-bit pixel moon for night mode
        const moonX = width * 0.8;
        const moonY = height * 0.12;
        const moonPs = 5; // pixel size

        // Moon pixel pattern (0 = transparent, 1 = bright, 2 = shadow/crater, 3 = glow)
        const moonPattern = [
          [0,0,0,0,3,3,3,3,3,0,0,0,0],
          [0,0,3,3,1,1,1,1,1,3,3,0,0],
          [0,3,1,1,1,1,1,1,1,1,1,3,0],
          [0,3,1,1,2,1,1,1,1,1,1,3,0],
          [3,1,1,2,2,1,1,1,2,1,1,1,3],
          [3,1,1,1,1,1,1,1,1,1,1,1,3],
          [3,1,1,1,1,1,2,1,1,2,1,1,3],
          [3,1,1,1,1,1,2,2,1,1,1,1,3],
          [3,1,1,2,1,1,1,1,1,1,1,1,3],
          [0,3,1,1,1,1,1,1,1,1,1,3,0],
          [0,3,1,1,1,1,1,2,1,1,1,3,0],
          [0,0,3,3,1,1,1,1,1,3,3,0,0],
          [0,0,0,0,3,3,3,3,3,0,0,0,0],
        ];

        const moonWidth = moonPattern[0].length * moonPs;
        const moonHeight = moonPattern.length * moonPs;
        const moonStartX = moonX - moonWidth / 2;
        const moonStartY = moonY - moonHeight / 2;

        // Draw pixelated glow behind moon
        ctx.fillStyle = 'rgba(200, 220, 255, 0.08)';
        for (let i = 3; i > 0; i--) {
          ctx.fillRect(moonStartX - moonPs * i * 2, moonStartY - moonPs * i * 2, moonWidth + moonPs * i * 4, moonHeight + moonPs * i * 4);
        }

        // Draw moon pixels
        for (let row = 0; row < moonPattern.length; row++) {
          for (let col = 0; col < moonPattern[row].length; col++) {
            const pixel = moonPattern[row][col];
            if (pixel === 0) continue;

            if (pixel === 1) {
              ctx.fillStyle = '#e8e8f0'; // Bright moon surface
            } else if (pixel === 2) {
              ctx.fillStyle = '#b8b8c8'; // Crater shadow
            } else if (pixel === 3) {
              ctx.fillStyle = 'rgba(200, 220, 255, 0.3)'; // Glow edge
            }
            ctx.fillRect(moonStartX + col * moonPs, moonStartY + row * moonPs, moonPs, moonPs);
          }
        }
      }

      // Day mode: Draw 8-bit pixel sun and clouds
      if (colors.sun) {
        const sunX = width * 0.75;
        const sunY = height * 0.15;
        const pixelSize = 6;
        const ps = pixelSize;

        // 8-bit sun pixel pattern with rays
        // 0 = transparent, 1 = bright yellow, 2 = orange/gold center, 3 = ray color
        const sunPattern = [
          [0,0,0,0,0,3,0,0,0,3,0,0,0,0,0],
          [0,0,0,0,0,3,0,0,0,3,0,0,0,0,0],
          [0,0,0,0,0,0,1,1,1,0,0,0,0,0,0],
          [0,0,0,0,1,1,1,1,1,1,1,0,0,0,0],
          [0,0,0,1,1,1,2,2,2,1,1,1,0,0,0],
          [3,3,0,1,1,2,2,2,2,2,1,1,0,3,3],
          [0,0,1,1,1,2,2,2,2,2,1,1,1,0,0],
          [0,0,1,1,1,2,2,2,2,2,1,1,1,0,0],
          [0,0,1,1,1,2,2,2,2,2,1,1,1,0,0],
          [3,3,0,1,1,2,2,2,2,2,1,1,0,3,3],
          [0,0,0,1,1,1,2,2,2,1,1,1,0,0,0],
          [0,0,0,0,1,1,1,1,1,1,1,0,0,0,0],
          [0,0,0,0,0,0,1,1,1,0,0,0,0,0,0],
          [0,0,0,0,0,3,0,0,0,3,0,0,0,0,0],
          [0,0,0,0,0,3,0,0,0,3,0,0,0,0,0],
        ];

        const sunWidth = sunPattern[0].length * ps;
        const sunHeight = sunPattern.length * ps;
        const startX = sunX - sunWidth / 2;
        const startY = sunY - sunHeight / 2;

        // Draw glow behind sun (pixelated style)
        const glowSize = ps * 3;
        ctx.fillStyle = 'rgba(255, 255, 150, 0.15)';
        for (let i = 4; i > 0; i--) {
          ctx.fillRect(startX - glowSize * i, startY - glowSize * i, sunWidth + glowSize * i * 2, sunHeight + glowSize * i * 2);
        }

        // Draw sun pixels
        for (let row = 0; row < sunPattern.length; row++) {
          for (let col = 0; col < sunPattern[row].length; col++) {
            const pixel = sunPattern[row][col];
            if (pixel === 0) continue;

            if (pixel === 1) {
              ctx.fillStyle = '#FFE135'; // Bright yellow
            } else if (pixel === 2) {
              ctx.fillStyle = '#FFAA00'; // Orange/gold
            } else if (pixel === 3) {
              // Animated ray with pulse
              const pulse = Math.sin(Date.now() * 0.005 + row * 0.5) * 0.3 + 0.7;
              ctx.fillStyle = `rgba(255, 230, 100, ${pulse})`;
            }
            ctx.fillRect(startX + col * ps, startY + row * ps, ps, ps);
          }
        }

        // Draw 8-bit clouds with gentle oscillating drift
        const time = Date.now() * 0.0001;
        const drift1 = Math.sin(time) * width * 0.03;
        const drift2 = Math.sin(time * 0.7 + 1) * width * 0.025;
        const drift3 = Math.sin(time * 1.2 + 2) * width * 0.035;
        const drift4 = Math.sin(time * 0.5 + 3) * width * 0.02;

        drawCloud(ctx, width * 0.15 + drift1, height * 0.12, 60);
        drawCloud(ctx, width * 0.35 + drift2, height * 0.08, 50);
        drawCloud(ctx, width * 0.55 + drift3, height * 0.18, 55);
        drawCloud(ctx, width * 0.85 + drift4, height * 0.25, 45);
      }

      // Draw distant mountains at horizon
      const horizonY = height * 0.5;
      const mountainColor1 = isDarkMode ? '#1a1a2e' : '#4a7c59';
      const mountainColor2 = isDarkMode ? '#252540' : '#3d6b4f';
      const mountainColor3 = isDarkMode ? '#2d2d4a' : '#5a8f6a';

      // Back mountain range (lighter/further)
      ctx.fillStyle = mountainColor3;
      ctx.beginPath();
      ctx.moveTo(0, horizonY);
      ctx.lineTo(width * 0.1, horizonY - height * 0.08);
      ctx.lineTo(width * 0.2, horizonY - height * 0.05);
      ctx.lineTo(width * 0.35, horizonY - height * 0.12);
      ctx.lineTo(width * 0.5, horizonY - height * 0.06);
      ctx.lineTo(width * 0.65, horizonY - height * 0.1);
      ctx.lineTo(width * 0.8, horizonY - height * 0.07);
      ctx.lineTo(width * 0.9, horizonY - height * 0.09);
      ctx.lineTo(width, horizonY - height * 0.04);
      ctx.lineTo(width, horizonY);
      ctx.closePath();
      ctx.fill();

      // Middle mountain range
      ctx.fillStyle = mountainColor2;
      ctx.beginPath();
      ctx.moveTo(0, horizonY);
      ctx.lineTo(width * 0.05, horizonY - height * 0.04);
      ctx.lineTo(width * 0.15, horizonY - height * 0.07);
      ctx.lineTo(width * 0.25, horizonY - height * 0.03);
      ctx.lineTo(width * 0.4, horizonY - height * 0.08);
      ctx.lineTo(width * 0.55, horizonY - height * 0.04);
      ctx.lineTo(width * 0.7, horizonY - height * 0.06);
      ctx.lineTo(width * 0.85, horizonY - height * 0.03);
      ctx.lineTo(width * 0.95, horizonY - height * 0.05);
      ctx.lineTo(width, horizonY - height * 0.02);
      ctx.lineTo(width, horizonY);
      ctx.closePath();
      ctx.fill();

      // Front hills (darker/closer)
      ctx.fillStyle = mountainColor1;
      ctx.beginPath();
      ctx.moveTo(0, horizonY);
      ctx.lineTo(width * 0.08, horizonY - height * 0.025);
      ctx.lineTo(width * 0.2, horizonY - height * 0.04);
      ctx.lineTo(width * 0.3, horizonY - height * 0.015);
      ctx.lineTo(width * 0.45, horizonY - height * 0.035);
      ctx.lineTo(width * 0.6, horizonY - height * 0.02);
      ctx.lineTo(width * 0.75, horizonY - height * 0.03);
      ctx.lineTo(width * 0.88, horizonY - height * 0.015);
      ctx.lineTo(width, horizonY - height * 0.025);
      ctx.lineTo(width, horizonY);
      ctx.closePath();
      ctx.fill();

      // Camera position
      const cameraZ = position;

      // Find base segment
      const baseIndex = Math.floor(cameraZ / config.segmentLength) % segments.length;

      // First pass: calculate dx offsets for all segments
      const dxValues: number[] = [];
      let dx = 0;
      for (let n = config.drawDistance - 1; n >= 0; n--) {
        const segIndex = (baseIndex + n) % segments.length;
        const segment = segments[segIndex];
        const looped = segIndex < baseIndex ? trackLength : 0;

        // Project to get scale
        project(segment.p1, 0, 0, cameraZ - looped, width, height, 0);

        if (segment.p1.screen.scale > 0) {
          dx += segment.curve * config.curveStrength * segment.p1.screen.scale;
        }
        dxValues[n] = dx;
      }

      // Draw road segments from far to near
      let minY = height;

      for (let n = config.drawDistance - 1; n >= 0; n--) {
        const segIndex = (baseIndex + n) % segments.length;
        const segment = segments[segIndex];
        const looped = segIndex < baseIndex ? trackLength : 0;

        const segDx = dxValues[n] || 0;
        const nextDx = dxValues[n - 1] || 0;

        // Project segment points with curve offset
        project(segment.p1, 0, 0, cameraZ - looped, width, height, segDx);
        project(segment.p2, 0, 0, cameraZ - looped, width, height, nextDx);

        // Skip if behind camera or below draw area
        if (segment.p1.camera.z <= 0 || segment.p2.screen.y >= minY) continue;

        // Clamp segment top to horizon to prevent flickering
        const horizonClamp = height * 0.5;
        const clampedTopY = Math.max(segment.p2.screen.y, horizonClamp);

        // Draw grass base (clamped to not go above horizon)
        // Grass stripes are built into segment colors (alternating every 5 segments)
        polygon(ctx,
          0, clampedTopY,
          width, clampedTopY,
          width, segment.p1.screen.y,
          0, segment.p1.screen.y,
          segment.color.grass
        );

        // Draw road
        const rumbleW1 = segment.p1.screen.w * 1.15;
        const rumbleW2 = segment.p2.screen.w * 1.15;

        // Rumble strips
        polygon(ctx,
          segment.p1.screen.x - rumbleW1, segment.p1.screen.y,
          segment.p1.screen.x - segment.p1.screen.w, segment.p1.screen.y,
          segment.p2.screen.x - segment.p2.screen.w, segment.p2.screen.y,
          segment.p2.screen.x - rumbleW2, segment.p2.screen.y,
          segment.color.rumble
        );
        polygon(ctx,
          segment.p1.screen.x + segment.p1.screen.w, segment.p1.screen.y,
          segment.p1.screen.x + rumbleW1, segment.p1.screen.y,
          segment.p2.screen.x + rumbleW2, segment.p2.screen.y,
          segment.p2.screen.x + segment.p2.screen.w, segment.p2.screen.y,
          segment.color.rumble
        );

        // Road surface - use grey color directly
        const roadColor = isDarkMode
          ? (Math.floor(segment.index / config.rumbleLength) % 2 === 0 ? '#4a4a4a' : '#5a5a5a')
          : (Math.floor(segment.index / config.rumbleLength) % 2 === 0 ? '#555555' : '#777777');
        polygon(ctx,
          segment.p1.screen.x - segment.p1.screen.w, segment.p1.screen.y,
          segment.p1.screen.x + segment.p1.screen.w, segment.p1.screen.y,
          segment.p2.screen.x + segment.p2.screen.w, segment.p2.screen.y,
          segment.p2.screen.x - segment.p2.screen.w, segment.p2.screen.y,
          roadColor
        );

        // Edge lines (white)
        const edgeLineWidth1 = segment.p1.screen.w * 0.02;
        const edgeLineWidth2 = segment.p2.screen.w * 0.02;
        ctx.fillStyle = '#ffffff';

        // Left edge line
        polygon(ctx,
          segment.p1.screen.x - segment.p1.screen.w - edgeLineWidth1, segment.p1.screen.y,
          segment.p1.screen.x - segment.p1.screen.w, segment.p1.screen.y,
          segment.p2.screen.x - segment.p2.screen.w, segment.p2.screen.y,
          segment.p2.screen.x - segment.p2.screen.w - edgeLineWidth2, segment.p2.screen.y,
          '#ffffff'
        );

        // Right edge line
        polygon(ctx,
          segment.p1.screen.x + segment.p1.screen.w, segment.p1.screen.y,
          segment.p1.screen.x + segment.p1.screen.w + edgeLineWidth1, segment.p1.screen.y,
          segment.p2.screen.x + segment.p2.screen.w + edgeLineWidth2, segment.p2.screen.y,
          segment.p2.screen.x + segment.p2.screen.w, segment.p2.screen.y,
          '#ffffff'
        );

        // Lane markers (dashed)
        if (Math.floor(segment.index / config.rumbleLength) % 2 === 0) {
          const laneW = segment.p1.screen.w * 0.02;
          ctx.fillStyle = colors.lane;
          ctx.globalAlpha = 0.7;
          ctx.fillRect(segment.p1.screen.x - laneW / 2, segment.p2.screen.y, laneW, segment.p1.screen.y - segment.p2.screen.y);
          ctx.globalAlpha = 1;
        }

        minY = clampedTopY;
      }

      // Draw grandstands (z-sorted by back edge, furthest first)
      const sortedGrandstands = [...grandstands].sort((a, b) => {
        const aZ = ((a.zEnd - cameraZ) % trackLength + trackLength) % trackLength;
        const bZ = ((b.zEnd - cameraZ) % trackLength + trackLength) % trackLength;
        return bZ - aZ;
      });

      for (const stand of sortedGrandstands) {
        const frontZ = ((stand.zStart - cameraZ) % trackLength + trackLength) % trackLength;
        const backZ = ((stand.zEnd - cameraZ) % trackLength + trackLength) % trackLength;

        // Only draw if in visible range
        if (frontZ > 100 && backZ < config.segmentLength * config.drawDistance && backZ > frontZ) {
          // Project front edge
          const frontScale = config.cameraDepth / frontZ;
          const frontY = height / 2 + frontScale * config.cameraHeight * height / 2;
          const frontW = frontScale * config.roadWidth * width / 2;
          const frontSegIdx = Math.floor(frontZ / config.segmentLength);
          const frontDx = dxValues[config.drawDistance - 1 - frontSegIdx] || 0;
          const frontX = width / 2 + frontDx;

          // Project back edge
          const backScale = config.cameraDepth / backZ;
          const backY = height / 2 + backScale * config.cameraHeight * height / 2;
          const backW = backScale * config.roadWidth * width / 2;
          const backSegIdx = Math.floor(backZ / config.segmentLength);
          const backDx = dxValues[config.drawDistance - 1 - backSegIdx] || 0;
          const backX = width / 2 + backDx;

          if (frontY < height && backY > height * 0.5) {
            drawGrandstand3D(
              ctx,
              frontX, frontY, frontW, frontScale,
              backX, backY, backW, backScale,
              stand.side,
              stand.height,
              width,
              stand.zStart // Use zStart as seed for deterministic crowd
            );
          }
        }
      }

      // Draw barriers with fade - extended to horizon
      for (const barrier of barriers) {
        const barrierZ = ((barrier.z - cameraZ) % trackLength + trackLength) % trackLength;
        if (barrierZ > 0 && barrierZ < config.segmentLength * config.drawDistance) {
          const scale = config.cameraDepth / barrierZ;
          const screenY = height / 2 + scale * config.cameraHeight * height / 2;
          const barrierWidth = Math.max(2, scale * 200 * width / 2);
          const barrierHeight = Math.max(2, scale * 400 * height / 2);
          const xOffset = scale * config.roadWidth * 1.3 * width / 2;

          // Calculate dx for barrier position
          const segIdx = Math.floor(barrierZ / config.segmentLength);
          const barrierDx = dxValues[config.drawDistance - 1 - segIdx] || 0;

          // Draw all the way to horizon
          if (screenY < height && screenY > horizonY) {
            // Stronger fade for distant barriers
            const distanceFactor = (screenY - horizonY) / (height - horizonY);
            const alpha = Math.min(1, distanceFactor * 2);
            ctx.globalAlpha = alpha;

            const x = barrier.side === 'left'
              ? width / 2 - xOffset + barrierDx
              : width / 2 + xOffset - barrierWidth + barrierDx;

            // Barrier post
            ctx.fillStyle = '#dc2626';
            ctx.fillRect(x, screenY - barrierHeight, barrierWidth, barrierHeight);

            // White stripe (only if visible enough)
            if (barrierWidth > 3) {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(x, screenY - barrierHeight * 0.6, barrierWidth, barrierHeight * 0.2);
            }

            ctx.globalAlpha = 1;
          }
        }
      }

      // Draw AI cars (z-sorted)
      const sortedAiCars = [...aiCars].sort((a, b) => {
        const aZ = ((a.z - cameraZ) % trackLength + trackLength) % trackLength;
        const bZ = ((b.z - cameraZ) % trackLength + trackLength) % trackLength;
        return bZ - aZ;
      });

      for (const car of sortedAiCars) {
        const carZ = ((car.z - cameraZ) % trackLength + trackLength) % trackLength;

        // Draw car if it's within visible range (ahead of player, within draw distance)
        if (carZ > 100 && carZ < config.segmentLength * config.drawDistance) {
          const scale = config.cameraDepth / carZ;
          const screenY = height / 2 + scale * config.cameraHeight * height / 2;
          const laneOffset = car.lane * config.roadWidth * 0.3;
          const xOffset = scale * laneOffset * width / 2;

          // Calculate dx for car position
          const segIdx = Math.floor(carZ / config.segmentLength);
          const carDx = dxValues[config.drawDistance - 1 - segIdx] || 0;

          const screenX = width / 2 + xOffset + carDx;

          // Draw if on screen and above horizon
          if (screenY < height && screenY > height * 0.45) {
            drawAICar(ctx, screenX, screenY, scale, car.color, car.stripeColor, width);
          }
        }

        // Update AI car position (slower than player, so player catches up)
        car.z += car.speed;
        if (car.z > trackLength) car.z -= trackLength;

        // Only respawn car after it's been fully passed (behind player)
        const relativeZ = ((car.z - cameraZ) % trackLength + trackLength) % trackLength;
        if (relativeZ < 100 || relativeZ > trackLength - 500) {
          // Car has been passed - respawn at horizon distance so it appears naturally
          const horizonDistance = config.segmentLength * config.drawDistance * 0.95;
          car.z = cameraZ + horizonDistance + Math.random() * 2000;
          if (car.z > trackLength) car.z -= trackLength;
          // Randomize lane on respawn (only left or right, not center)
          car.lane = Math.random() < 0.5 ? -1 : 1;
        }
      }

      // Draw player car - positioned on the road
      const carWidth = config.carWidth;
      const carHeight = config.carHeight;
      const carX = width / 2 - carWidth / 2;
      // Ground level is where wheels touch
      const groundY = height * 0.85;
      const bob = Math.sin(Date.now() * 0.02) * 2;

      // Car shadow on ground
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.ellipse(width / 2, groundY + 5, carWidth * 0.4, 12, 0, 0, Math.PI * 2);
      ctx.fill();

      // Wheels (touching ground)
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(carX + 5, groundY - 50 + bob, 28, 50);
      ctx.fillRect(carX + carWidth - 33, groundY - 50 + bob, 28, 50);

      // Car body (above wheels)
      ctx.fillStyle = '#171717';
      ctx.fillRect(carX + 25, groundY - 70 + bob, carWidth - 50, 45);
      ctx.fillRect(carX + 40, groundY - 95 + bob, carWidth - 80, 30);

      // Racing stripe
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(carX + carWidth / 2 - 12, groundY - 95 + bob, 24, 70);

      // Windshield
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(carX + 55, groundY - 90 + bob, carWidth - 110, 18);

      // Rear lights
      const lightFlicker = Math.sin(Date.now() * 0.01) * 0.3 + 0.7;
      ctx.fillStyle = `rgba(220, 38, 38, ${lightFlicker})`;
      ctx.fillRect(carX + 30, groundY - 40 + bob, 35, 10);
      ctx.fillRect(carX + carWidth - 65, groundY - 40 + bob, 35, 10);

      // Light glow
      ctx.fillStyle = `rgba(255, 50, 50, ${lightFlicker * 0.4})`;
      ctx.fillRect(carX + 26, groundY - 44 + bob, 43, 18);
      ctx.fillRect(carX + carWidth - 69, groundY - 44 + bob, 43, 18);

      // Exhaust flames
      const flameHeight1 = 10 + Math.sin(Date.now() * 0.05) * 8;
      const flameHeight2 = 10 + Math.sin(Date.now() * 0.05 + 1) * 8;
      ctx.fillStyle = '#fbbf24';
      ctx.globalAlpha = 0.8;
      ctx.fillRect(carX + 75, groundY + bob, 14, flameHeight1);
      ctx.fillRect(carX + carWidth - 89, groundY + bob, 14, flameHeight2);
      ctx.fillStyle = '#ea580c';
      ctx.fillRect(carX + 78, groundY + 3 + bob, 8, flameHeight1 - 5);
      ctx.fillRect(carX + carWidth - 86, groundY + 3 + bob, 8, flameHeight2 - 5);
      ctx.globalAlpha = 1;

      // Spoiler
      ctx.fillStyle = '#262626';
      ctx.fillRect(carX + 20, groundY - 100 + bob, carWidth - 40, 8);
      ctx.fillRect(carX + 35, groundY - 108 + bob, 12, 18);
      ctx.fillRect(carX + carWidth - 47, groundY - 108 + bob, 12, 18);

      // Vignette
      const vignetteGradient = ctx.createRadialGradient(width / 2, height / 2, height * 0.3, width / 2, height / 2, height);
      vignetteGradient.addColorStop(0, 'transparent');
      vignetteGradient.addColorStop(1, 'rgba(0,0,0,0.3)');
      ctx.fillStyle = vignetteGradient;
      ctx.fillRect(0, 0, width, height);

      // Update position
      position += speed;
      if (position >= trackLength) position -= trackLength;

      animationId = requestAnimationFrame(render);
    }

    // Handle resize
    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    window.addEventListener('resize', resize);
    resize();
    render();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, [isDarkMode]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
