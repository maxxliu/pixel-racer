'use client';

import { memo, useEffect, useRef, useSyncExternalStore } from 'react';
import type { GameStore, HudState, Notice } from '@/lib/game/GameStore';
import type { MinimapData } from '@/lib/game/TrackSpline';
import { formatTime, formatDelta } from '@/lib/utils/format';
import { hex } from '@/lib/game/palette';
import { SpeedLines } from './SpeedLines';

interface HUDProps {
  store: GameStore;
  minimap: MinimapData | null;
  isMobile: boolean;
  mode: 'time-trial' | 'race';
  speedLines: boolean;
}

const MAX_KMH = 230;

function HUDInner({ store, minimap, isMobile, mode, speedLines }: HUDProps) {
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const speedRef = useRef<HTMLDivElement>(null);
  const gearRef = useRef<HTMLDivElement>(null);
  const rpmRef = useRef<HTMLDivElement>(null);
  const arcRef = useRef<SVGCircleElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);
  const bestRef = useRef<HTMLDivElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const meterWrapRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<SVGGElement>(null);

  // Hot values straight into the DOM at render rate.
  useEffect(() => {
    let raf = 0;
    const ARC = 2 * Math.PI * 44;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const s: HudState = store.state;
      if (speedRef.current) speedRef.current.textContent = Math.round(s.speedKmh).toString().padStart(3, '0');
      if (gearRef.current) gearRef.current.textContent = s.gear === -1 ? 'R' : String(s.gear);
      if (rpmRef.current) rpmRef.current.style.width = `${Math.round(s.rpm * 100)}%`;
      if (arcRef.current) {
        const f = Math.min(1, s.speedKmh / MAX_KMH) * 0.75;
        arcRef.current.style.strokeDashoffset = String(ARC * (1 - f));
      }
      if (timeRef.current) timeRef.current.textContent = formatTime(s.lapTime);
      if (bestRef.current) bestRef.current.textContent = s.bestLap > 0 ? formatTime(s.bestLap) : '--:--.---';
      if (meterRef.current && meterWrapRef.current) {
        const charge = s.isDrifting ? Math.min(1, s.driftCharge / 2.9) : s.boostTime > 0 ? Math.min(1, s.boostTime / 1.7) : 0;
        meterRef.current.style.width = `${Math.round(charge * 100)}%`;
        const tier = s.isDrifting ? s.driftTier : s.boostTier;
        meterRef.current.style.background = tier === 3 ? '#b38cff' : tier === 2 ? '#ff8a5b' : tier === 1 ? '#3fb6ff' : '#fff7ef';
        meterWrapRef.current.style.opacity = charge > 0 ? '1' : '0.35';
      }
      if (linesRef.current) {
        const n = Math.max(0, (s.speedKmh - 120) / (MAX_KMH - 120));
        const o = speedLines ? Math.min(0.8, n * n * 0.7 + (s.boostTime > 0 ? 0.35 : 0)) : 0;
        linesRef.current.style.opacity = o.toFixed(2);
      }
      if (dotsRef.current) {
        const g = dotsRef.current;
        const children = g.children;
        for (let i = 0; i < s.dots.length && i < children.length; i++) {
          const d = s.dots[i];
          (children[i] as SVGGElement).setAttribute('transform', `translate(${d.x.toFixed(1)} ${d.z.toFixed(1)}) rotate(${(180 - (d.heading * 180) / Math.PI).toFixed(1)})`);
        }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [store, speedLines]);

  const showPos = mode === 'race';
  const delta = snap.lastLapDelta;

  return (
    <div className="hud" aria-hidden={snap.phase === 'finished'}>
      {speedLines && <SpeedLines innerRef={linesRef} />}
      <div className="vignette" />

      {/* top-left: lap & position */}
      <div className={`absolute left-3 top-3 flex gap-2 ${isMobile ? 'scale-75 origin-top-left' : ''}`}>
        <div className="glass px-4 py-2">
          <div className="text-label uppercase text-muted">Lap</div>
          <div className="text-3xl font-bold italic leading-none hud-num">
            {snap.lap}<span className="text-base text-muted">/{snap.totalLaps}</span>
          </div>
        </div>
        {showPos && (
          <div className="glass px-4 py-2">
            <div className="text-label uppercase text-muted">Pos</div>
            <div className={`text-3xl font-bold italic leading-none hud-num ${snap.position === 1 ? 'text-lime' : ''}`}>
              {snap.position}<span className="text-base text-muted">/{snap.totalRacers}</span>
            </div>
          </div>
        )}
      </div>

      {/* top-right: timing */}
      <div className={`absolute right-3 top-3 glass px-4 py-2 text-right ${isMobile ? 'scale-75 origin-top-right' : ''}`}>
        <div className="text-label uppercase text-muted">Lap time</div>
        <div ref={timeRef} className="text-2xl font-bold italic leading-none hud-num">0:00.000</div>
        <div className="mt-1 flex items-baseline justify-end gap-2 text-xs">
          <span className="text-muted">BEST</span>
          <span ref={bestRef} className="hud-num text-sun">--:--.---</span>
          {snap.lastLap > 0 && delta !== 0 && (
            <span className={`hud-num ${delta < 0 ? 'text-lime' : 'text-coral'}`}>{formatDelta(delta)}</span>
          )}
        </div>
      </div>

      {/* bottom-right: speed */}
      <div className={`absolute bottom-3 right-3 flex items-end gap-3 ${isMobile ? 'bottom-2 left-1/2 right-auto -translate-x-1/2 scale-[0.7] origin-bottom' : ''}`}>
        <div className="glass relative flex h-36 w-36 items-center justify-center rounded-full">
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-[135deg]">
            <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,247,239,0.12)" strokeWidth="6" strokeDasharray={`${2 * Math.PI * 44 * 0.75} ${2 * Math.PI * 44}`} strokeLinecap="round" />
            <circle ref={arcRef} cx="50" cy="50" r="44" fill="none" stroke="#ff5c4d" strokeWidth="6" strokeDasharray={`${2 * Math.PI * 44}`} strokeDashoffset={2 * Math.PI * 44} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 80ms linear' }} />
          </svg>
          <div className="text-center">
            <div ref={speedRef} className="text-4xl font-bold italic leading-none hud-num">000</div>
            <div className="text-label uppercase text-muted">km/h</div>
          </div>
          <div ref={gearRef} className="absolute bottom-3 right-1/2 translate-x-1/2 rounded-md bg-ink/70 px-2 py-0.5 text-sm font-bold text-sun hud-num">1</div>
        </div>
        <div className={`flex flex-col gap-2 pb-2 ${isMobile ? 'hidden' : ''}`}>
          <div className="h-2 w-28 overflow-hidden rounded-full bg-cream/10">
            <div ref={rpmRef} className="h-full rounded-full bg-gradient-to-r from-lime via-sun to-coral" style={{ width: '20%' }} />
          </div>
          <div ref={meterWrapRef} className="transition-opacity">
            <div className="mb-1 text-label uppercase text-muted">Drift boost</div>
            <div className="h-2 w-28 overflow-hidden rounded-full bg-cream/10">
              <div ref={meterRef} className="h-full rounded-full" style={{ width: '0%', background: '#fff7ef' }} />
            </div>
          </div>
        </div>
      </div>

      {/* bottom-left: minimap */}
      {minimap && (
        <div className={`absolute bottom-3 left-3 glass p-2 ${isMobile ? 'h-24 w-24 scale-90 origin-bottom-left' : 'h-40 w-40'}`}>
          <Minimap data={minimap} dots={snap.dots} dotsRef={dotsRef} />
        </div>
      )}

      {/* centre notices */}
      <div className="pointer-events-none absolute left-1/2 top-[22%] flex -translate-x-1/2 flex-col items-center gap-2">
        {snap.phase === 'countdown' && snap.countdown !== null && (
          <div key={`cd-${snap.countdown}`} className="anim-pop text-[8rem] font-bold italic leading-none text-cream drop-shadow-[0_6px_0_rgba(15,10,30,0.6)]">
            {snap.countdown}
          </div>
        )}
        {snap.go && (
          <div className="anim-go text-[8rem] font-bold italic leading-none text-lime drop-shadow-[0_6px_0_rgba(15,10,30,0.6)]">GO!</div>
        )}
        {snap.wrongWay && (
          <div className="anim-pulse-soft rounded-lg bg-coral px-6 py-2 text-2xl font-bold italic uppercase text-ink">Wrong way</div>
        )}
        {snap.notices.map((n) => <NoticeView key={n.id} notice={n} />)}
        {snap.stuck && snap.phase === 'racing' && !isMobile && (
          <div className="rounded-md bg-ink/70 px-3 py-1 text-sm text-cream">Stuck? Press <b>R</b> to respawn</div>
        )}
      </div>
    </div>
  );
}

function NoticeView({ notice }: { notice: Notice }) {
  const color = notice.kind === 'good' ? 'text-lime' : notice.kind === 'bad' ? 'text-coral' : notice.kind === 'big' ? 'text-sun' : 'text-cream';
  return (
    <div className="anim-pop text-center">
      <div className={`text-4xl font-bold italic uppercase leading-none drop-shadow-[0_4px_0_rgba(15,10,30,0.6)] ${color}`}>{notice.text}</div>
      {notice.sub && <div className="mt-1 text-sm font-semibold uppercase tracking-wider text-cream/85">{notice.sub}</div>}
    </div>
  );
}

function Minimap({ data, dots, dotsRef }: { data: MinimapData; dots: HudState['dots']; dotsRef: React.RefObject<SVGGElement> }) {
  const { bounds } = data;
  const w = bounds.maxX - bounds.minX, h = bounds.maxZ - bounds.minZ;
  const size = Math.max(w, h) + 16;
  const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
  const viewBox = `${cx - size / 2} ${cz - size / 2} ${size} ${size}`;
  const s = data.start;
    const dotR = size / 42;
  return (
    <svg viewBox={viewBox} className="h-full w-full" aria-hidden="true">
      <path d={data.outerPath} fill="#6f6788" stroke="#fff7ef" strokeWidth={size / 120} strokeOpacity="0.9" />
      <path d={data.innerPath} fill="#221838" stroke="#fff7ef" strokeWidth={size / 120} strokeOpacity="0.9" />
      <g transform={`translate(${s.x} ${s.z}) rotate(${180 - (Math.atan2(s.tx, s.tz) * 180) / Math.PI})`}>
        <rect x={-size / 24} y={-size / 260} width={size / 12} height={size / 130} fill="#fff7ef" />
      </g>
      <g ref={dotsRef}>
        {dots.map((d, i) => (
          <g key={i}>
            {d.isPlayer ? (
              <path d={`M 0 ${-dotR * 1.6} L ${dotR} ${dotR} L 0 ${dotR * 0.4} L ${-dotR} ${dotR} Z`} fill={hex(d.color)} stroke="#0f0a1e" strokeWidth={size / 300} />
            ) : (
              <circle r={dotR * 0.8} fill={hex(d.color)} stroke="#0f0a1e" strokeWidth={size / 300} />
            )}
          </g>
        ))}
      </g>
    </svg>
  );
}

export default memo(HUDInner);
