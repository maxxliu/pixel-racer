/**
 * Fully synthesized game audio (no assets). Safe to construct on the server —
 * nothing touches the AudioContext until `unlock()` runs from a user gesture.
 */
export interface AudioLevels {
  muted: boolean;
  master: number;
  engine: number;
  sfx: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private engineGain!: GainNode;
  private sfxGain!: GainNode;
  private osc1!: OscillatorNode;
  private osc2!: OscillatorNode;
  private sub!: OscillatorNode;
  private engineFilter!: BiquadFilterNode;
  private squealGain!: GainNode;
  private rumbleGain!: GainNode;
  private windGain!: GainNode;
  private noiseBuffer: AudioBuffer | null = null;
  private levels: AudioLevels = { muted: false, master: 0.8, engine: 0.7, sfx: 0.9 };
  private ready = false;
  private engineOn = false;
  private lastRpm = 0.2;

  public get isReady(): boolean { return this.ready; }

  public setLevels(levels: AudioLevels): void {
    this.levels = levels;
    this.applyLevels();
  }

  private applyLevels(): void {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.master.gain.setTargetAtTime(this.levels.muted ? 0 : this.levels.master, t, 0.05);
    this.engineGain.gain.setTargetAtTime(this.levels.engine * (this.engineOn ? 1 : 0), t, 0.05);
    this.sfxGain.gain.setTargetAtTime(this.levels.sfx, t, 0.05);
  }

  /** Must be called from a user gesture (click/keydown/touch). Idempotent. */
  public unlock(): void {
    if (this.ready || typeof window === 'undefined') return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    try {
      this.ctx = new Ctx();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.engineGain = ctx.createGain();
    this.sfxGain = ctx.createGain();
    this.engineGain.connect(this.master);
    this.sfxGain.connect(this.master);

    // engine: two detuned saws + a sub sine through a low-pass
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 600;
    this.engineFilter.Q.value = 1.2;
    this.engineFilter.connect(this.engineGain);
    const mk = (type: OscillatorType, gain: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g);
      g.connect(this.engineFilter);
      o.start();
      return o;
    };
    this.osc1 = mk('sawtooth', 0.22);
    this.osc2 = mk('sawtooth', 0.16);
    this.sub = mk('sine', 0.3);

    // noise sources: squeal (band-pass), rumble (low), wind (high)
    this.noiseBuffer = this.makeNoise();
    const mkNoise = (filterType: BiquadFilterType, freq: number, q: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f);
      f.connect(g);
      g.connect(this.sfxGain);
      src.start();
      return g;
    };
    this.squealGain = mkNoise('bandpass', 1900, 6);
    this.rumbleGain = mkNoise('lowpass', 140, 0.8);
    this.windGain = mkNoise('highpass', 2400, 0.5);

    this.ready = true;
    this.applyLevels();
    if (ctx.state === 'suspended') void ctx.resume();
  }

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02; // brownish
      d[i] = (w * 0.6 + last * 3) * 0.5;
    }
    return buf;
  }

  public setEngineRunning(on: boolean): void {
    this.engineOn = on;
    this.applyLevels();
  }

  /** Per-frame engine/tyre/wind update. rpm 0..1, throttle 0..1, slip m/s, speed m/s. */
  public update(rpm: number, throttle: number, slip: number, speed: number, surface: 'asphalt' | 'kerb' | 'grass', boosting: boolean): void {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    const r = this.lastRpm + (rpm - this.lastRpm) * 0.25;
    this.lastRpm = r;
    const base = 42 + r * 190 + (boosting ? 30 : 0);
    this.osc1.frequency.setTargetAtTime(base, t, 0.03);
    this.osc2.frequency.setTargetAtTime(base * 1.503 + 3, t, 0.03);
    this.sub.frequency.setTargetAtTime(base * 0.5, t, 0.03);
    this.engineFilter.frequency.setTargetAtTime(380 + r * 1700 + throttle * 500, t, 0.05);
    const squeal = Math.min(1, Math.max(0, (slip - 2.5) / 7)) * (surface === 'grass' ? 0.15 : 1) * Math.min(1, speed / 8);
    this.squealGain.gain.setTargetAtTime(squeal * 0.5, t, 0.05);
    const rumble = surface === 'grass' ? Math.min(1, speed / 20) * 0.6 : surface === 'kerb' ? 0.35 : 0;
    this.rumbleGain.gain.setTargetAtTime(rumble, t, 0.06);
    this.windGain.gain.setTargetAtTime(Math.pow(Math.min(1, speed / 58), 2) * 0.16, t, 0.1);
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'square', gain = 0.25, slideTo?: number): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(this.sfxGain);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }

  private noiseBurst(dur: number, freq: number, gain: number, type: BiquadFilterType = 'lowpass'): void {
    if (!this.ready || !this.noiseBuffer) return;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start();
    src.stop(ctx.currentTime + dur + 0.02);
  }

  public countdownBeep(final: boolean): void {
    this.tone(final ? 880 : 440, final ? 0.5 : 0.18, 'square', 0.22);
  }

  public impact(magnitude: number): void {
    const m = Math.min(1, magnitude / 18);
    this.noiseBurst(0.18 + m * 0.2, 300 + m * 500, 0.5 + m * 0.5);
    this.tone(90, 0.2, 'sine', 0.4 * m + 0.1, 40);
  }

  public boost(tier: number): void {
    this.noiseBurst(0.5, 1200 + tier * 400, 0.5, 'bandpass');
    this.tone(220 + tier * 80, 0.35, 'sawtooth', 0.15, 660 + tier * 120);
  }

  public lap(best: boolean): void {
    const notes = best ? [523, 659, 784, 1047] : [659, 784];
    notes.forEach((n, i) => setTimeout(() => this.tone(n, 0.22, 'triangle', 0.25), i * 90));
  }

  public finish(win: boolean): void {
    const notes = win ? [523, 659, 784, 1047, 1319] : [392, 349, 330, 294];
    notes.forEach((n, i) => setTimeout(() => this.tone(n, 0.3, 'triangle', 0.28), i * 140));
  }

  public wrongWay(): void {
    this.tone(200, 0.25, 'square', 0.15, 150);
  }

  public click(): void {
    this.tone(1200, 0.06, 'square', 0.12);
  }

  public respawn(): void {
    this.tone(300, 0.3, 'triangle', 0.2, 600);
  }

  public suspend(): void {
    if (this.ready && this.ctx?.state === 'running') void this.ctx.suspend();
  }

  public resume(): void {
    if (this.ready && this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  public dispose(): void {
    if (!this.ctx) return;
    try { void this.ctx.close(); } catch { /* ignore */ }
    this.ctx = null;
    this.ready = false;
  }
}
