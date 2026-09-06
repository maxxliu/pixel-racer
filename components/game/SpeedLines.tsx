'use client';

import { memo, useMemo } from 'react';

/** Radial streaks; opacity is driven from the HUD's rAF via the ref's style. */
function SpeedLinesInner({ innerRef }: { innerRef: React.RefObject<HTMLDivElement> }) {
  const lines = useMemo(() => {
    const out: { x1: number; y1: number; x2: number; y2: number; w: number }[] = [];
    const cx = 50, cy = 52;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 + (i % 2) * 0.07;
      const r1 = 34 + (i % 3) * 5, r2 = 80 + (i % 4) * 6;
      out.push({ x1: cx + Math.cos(a) * r1, y1: cy + Math.sin(a) * r1 * 0.9, x2: cx + Math.cos(a) * r2, y2: cy + Math.sin(a) * r2 * 0.9, w: 0.35 + (i % 3) * 0.2 });
    }
    return out;
  }, []);
  return (
    <div ref={innerRef} className="speed-lines" style={{ opacity: 0 }} aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
        {lines.map((l, i) => (
          <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#fff7ef" strokeWidth={l.w} strokeLinecap="round" opacity={0.8} />
        ))}
      </svg>
    </div>
  );
}

export const SpeedLines = memo(SpeedLinesInner);
