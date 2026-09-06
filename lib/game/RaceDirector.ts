import type { ArcadeCar } from './ArcadeCar';
import type { TrackSpline } from './TrackSpline';

export type RacePhase = 'countdown' | 'racing' | 'finished';

export interface Racer {
  car: ArcadeCar;
  name: string;
  color: number;
  isPlayer: boolean;
  /** Current lap, 1-based. */
  lap: number;
  lapsCompleted: number;
  nextGate: number;
  progress: number;
  lapStartTime: number;
  lapTimes: number[];
  bestLap: number;
  lastLap: number;
  lastLapDelta: number;
  finished: boolean;
  finishTime: number;
  position: number;
  wrongWay: boolean;
  invalidLap: boolean;
  offTrackTime: number;
  stuckTime: number;
  lastS: number;
  backDist: number;
  avgSpeed: number;
  throttleSince: number;
  /** True once the racer has crossed the line for the first time (left the grid). */
  startedLap: boolean;
  /** Forward distance travelled since the last line crossing. */
  lapTravel: number;
}

export interface Standing {
  name: string;
  color: number;
  isPlayer: boolean;
  position: number;
  finished: boolean;
  totalTime: number;
  bestLap: number;
  lapTimes: number[];
  /** Estimated gap to the winner in ms for racers still on track. */
  gapMs: number;
}

export type RaceEvent =
  | { type: 'countdown'; value: number }
  | { type: 'go' }
  | { type: 'lap'; racer: Racer; lapTime: number; isBest: boolean; delta: number; finalLap: boolean }
  | { type: 'invalidLap'; racer: Racer }
  | { type: 'gate'; racer: Racer; gate: number }
  | { type: 'position'; racer: Racer; from: number; to: number }
  | { type: 'wrongWay'; racer: Racer; active: boolean }
  | { type: 'respawn'; racer: Racer }
  | { type: 'finish'; racer: Racer; standings: Standing[] }
  | { type: 'startBoost'; racer: Racer };

export interface RaceDirectorOptions {
  laps: number;
  countdownSeconds?: number;
}

const OFF_TRACK_MARGIN = 14;
const OFF_TRACK_RESPAWN_TIME = 2.0;
const STUCK_RESPAWN_TIME = 3.5;
const WRONG_WAY_DIST = 9;

export class RaceDirector {
  public phase: RacePhase = 'countdown';
  public raceTime = 0;
  public countdownRemaining: number;
  public countdownValue = 3;
  public readonly racers: Racer[] = [];
  public readonly laps: number;
  private listeners: ((e: RaceEvent) => void)[] = [];
  private readonly countdownSeconds: number;
  private goFlashTime = 0;

  constructor(private readonly spline: TrackSpline, options: RaceDirectorOptions) {
    this.laps = options.laps;
    this.countdownSeconds = options.countdownSeconds ?? 3;
    this.countdownRemaining = this.countdownSeconds;
  }

  public on(listener: (e: RaceEvent) => void): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter((l) => l !== listener); };
  }

  private emit(e: RaceEvent): void {
    for (const l of this.listeners) l(e);
  }

  public addRacer(car: ArcadeCar, name: string, color: number, isPlayer: boolean): Racer {
    const n = this.spline.nearest(car.x, car.z);
    const racer: Racer = {
      car, name, color, isPlayer,
      lap: 1, lapsCompleted: 0, nextGate: 1, progress: n.s - this.spline.length,
      lapStartTime: 0, lapTimes: [], bestLap: 0, lastLap: 0, lastLapDelta: 0,
      finished: false, finishTime: 0, position: this.racers.length + 1,
      wrongWay: false, invalidLap: false, offTrackTime: 0, stuckTime: 0,
      lastS: n.s, backDist: 0, avgSpeed: 20, throttleSince: -1, startedLap: false, lapTravel: 0,
    };
    this.racers.push(racer);
    return racer;
  }

  public get player(): Racer | undefined {
    return this.racers.find((r) => r.isPlayer);
  }

  public get isFrozen(): boolean {
    return this.phase === 'countdown';
  }

  public get goFlash(): boolean {
    return this.phase === 'racing' && this.raceTime < 0.9;
  }

  public reset(): void {
    this.phase = 'countdown';
    this.raceTime = 0;
    this.countdownRemaining = this.countdownSeconds;
    this.countdownValue = Math.ceil(this.countdownSeconds);
    this.goFlashTime = 0;
    for (const r of this.racers) {
      const n = this.spline.nearest(r.car.x, r.car.z);
      Object.assign(r, {
        lap: 1, lapsCompleted: 0, nextGate: 1, progress: n.s - this.spline.length,
        lapStartTime: 0, lapTimes: [], bestLap: 0, lastLap: 0, lastLapDelta: 0,
        finished: false, finishTime: 0, wrongWay: false, invalidLap: false,
        offTrackTime: 0, stuckTime: 0, lastS: n.s, backDist: 0, avgSpeed: 20, throttleSince: -1, startedLap: false, lapTravel: 0,
      });
    }
    this.racers.forEach((r, i) => { r.position = i + 1; });
  }

  /** Notify the director that a racer is holding throttle (for the start boost). */
  public noteThrottle(racer: Racer, throttle: number, now: number): void {
    if (this.phase !== 'countdown') return;
    if (throttle > 0.3) {
      if (racer.throttleSince < 0) racer.throttleSince = now;
    } else {
      racer.throttleSince = -1;
    }
  }

  public update(dt: number): void {
    if (this.phase === 'countdown') {
      const elapsed = this.countdownSeconds - this.countdownRemaining;
      this.countdownRemaining -= dt;
      const value = Math.max(0, Math.ceil(this.countdownRemaining));
      if (value !== this.countdownValue && value > 0) {
        this.countdownValue = value;
        this.emit({ type: 'countdown', value });
      }
      if (this.countdownRemaining <= 0) {
        this.phase = 'racing';
        this.raceTime = 0;
        for (const r of this.racers) {
          r.lapStartTime = 0;
          if (r.throttleSince >= 0 && elapsed + dt - r.throttleSince <= 0.4) {
            r.car.giveBoost(1, 0.8);
            this.emit({ type: 'startBoost', racer: r });
          }
        }
        this.emit({ type: 'go' });
      }
      return;
    }

    this.raceTime += dt;
    const L = this.spline.length;
    for (const r of this.racers) {
      const car = r.car;
      const prev = r.lastS;
      const cur = car.splineS;
      let ds = cur - prev;
      if (ds < -L / 2) ds += L;
      if (ds > L / 2) ds -= L;
      r.lastS = cur;
      r.avgSpeed += (car.speed - r.avgSpeed) * Math.min(1, dt * 0.2);
      // A physically impossible jump is a teleport (respawn / course cut): it credits nothing.
      const teleport = Math.abs(ds) > 8;
      const hw = this.spline.halfWidthAt(car.splineIndex);
      const nearRoad = Math.abs(car.lateral) <= hw + OFF_TRACK_MARGIN;

      if (!r.finished && !teleport) {
        // --- wrong way ---
        if (ds < 0) r.backDist += -ds; else r.backDist = Math.max(0, r.backDist - ds * 1.5);
        const wrong = r.backDist > WRONG_WAY_DIST;
        if (wrong !== r.wrongWay) {
          r.wrongWay = wrong;
          this.emit({ type: 'wrongWay', racer: r, active: wrong });
        }

        if (ds > 0) {
          r.lapTravel += ds;
          const gates = this.spline.gates;
          const wrapped = cur < prev; // crossed s = 0 going forward
          // ordered gates (never gate 0, which is the line itself)
          if (!wrapped && r.nextGate < gates.length) {
            const g = gates[r.nextGate];
            if (prev < g.s && cur >= g.s && nearRoad) {
              r.nextGate++;
              this.emit({ type: 'gate', racer: r, gate: r.nextGate - 1 });
            }
          }
          if (wrapped) {
            if (!r.startedLap) {
              r.startedLap = true;
              r.nextGate = 1;
              r.lapTravel = 0;
            } else if (r.nextGate >= gates.length && nearRoad) {
              this.completeLap(r);
            } else if (r.lapTravel > L * 0.5) {
              // Went most of the way round but missed a checkpoint: not a lap.
              r.invalidLap = true;
              r.nextGate = 1;
              r.lapTravel = 0;
              this.emit({ type: 'invalidLap', racer: r });
            }
            // else: a short back-and-forth over the line; ignore.
          }
        }
      }

      r.progress = r.startedLap ? r.lapsCompleted * L + cur : cur - L;

      // --- off-track / stuck respawn (player only; AI recovers itself) ---
      if (r.isPlayer && !r.finished) {
        const far = Math.abs(car.lateral) > hw + OFF_TRACK_MARGIN;
        r.offTrackTime = far ? r.offTrackTime + dt : 0;
        r.stuckTime = car.stuck ? r.stuckTime + dt : 0;
        if (r.offTrackTime > OFF_TRACK_RESPAWN_TIME || r.stuckTime > STUCK_RESPAWN_TIME) {
          this.respawn(r);
        }
      }
    }

    this.updatePositions();
  }

  private completeLap(r: Racer): void {
    const lapTime = (this.raceTime - r.lapStartTime) * 1000;
    r.lapsCompleted++;
    r.lapTimes.push(lapTime);
    const isBest = r.bestLap === 0 || lapTime < r.bestLap;
    r.lastLapDelta = r.bestLap === 0 ? 0 : lapTime - r.bestLap;
    if (isBest) r.bestLap = lapTime;
    r.lastLap = lapTime;
    r.lapStartTime = this.raceTime;
    r.nextGate = 1;
    r.lapTravel = 0;
    r.invalidLap = false;
    if (r.lapsCompleted >= this.laps) {
      r.finished = true;
      r.finishTime = this.raceTime * 1000;
      this.emit({ type: 'lap', racer: r, lapTime, isBest, delta: r.lastLapDelta, finalLap: false });
      this.updatePositions();
      if (r.isPlayer) {
        this.phase = 'finished';
        this.emit({ type: 'finish', racer: r, standings: this.getStandings() });
      }
    } else {
      r.lap = r.lapsCompleted + 1;
      this.emit({ type: 'lap', racer: r, lapTime, isBest, delta: r.lastLapDelta, finalLap: r.lap === this.laps });
    }
  }

  private updatePositions(): void {
    const sorted = [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
    sorted.forEach((r, i) => {
      const pos = i + 1;
      if (pos !== r.position) {
        const from = r.position;
        r.position = pos;
        if (this.raceTime > 1.5) this.emit({ type: 'position', racer: r, from, to: pos });
      }
    });
  }

  public respawn(r: Racer): void {
    const gateIndex = Math.max(0, r.nextGate - 1);
    const gate = this.spline.gates[gateIndex];
    const p = this.spline.sampleAt(gate.s + 3);
    r.car.place(p.x, p.z, Math.atan2(p.tx, p.tz));
    r.car.ghostTime = 1.5;
    r.lastS = r.car.splineS;
    r.progress = r.startedLap ? r.lapsCompleted * this.spline.length + r.car.splineS : r.car.splineS - this.spline.length;
    r.offTrackTime = 0;
    r.stuckTime = 0;
    r.backDist = 0;
    if (r.wrongWay) { r.wrongWay = false; this.emit({ type: 'wrongWay', racer: r, active: false }); }
    this.emit({ type: 'respawn', racer: r });
  }

  public getStandings(): Standing[] {
    const L = this.spline.length;
    const leader = [...this.racers].sort((a, b) => a.position - b.position)[0];
    const leaderTime = leader?.finished ? leader.finishTime : this.raceTime * 1000;
    return [...this.racers]
      .sort((a, b) => a.position - b.position)
      .map((r) => {
        let totalTime = r.finishTime;
        let gapMs = 0;
        if (!r.finished) {
          const remaining = this.laps * L - (r.progress + L); // progress is -L..0 on the grid
          const est = this.raceTime * 1000 + (Math.max(0, remaining) / Math.max(8, r.avgSpeed)) * 1000;
          totalTime = est;
          gapMs = Math.max(0, est - leaderTime);
        } else {
          gapMs = Math.max(0, r.finishTime - leaderTime);
        }
        return {
          name: r.name, color: r.color, isPlayer: r.isPlayer, position: r.position,
          finished: r.finished, totalTime, bestLap: r.bestLap, lapTimes: r.lapTimes, gapMs,
        };
      });
  }

  public currentLapTime(r: Racer): number {
    if (this.phase === 'countdown') return 0;
    if (r.finished) return r.lastLap;
    return (this.raceTime - r.lapStartTime) * 1000;
  }
}
