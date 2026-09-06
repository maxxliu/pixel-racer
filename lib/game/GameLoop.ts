export type UpdateCallback = (dt: number) => void;
export type RenderCallback = (alpha: number, dt: number) => void;

/**
 * Fixed-timestep loop with render interpolation.
 * The accumulator is clamped so a long stall never causes a fast-forward burst.
 */
export class GameLoop {
  private running = false;
  private rafId: number | null = null;
  private lastTime = 0;
  private accumulator = 0;
  private readonly step: number;
  private readonly maxSteps: number;
  private update: UpdateCallback | null = null;
  private render: RenderCallback | null = null;
  private fps = 60;
  private frames = 0;
  private fpsTime = 0;

  constructor(step = 1 / 60, maxSteps = 4) {
    this.step = step;
    this.maxSteps = maxSteps;
  }

  public onUpdate(cb: UpdateCallback): void { this.update = cb; }
  public onRender(cb: RenderCallback): void { this.render = cb; }
  public getFixedTimeStep(): number { return this.step; }
  public getFPS(): number { return this.fps; }
  public isRunning(): boolean { return this.running; }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  public stop(): void {
    this.running = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);
    let frame = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (frame > 0.25) frame = 0.25;
    this.accumulator = Math.min(this.accumulator + frame, this.step * this.maxSteps);
    let steps = 0;
    while (this.accumulator >= this.step && steps < this.maxSteps) {
      this.update?.(this.step);
      this.accumulator -= this.step;
      steps++;
    }
    this.render?.(this.accumulator / this.step, frame);
    this.frames++;
    if (now - this.fpsTime >= 1000) {
      this.fps = this.frames;
      this.frames = 0;
      this.fpsTime = now;
    }
  };
}
