/**
 * The brain of an endless run: countdown, streaming, obstacles, the rival, and
 * the score. Pure simulation; the game layer turns its events into feedback.
 */
import { ArcadeCar, type CarInput } from '../ArcadeCar';
import { StreamTrack, type StreamEvent } from './StreamTrack';
import { ObstacleField, type ObstacleEvent, type ObstacleKind } from './ObstacleField';
import { Pursuer } from './Pursuer';
import { ENDLESS_TUNING, bandAt, type EndlessTuning } from './tuning';

export type EndlessPhase = 'countdown' | 'running' | 'caught';

export interface RunResults {
  mode: 'endless';
  score: number;
  distance: number;
  /** Seconds survived after GO. */
  time: number;
  topSpeed: number;
  nearMisses: number;
  bestCombo: number;
  hits: number;
  seed: number;
  isRecord: boolean;
}

export type EndlessEvent =
  | { type: 'countdown'; value: number }
  | { type: 'go' }
  | { type: 'startBoost' }
  | { type: 'hit'; kind: ObstacleKind | 'wall'; magnitude: number; x: number; z: number }
  | { type: 'nearMiss'; clearance: number; points: number }
  | { type: 'patternClear'; name: string; combo: number }
  | { type: 'comboLost'; combo: number }
  | { type: 'multiplier'; value: number }
  | { type: 'oil' }
  | { type: 'boostPad'; points: number }
  | { type: 'driftBoost'; tier: number; points: number }
  | { type: 'milestone'; metres: number }
  | { type: 'record'; score: number }
  | { type: 'closing'; gap: number }
  | { type: 'surge'; heavy: boolean }
  | { type: 'caught'; results: RunResults }
  | { type: 'respawn' }
  | { type: 'stream'; event: StreamEvent }
  | { type: 'obstacle'; event: ObstacleEvent };

export interface EndlessOptions {
  seed: number;
  bestScore?: number;
  countdownSeconds?: number;
}

const STUCK_RESPAWN_TIME = 3.5;

export class EndlessDirector {
  public phase: EndlessPhase = 'countdown';
  public readonly seed: number;
  public readonly track: StreamTrack;
  public readonly obstacles: ObstacleField;
  public readonly rival: Pursuer;
  public readonly car: ArcadeCar;
  public score = 0;
  public distance = 0;
  public combo = 0;
  public bestCombo = 0;
  public multiplier = 1;
  public runTime = 0;
  public topSpeed = 0;
  public nearMisses = 0;
  public hits = 0;
  public countdownRemaining: number;
  public countdownValue = 3;
  public readonly bestScore: number;
  private recordAnnounced = false;
  private nextMilestone: number;
  private throttleSince = -1;
  private stuckTime = 0;
  private listeners: ((e: EndlessEvent) => void)[] = [];
  private readonly countdownSeconds: number;
  private lastProgress = 0;

  constructor(options: EndlessOptions, private readonly t: EndlessTuning = ENDLESS_TUNING) {
    this.seed = options.seed;
    this.bestScore = options.bestScore ?? 0;
    this.countdownSeconds = options.countdownSeconds ?? 3;
    this.countdownRemaining = this.countdownSeconds;
    this.nextMilestone = t.milestoneEvery;
    this.track = new StreamTrack(options.seed, t);
    this.obstacles = new ObstacleField(this.track, options.seed, t);
    this.track.on((e) => {
      if (e.type === 'chunk') this.obstacles.populate(e.chunk);
      else this.obstacles.retire(e.chunk);
      this.emit({ type: 'stream', event: e });
    });
    this.obstacles.on((e) => this.onObstacle(e));
    this.track.ensureAhead(t.windowAhead);
    this.car = new ArcadeCar(this.track);
    const p = this.track.sampleAt(t.playerStart);
    this.car.place(p.x, p.z, Math.atan2(p.tx, p.tz));
    this.car.isPlayer = true;
    this.car.onBoost = (tier) => {
      if (this.phase !== 'running') return;
      const points = tier * t.driftPointsPerTier * this.multiplier;
      this.score += points;
      this.emit({ type: 'driftBoost', tier, points });
    };
    this.rival = new Pursuer(this.track, t.playerStart - t.rivalStartGap, t);
    this.rival.on((e) => {
      if (e.type === 'caught') this.finish();
      else this.emit(e);
    });
    this.lastProgress = 0;
  }

  public on(listener: (e: EndlessEvent) => void): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter((l) => l !== listener); };
  }

  private emit(e: EndlessEvent): void {
    for (const l of this.listeners) l(e);
  }

  public get isFrozen(): boolean { return this.phase === 'countdown'; }
  public get band(): number { return bandAt(this.distance, this.t); }
  public get goFlash(): boolean { return this.phase === 'running' && this.runTime < 0.9; }

  /** Throttle held during the countdown (perfect start). */
  public noteThrottle(throttle: number, elapsed: number): void {
    if (this.phase !== 'countdown') return;
    if (throttle > 0.3) { if (this.throttleSince < 0) this.throttleSince = elapsed; }
    else this.throttleSince = -1;
  }

  private setCombo(value: number): void {
    const T = this.t;
    this.combo = value;
    this.bestCombo = Math.max(this.bestCombo, value);
    const mult = 1 + Math.min(T.maxMultiplier - 1, Math.floor(value / T.comboPerTier));
    if (mult !== this.multiplier) {
      this.multiplier = mult;
      this.emit({ type: 'multiplier', value: mult });
    }
  }

  private loseCombo(): void {
    const had = this.combo;
    if (had >= this.t.comboLostMin) this.emit({ type: 'comboLost', combo: had });
    this.setCombo(0);
  }

  private onObstacle(e: ObstacleEvent): void {
    const T = this.t;
    this.emit({ type: 'obstacle', event: e });
    if (this.phase !== 'running') return;
    switch (e.type) {
      case 'hit':
        this.hits++;
        this.loseCombo();
        this.rival.surge(e.obstacle.kind === 'block');
        this.emit({ type: 'hit', kind: e.obstacle.kind, magnitude: e.impact, x: e.obstacle.x, z: e.obstacle.z });
        break;
      case 'nearMiss': {
        this.nearMisses++;
        this.setCombo(this.combo + 1);
        const points = T.nearMissPoints * this.multiplier;
        this.score += points;
        this.emit({ type: 'nearMiss', clearance: e.clearance, points });
        break;
      }
      case 'patternClear':
        this.setCombo(this.combo + 1);
        this.emit({ type: 'patternClear', name: e.name, combo: this.combo });
        break;
      case 'oil':
        this.emit({ type: 'oil' });
        break;
      case 'boost': {
        const points = T.boostPadPoints * this.multiplier;
        this.score += points;
        this.emit({ type: 'boostPad', points });
        break;
      }
      default:
        break;
    }
  }

  /** Advance the whole simulation by one physics step. */
  public update(dt: number, input: CarInput): void {
    const T = this.t;
    if (this.phase === 'countdown') {
      const elapsed = this.countdownSeconds - this.countdownRemaining;
      this.noteThrottle(input.throttle, elapsed);
      this.car.step(dt, input, true);
      this.countdownRemaining -= dt;
      const value = Math.max(0, Math.ceil(this.countdownRemaining));
      if (value !== this.countdownValue && value > 0) {
        this.countdownValue = value;
        this.emit({ type: 'countdown', value });
      }
      if (this.countdownRemaining <= 0) {
        this.phase = 'running';
        this.runTime = 0;
        if (this.throttleSince >= 0 && elapsed + dt - this.throttleSince <= 0.4) {
          this.car.giveBoost(1, 0.8);
          this.emit({ type: 'startBoost' });
        }
        this.emit({ type: 'go' });
      }
      return;
    }
    if (this.phase === 'caught') {
      // let the cars coast through the capture slow-mo
      this.car.step(dt, { throttle: 0, steer: 0, brake: false, handbrake: false });
      this.rival.step(dt, this.car, this.distance, this.runTime);
      return;
    }

    this.runTime += dt;
    this.car.step(dt, input);
    this.track.ensureAhead(this.car.splineS + T.windowAhead);
    this.track.trimBehind(Math.min(this.car.splineS, this.rival.s));
    this.obstacles.step(this.car);

    // walls
    for (const imp of this.car.impacts) {
      if (imp.other !== 'wall') continue;
      this.hits++;
      this.loseCombo();
      this.rival.surge(imp.magnitude >= T.heavyImpact);
      this.emit({ type: 'hit', kind: 'wall', magnitude: imp.magnitude, x: imp.x, z: imp.z });
    }

    // progress and score: only new ground counts
    const progress = this.car.splineS - T.playerStart;
    if (progress > this.lastProgress) {
      const gained = progress - this.lastProgress;
      this.distance = progress;
      this.score += gained * this.multiplier;
      this.lastProgress = progress;
    }
    this.topSpeed = Math.max(this.topSpeed, this.car.forwardSpeed);
    while (this.distance >= this.nextMilestone) {
      this.emit({ type: 'milestone', metres: this.nextMilestone });
      this.nextMilestone += T.milestoneEvery;
    }
    if (!this.recordAnnounced && this.bestScore > 0 && this.score > this.bestScore) {
      this.recordAnnounced = true;
      this.emit({ type: 'record', score: this.score });
    }

    // stuck against a wall for too long: back onto the road (the rival keeps coming)
    this.stuckTime = this.car.stuck ? this.stuckTime + dt : 0;
    if (this.stuckTime > STUCK_RESPAWN_TIME) this.respawn();

    this.rival.step(dt, this.car, this.distance, this.runTime);
  }

  public respawn(): void {
    // back onto the centreline, just past anything solid that is sitting there
    let s = Math.max(this.track.firstS + 4, this.car.splineS);
    for (let guard = 0; guard < 20; guard++) {
      const blocked = this.obstacles.near(s, 7).some((o) => o.alive && (o.kind === 'block' || o.kind === 'cones') && Math.abs(o.lateral) < o.radius + 2);
      if (!blocked) break;
      s += 5;
    }
    const p = this.track.sampleAt(s);
    this.car.place(p.x, p.z, Math.atan2(p.tx, p.tz));
    this.car.ghostTime = 1.5;
    this.stuckTime = 0;
    this.emit({ type: 'respawn' });
  }

  public get isRecord(): boolean {
    return this.score > this.bestScore;
  }

  public results(): RunResults {
    return {
      mode: 'endless',
      score: Math.floor(this.score),
      distance: Math.floor(this.distance),
      time: this.runTime,
      topSpeed: this.topSpeed,
      nearMisses: this.nearMisses,
      bestCombo: this.bestCombo,
      hits: this.hits,
      seed: this.seed,
      isRecord: this.isRecord,
    };
  }

  private finish(): void {
    if (this.phase === 'caught') return;
    this.phase = 'caught';
    this.emit({ type: 'caught', results: this.results() });
  }
}
