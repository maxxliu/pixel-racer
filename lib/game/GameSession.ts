import type { GameStore } from './GameStore';
import type { AudioEngine } from '@/lib/audio/AudioEngine';
import type { InputManager } from '@/lib/input/InputManager';
import type { MinimapData } from './TrackSpline';

/** What the React layer needs from any running game, whichever mode it is. */
export interface GameSession {
  readonly store: GameStore;
  readonly audio: AudioEngine;
  init(): Promise<void>;
  pause(): void;
  resume(): void;
  restart(): void;
  dispose(): void;
  isPaused(): boolean;
  getInputManager(): InputManager | null;
  getMinimapData(): MinimapData | null;
  getTrackId(): string | undefined;
}
