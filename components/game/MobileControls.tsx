'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { TouchInputHandler } from '@/lib/input/TouchInputHandler';
import type { InputManager } from '@/lib/input/InputManager';

interface MobileControlsProps {
  inputManager: InputManager | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isPaused: boolean;
  isLoading: boolean;
}

export default function MobileControls({
  inputManager,
  containerRef,
  isPaused,
  isLoading,
}: MobileControlsProps) {
  const touchHandlerRef = useRef<TouchInputHandler | null>(null);
  const animFrameRef = useRef<number>(0);
  const [joystickVisual, setJoystickVisual] = useState<{
    active: boolean;
    baseX: number;
    baseY: number;
    currentX: number;
    currentY: number;
  }>({ active: false, baseX: 0, baseY: 0, currentX: 0, currentY: 0 });

  // Button refs for registration
  const gasRef = useRef<HTMLButtonElement>(null);
  const brakeRef = useRef<HTMLButtonElement>(null);
  const handbrakeRef = useRef<HTMLButtonElement>(null);
  const pauseRef = useRef<HTMLButtonElement>(null);
  const resetRef = useRef<HTMLButtonElement>(null);

  // Track which buttons are visually pressed
  const [gasActive, setGasActive] = useState(false);
  const [brakeActive, setBrakeActive] = useState(false);
  const [handbrakeActive, setHandbrakeActive] = useState(false);

  // Initialize touch handler
  useEffect(() => {
    const handler = new TouchInputHandler(60);
    touchHandlerRef.current = handler;

    return () => {
      handler.dispose();
      touchHandlerRef.current = null;
    };
  }, []);

  // Attach to container element
  useEffect(() => {
    const handler = touchHandlerRef.current;
    const container = containerRef.current;
    if (!handler || !container) return;

    handler.attach(container);
    return () => handler.detach();
  }, [containerRef]);

  // Register button elements
  useEffect(() => {
    const handler = touchHandlerRef.current;
    if (!handler) return;

    if (gasRef.current) handler.registerButton('gas', gasRef.current);
    if (brakeRef.current) handler.registerButton('brake', brakeRef.current);
    if (handbrakeRef.current) handler.registerButton('handbrake', handbrakeRef.current);
    if (pauseRef.current) handler.registerButton('pause', pauseRef.current);
    if (resetRef.current) handler.registerButton('reset', resetRef.current);

    return () => {
      handler.unregisterButton('gas');
      handler.unregisterButton('brake');
      handler.unregisterButton('handbrake');
      handler.unregisterButton('pause');
      handler.unregisterButton('reset');
    };
  }, [isPaused, isLoading]);

  // Frame loop: read touch state and feed into InputManager
  const updateLoop = useCallback(() => {
    const handler = touchHandlerRef.current;
    if (handler && inputManager) {
      const touchState = handler.update();
      const joystick = handler.getJoystickState();

      inputManager.setTouchState({
        active: handler.isActive(),
        steering: touchState.steering,
        throttle: touchState.throttle,
        brake: touchState.brake,
        handbrake: touchState.handbrake,
        pause: touchState.pause,
        resetVehicle: touchState.resetVehicle,
      });

      // Update joystick visuals (throttle to avoid excessive re-renders)
      setJoystickVisual({
        active: joystick.active,
        baseX: joystick.baseX,
        baseY: joystick.baseY,
        currentX: joystick.currentX,
        currentY: joystick.currentY,
      });

      // Update button active states
      setGasActive(touchState.throttle > 0.5);
      setBrakeActive(touchState.throttle < -0.5 || touchState.brake);
      setHandbrakeActive(touchState.handbrake);
    }

    animFrameRef.current = requestAnimationFrame(updateLoop);
  }, [inputManager]);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(updateLoop);
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [updateLoop]);

  // Don't render controls when loading or paused
  if (isLoading || isPaused) return null;

  const joystickRadius = 60;

  return (
    <div className="mobile-controls-overlay" aria-hidden="true">
      {/* Virtual Joystick Visual */}
      {joystickVisual.active && (
        <div className="joystick-container" style={{ pointerEvents: 'none' }}>
          {/* Base circle */}
          <div
            className="joystick-base"
            style={{
              left: joystickVisual.baseX - joystickRadius,
              top: joystickVisual.baseY - joystickRadius,
              width: joystickRadius * 2,
              height: joystickRadius * 2,
            }}
          />
          {/* Thumb circle */}
          <div
            className="joystick-thumb"
            style={{
              left: joystickVisual.currentX - 24,
              top: joystickVisual.currentY - 24,
              width: 48,
              height: 48,
            }}
          />
        </div>
      )}

      {/* Action Buttons - Right Side */}
      <div className="mobile-action-buttons">
        {/* Gas Button */}
        <button
          ref={gasRef}
          className={`mobile-btn mobile-btn-gas ${gasActive ? 'mobile-btn-active' : ''}`}
          type="button"
        >
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
            <path d="M12 4l-8 14h16L12 4z" />
          </svg>
          <span className="mobile-btn-label">GAS</span>
        </button>

        {/* Brake Button */}
        <button
          ref={brakeRef}
          className={`mobile-btn mobile-btn-brake ${brakeActive ? 'mobile-btn-active' : ''}`}
          type="button"
        >
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
            <path d="M12 20l8-14H4l8 14z" />
          </svg>
          <span className="mobile-btn-label">BRAKE</span>
        </button>
      </div>

      {/* Handbrake - Bottom Center Right */}
      <button
        ref={handbrakeRef}
        className={`mobile-btn mobile-btn-handbrake ${handbrakeActive ? 'mobile-btn-active' : ''}`}
        type="button"
      >
        <span className="mobile-btn-label">HB</span>
      </button>

      {/* Utility Buttons - Top */}
      <button
        ref={pauseRef}
        className="mobile-btn mobile-btn-util mobile-btn-pause"
        type="button"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" />
          <rect x="14" y="4" width="4" height="16" />
        </svg>
      </button>

      <button
        ref={resetRef}
        className="mobile-btn mobile-btn-util mobile-btn-reset"
        type="button"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
        </svg>
      </button>
    </div>
  );
}
