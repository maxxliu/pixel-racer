import type { RacePhase } from './RaceDirector';

export interface RacerDot {
  x: number;
  z: number;
  heading: number;
  color: number;
  isPlayer: boolean;
}

export type NoticeKind = 'info' | 'good' | 'bad' | 'big';

export interface Notice {
  id: number;
  text: string;
  sub?: string;
  kind: NoticeKind;
  /** ms since epoch when it should disappear. */
  until: number;
}

export interface HudState {
  phase: RacePhase;
  countdown: number | null;
  go: boolean;
  speedKmh: number;
  rpm: number;
  gear: number;
  lap: number;
  totalLaps: number;
  position: number;
  totalRacers: number;
  lapTime: number;
  bestLap: number;
  lastLap: number;
  lastLapDelta: number;
  raceTime: number;
  driftCharge: number;
  driftTier: number;
  isDrifting: boolean;
  boostTime: number;
  boostTier: number;
  wrongWay: boolean;
  offTrack: boolean;
  stuck: boolean;
  dots: RacerDot[];
  notices: Notice[];
  fps: number;
  showDriftHint: boolean;
  // --- endless mode ---
  score: number;
  distance: number;
  multiplier: number;
  combo: number;
  /** Metres between the rival's nose and the player. */
  gap: number;
  /** 0 = rival far away, 1 = on your door. */
  danger: number;
  bestScore: number;
  runTime: number;
  caught: boolean;
}

export function createHudState(totalLaps: number, totalRacers: number): HudState {
  return {
    phase: 'countdown', countdown: 3, go: false,
    speedKmh: 0, rpm: 0.2, gear: 1,
    lap: 1, totalLaps, position: 1, totalRacers,
    lapTime: 0, bestLap: 0, lastLap: 0, lastLapDelta: 0, raceTime: 0,
    driftCharge: 0, driftTier: 0, isDrifting: false, boostTime: 0, boostTier: 0,
    wrongWay: false, offTrack: false, stuck: false,
    dots: [], notices: [], fps: 60, showDriftHint: false,
    score: 0, distance: 0, multiplier: 1, combo: 0, gap: 60, danger: 0, bestScore: 0, runTime: 0, caught: false,
  };
}

/**
 * Mutable game → UI bridge. Hot fields are read directly from `state` every frame
 * by the HUD's rAF; `emit()` publishes an immutable snapshot for React state.
 */
export class GameStore {
  public readonly state: HudState;
  private snapshot: HudState;
  private listeners = new Set<() => void>();
  private noticeId = 1;

  constructor(totalLaps: number, totalRacers: number) {
    this.state = createHudState(totalLaps, totalRacers);
    this.snapshot = { ...this.state };
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  public getSnapshot = (): HudState => this.snapshot;

  public emit(): void {
    this.snapshot = { ...this.state, dots: this.state.dots, notices: [...this.state.notices] };
    this.listeners.forEach((l) => l());
  }

  public notify(text: string, kind: NoticeKind = 'info', durationMs = 1800, sub?: string): void {
    const now = performance.now();
    this.state.notices = this.state.notices.filter((n) => n.until > now && !(kind === 'big' && n.kind === 'big'));
    this.state.notices.push({ id: this.noticeId++, text, sub, kind, until: now + durationMs });
    if (this.state.notices.length > 4) this.state.notices.shift();
    this.emit();
  }

  /** Drop expired notices; returns true if anything changed. */
  public sweep(): boolean {
    const now = performance.now();
    const before = this.state.notices.length;
    this.state.notices = this.state.notices.filter((n) => n.until > now);
    if (this.state.notices.length !== before) { this.emit(); return true; }
    return false;
  }
}
