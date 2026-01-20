'use client';

import { memo } from 'react';

export interface MinimapData {
  centerPath: string;
  innerPath: string;
  outerPath: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

interface HUDProps {
  speed: number;
  rpm: number;
  gear: number;
  lap: number;
  totalLaps: number;
  position: number;
  totalRacers: number;
  lapTime: number;
  bestLapTime: number;
  carX?: number;
  carZ?: number;
  carRotation?: number;
  minimapData?: MinimapData;
}

function HUD({
  speed,
  rpm,
  gear,
  lap,
  totalLaps,
  position,
  totalRacers,
  lapTime,
  bestLapTime,
  carX = 0,
  carZ = 0,
  carRotation = 0,
  minimapData,
}: HUDProps) {
  const formatTime = (ms: number): string => {
    if (ms === 0) return '--:--.---';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const millis = Math.floor(ms % 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
  };

  // Calculate minimap transform based on track bounds
  const getMinimapTransform = () => {
    if (!minimapData) {
      return { scale: 1, offsetX: 0, offsetZ: 0, viewBox: '-120 -120 240 240' };
    }

    const { bounds } = minimapData;
    const trackWidth = bounds.maxX - bounds.minX;
    const trackHeight = bounds.maxZ - bounds.minZ;
    const maxDim = Math.max(trackWidth, trackHeight);

    // Center of the track
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;

    // Scale to fit in viewBox with padding
    const padding = 20;
    const viewSize = maxDim + padding * 2;

    return {
      scale: 200 / viewSize,
      offsetX: centerX,
      offsetZ: centerZ,
      viewBox: `${-viewSize / 2} ${-viewSize / 2} ${viewSize} ${viewSize}`,
    };
  };

  const minimapTransform = getMinimapTransform();

  // Transform car position to minimap coordinates
  const getCarMinimapPosition = () => {
    if (!minimapData) {
      return { x: 0, y: 0 };
    }

    // Transform world coordinates to SVG coordinates (centered around track center)
    const x = carX - minimapTransform.offsetX;
    const z = carZ - minimapTransform.offsetZ;

    return { x, y: z };
  };

  const carPos = getCarMinimapPosition();

  // Transform path to be centered around origin
  const transformPath = (path: string) => {
    if (!path || !minimapData) return path;

    // Parse and transform the path
    const parts = path.split(/(?=[MLZ])/);
    const transformed = parts.map(part => {
      const cmd = part.charAt(0);
      const coords = part.slice(1).trim();

      if (cmd === 'Z' || !coords) return part;

      const [x, z] = coords.split(' ').map(Number);
      const newX = x - minimapTransform.offsetX;
      const newZ = z - minimapTransform.offsetZ;

      return `${cmd} ${newX} ${newZ}`;
    });

    return transformed.join(' ');
  };

  return (
    <div className="hud-overlay font-pixel">
      {/* Scanlines over HUD */}
      <div className="absolute inset-0 scanlines pointer-events-none" />

      {/* Top Bar - Position and Lap */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
        {/* Position */}
        <div className="pixel-panel">
          <div className="text-[8px] text-pixel-gray uppercase tracking-wider mb-1">POS</div>
          <div className="text-2xl text-pixel-white">
            {position}<span className="text-sm text-pixel-gray">/{totalRacers}</span>
          </div>
        </div>

        {/* Lap Counter */}
        <div className="pixel-panel text-center">
          <div className="text-[8px] text-pixel-gray uppercase tracking-wider mb-1">LAP</div>
          <div className="text-2xl text-pixel-yellow">
            {lap}<span className="text-sm text-pixel-gray">/{totalLaps}</span>
          </div>
        </div>

        {/* Times */}
        <div className="pixel-panel text-right">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-end gap-2">
              <span className="text-[8px] text-pixel-gray">TIME</span>
              <span className="text-sm text-pixel-white">{formatTime(lapTime)}</span>
            </div>
            <div className="flex items-center justify-end gap-2">
              <span className="text-[8px] text-pixel-gray">BEST</span>
              <span className="text-sm text-pixel-cyan">{formatTime(bestLapTime)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom - Speedometer and Gear */}
      <div className="absolute bottom-4 right-4 flex items-end gap-3">
        {/* Gear Display */}
        <div className="pixel-panel text-center min-w-[60px]">
          <div className="text-[8px] text-pixel-gray uppercase mb-1">GEAR</div>
          <div className="text-3xl text-pixel-orange">
            {gear === 0 ? 'N' : gear === -1 ? 'R' : gear}
          </div>
        </div>

        {/* Digital Speedometer */}
        <div className="pixel-panel">
          <div className="text-[8px] text-pixel-gray uppercase mb-1">KM/H</div>
          <div className="digital-display text-3xl tabular-nums min-w-[100px] text-center">
            {Math.round(speed).toString().padStart(3, '0')}
          </div>
        </div>
      </div>

      {/* Pixelated Minimap */}
      <div className="absolute bottom-4 left-4 pixel-minimap w-44 h-44 p-2">
        <svg
          viewBox={minimapData ? minimapTransform.viewBox : '-120 -120 240 240'}
          className="w-full h-full"
          style={{ imageRendering: 'pixelated' }}
        >
          {minimapData ? (
            <>
              {/* Track surface - filled area between inner and outer paths */}
              <path
                d={transformPath(minimapData.outerPath)}
                fill="#4a4a6a"
                stroke="none"
              />
              <path
                d={transformPath(minimapData.innerPath)}
                fill="#0f0f23"
                stroke="none"
              />

              {/* Track edges */}
              <path
                d={transformPath(minimapData.innerPath)}
                fill="none"
                stroke="#2d2d44"
                strokeWidth="2"
              />
              <path
                d={transformPath(minimapData.outerPath)}
                fill="none"
                stroke="#2d2d44"
                strokeWidth="2"
              />

              {/* Center line - dashed */}
              <path
                d={transformPath(minimapData.centerPath)}
                fill="none"
                stroke="#fff1e8"
                strokeWidth="1"
                strokeDasharray="8 8"
              />

              {/* Start/finish marker */}
              <rect
                x={-minimapTransform.offsetX - 10}
                y={-minimapTransform.offsetZ - 2}
                width="20"
                height="4"
                fill="#fff1e8"
              />
            </>
          ) : (
            <>
              {/* Fallback: circular track */}
              <circle
                cx="0"
                cy="0"
                r="100"
                fill="none"
                stroke="#4a4a6a"
                strokeWidth="20"
              />
              <circle
                cx="0"
                cy="0"
                r="90"
                fill="none"
                stroke="#2d2d44"
                strokeWidth="2"
              />
              <circle
                cx="0"
                cy="0"
                r="110"
                fill="none"
                stroke="#2d2d44"
                strokeWidth="2"
              />
              <circle
                cx="0"
                cy="0"
                r="100"
                fill="none"
                stroke="#fff1e8"
                strokeWidth="2"
                strokeDasharray="8 8"
              />
              <rect x="-110" y="-4" width="25" height="8" fill="#fff1e8" />
            </>
          )}

          {/* Car indicator - chunky arrow */}
          <g transform={`translate(${carPos.x}, ${carPos.y}) rotate(${(carRotation) * 180 / Math.PI})`}>
            <rect x="-4" y="-8" width="8" height="16" fill="#ff004d" />
            <rect x="-6" y="4" width="4" height="4" fill="#ff004d" />
            <rect x="2" y="4" width="4" height="4" fill="#ff004d" />
          </g>
        </svg>
      </div>

      {/* Center notifications area */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 pointer-events-none">
        {/* Checkpoint, lap complete, etc. notifications will appear here */}
      </div>
    </div>
  );
}

export default memo(HUD);
