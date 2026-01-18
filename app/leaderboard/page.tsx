'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getScores, clearScores as clearAllScores, ScoreEntry } from '@/lib/scores';

const gameModes = ['All', 'Time Trial', 'Race'];

export default function LeaderboardPage() {
  const [selectedMode, setSelectedMode] = useState('All');
  const [entries, setEntries] = useState<ScoreEntry[]>([]);

  useEffect(() => {
    setEntries(getScores());
  }, []);

  const formatTime = (ms: number): string => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const millis = ms % 1000;
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
  };

  const filteredEntries = selectedMode === 'All'
    ? entries
    : entries.filter(e =>
        (selectedMode === 'Time Trial' && e.gameMode === 'time-trial') ||
        (selectedMode === 'Race' && e.gameMode === 'race')
      );

  const clearScores = () => {
    if (confirm('Are you sure you want to clear all scores?')) {
      clearAllScores();
      setEntries([]);
    }
  };

  return (
    <main className="min-h-screen relative overflow-hidden bg-pixel-black">
      {/* Background effects */}
      <div className="absolute inset-0 pixel-grid-bg opacity-30" />
      <div className="absolute inset-0 scanlines" />
      <div className="absolute inset-0 crt-vignette" />

      <div className="relative z-10 max-w-4xl mx-auto p-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="font-pixel text-2xl md:text-4xl text-pixel-cyan pixel-text-shadow">
            HIGH SCORES
          </h1>
          <Link href="/" className="btn btn-secondary">
            BACK
          </Link>
        </div>

        {/* Game Mode Filter */}
        <div className="mb-8">
          <div className="flex flex-wrap gap-2">
            {gameModes.map((mode) => (
              <button
                key={mode}
                onClick={() => setSelectedMode(mode)}
                className={`pixel-btn text-xs ${
                  selectedMode === mode
                    ? 'pixel-btn-primary'
                    : 'pixel-btn-secondary'
                }`}
              >
                {mode.toUpperCase()}
              </button>
            ))}
            {entries.length > 0 && (
              <button
                onClick={clearScores}
                className="pixel-btn text-xs ml-auto"
                style={{ background: '#7e2553' }}
              >
                CLEAR ALL
              </button>
            )}
          </div>
        </div>

        {/* Leaderboard Table */}
        <div className="pixel-panel">
          <table className="w-full">
            <thead>
              <tr className="border-b-4 border-pixel-dark">
                <th className="px-4 py-3 text-left font-pixel text-[10px] text-pixel-gray">RANK</th>
                <th className="px-4 py-3 text-left font-pixel text-[10px] text-pixel-gray">NAME</th>
                <th className="px-4 py-3 text-left font-pixel text-[10px] text-pixel-gray">MODE</th>
                <th className="px-4 py-3 text-left font-pixel text-[10px] text-pixel-gray">TIME</th>
                <th className="px-4 py-3 text-left font-pixel text-[10px] text-pixel-gray">DATE</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry, index) => (
                <tr
                  key={`${entry.playerName}-${entry.time}-${entry.date}`}
                  className="border-b-2 border-pixel-dark hover:bg-pixel-mid transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className={`font-pixel text-sm ${
                      index === 0 ? 'text-pixel-yellow' :
                      index === 1 ? 'text-pixel-white' :
                      index === 2 ? 'text-pixel-orange' : 'text-pixel-gray'
                    }`}>
                      #{entry.rank}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-pixel-body text-lg text-pixel-white">
                    {entry.playerName}
                  </td>
                  <td className="px-4 py-3 font-pixel-body text-lg text-pixel-cyan">
                    {entry.gameMode === 'time-trial' ? 'TIME TRIAL' : `RACE #${entry.position || '-'}`}
                  </td>
                  <td className="px-4 py-3 font-pixel text-xs text-pixel-green">
                    {formatTime(entry.time)}
                  </td>
                  <td className="px-4 py-3 font-pixel-body text-sm text-pixel-gray">
                    {entry.date}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredEntries.length === 0 && (
            <div className="text-center py-12">
              <p className="font-pixel text-sm text-pixel-gray mb-4">
                NO RECORDS YET
              </p>
              <Link href="/play?mode=time-trial" className="btn btn-primary text-xs">
                START RACING
              </Link>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="mt-8 text-center">
          <p className="font-pixel-body text-lg text-pixel-gray">
            Complete races to save your best times!
          </p>
        </div>
      </div>
    </main>
  );
}
