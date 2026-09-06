'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import LoadingScreen from './LoadingScreen';
import HUD from './HUD';
import PauseMenu from './PauseMenu';
import RaceComplete from './RaceComplete';
import MobileControls from './MobileControls';
import { Game, type RaceResults, type GameMode, type MinimapData, type CustomTrackData } from '@/lib/game/Game';
import type { GameStore } from '@/lib/game/GameStore';
import { validateWaypoints } from '@/lib/game/TrackSpline';
import { TouchInputHandler } from '@/lib/input/TouchInputHandler';
import type { InputManager } from '@/lib/input/InputManager';
import { useSettings } from '@/lib/settings';
import { LinkButton } from '@/components/ui/Button';

interface GameCanvasProps {
  gameMode?: GameMode;
  customTrack?: boolean;
  /** Development-only lap override from `?laps=`. */
  lapsOverride?: number;
}

type Status = 'loading' | 'playing' | 'paused' | 'finished' | 'error';

function readCustomTrack(): CustomTrackData | null {
  try {
    const raw = sessionStorage.getItem('customTrack');
    if (!raw) return null;
    const data = JSON.parse(raw) as CustomTrackData;
    if (validateWaypoints(data.waypoints)) return null;
    return data;
  } catch {
    return null;
  }
}

export default function GameCanvas({ gameMode = 'time-trial', customTrack = false, lapsOverride }: GameCanvasProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [settings] = useSettings();
  const [status, setStatus] = useState<Status>('loading');
  const [progress, setProgress] = useState({ value: 0, message: 'Loading' });
  const [results, setResults] = useState<RaceResults | null>(null);
  const [store, setStore] = useState<GameStore | null>(null);
  const [minimap, setMinimap] = useState<MinimapData | null>(null);
  const [inputManager, setInputManager] = useState<InputManager | null>(null);
  const [trackId, setTrackId] = useState<string | undefined>(undefined);
  const [isMobile, setIsMobile] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [session, setSession] = useState(0);

  useEffect(() => { setIsMobile(TouchInputHandler.isTouchDevice()); }, []);

  // Own the Game lifecycle in one effect so StrictMode and "race again" can never orphan an instance.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let track: CustomTrackData | undefined;
    if (customTrack) {
      const t = readCustomTrack();
      if (!t) {
        setErrorMessage('That track could not be loaded. Pick one from the library or draw a new one.');
        setStatus('error');
        return;
      }
      track = t;
      setTrackId(t.id);
    }
    setStatus('loading');
    setResults(null);
    setProgress({ value: 0, message: 'Loading' });

    const game = new Game(container, {
      mode: gameMode,
      customTrack: track,
      lapsOverride,
      onProgress: (value, message) => setProgress({ value, message }),
      onPause: () => setStatus('paused'),
      onFinish: (r) => { setResults(r); setStatus('finished'); },
    });
    gameRef.current = game;
    setStore(game.store);
    if (process.env.NODE_ENV !== 'production') {
      (window as unknown as { __pixelRacer?: Game }).__pixelRacer = game;
    }
    let cancelled = false;
    game.init().then(() => {
      if (cancelled) return;
      setMinimap(game.getMinimapData());
      setInputManager(game.getInputManager());
      setStatus('playing');
    }).catch((err: unknown) => {
      if (cancelled) return;
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : 'The game failed to start.');
      setStatus('error');
    });

    // Audio needs a user gesture; unlock on the first one.
    const unlock = () => { game.audio.unlock(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      game.dispose();
      if (gameRef.current === game) gameRef.current = null;
      setInputManager(null);
      setStore(null);
    };
  }, [gameMode, customTrack, lapsOverride, session]);

  const resume = useCallback(() => { gameRef.current?.audio.unlock(); gameRef.current?.resume(); setStatus('playing'); }, []);
  const restart = useCallback(() => { gameRef.current?.restart(); setResults(null); setStatus('playing'); }, []);
  const playAgain = useCallback(() => { setSession((s) => s + 1); }, []);
  const exit = useCallback(() => { router.push('/'); }, [router]);

  const focusGame = useCallback((e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('button, input, a, select, textarea')) return;
    if (status === 'playing') containerRef.current?.focus();
  }, [status]);

  return (
    <div className="game-container" ref={containerRef} tabIndex={-1} onClick={focusGame}>
      {status === 'loading' && <LoadingScreen progress={progress.value} message={progress.message} />}

      {status === 'error' && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-ink px-6 text-center">
          <h1 className="text-display-m italic">Can&apos;t start the race</h1>
          <p className="max-w-md text-muted">{errorMessage}</p>
          <div className="flex gap-3">
            <LinkButton href="/tracks">Track library</LinkButton>
            <LinkButton href="/" variant="primary">Main menu</LinkButton>
          </div>
        </div>
      )}

      {store && status !== 'loading' && status !== 'error' && (
        <HUD store={store} minimap={minimap} isMobile={isMobile} mode={gameMode} speedLines={settings.speedLines && !isMobile} />
      )}

      {status === 'playing' && isMobile && inputManager && (
        <MobileControls inputManager={inputManager} containerRef={containerRef} />
      )}

      {status === 'paused' && (
        <PauseMenu onResume={resume} onRestart={restart} onExit={exit} isMobile={isMobile} />
      )}

      {status === 'finished' && results && (
        <RaceComplete results={results} trackId={trackId} onPlayAgain={playAgain} onMainMenu={exit} />
      )}
    </div>
  );
}
