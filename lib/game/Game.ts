import * as THREE from 'three';
import { Engine } from './Engine';
import { GameLoop } from './GameLoop';
import { TrackSpline, DEFAULT_WAYPOINTS, type MinimapData } from './TrackSpline';
import { ArcadeCar } from './ArcadeCar';
import { RaceDirector, type Racer, type Standing, type RaceEvent } from './RaceDirector';
import { GameStore } from './GameStore';
import { CameraRig } from './CameraRig';
import { Environment } from './Environment';
import { TrackMeshBuilder } from './TrackMeshBuilder';
import { buildCarMesh, updateCarVisual, type CarVisual } from './CarMesh';
import { ParticleSystem, SkidMarks, CarEffects } from './Effects';
import { AIDriver, DIFFICULTY_SCALE, type AIPersonality } from './ai/AIDriver';
import { PALETTE } from './palette';
import { InputManager } from '@/lib/input/InputManager';
import { HapticFeedback } from '@/lib/input/HapticFeedback';
import { AudioEngine } from '@/lib/audio/AudioEngine';
import { loadSettings, saveSettings, subscribeSettings, type GameSettings } from '@/lib/settings';
import type { CustomTrackData, GameMode } from './types';

export type { MinimapData } from './TrackSpline';
export type { CustomTrackData, GameMode } from './types';

export interface RaceResults {
  mode: GameMode;
  standings: Standing[];
  position: number;
  totalTime: number;
  bestLap: number;
  lapTimes: number[];
  totalLaps: number;
  trackLength: number;
}

export interface GameOptions {
  mode: GameMode;
  customTrack?: CustomTrackData;
  /** Development-only override. */
  lapsOverride?: number;
  onProgress?: (progress: number, message: string) => void;
  onPause?: () => void;
  onFinish?: (results: RaceResults) => void;
}

const PERSONALITIES: Record<GameSettings['difficulty'], AIPersonality[]> = {
  easy: ['balanced', 'defensive', 'rookie', 'rookie', 'defensive'],
  normal: ['aggressive', 'balanced', 'defensive', 'rookie', 'balanced'],
  hard: ['aggressive', 'aggressive', 'balanced', 'balanced', 'defensive'],
};

interface RacerBundle {
  racer: Racer;
  car: ArcadeCar;
  visual: CarVisual;
  fx: CarEffects;
  ai: AIDriver | null;
}

export class Game {
  public readonly store: GameStore;
  public readonly audio = new AudioEngine();
  private engine!: Engine;
  private loop!: GameLoop;
  private input!: InputManager;
  private spline!: TrackSpline;
  private director!: RaceDirector;
  private camera!: CameraRig;
  private environment!: Environment;
  private trackMesh!: TrackMeshBuilder;
  private particles!: ParticleSystem;
  private skids!: SkidMarks;
  private bundles: RacerBundle[] = [];
  private player!: RacerBundle;
  private settings: GameSettings;
  private unsubscribeSettings: (() => void) | null = null;
  private unsubscribeDirector: (() => void) | null = null;
  private paused = false;
  private disposed = false;
  private initialised = false;
  private finished = false;
  private time = 0;
  private lastColdKey = '';
  private driftHintShown = false;
  private autopilot: AIDriver | null = null;
  private readonly lapsTotal: number;

  constructor(private readonly container: HTMLElement, private readonly options: GameOptions) {
    this.settings = loadSettings();
    const isDev = process.env.NODE_ENV !== 'production';
    this.lapsTotal = isDev && options.lapsOverride ? options.lapsOverride : this.settings.laps;
    const aiCount = options.mode === 'race' ? this.settings.aiCount : 0;
    this.store = new GameStore(this.lapsTotal, aiCount + 1);
  }

  public async init(): Promise<void> {
    const report = (p: number, m: string) => this.options.onProgress?.(p, m);
    report(5, 'Warming up');
    await nextFrame();
    if (this.disposed) return;

    const waypoints = this.options.customTrack?.waypoints ?? DEFAULT_WAYPOINTS;
    this.spline = new TrackSpline(waypoints, this.options.customTrack?.startPosition);
    report(20, 'Laying asphalt');
    await nextFrame();
    if (this.disposed) return;

    this.engine = new Engine({ container: this.container, quality: this.settings.quality });
    this.trackMesh = new TrackMeshBuilder(this.spline);
    this.engine.scene.add(this.trackMesh.group);
    report(45, 'Painting the sunset');
    await nextFrame();
    if (this.disposed) return;

    this.environment = new Environment(this.spline, this.settings.quality);
    this.engine.scene.add(this.environment.group);
    this.particles = new ParticleSystem(this.engine.scene);
    this.skids = new SkidMarks(this.engine.scene);
    report(70, 'Fuelling cars');
    await nextFrame();
    if (this.disposed) return;

    this.director = new RaceDirector(this.spline, { laps: this.lapsTotal });
    this.createRacers();
    this.unsubscribeDirector = this.director.on((e) => this.onRaceEvent(e));

    this.input = new InputManager();
    this.camera = new CameraRig(this.engine.camera, this.settings.cameraMode);
    this.camera.snapTo(this.player.car);
    this.audio.setLevels(this.settings.audio);
    this.unsubscribeSettings = subscribeSettings(() => {
      this.settings = loadSettings();
      this.audio.setLevels(this.settings.audio);
      HapticFeedback.setEnabled(this.settings.haptics);
    });
    HapticFeedback.setEnabled(this.settings.haptics);

    this.loop = new GameLoop(1 / 60, 4);
    this.loop.onUpdate((dt) => this.update(dt));
    this.loop.onRender((alpha, dt) => this.render(alpha, dt));
    report(100, 'Lights on');
    await nextFrame();
    if (this.disposed) return;
    this.initialised = true;
    this.loop.start();
    this.audio.setEngineRunning(true);
    this.store.emit();
  }

  private createRacers(): void {
    const aiCount = this.options.mode === 'race' ? this.settings.aiCount : 0;
    const slots = aiCount + 1;
    // Player starts at the back for a race, on pole in a time trial.
    const playerSlot = aiCount > 0 ? slots - 1 : 0;
    const personalities = PERSONALITIES[this.settings.difficulty];
    const diff = DIFFICULTY_SCALE[this.settings.difficulty];
    let aiIndex = 0;
    for (let i = 0; i < slots; i++) {
      const isPlayer = i === playerSlot;
      const car = new ArcadeCar(this.spline);
      const slot = this.spline.gridSlot(i);
      car.place(slot.x, slot.z, slot.rotation);
      car.isPlayer = isPlayer;
      const color = isPlayer ? PALETTE.player : PALETTE.ai[aiIndex % PALETTE.ai.length];
      const personality = personalities[aiIndex % personalities.length];
      const ai = isPlayer ? null : new AIDriver(car, this.spline, personality, diff);
      const name = isPlayer ? 'YOU' : ai!.profile.name;
      const racer = this.director.addRacer(car, name, color, isPlayer);
      const visual = buildCarMesh(color);
      this.engine.scene.add(visual.group);
      const fx = new CarEffects(this.particles, this.skids, `c${i}`);
      const bundle: RacerBundle = { racer, car, visual, fx, ai };
      this.bundles.push(bundle);
      if (isPlayer) this.player = bundle;
      else aiIndex++;
      car.onBoost = (tier) => {
        if (isPlayer) { this.audio.boost(tier); HapticFeedback.drift(); this.camera.addShake(0.15); }
      };
    }
    // AI hard-cap so the field stays close on lap 1
    this.director.racers.forEach((r, i) => { r.position = i + 1; });
  }

  private onRaceEvent(e: RaceEvent): void {
    const s = this.store;
    switch (e.type) {
      case 'countdown':
        s.state.countdown = e.value;
        this.audio.countdownBeep(false);
        s.emit();
        break;
      case 'go':
        s.state.countdown = null;
        s.state.go = true;
        this.audio.countdownBeep(true);
        s.emit();
        break;
      case 'startBoost':
        if (e.racer.isPlayer) s.notify('PERFECT START', 'good', 1400);
        break;
      case 'lap':
        if (!e.racer.isPlayer) break;
        if (e.racer.finished) break;
        if (e.isBest && e.racer.lapTimes.length > 1) s.notify('NEW BEST LAP', 'good', 1800, formatDeltaShort(e.delta));
        else if (e.finalLap) s.notify('FINAL LAP', 'big', 1800);
        else s.notify(`LAP ${e.racer.lap}`, 'info', 1400, e.racer.lapTimes.length > 1 ? formatDeltaShort(e.delta) : undefined);
        this.audio.lap(e.isBest && e.racer.lapTimes.length > 1);
        HapticFeedback.checkpoint();
        break;
      case 'invalidLap':
        if (e.racer.isPlayer) s.notify('LAP NOT COUNTED', 'bad', 2200, 'Missed a checkpoint');
        break;
      case 'wrongWay':
        if (e.racer.isPlayer) { s.state.wrongWay = e.active; if (e.active) this.audio.wrongWay(); s.emit(); }
        break;
      case 'position':
        if (e.racer.isPlayer && this.director.phase === 'racing') {
          s.notify(e.to < e.from ? `P${e.to}` : `P${e.to}`, e.to < e.from ? 'good' : 'bad', 900, e.to < e.from ? 'Overtake!' : 'Lost a place');
        }
        break;
      case 'respawn':
        if (e.racer.isPlayer) { this.audio.respawn(); this.skids.lift('c0-0'); this.skids.lift('c0-1'); this.camera.snapTo(e.racer.car); }
        break;
      case 'finish':
        this.finish(e.standings);
        break;
      default:
        break;
    }
  }

  private finish(standings: Standing[]): void {
    if (this.finished) return;
    this.finished = true;
    const r = this.player.racer;
    const win = r.position === 1;
    this.audio.finish(win);
    HapticFeedback.raceComplete();
    this.player.fx.burst(this.player.car.x, this.player.car.z);
    this.store.state.phase = 'finished';
    this.store.emit();
    const results: RaceResults = {
      mode: this.options.mode,
      standings,
      position: r.position,
      totalTime: r.finishTime,
      bestLap: r.bestLap,
      lapTimes: r.lapTimes,
      totalLaps: this.lapsTotal,
      trackLength: this.spline.length,
    };
    window.setTimeout(() => { if (!this.disposed) this.options.onFinish?.(results); }, 900);
  }

  private update(dt: number): void {
    if (this.paused || this.disposed) return;
    this.time += dt;
    const input = this.input.update();

    if (input.pause && !this.finished) {
      this.pause();
      this.options.onPause?.();
      return;
    }
    if (input.mute) {
      saveSettings((s) => ({ ...s, audio: { ...s.audio, muted: !s.audio.muted } }));
      this.store.notify(this.settings.audio.muted ? 'SOUND ON' : 'SOUND OFF', 'info', 900);
    }
    if (input.cameraToggle) {
      const mode = this.camera.cycle();
      saveSettings({ cameraMode: mode });
      this.store.notify(`CAMERA: ${mode.toUpperCase()}`, 'info', 900);
    }
    if (input.respawn && !this.finished && this.director.phase === 'racing') {
      this.director.respawn(this.player.racer);
    }

    const frozen = this.director.isFrozen;
    if (frozen) {
      const elapsed = 3 - this.director.countdownRemaining;
      this.director.noteThrottle(this.player.racer, input.throttle, elapsed);
    }

    // player
    const cars = this.bundles.map((b) => b.car);
    const playerInput = this.finished
      ? { throttle: 0, steer: 0, brake: true, handbrake: false }
      : this.autopilot
        ? this.autopilot.think(dt, { others: cars.filter((c) => c !== this.player.car), gapToPlayer: 0 })
        : { throttle: input.throttle, steer: input.steering, brake: input.brake, handbrake: input.handbrake };
    this.player.car.step(dt, playerInput, frozen);

    // AI
    for (const b of this.bundles) {
      if (!b.ai) continue;
      const others = cars.filter((c) => c !== b.car);
      const gap = this.player.racer.progress - b.racer.progress;
      const ctx = { others, gapToPlayer: this.finished ? 0 : gap };
      const ai = b.ai.think(dt, ctx);
      b.car.step(dt, ai, frozen);
    }
    // car-car
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) ArcadeCar.collide(cars[i], cars[j]);
    }

    this.director.update(dt);

    // impacts → feedback
    for (const b of this.bundles) {
      for (const imp of b.car.impacts) {
        if (b === this.player) {
          this.camera.addShake(Math.min(1, imp.magnitude / 12));
          this.audio.impact(imp.magnitude);
          if (imp.magnitude > 6) HapticFeedback.collision();
        }
      }
    }

    this.syncStore(input.throttle);

    const pc = this.player.car;
    this.audio.update(pc.rpm, Math.max(0, pc.throttle), pc.slip, pc.speed, pc.surface, pc.boostTime > 0);
  }

  private syncStore(throttle: number): void {
    const s = this.store.state;
    const pc = this.player.car;
    const r = this.player.racer;
    s.phase = this.director.phase;
    s.go = this.director.goFlash;
    s.speedKmh = pc.speedKmh;
    s.rpm = pc.rpm;
    s.gear = pc.gear;
    s.lap = Math.min(r.lap, this.lapsTotal);
    s.position = r.position;
    s.lapTime = this.director.currentLapTime(r);
    s.bestLap = r.bestLap;
    s.lastLap = r.lastLap;
    s.lastLapDelta = r.lastLapDelta;
    s.raceTime = this.director.raceTime * 1000;
    s.driftCharge = pc.driftCharge;
    s.driftTier = pc.driftCharge >= 2.9 ? 3 : pc.driftCharge >= 1.8 ? 2 : pc.driftCharge >= 0.9 ? 1 : 0;
    s.isDrifting = pc.isDrifting;
    s.boostTime = pc.boostTime;
    s.boostTier = pc.boostTier;
    s.offTrack = pc.surface === 'grass';
    s.stuck = pc.stuck;
    s.fps = this.loop.getFPS();
    s.dots = this.bundles.map((b) => ({ x: b.car.x, z: b.car.z, heading: b.car.heading, color: b.racer.color, isPlayer: b.racer.isPlayer }));

    if (!this.driftHintShown && this.director.phase === 'racing' && this.director.raceTime > 4 && pc.speed > 15 && Math.abs(this.spline.sampleAt(pc.splineS + 30).curvature) > 0.02 && !this.input.isTouchActive()) {
      this.driftHintShown = true;
      s.showDriftHint = true;
      this.store.notify('HOLD SPACE TO DRIFT', 'info', 2600, 'Release for a boost');
    }
    void throttle;

    const cold = `${s.phase}|${s.lap}|${s.position}|${s.gear}|${s.wrongWay}|${s.offTrack}|${s.stuck}|${s.boostTier}|${s.driftTier}|${s.isDrifting}|${s.countdown}|${s.go}`;
    const swept = this.store.sweep();
    if (cold !== this.lastColdKey && !swept) {
      this.lastColdKey = cold;
      this.store.emit();
    } else if (cold !== this.lastColdKey) {
      this.lastColdKey = cold;
    }
  }

  private render(alpha: number, dt: number): void {
    if (this.disposed) return;
    for (const b of this.bundles) {
      updateCarVisual(b.visual, b.car, alpha, dt);
      b.visual.group.updateMatrixWorld();
      b.fx.update(dt, b.car, b.visual);
    }
    const pc = this.player.car;
    this.camera.setRumble(pc.surface === 'grass' ? 1 : pc.surface === 'kerb' ? 0.5 : 0);
    this.camera.update(pc, alpha, dt, this.director.phase === 'countdown');
    this.particles.update(dt, this.engine.camera);
    this.environment.update(this.engine.camera.position, this.time);
    this.engine.followShadow(pc.x, pc.z);
    if (this.director.phase === 'countdown') {
      const lit = Math.min(5, Math.floor((3 - this.director.countdownRemaining) / 3 * 5) + 1);
      this.trackMesh.setStartLights(lit, false);
    } else {
      this.trackMesh.setStartLights(5, this.director.raceTime < 3);
    }
    this.engine.render();
  }

  public pause(): void {
    if (this.paused || !this.initialised) return;
    this.paused = true;
    this.loop.stop();
    this.input.setEnabled(false);
    this.audio.suspend();
  }

  public resume(): void {
    if (!this.paused || this.disposed) return;
    this.paused = false;
    this.input.clearPending();
    this.input.setEnabled(true);
    this.audio.resume();
    this.loop.start();
  }

  public restart(): void {
    if (!this.initialised) return;
    this.finished = false;
    this.driftHintShown = false;
    this.bundles.forEach((b, i) => {
      const slot = this.spline.gridSlot(i);
      b.car.place(slot.x, slot.z, slot.rotation);
      b.ai?.reset();
    });
    this.director.reset();
    this.skids.clear();
    this.particles.clear();
    const st = this.store.state;
    Object.assign(st, { countdown: 3, go: false, wrongWay: false, notices: [], phase: 'countdown' });
    this.camera.snapTo(this.player.car);
    this.store.emit();
    this.resume();
  }

  public isPaused(): boolean { return this.paused; }

  /** Development aid: let an AI drive the player car (used by the end-to-end drive-through). */
  public setAutopilot(on: boolean): void {
    if (process.env.NODE_ENV === 'production') return;
    this.autopilot = on ? new AIDriver(this.player.car, this.spline, 'aggressive', 1) : null;
    if (!on) this.player.car.maxSpeedScale = 1;
  }

  public getPhase(): string { return this.director?.phase ?? 'loading'; }
  public getInputManager(): InputManager | null { return this.input ?? null; }
  public getMinimapData(): MinimapData | null { return this.spline ? this.spline.getMinimapData() : null; }
  public getTrackId(): string | undefined { return this.options.customTrack?.id; }
  public getTrackLength(): number { return this.spline?.length ?? 0; }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loop?.stop();
    this.unsubscribeSettings?.();
    this.unsubscribeDirector?.();
    this.input?.dispose();
    this.audio.dispose();
    for (const b of this.bundles) b.visual.dispose();
    this.bundles = [];
    this.particles?.dispose();
    this.skids?.dispose();
    this.trackMesh?.dispose();
    this.environment?.dispose();
    this.engine?.dispose();
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

function formatDeltaShort(ms: number): string {
  if (!ms) return '';
  const sign = ms < 0 ? '-' : '+';
  return `${sign}${(Math.abs(ms) / 1000).toFixed(3)}`;
}

