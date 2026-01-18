export type UpdateCallback = (deltaTime: number) => void;
export type RenderCallback = (interpolation: number) => void;

export interface GameLoopOptions {
  fixedTimeStep?: number; // Physics timestep in seconds (default: 1/60)
  maxSubSteps?: number; // Maximum physics steps per frame (default: 3)
}

export class GameLoop {
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;

  private lastTime: number = 0;
  private accumulator: number = 0;
  private fixedTimeStep: number;
  private maxSubSteps: number;

  private updateCallbacks: UpdateCallback[] = [];
  private renderCallbacks: RenderCallback[] = [];

  // Performance metrics
  private frameCount: number = 0;
  private fpsUpdateTime: number = 0;
  private currentFPS: number = 60;
  private physicsTime: number = 0;
  private renderTime: number = 0;

  constructor(options: GameLoopOptions = {}) {
    this.fixedTimeStep = options.fixedTimeStep ?? 1 / 60;
    this.maxSubSteps = options.maxSubSteps ?? 3;
  }

  public start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.fpsUpdateTime = this.lastTime;
    this.frameCount = 0;

    this.loop(this.lastTime);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  public pause(): void {
    this.isRunning = false;
  }

  public resume(): void {
    if (!this.isRunning) {
      this.isRunning = true;
      this.lastTime = performance.now();
      this.accumulator = 0;
      this.loop(this.lastTime);
    }
  }

  private loop = (currentTime: number): void => {
    if (!this.isRunning) return;

    this.animationFrameId = requestAnimationFrame(this.loop);

    // Calculate frame time (cap at 250ms to prevent spiral of death)
    const frameTime = Math.min((currentTime - this.lastTime) / 1000, 0.25);
    this.lastTime = currentTime;
    this.accumulator += frameTime;

    // Fixed timestep physics updates
    const physicsStart = performance.now();
    let steps = 0;
    while (this.accumulator >= this.fixedTimeStep && steps < this.maxSubSteps) {
      for (const callback of this.updateCallbacks) {
        callback(this.fixedTimeStep);
      }
      this.accumulator -= this.fixedTimeStep;
      steps++;
    }
    this.physicsTime = performance.now() - physicsStart;

    // Calculate interpolation for smooth rendering
    const interpolation = this.accumulator / this.fixedTimeStep;

    // Render
    const renderStart = performance.now();
    for (const callback of this.renderCallbacks) {
      callback(interpolation);
    }
    this.renderTime = performance.now() - renderStart;

    // Update FPS counter
    this.frameCount++;
    if (currentTime - this.fpsUpdateTime >= 1000) {
      this.currentFPS = this.frameCount;
      this.frameCount = 0;
      this.fpsUpdateTime = currentTime;
    }
  };

  public onUpdate(callback: UpdateCallback): () => void {
    this.updateCallbacks.push(callback);
    return () => {
      const index = this.updateCallbacks.indexOf(callback);
      if (index !== -1) {
        this.updateCallbacks.splice(index, 1);
      }
    };
  }

  public onRender(callback: RenderCallback): () => void {
    this.renderCallbacks.push(callback);
    return () => {
      const index = this.renderCallbacks.indexOf(callback);
      if (index !== -1) {
        this.renderCallbacks.splice(index, 1);
      }
    };
  }

  public getFPS(): number {
    return this.currentFPS;
  }

  public getPhysicsTime(): number {
    return this.physicsTime;
  }

  public getRenderTime(): number {
    return this.renderTime;
  }

  public getFixedTimeStep(): number {
    return this.fixedTimeStep;
  }

  public isActive(): boolean {
    return this.isRunning;
  }
}
