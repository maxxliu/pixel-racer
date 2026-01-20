'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import type { Point2D } from '@/lib/track/TrackGeometryUtils';

export interface DrawingCanvasProps {
  width?: number;
  height?: number;
  worldBounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  onPointsChange?: (points: Point2D[]) => void;
  showGrid?: boolean;
  gridSize?: number;
  strokeColor?: string;
  strokeWidth?: number;
  minPointDistance?: number;
  disabled?: boolean;
}

const DEFAULT_WORLD_BOUNDS = {
  minX: -150,
  maxX: 150,
  minZ: -150,
  maxZ: 150
};

export default function DrawingCanvas({
  width = 600,
  height = 600,
  worldBounds = DEFAULT_WORLD_BOUNDS,
  onPointsChange,
  showGrid = true,
  gridSize = 20,
  strokeColor = '#dc2626',
  strokeWidth = 3,
  minPointDistance = 5,
  disabled = false
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [points, setPoints] = useState<Point2D[]>([]);
  const [lastPoint, setLastPoint] = useState<Point2D | null>(null);

  // Convert screen coordinates to world coordinates
  const screenToWorld = useCallback((screenX: number, screenY: number): Point2D => {
    const worldWidth = worldBounds.maxX - worldBounds.minX;
    const worldHeight = worldBounds.maxZ - worldBounds.minZ;

    return {
      x: worldBounds.minX + (screenX / width) * worldWidth,
      z: worldBounds.minZ + (screenY / height) * worldHeight
    };
  }, [width, height, worldBounds]);

  // Convert world coordinates to screen coordinates
  const worldToScreen = useCallback((worldX: number, worldZ: number): { x: number; y: number } => {
    const worldWidth = worldBounds.maxX - worldBounds.minX;
    const worldHeight = worldBounds.maxZ - worldBounds.minZ;

    return {
      x: ((worldX - worldBounds.minX) / worldWidth) * width,
      y: ((worldZ - worldBounds.minZ) / worldHeight) * height
    };
  }, [width, height, worldBounds]);

  // Draw the canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#171717';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    if (showGrid) {
      ctx.strokeStyle = '#262626';
      ctx.lineWidth = 1;

      const worldWidth = worldBounds.maxX - worldBounds.minX;
      const worldHeight = worldBounds.maxZ - worldBounds.minZ;
      const screenGridSize = (gridSize / worldWidth) * width;

      for (let x = 0; x <= width; x += screenGridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      for (let y = 0; y <= height; y += screenGridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw center lines
      ctx.strokeStyle = '#404040';
      ctx.beginPath();
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width / 2, height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
    }

    // Draw the path
    if (points.length > 0) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      const firstScreen = worldToScreen(points[0].x, points[0].z);
      ctx.moveTo(firstScreen.x, firstScreen.y);

      for (let i = 1; i < points.length; i++) {
        const screenPoint = worldToScreen(points[i].x, points[i].z);
        ctx.lineTo(screenPoint.x, screenPoint.y);
      }

      ctx.stroke();

      // Draw start point
      ctx.fillStyle = '#00e436';
      ctx.beginPath();
      ctx.arc(firstScreen.x, firstScreen.y, 8, 0, Math.PI * 2);
      ctx.fill();

      // Draw end point if we have more than 1 point
      if (points.length > 1) {
        const lastScreen = worldToScreen(points[points.length - 1].x, points[points.length - 1].z);
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(lastScreen.x, lastScreen.y, 6, 0, Math.PI * 2);
        ctx.fill();

        // Show closure indicator if endpoints are close
        const closureDistance = Math.sqrt(
          Math.pow(points[0].x - points[points.length - 1].x, 2) +
          Math.pow(points[0].z - points[points.length - 1].z, 2)
        );

        if (closureDistance < 20 && closureDistance > 0) {
          // Draw dashed line showing closure
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(lastScreen.x, lastScreen.y);
          ctx.lineTo(firstScreen.x, firstScreen.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // Draw "Draw your track" hint if empty
    if (points.length === 0 && !disabled) {
      ctx.fillStyle = '#737373';
      ctx.font = '16px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Draw your track', width / 2, height / 2 - 10);
      ctx.font = '12px "VT323", monospace';
      ctx.fillText('Click and drag to create a path', width / 2, height / 2 + 20);
    }
  }, [points, width, height, worldBounds, showGrid, gridSize, strokeColor, strokeWidth, worldToScreen, disabled]);

  // Redraw when points change
  useEffect(() => {
    draw();
  }, [draw]);

  // Notify parent of points change
  useEffect(() => {
    onPointsChange?.(points);
  }, [points, onPointsChange]);

  // Get point from event
  const getPointFromEvent = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>): Point2D => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, z: 0 };

    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const screenX = (clientX - rect.left) * scaleX;
    const screenY = (clientY - rect.top) * scaleY;

    return screenToWorld(screenX, screenY);
  }, [screenToWorld, width, height]);

  // Check if point is far enough from last point
  const isFarEnough = useCallback((newPoint: Point2D): boolean => {
    if (!lastPoint) return true;

    const dist = Math.sqrt(
      Math.pow(newPoint.x - lastPoint.x, 2) +
      Math.pow(newPoint.z - lastPoint.z, 2)
    );

    return dist >= minPointDistance;
  }, [lastPoint, minPointDistance]);

  // Handle mouse/touch down
  const handleStart = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.preventDefault();

    const point = getPointFromEvent(e);
    setIsDrawing(true);
    setPoints([point]);
    setLastPoint(point);
  }, [disabled, getPointFromEvent]);

  // Handle mouse/touch move
  const handleMove = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || disabled) return;
    e.preventDefault();

    const point = getPointFromEvent(e);

    if (isFarEnough(point)) {
      setPoints(prev => [...prev, point]);
      setLastPoint(point);
    }
  }, [isDrawing, disabled, getPointFromEvent, isFarEnough]);

  // Handle mouse/touch up
  const handleEnd = useCallback(() => {
    setIsDrawing(false);
  }, []);

  // Clear the canvas
  const clear = useCallback(() => {
    setPoints([]);
    setLastPoint(null);
  }, []);

  // Expose clear method via ref
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      (canvas as HTMLCanvasElement & { clear?: () => void }).clear = clear;
    }
  }, [clear]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className={`border-4 border-white shadow-pixel ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-crosshair'}`}
        style={{ imageRendering: 'pixelated' }}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
      />
      {points.length > 0 && (
        <div className="absolute bottom-2 left-2 bg-pixel-black/80 px-2 py-1 rounded">
          <span className="text-xs text-pixel-gray font-pixel-body">
            {points.length} points
          </span>
        </div>
      )}
    </div>
  );
}

// Export additional utilities
export function clearCanvas(canvasElement: HTMLCanvasElement | null): void {
  if (canvasElement && 'clear' in canvasElement) {
    (canvasElement as HTMLCanvasElement & { clear: () => void }).clear();
  }
}
