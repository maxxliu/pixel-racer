'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import LoadingScreen from './LoadingScreen';
import HUD from './HUD';
import PauseMenu from './PauseMenu';
import RaceComplete from './RaceComplete';
import { Game, RaceResults, GameMode, MinimapData } from '@/lib/game/Game';

interface GameCanvasProps {
  gameMode?: GameMode;
}

export default function GameCanvas({ gameMode = 'time-trial' }: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('Initializing...');
  const [isPaused, setIsPaused] = useState(false);
  const [raceResults, setRaceResults] = useState<RaceResults | null>(null);
  const [minimapData, setMinimapData] = useState<MinimapData | null>(null);
  const [gameState, setGameState] = useState({
    speed: 0,
    rpm: 0,
    gear: 1,
    lap: 1,
    totalLaps: 3,
    position: 1,
    totalRacers: gameMode === 'race' ? 4 : 1,
    lapTime: 0,
    bestLapTime: 0,
    carX: 0,
    carZ: -10,
    carRotation: 0,
  });

  const handleProgressUpdate = useCallback((progress: number, message: string) => {
    setLoadingProgress(progress);
    setLoadingMessage(message);
    if (progress >= 100) {
      // Get minimap data when loading completes
      const data = gameRef.current?.getMinimapData();
      if (data) {
        setMinimapData(data);
      }
      setTimeout(() => setIsLoading(false), 500);
    }
  }, []);

  const handleGameStateUpdate = useCallback((state: typeof gameState) => {
    setGameState(state);
  }, []);

  const handlePause = useCallback(() => {
    setIsPaused(true);
    gameRef.current?.pause();
  }, []);

  const handleResume = useCallback(() => {
    setIsPaused(false);
    gameRef.current?.resume();
  }, []);

  const handleRestart = useCallback(() => {
    setIsPaused(false);
    setRaceResults(null);
    gameRef.current?.restart();
  }, []);

  const handleExit = useCallback(() => {
    gameRef.current?.dispose();
    window.location.href = '/';
  }, []);

  const handleRaceComplete = useCallback((results: RaceResults) => {
    setRaceResults(results);
  }, []);

  const handlePlayAgain = useCallback(() => {
    setRaceResults(null);
    setMinimapData(null);
    // Dispose old game and create new one
    gameRef.current?.dispose();

    if (containerRef.current) {
      const game = new Game(containerRef.current, {
        gameMode,
        onProgressUpdate: handleProgressUpdate,
        onGameStateUpdate: handleGameStateUpdate,
        onPause: handlePause,
        onRaceComplete: handleRaceComplete,
      });
      gameRef.current = game;
      game.init();
    }
  }, [gameMode, handleProgressUpdate, handleGameStateUpdate, handlePause, handleRaceComplete]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize the game
    const game = new Game(containerRef.current, {
      gameMode,
      onProgressUpdate: handleProgressUpdate,
      onGameStateUpdate: handleGameStateUpdate,
      onPause: handlePause,
      onRaceComplete: handleRaceComplete,
    });

    gameRef.current = game;
    game.init();

    // Handle keyboard for pause
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !raceResults) {
        if (isPaused) {
          handleResume();
        } else {
          handlePause();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      game.dispose();
    };
  }, [gameMode, handleProgressUpdate, handleGameStateUpdate, handlePause, handleRaceComplete, isPaused, handleResume, raceResults]);

  // Click handler to ensure focus
  const handleClick = useCallback(() => {
    containerRef.current?.focus();
  }, []);

  return (
    <div
      className="game-container"
      ref={containerRef}
      tabIndex={0}
      onClick={handleClick}
      style={{ outline: 'none' }}
    >
      {isLoading && (
        <LoadingScreen progress={loadingProgress} message={loadingMessage} />
      )}

      {!isLoading && !isPaused && !raceResults && <HUD {...gameState} minimapData={minimapData || undefined} />}

      {isPaused && !raceResults && (
        <PauseMenu
          onResume={handleResume}
          onRestart={handleRestart}
          onExit={handleExit}
        />
      )}

      {raceResults && (
        <RaceComplete
          totalTime={raceResults.totalTime}
          bestLapTime={raceResults.bestLapTime}
          lapTimes={raceResults.lapTimes}
          totalLaps={raceResults.totalLaps}
          position={raceResults.position}
          gameMode={gameMode}
          onPlayAgain={handlePlayAgain}
          onMainMenu={handleExit}
        />
      )}
    </div>
  );
}
