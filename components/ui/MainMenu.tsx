'use client';

import { useState } from 'react';
import Link from 'next/link';

interface MainMenuProps {
  onStartGame?: (mode: 'single' | 'multiplayer') => void;
  onSettings?: () => void;
}

export default function MainMenu({ onStartGame, onSettings }: MainMenuProps) {
  const [selectedVehicle, setSelectedVehicle] = useState('arcade');

  const vehicles = [
    { id: 'arcade', name: 'Street Racer', description: 'Balanced handling and speed' },
    { id: 'sports', name: 'Sports GT', description: 'Fast but requires skill' },
    { id: 'offroad', name: 'Off-Road Beast', description: 'Great grip on any terrain' },
    { id: 'muscle', name: 'Muscle Car', description: 'Raw power, tail-happy' },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-dark to-[#1a1a2e] p-8">
      <div className="text-center mb-12">
        <h1 className="text-6xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-4">
          Open World Racing
        </h1>
        <p className="text-xl text-gray-400">
          High-speed racing across a vast open world
        </p>
      </div>

      {/* Vehicle Selection */}
      <div className="mb-8 w-full max-w-2xl">
        <h2 className="text-lg font-semibold text-white mb-4 text-center">
          Select Your Vehicle
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {vehicles.map((vehicle) => (
            <button
              key={vehicle.id}
              onClick={() => setSelectedVehicle(vehicle.id)}
              className={`p-4 rounded-xl border transition-all ${
                selectedVehicle === vehicle.id
                  ? 'border-primary bg-primary/20'
                  : 'border-white/10 bg-white/5 hover:border-white/30'
              }`}
            >
              <div className="text-3xl mb-2">🏎️</div>
              <div className="text-sm font-semibold text-white">{vehicle.name}</div>
              <div className="text-xs text-gray-400 mt-1">{vehicle.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Menu Options */}
      <div className="flex flex-col gap-4 w-full max-w-xs">
        <Link
          href={`/play?vehicle=${selectedVehicle}`}
          className="btn btn-primary text-center"
        >
          Quick Race
        </Link>

        <Link
          href={`/lobby?vehicle=${selectedVehicle}`}
          className="btn btn-secondary text-center"
        >
          Multiplayer
        </Link>

        <button onClick={onSettings} className="btn btn-secondary">
          Settings
        </button>

        <Link href="/leaderboard" className="btn btn-secondary text-center">
          Leaderboard
        </Link>
      </div>

      {/* Controls hint */}
      <div className="mt-12 text-center text-sm text-gray-500">
        <p className="mb-2">Controls</p>
        <div className="flex flex-wrap justify-center gap-4">
          <span>WASD / Arrows - Drive</span>
          <span>Space - Handbrake</span>
          <span>C - Camera</span>
          <span>ESC - Pause</span>
        </div>
      </div>
    </div>
  );
}
