'use client';

import { useEffect, useRef } from 'react';
import { TouchInputHandler } from '@/lib/input/TouchInputHandler';
import type { InputManager } from '@/lib/input/InputManager';

interface MobileControlsProps {
  inputManager: InputManager | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Touch overlay: left-half drag = steering joystick, right-side buttons for gas/brake/drift,
 * top-right pause & respawn. Visual state is written straight to the DOM (no per-frame setState).
 */
export default function MobileControls({ inputManager, containerRef }: MobileControlsProps) {
  const handlerRef = useRef<TouchInputHandler | null>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const gasRef = useRef<HTMLButtonElement>(null);
  const brakeRef = useRef<HTMLButtonElement>(null);
  const driftRef = useRef<HTMLButtonElement>(null);
  const pauseRef = useRef<HTMLButtonElement>(null);
  const resetRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !inputManager) return;
    const handler = new TouchInputHandler(56);
    handlerRef.current = handler;
    handler.attach(container);
    if (gasRef.current) handler.registerButton('gas', gasRef.current);
    if (brakeRef.current) handler.registerButton('brake', brakeRef.current);
    if (driftRef.current) handler.registerButton('handbrake', driftRef.current);
    if (pauseRef.current) handler.registerButton('pause', pauseRef.current);
    if (resetRef.current) handler.registerButton('reset', resetRef.current);

    let raf = 0;
    const radius = 56;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = handler.update();
      const j = handler.getJoystickState();
      inputManager.setTouchState(
        { active: handler.isActive(), steering: t.steering, throttle: t.throttle, brake: t.brake, handbrake: t.handbrake },
        { pause: t.pause, respawn: t.resetVehicle },
      );
      if (baseRef.current && thumbRef.current) {
        const show = j.active ? 'block' : 'none';
        baseRef.current.style.display = show;
        thumbRef.current.style.display = show;
        if (j.active) {
          baseRef.current.style.transform = `translate(${j.baseX - radius}px, ${j.baseY - radius}px)`;
          const dx = Math.max(-radius, Math.min(radius, j.currentX - j.baseX));
          const dy = Math.max(-radius, Math.min(radius, j.currentY - j.baseY));
          thumbRef.current.style.transform = `translate(${j.baseX + dx - 22}px, ${j.baseY + dy - 22}px)`;
        }
      }
      gasRef.current?.classList.toggle('is-active', t.throttle > 0.5);
      brakeRef.current?.classList.toggle('is-active', t.throttle < -0.5 || t.brake);
      driftRef.current?.classList.toggle('is-active', t.handbrake);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      handler.dispose();
      handlerRef.current = null;
      inputManager.clearTouchState();
    };
  }, [containerRef, inputManager]);

  return (
    <div className="mobile-controls">
      <div ref={baseRef} className="joystick-base" style={{ display: 'none', width: 112, height: 112, left: 0, top: 0, pointerEvents: 'none' }} aria-hidden="true" />
      <div ref={thumbRef} className="joystick-thumb" style={{ display: 'none', width: 44, height: 44, left: 0, top: 0, pointerEvents: 'none' }} aria-hidden="true" />

      <div className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+14px)] right-[calc(env(safe-area-inset-right,0px)+14px)] flex flex-col items-end gap-3">
        <button ref={gasRef} type="button" className="mobile-btn mobile-btn-gas h-[76px] w-[76px]" aria-label="Accelerate">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M12 4l-8 14h16L12 4z" /></svg>
          GAS
        </button>
        <button ref={brakeRef} type="button" className="mobile-btn mobile-btn-brake h-[76px] w-[76px]" aria-label="Brake or reverse">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M12 20l8-14H4l8 14z" /></svg>
          BRAKE
        </button>
      </div>
      <button ref={driftRef} type="button" className="mobile-btn mobile-btn-drift absolute bottom-[calc(env(safe-area-inset-bottom,0px)+24px)] right-[calc(env(safe-area-inset-right,0px)+104px)] h-[64px] w-[64px]" aria-label="Drift">
        DRIFT
      </button>
      <button ref={pauseRef} type="button" className="mobile-btn absolute right-[calc(env(safe-area-inset-right,0px)+12px)] top-[calc(env(safe-area-inset-top,0px)+58px)] h-11 w-11 rounded-xl" aria-label="Pause">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
      </button>
      <button ref={resetRef} type="button" className="mobile-btn absolute right-[calc(env(safe-area-inset-right,0px)+60px)] top-[calc(env(safe-area-inset-top,0px)+58px)] h-11 w-11 rounded-xl" aria-label="Respawn">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" /></svg>
      </button>
    </div>
  );
}
