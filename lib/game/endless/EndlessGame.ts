/**
 * The endless mode's game: composes the run director with the streaming renderers
 * and the engine pieces shared with the circuit modes (renderer, camera,
 * particles, skids, car meshes, input, audio, HUD store, settings).
 */
import * as THREE from 'three';
import { Engine } from '../Engine';
import { GameLoop } from '../GameLoop';
import { GameStore } from '../GameStore';
import { CameraRig } from '../CameraRig';
import { buildCarMesh, updateCarVisual, type CarVisual } from '../CarMesh';
import { ParticleSystem, SkidMarks, CarEffects } from '../Effects';
import { PALETTE } from '../palette';
import type { GameSession } from '../GameSession';
import type { MinimapData } from '../TrackSpline';
import { InputManager } from '@/lib/input/InputManager';
import { HapticFeedback } from '@/lib/input/HapticFeedback';
import { AudioEngine } from '@/lib/audio/AudioEngine';
import { loadSettings, saveSettings, subscribeSettings, type GameSettings } from '@/lib/settings';
import { getBestEndlessScore, ENDLESS_TRACK_ID } from '@/lib/scores';
import { randomSeed } from '@/lib/utils/rng';
import { EndlessDirector, type EndlessEvent, type RunResults } from './EndlessDirector';
import { StreamRoadMesh } from './StreamRoadMesh';
import { StreamEnvironment } from './StreamEnvironment';
import { ObstacleMeshes } from './ObstacleMeshes';
import { ENDLESS_TUNING } from './tuning';
import { driveAlong } from './EndlessBot';

export type { RunResults } from './EndlessDirector';

export interface EndlessGameOptions {
  seed?: number;
  onProgress?: (progress: number, message: string) => void;
  onPause?: () => void;
  onFinish?: (results: RunResults) => void;
}

const DUSK_DISTANCE = 6000;

export class EndlessGame implements GameSession {
  public readonly store = new GameStore(1, 1);
  public readonly audio = new AudioEngine();
  private engine!: Engine;
  private loop!: GameLoop;
  private input!: InputManager;
  private camera!: CameraRig;
  private particles!: ParticleSystem;
  private skids!: SkidMarks;
  private director!: EndlessDirector;
  private road!: StreamRoadMesh;
  private environment!: StreamEnvironment;
  private obstacleMeshes!: ObstacleMeshes;
  private playerVisual!: CarVisual;
  private playerFx!: CarEffects;
  private rivalVisual!: CarVisual;
  private rivalFx!: CarEffects;
  private rivalLight!: THREE.PointLight;
  private unsubscribeDirector: (() => void) | null = null;
  private unsubscribeSettings: (() => void) | null = null;
  private settings: GameSettings;
  private paused = false;
  private disposed = false;
  private initialised = false;
  private finished = false;
  private time = 0;
  private hitStop = 0;
  private timeScale = 1;
  private captureTimer = 0;
  private lastColdKey = '';
  private bestScore = 0;
  private autopilot = false;

  constructor(private readonly container: HTMLElement, private readonly options: EndlessGameOptions) {
    this.settings = loadSettings();
  }

  public async init(): Promise<void> {
    const report = (p: number, m: string) => this.options.onProgress?.(p, m);
    report(5, 'Warming up');
    await nextFrame();
    if (this.disposed) return;

    this.bestScore = getBestEndlessScore();
    this.director = new EndlessDirector({ seed: this.options.seed ?? randomSeed(), bestScore: this.bestScore });
    report(20, 'Laying the open road');
    await nextFrame();
    if (this.disposed) return;

    this.engine = new Engine({ container: this.container, quality: this.settings.quality });
    this.particles = new ParticleSystem(this.engine.scene);
    this.skids = new SkidMarks(this.engine.scene);
    this.buildWorld();
    report(50, 'Painting the sunset');
    await nextFrame();
    if (this.disposed) return;

    this.playerVisual = buildCarMesh(PALETTE.player);
    this.engine.scene.add(this.playerVisual.group);
    this.playerFx = new CarEffects(this.particles, this.skids, 'p');
    this.rivalVisual = buildCarMesh(PALETTE.rival, { headlight: PALETTE.rivalLight, stripe: 0x2a2140, underglow: PALETTE.rivalLight });
    this.rivalLight = new THREE.PointLight(PALETTE.rivalLight, 8, 18, 2);
    this.rivalLight.position.set(0, 0.7, -0.5);
    this.rivalVisual.group.add(this.rivalLight);
    this.engine.scene.add(this.rivalVisual.group);
    this.rivalFx = new CarEffects(this.particles, this.skids, 'r');
    report(75, 'Fuelling cars');
    await nextFrame();
    if (this.disposed) return;

    this.input = new InputManager();
    this.camera = new CameraRig(this.engine.camera, this.settings.cameraMode);
    this.camera.snapTo(this.director.car);
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
    this.store.state.bestScore = this.bestScore;
    report(100, 'Lights on');
    await nextFrame();
    if (this.disposed) return;
    this.initialised = true;
    this.loop.start();
    this.audio.setEngineRunning(true);
    this.store.emit();
  }

  /** Renderers bound to the current director (rebuilt on restart). */
  private buildWorld(): void {
    this.road = new StreamRoadMesh(this.engine.scene, this.director.track);
    this.environment = new StreamEnvironment(this.engine.scene, this.director.track, this.settings.quality);
    this.obstacleMeshes = new ObstacleMeshes(this.engine.scene, this.director.obstacles, this.particles);
    this.unsubscribeDirector = this.director.on((e) => this.onEvent(e));
    this.director.car.onBoost = ((base) => (tier: number) => {
      base?.(tier);
      this.audio.boost(tier);
      HapticFeedback.drift();
      this.camera?.addShake(0.15);
    })(this.director.car.onBoost);
  }

  private teardownWorld(): void {
    this.unsubscribeDirector?.();
    this.unsubscribeDirector = null;
    this.road?.dispose();
    this.environment?.dispose();
    this.obstacleMeshes?.dispose();
  }

  private onEvent(e: EndlessEvent): void {
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
        s.notify('PERFECT START', 'good', 1400);
        break;
      case 'hit': {
        const heavy = e.kind === 'block' || (e.kind === 'wall' && e.magnitude >= ENDLESS_TUNING.heavyImpact);
        if (e.kind === 'cones') this.audio.smash();
        if (heavy) this.hitStop = Math.max(this.hitStop, ENDLESS_TUNING.hitStopSteps);
        break;
      }
      case 'nearMiss':
        this.audio.nearMiss();
        HapticFeedback.nearMiss();
        s.notify('CLOSE CALL', 'good', 900, `+${Math.round(e.points)}`);
        break;
      case 'multiplier':
        if (e.value > 1) s.notify(`×${e.value}`, 'big', 1100, 'Multiplier up');
        break;
      case 'comboLost':
        this.audio.comboLost();
        s.notify('COMBO LOST', 'bad', 1200);
        break;
      case 'oil':
        s.notify('OIL', 'bad', 700);
        break;
      case 'boostPad':
        s.notify('BOOST PAD', 'good', 900, `+${Math.round(e.points)}`);
        break;
      case 'milestone':
        this.audio.milestone();
        s.notify(e.metres >= 1000 ? `${(e.metres / 1000).toFixed(1)} KM` : `${e.metres} M`, 'info', 1300);
        break;
      case 'record':
        this.audio.recordBeaten();
        this.playerFx.burst(this.director.car.x, this.director.car.z);
        s.notify('NEW BEST', 'big', 1800, 'Keep going');
        break;
      case 'closing':
        HapticFeedback.closing();
        s.notify("IT'S ON YOU", 'bad', 1100);
        break;
      case 'surge':
        this.audio.surge(e.heavy);
        break;
      case 'respawn':
        this.audio.respawn();
        this.skids.lift('p-0'); this.skids.lift('p-1');
        this.camera.snapTo(this.director.car);
        break;
      case 'caught':
        this.capture(e.results);
        break;
      default:
        break;
    }
  }

  private capture(results: RunResults): void {
    if (this.finished) return;
    this.finished = true;
    this.timeScale = ENDLESS_TUNING.captureSlowMo;
    this.captureTimer = ENDLESS_TUNING.captureSlowMoTime;
    this.audio.caught();
    HapticFeedback.caught();
    this.camera.addShake(1);
    this.store.state.caught = true;
    this.store.notify('CAUGHT', 'big', 2400);
    window.setTimeout(() => {
      if (this.disposed) return;
      this.store.state.phase = 'finished';
      this.store.emit();
      this.options.onFinish?.(results);
    }, 1400);
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
    if (input.respawn && !this.finished && this.director.phase === 'running') {
      this.director.respawn();
    }

    // hit-stop: a few frozen frames sell the impact
    if (this.hitStop > 0) {
      this.hitStop--;
      return;
    }
    if (this.captureTimer > 0) {
      this.captureTimer -= dt;
      if (this.captureTimer <= 0) this.timeScale = 1;
    }

    const playerInput = this.finished
      ? { throttle: 0, steer: 0, brake: false, handbrake: false }
      : this.autopilot
        ? driveAlong(this.director.car, this.director.track, { avoid: this.director.obstacles.obstacles })
        : { throttle: input.throttle, steer: input.steering, brake: input.brake, handbrake: input.handbrake };
    this.director.update(dt * this.timeScale, playerInput);

    // impacts → feedback
    const pc = this.director.car;
    for (const imp of pc.impacts) {
      this.camera.addShake(Math.min(1, imp.magnitude / 12) * (imp.other === 'obstacle' && imp.kind === 'cones' ? 0.4 : 1));
      if (imp.other !== 'obstacle' || imp.kind !== 'cones') this.audio.impact(imp.magnitude);
      if (imp.magnitude > 6) HapticFeedback.collision();
    }
    // the rival smashes whatever it drives over
    const rival = this.director.rival;
    for (const o of this.director.obstacles.near(rival.s, 3)) {
      if (o.kind === 'cones' && Math.hypot(o.x - rival.x, o.z - rival.z) < o.radius + 1.4) this.director.obstacles.smash(o);
    }

    this.syncStore();
    this.audio.update(pc.rpm, Math.max(0, pc.throttle), pc.slip, pc.speed, pc.surface, pc.boostTime > 0);
    const closeness = this.director.phase === 'countdown' ? 0 : Math.min(1, Math.max(0, 1 - (rival.gap - 3) / 55));
    this.audio.setRival(closeness, Math.min(1, rival.v / 60));
  }

  private syncStore(): void {
    const s = this.store.state;
    const d = this.director;
    const pc = d.car;
    s.phase = d.phase === 'countdown' ? 'countdown' : this.finished ? 'finished' : 'racing';
    s.go = d.goFlash;
    s.speedKmh = pc.speedKmh;
    s.rpm = pc.rpm;
    s.gear = pc.gear;
    s.driftCharge = pc.driftCharge;
    s.driftTier = pc.driftCharge >= 2.9 ? 3 : pc.driftCharge >= 1.8 ? 2 : pc.driftCharge >= 0.9 ? 1 : 0;
    s.isDrifting = pc.isDrifting;
    s.boostTime = pc.boostTime;
    s.boostTier = pc.boostTier;
    s.offTrack = pc.surface === 'grass';
    s.stuck = pc.stuck;
    s.fps = this.loop.getFPS();
    s.score = d.score;
    s.distance = d.distance;
    s.multiplier = d.multiplier;
    s.combo = d.combo;
    s.gap = d.rival.gap;
    s.danger = d.phase === 'countdown' ? 0 : d.rival.danger;
    s.runTime = d.runTime;
    s.bestScore = Math.max(this.bestScore, Math.floor(d.score));
    s.dots = [];

    const cold = `${s.phase}|${s.gear}|${s.offTrack}|${s.stuck}|${s.boostTier}|${s.driftTier}|${s.isDrifting}|${s.countdown}|${s.go}|${s.multiplier}|${s.caught}`;
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
    const pc = this.director.car;
    const rival = this.director.rival;
    updateCarVisual(this.playerVisual, pc, alpha, dt);
    this.playerVisual.group.updateMatrixWorld();
    this.playerFx.update(dt, pc, this.playerVisual);
    updateCarVisual(this.rivalVisual, rival, alpha, dt);
    this.rivalVisual.group.updateMatrixWorld();
    this.rivalFx.update(dt, rival, this.rivalVisual);
    this.rivalLight.intensity = 5 + rival.danger * 9 + (rival.boostTime > 0 ? 4 : 0);

    this.camera.setRumble(pc.surface === 'grass' ? 1 : pc.surface === 'kerb' ? 0.5 : 0);
    this.camera.update(pc, alpha, dt, this.director.phase === 'countdown');
    this.particles.update(dt, this.engine.camera);
    this.obstacleMeshes.update(dt);
    this.environment.setProgress(this.director.distance / DUSK_DISTANCE);
    this.environment.update(this.engine.camera.position, pc.x, pc.z, this.time);
    this.engine.followShadow(pc.x, pc.z);
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

  /** A fresh road and a fresh seed, without rebuilding the renderer. */
  public restart(): void {
    if (!this.initialised) return;
    this.teardownWorld();
    this.bestScore = getBestEndlessScore();
    this.director = new EndlessDirector({ seed: randomSeed(), bestScore: this.bestScore });
    this.buildWorld();
    this.finished = false;
    this.hitStop = 0;
    this.timeScale = 1;
    this.captureTimer = 0;
    this.skids.clear();
    this.particles.clear();
    const st = this.store.state;
    Object.assign(st, { countdown: 3, go: false, notices: [], phase: 'countdown', caught: false, score: 0, distance: 0, multiplier: 1, combo: 0, gap: ENDLESS_TUNING.rivalStartGap, danger: 0, runTime: 0, bestScore: this.bestScore });
    this.camera.snapTo(this.director.car);
    this.environment.setProgress(0);
    this.store.emit();
    this.resume();
  }

  /** Development aid: let the bot drive (used by the headless playtest). */
  public setAutopilot(on: boolean): void {
    if (process.env.NODE_ENV === 'production') return;
    this.autopilot = on;
  }

  public isPaused(): boolean { return this.paused; }
  public getInputManager(): InputManager | null { return this.input ?? null; }
  public getMinimapData(): MinimapData | null { return null; }
  public getTrackId(): string | undefined { return ENDLESS_TRACK_ID; }
  public getPhase(): string { return this.director?.phase ?? 'loading'; }
  public getSeed(): number { return this.director?.seed ?? 0; }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loop?.stop();
    this.unsubscribeSettings?.();
    this.teardownWorld();
    this.input?.dispose();
    this.audio.dispose();
    this.playerVisual?.dispose();
    this.rivalVisual?.dispose();
    this.particles?.dispose();
    this.skids?.dispose();
    this.engine?.dispose();
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}
