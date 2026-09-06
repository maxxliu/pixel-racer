'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Point2D } from '@/lib/track/TrackGeometryUtils';

export interface DrawingCanvasProps {
  size?: number;
  worldBounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  strokes: Point2D[][];
  onStrokesChange: (strokes: Point2D[][]) => void;
  disabled?: boolean;
  minPointDistance?: number;
}

const DEFAULT_BOUNDS = { minX: -150, maxX: 150, minZ: -150, maxZ: 150 };

/**
 * Multi-stroke drawing surface. Each pointer-down starts a new stroke that is
 * appended (never replaces). Uses pointer events with capture so drags that
 * leave the canvas still end cleanly; touch scrolling is suppressed via CSS.
 */
export default function DrawingCanvas({ size = 600, worldBounds = DEFAULT_BOUNDS, strokes, onStrokesChange, disabled = false, minPointDistance = 4 }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const currentRef = useRef<Point2D[]>([]);

  const toWorld = useCallback((clientX: number, clientY: number): Point2D => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * size;
    const sy = ((clientY - rect.top) / rect.height) * size;
    return {
      x: worldBounds.minX + (sx / size) * (worldBounds.maxX - worldBounds.minX),
      z: worldBounds.minZ + (sy / size) * (worldBounds.maxZ - worldBounds.minZ),
    };
  }, [size, worldBounds]);

  const toScreen = useCallback((p: Point2D) => ({
    x: ((p.x - worldBounds.minX) / (worldBounds.maxX - worldBounds.minX)) * size,
    y: ((p.z - worldBounds.minZ) / (worldBounds.maxZ - worldBounds.minZ)) * size,
  }), [size, worldBounds]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#160f2b';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(255,247,239,0.06)';
    ctx.lineWidth = 1;
    const step = size / 15;
    for (let i = 0; i <= 15; i++) {
      ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(size, i * step); ctx.stroke();
    }
    const all = [...strokes, currentRef.current].filter((s) => s.length > 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    all.forEach((stroke, si) => {
      ctx.strokeStyle = si === all.length - 1 && drawing ? '#c8ff3d' : '#ff5c4d';
      ctx.lineWidth = 12;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      stroke.forEach((p, i) => { const s = toScreen(p); if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y); });
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 3;
      ctx.stroke();
    });
    const first = all[0]?.[0];
    const flat = all.flat();
    const last = flat[flat.length - 1];
    if (first) {
      const s = toScreen(first);
      ctx.fillStyle = '#c8ff3d';
      ctx.beginPath(); ctx.arc(s.x, s.y, 7, 0, Math.PI * 2); ctx.fill();
    }
    if (first && last && flat.length > 5) {
      const a = toScreen(last), b = toScreen(first);
      const gap = Math.hypot(first.x - last.x, first.z - last.z);
      if (gap < 30) {
        ctx.strokeStyle = '#ffd166';
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (flat.length === 0 && !disabled) {
      ctx.fillStyle = '#b7a9c9';
      ctx.font = `700 22px "Chakra Petch", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('Draw a loop', size / 2, size / 2 - 8);
      ctx.font = `14px Inter, sans-serif`;
      ctx.fillText('Drag to draw. Lift and drag again to keep going.', size / 2, size / 2 + 18);
    }
  }, [strokes, drawing, size, toScreen, disabled]);

  useEffect(() => { draw(); }, [draw]);

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || e.button > 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    currentRef.current = [toWorld(e.clientX, e.clientY)];
    setDrawing(true);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing || disabled) return;
    const p = toWorld(e.clientX, e.clientY);
    const last = currentRef.current[currentRef.current.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.z - last.z) >= minPointDistance) {
      currentRef.current = [...currentRef.current, p];
      draw();
    }
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    setDrawing(false);
    if (currentRef.current.length > 1) onStrokesChange([...strokes, currentRef.current]);
    currentRef.current = [];
  };

  const pointCount = strokes.reduce((a, s) => a + s.length, 0);
  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className={`glass-solid aspect-square w-full max-w-[600px] touch-none ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-crosshair'}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        aria-label="Track drawing canvas"
        role="img"
      />
      {pointCount > 0 && (
        <div className="absolute bottom-2 left-2 rounded-md bg-ink/70 px-2 py-1 text-xs text-muted hud-num">{strokes.length} stroke{strokes.length === 1 ? '' : 's'} · {pointCount} points</div>
      )}
    </div>
  );
}
