'use client';

import { useCallback, useEffect, useState } from 'react';

export type Difficulty = 'easy' | 'normal' | 'hard';
export type Quality = 'low' | 'medium' | 'high';
export type CameraMode = 'chase' | 'far' | 'hood';

export interface GameSettings {
  laps: number;
  aiCount: number;
  difficulty: Difficulty;
  quality: Quality;
  cameraMode: CameraMode;
  speedLines: boolean;
  haptics: boolean;
  audio: {
    muted: boolean;
    master: number;
    engine: number;
    sfx: number;
  };
}

export const DEFAULT_SETTINGS: GameSettings = {
  laps: 3,
  aiCount: 3,
  difficulty: 'normal',
  quality: 'high',
  cameraMode: 'chase',
  speedLines: true,
  haptics: true,
  audio: { muted: false, master: 0.8, engine: 0.7, sfx: 0.9 },
};

const KEY = 'pixel-racer-settings-v2';
const listeners = new Set<() => void>();
let cache: GameSettings | null = null;

function clampInt(v: unknown, min: number, max: number, def: number): number {
  const n = typeof v === 'number' ? Math.round(v) : def;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}
function clamp01(v: unknown, def: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : def;
}
function oneOf<T extends string>(v: unknown, options: readonly T[], def: T): T {
  return typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : def;
}

/** Validate an unknown blob into a full settings object. Never throws. */
export function sanitizeSettings(raw: unknown): GameSettings {
  const d = DEFAULT_SETTINGS;
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const audio = (r.audio && typeof r.audio === 'object' ? r.audio : {}) as Record<string, unknown>;
  return {
    laps: clampInt(r.laps, 1, 10, d.laps),
    aiCount: clampInt(r.aiCount, 0, 5, d.aiCount),
    difficulty: oneOf(r.difficulty, ['easy', 'normal', 'hard'] as const, d.difficulty),
    quality: oneOf(r.quality, ['low', 'medium', 'high'] as const, d.quality),
    cameraMode: oneOf(r.cameraMode, ['chase', 'far', 'hood'] as const, d.cameraMode),
    speedLines: typeof r.speedLines === 'boolean' ? r.speedLines : d.speedLines,
    haptics: typeof r.haptics === 'boolean' ? r.haptics : d.haptics,
    audio: {
      muted: typeof audio.muted === 'boolean' ? audio.muted : d.audio.muted,
      master: clamp01(audio.master, d.audio.master),
      engine: clamp01(audio.engine, d.audio.engine),
      sfx: clamp01(audio.sfx, d.audio.sfx),
    },
  };
}

export function loadSettings(): GameSettings {
  if (cache) return cache;
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = sanitizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    cache = { ...DEFAULT_SETTINGS };
  }
  return cache;
}

export function saveSettings(next: Partial<GameSettings> | ((s: GameSettings) => GameSettings)): GameSettings {
  const current = loadSettings();
  const merged = typeof next === 'function' ? next(current) : { ...current, ...next, audio: { ...current.audio, ...(next.audio ?? {}) } };
  cache = sanitizeSettings(merged);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // storage unavailable; keep in memory
  }
  listeners.forEach((l) => l());
  return cache;
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useSettings(): [GameSettings, (next: Partial<GameSettings>) => void] {
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  useEffect(() => {
    setSettings(loadSettings());
    return subscribeSettings(() => setSettings(loadSettings()));
  }, []);
  const update = useCallback((next: Partial<GameSettings>) => { saveSettings(next); }, []);
  return [settings, update];
}
