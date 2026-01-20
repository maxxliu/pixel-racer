'use client';

import { useState, useEffect, useCallback } from 'react';
import { saveScore } from '@/lib/scores';

interface LeaderboardEntry {
  id: string;
  player_name: string;
  time_ms: number;
  created_at: string;
}

interface RaceCompleteProps {
  totalTime: number;
  bestLapTime: number;
  lapTimes: number[];
  totalLaps: number;
  position?: number;
  gameMode?: 'time-trial' | 'race';
  trackId?: string;
  onPlayAgain: () => void;
  onMainMenu: () => void;
}

export default function RaceComplete({
  totalTime,
  bestLapTime,
  lapTimes,
  totalLaps,
  position = 1,
  gameMode = 'time-trial',
  trackId,
  onPlayAgain,
  onMainMenu,
}: RaceCompleteProps) {
  const [showButtons, setShowButtons] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [saved, setSaved] = useState(false);
  const [savedToLeaderboard, setSavedToLeaderboard] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [leaderboardRank, setLeaderboardRank] = useState<number | null>(null);
  const [submittingLeaderboard, setSubmittingLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowButtons(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  // Fetch leaderboard
  const fetchLeaderboard = useCallback(async () => {
    setLoadingLeaderboard(true);
    try {
      const url = trackId
        ? `/api/tracks/${trackId}/leaderboard?limit=10`
        : '/api/leaderboard/global?limit=10';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        // Normalize field names (API might return camelCase or snake_case)
        const normalized = data.map((entry: Record<string, unknown>) => ({
          id: entry.id,
          player_name: entry.player_name || entry.playerName,
          time_ms: entry.time_ms || entry.timeMs,
          created_at: entry.created_at || entry.createdAt,
        }));
        setLeaderboard(normalized);
      }
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
    } finally {
      setLoadingLeaderboard(false);
    }
  }, [trackId]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const handleSaveScore = useCallback(async () => {
    if (!playerName.trim()) return;

    // Save to local storage
    saveScore({
      playerName: playerName.trim().toUpperCase(),
      gameMode,
      time: totalTime,
      date: new Date().toLocaleDateString(),
      position: gameMode === 'race' ? position : undefined,
    });

    // Submit to leaderboard if track has an ID
    if (trackId) {
      setSubmittingLeaderboard(true);
      setLeaderboardError(null);
      try {
        const response = await fetch(`/api/tracks/${trackId}/leaderboard`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            player_name: playerName.trim().toUpperCase(),
            time_ms: Math.round(totalTime),
            lap_times: lapTimes,
            game_mode: gameMode
          })
        });

        if (response.ok) {
          const data = await response.json();
          setSavedToLeaderboard(true);
          if (data.rank) {
            setLeaderboardRank(data.rank);
          }
          // Refetch leaderboard to show updated rankings
          fetchLeaderboard();
        } else {
          const errorData = await response.json().catch(() => ({}));
          console.error('Leaderboard submission failed:', response.status, errorData);
          setLeaderboardError(errorData.error || `Server error: ${response.status}`);
        }
      } catch (error) {
        console.error('Failed to submit to leaderboard:', error);
        setLeaderboardError('Network error - could not reach server');
      } finally {
        setSubmittingLeaderboard(false);
      }
    }

    setSaved(true);
  }, [playerName, gameMode, totalTime, position, trackId, lapTimes, fetchLeaderboard]);

  const formatTime = (ms: number): string => {
    if (ms === 0) return '--:--.---';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const millis = Math.floor(ms % 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-pixel-black/95 flex items-center justify-center z-50">
      {/* Scanlines */}
      <div className="absolute inset-0 scanlines" />

      {/* CRT vignette */}
      <div className="absolute inset-0 crt-vignette" />

      {/* Pixel grid background */}
      <div className="absolute inset-0 pixel-grid-bg opacity-10" />

      {/* Content */}
      <div className="relative z-10 max-w-lg w-full mx-4">
        {/* Trophy icon */}
        <div className="text-center mb-4">
          <div className="inline-block animate-bounce">
            <PixelTrophy />
          </div>
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="font-pixel text-2xl md:text-4xl text-pixel-yellow pixel-text-shadow animate-pixel-pulse mb-4">
            RACE COMPLETE!
          </h1>
          <p className="font-pixel text-xs text-pixel-cyan">
            {totalLaps} LAPS FINISHED
          </p>
        </div>

        {/* Stats - Arcade high-score style */}
        <div className="space-y-3 mb-8">
          {/* Total Time */}
          <div className="pixel-panel">
            <div className="flex justify-between items-center">
              <span className="font-pixel text-xs text-pixel-gray">TOTAL TIME</span>
              <span className="font-pixel text-lg text-pixel-white">{formatTime(totalTime)}</span>
            </div>
          </div>

          {/* Best Lap */}
          <div className="pixel-panel border-pixel-green">
            <div className="flex justify-between items-center">
              <span className="font-pixel text-xs text-pixel-gray">BEST LAP</span>
              <span className="font-pixel text-lg text-pixel-green neon-text">{formatTime(bestLapTime)}</span>
            </div>
          </div>

          {/* Lap Times */}
          <div className="pixel-panel">
            <div className="font-pixel text-xs text-pixel-gray mb-3">LAP TIMES</div>
            <div className="space-y-2">
              {lapTimes.map((time, index) => (
                <div key={index} className="flex justify-between items-center">
                  <span className="font-pixel text-[10px] text-pixel-light">
                    LAP {(index + 1).toString().padStart(2, '0')}
                  </span>
                  <span className={`font-pixel text-sm ${time === bestLapTime ? 'text-pixel-green' : 'text-pixel-white'}`}>
                    {formatTime(time)}
                    {time === bestLapTime && <span className="text-pixel-yellow ml-2">★</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Save Score */}
        {showButtons && !saved && (
          <div className="pixel-panel mb-4">
            <div className="font-pixel text-xs text-pixel-gray mb-3">SAVE YOUR SCORE</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value.slice(0, 12))}
                placeholder="ENTER NAME"
                maxLength={12}
                className="flex-1 bg-pixel-black border-4 border-pixel-gray px-3 py-2 font-pixel text-xs text-pixel-white uppercase focus:border-pixel-cyan outline-none"
              />
              <button
                onClick={handleSaveScore}
                disabled={!playerName.trim() || submittingLeaderboard}
                className={`pixel-btn text-xs ${playerName.trim() && !submittingLeaderboard ? 'pixel-btn-primary' : 'opacity-50'}`}
              >
                {submittingLeaderboard ? '...' : 'SAVE'}
              </button>
            </div>
          </div>
        )}

        {saved && (
          <div className={`pixel-panel mb-4 ${savedToLeaderboard ? 'border-pixel-green' : leaderboardError ? 'border-red-500' : 'border-pixel-gray'}`}>
            <div className="text-center">
              {savedToLeaderboard ? (
                <>
                  <span className="font-pixel text-xs text-pixel-green">SCORE SAVED TO LEADERBOARD!</span>
                  {leaderboardRank && (
                    <div className="mt-2">
                      <span className="font-pixel text-xs text-pixel-yellow">
                        RANK: #{leaderboardRank}
                      </span>
                    </div>
                  )}
                </>
              ) : leaderboardError ? (
                <>
                  <span className="font-pixel text-xs text-pixel-gray">SAVED LOCALLY</span>
                  <div className="mt-2">
                    <span className="font-pixel text-[10px] text-red-400">
                      Leaderboard: {leaderboardError}
                    </span>
                  </div>
                </>
              ) : !trackId ? (
                <>
                  <span className="font-pixel text-xs text-pixel-gray">SAVED LOCALLY</span>
                  <div className="mt-2">
                    <span className="font-pixel text-[10px] text-pixel-gray">
                      Play a track from the library to save to leaderboard
                    </span>
                  </div>
                </>
              ) : (
                <span className="font-pixel text-xs text-pixel-gray">SAVED LOCALLY</span>
              )}
            </div>
          </div>
        )}

        {/* Leaderboard */}
        <div className="pixel-panel mb-4">
          <div className="font-pixel text-xs text-pixel-yellow mb-3">
            {trackId ? 'TRACK LEADERBOARD' : 'GLOBAL LEADERBOARD'}
          </div>
          {loadingLeaderboard ? (
            <div className="text-center py-4">
              <span className="font-pixel text-[10px] text-pixel-gray animate-pulse">LOADING...</span>
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="text-center py-4">
              <span className="font-pixel text-[10px] text-pixel-gray">NO RECORDS YET</span>
            </div>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {leaderboard.map((entry, index) => {
                const isCurrentPlayer = saved &&
                  entry.player_name === playerName.trim().toUpperCase() &&
                  Math.abs(entry.time_ms - totalTime) < 100;
                return (
                  <div
                    key={entry.id}
                    className={`flex items-center gap-2 py-1 px-2 rounded ${
                      isCurrentPlayer
                        ? 'bg-pixel-green/20 border border-pixel-green'
                        : index < 3
                        ? 'bg-white/5'
                        : ''
                    }`}
                  >
                    <span className={`font-pixel text-[10px] w-6 ${
                      index === 0 ? 'text-yellow-400'
                      : index === 1 ? 'text-gray-400'
                      : index === 2 ? 'text-orange-400'
                      : 'text-pixel-gray'
                    }`}>
                      {index + 1}.
                    </span>
                    <span className={`font-pixel text-[10px] flex-1 truncate ${
                      isCurrentPlayer ? 'text-pixel-green' : 'text-pixel-white'
                    }`}>
                      {entry.player_name}
                      {isCurrentPlayer && ' ◄'}
                    </span>
                    <span className={`font-pixel text-[10px] ${
                      isCurrentPlayer ? 'text-pixel-green' : 'text-pixel-light'
                    }`}>
                      {formatTime(entry.time_ms)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Buttons */}
        {showButtons ? (
          <div className="flex flex-col gap-3">
            <button
              onClick={onPlayAgain}
              className="pixel-btn pixel-btn-primary w-full text-center animate-blink"
            >
              RACE AGAIN
            </button>
            <button
              onClick={onMainMenu}
              className="pixel-btn pixel-btn-secondary w-full text-center"
            >
              MAIN MENU
            </button>
          </div>
        ) : (
          <div className="text-center">
            <span className="font-pixel text-sm text-pixel-orange animate-blink">
              CALCULATING SCORE...
            </span>
          </div>
        )}

        {/* Bottom blinking text */}
        <div className="text-center mt-8">
          <span className="font-pixel text-[10px] text-pixel-cyan animate-blink">
            PRESS START TO CONTINUE
          </span>
        </div>
      </div>
    </div>
  );
}

function PixelTrophy() {
  return (
    <svg width="48" height="56" viewBox="0 0 48 56" style={{ imageRendering: 'pixelated' }}>
      {/* Trophy cup */}
      <rect x="8" y="4" width="32" height="4" fill="#ffec27" />
      <rect x="4" y="8" width="40" height="4" fill="#ffec27" />
      <rect x="4" y="12" width="40" height="16" fill="#ffa300" />
      <rect x="8" y="28" width="32" height="4" fill="#ffa300" />
      <rect x="12" y="32" width="24" height="4" fill="#ffa300" />
      {/* Handles */}
      <rect x="0" y="12" width="4" height="12" fill="#ffec27" />
      <rect x="44" y="12" width="4" height="12" fill="#ffec27" />
      <rect x="0" y="20" width="8" height="4" fill="#ffec27" />
      <rect x="40" y="20" width="8" height="4" fill="#ffec27" />
      {/* Star */}
      <rect x="20" y="16" width="8" height="8" fill="#fff1e8" />
      <rect x="22" y="14" width="4" height="4" fill="#fff1e8" />
      <rect x="22" y="24" width="4" height="4" fill="#fff1e8" />
      <rect x="16" y="18" width="4" height="4" fill="#fff1e8" />
      <rect x="28" y="18" width="4" height="4" fill="#fff1e8" />
      {/* Base */}
      <rect x="16" y="36" width="16" height="4" fill="#5f574f" />
      <rect x="12" y="40" width="24" height="4" fill="#5f574f" />
      <rect x="8" y="44" width="32" height="8" fill="#4a4a6a" />
      {/* Base highlight */}
      <rect x="8" y="44" width="32" height="2" fill="#5f574f" />
    </svg>
  );
}
