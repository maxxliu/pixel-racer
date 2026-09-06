export interface InputState {
  throttle: number; // -1..1
  steering: number; // -1..1, positive = right
  brake: boolean;
  handbrake: boolean;
  // one-shots (true for exactly one update)
  pause: boolean;
  cameraToggle: boolean;
  respawn: boolean;
  mute: boolean;
}

export type InputSource = 'keyboard' | 'gamepad' | 'touch';

export interface TouchState {
  active: boolean;
  steering: number;
  throttle: number;
  brake: boolean;
  handbrake: boolean;
}

const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  backward: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  brake: ['ShiftLeft', 'ShiftRight'],
  handbrake: ['Space'],
  pause: ['Escape', 'KeyP'],
  cameraToggle: ['KeyC'],
  respawn: ['KeyR'],
  mute: ['KeyM'],
} as const;

type OneShot = 'pause' | 'cameraToggle' | 'respawn' | 'mute';
const ONE_SHOTS: OneShot[] = ['pause', 'cameraToggle', 'respawn', 'mute'];
const ALL_GAME_KEYS = new Set<string>(Object.values(BINDINGS).flat());

/**
 * Keyboard + gamepad + (externally fed) touch input.
 * - One-shot actions are edge-triggered on keydown and consumed by a single update().
 * - All held keys are released on blur / tab hide so throttle can never stick.
 * - A connected but idle gamepad does not take over from the keyboard.
 */
export class InputManager {
  private keys = new Set<string>();
  private pending = new Set<OneShot>();
  private touch: TouchState = { active: false, steering: 0, throttle: 0, brake: false, handbrake: false };
  private touchPending = new Set<OneShot>();
  private gamepadIndex: number | null = null;
  private gamepadActiveUntil = 0;
  private prevButtons: boolean[] = [];
  private source: InputSource = 'keyboard';
  private enabled = true;

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.releaseAll);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('gamepadconnected', this.onGamepadConnected);
    window.addEventListener('gamepaddisconnected', this.onGamepadDisconnected);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    if (!ALL_GAME_KEYS.has(e.code)) return;
    e.preventDefault();
    if (e.repeat) return;
    if (!this.keys.has(e.code)) {
      for (const name of ONE_SHOTS) {
        if ((BINDINGS[name] as readonly string[]).includes(e.code)) this.pending.add(name);
      }
    }
    this.keys.add(e.code);
    this.source = 'keyboard';
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private releaseAll = (): void => {
    this.keys.clear();
  };

  private onVisibility = (): void => {
    if (document.hidden) this.releaseAll();
  };

  private onGamepadConnected = (e: GamepadEvent): void => {
    this.gamepadIndex = e.gamepad.index;
  };

  private onGamepadDisconnected = (e: GamepadEvent): void => {
    if (this.gamepadIndex === e.gamepad.index) this.gamepadIndex = null;
  };

  /** Ignore movement keys (menus open) but keep listening so held keys still release. */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.pending.clear();
  }

  /** Called by MobileControls every frame. One-shots are latched until consumed. */
  public setTouchState(state: TouchState, oneShots?: { pause?: boolean; respawn?: boolean }): void {
    this.touch = state;
    if (oneShots?.pause) this.touchPending.add('pause');
    if (oneShots?.respawn) this.touchPending.add('respawn');
  }

  public clearTouchState(): void {
    this.touch = { active: false, steering: 0, throttle: 0, brake: false, handbrake: false };
    this.touchPending.clear();
  }

  /** Drop any latched one-shots (e.g. after a menu handled Escape itself). */
  public clearPending(): void {
    this.pending.clear();
    this.touchPending.clear();
  }

  private pressed(codes: readonly string[]): boolean {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  public update(): InputState {
    const out: InputState = {
      throttle: 0, steering: 0, brake: false, handbrake: false,
      pause: false, cameraToggle: false, respawn: false, mute: false,
    };
    for (const name of ONE_SHOTS) {
      if (this.pending.has(name) || this.touchPending.has(name)) out[name] = true;
    }
    this.pending.clear();
    this.touchPending.clear();
    if (!this.enabled) return out;

    if (this.touch.active) {
      this.source = 'touch';
      out.throttle = this.touch.throttle;
      out.steering = this.touch.steering;
      out.brake = this.touch.brake;
      out.handbrake = this.touch.handbrake;
      return out;
    }

    const gp = this.readGamepad(out);
    if (gp) return out;

    const forward = this.pressed(BINDINGS.forward);
    const backward = this.pressed(BINDINGS.backward);
    const left = this.pressed(BINDINGS.left);
    const right = this.pressed(BINDINGS.right);
    out.throttle = forward && !backward ? 1 : backward && !forward ? -1 : 0;
    out.steering = left && !right ? -1 : right && !left ? 1 : 0;
    out.brake = this.pressed(BINDINGS.brake);
    out.handbrake = this.pressed(BINDINGS.handbrake);
    this.source = 'keyboard';
    return out;
  }

  private readGamepad(out: InputState): boolean {
    if (this.gamepadIndex === null || typeof navigator === 'undefined' || !navigator.getGamepads) return false;
    const gp = navigator.getGamepads()[this.gamepadIndex];
    if (!gp) return false;
    const dead = 0.15;
    const axis = gp.axes[0] ?? 0;
    const steer = Math.abs(axis) < dead ? 0 : Math.sign(axis) * (Math.abs(axis) - dead) / (1 - dead);
    const rt = gp.buttons[7]?.value ?? 0;
    const lt = gp.buttons[6]?.value ?? 0;
    const a = gp.buttons[0]?.pressed ?? false;
    const b = gp.buttons[1]?.pressed ?? false;
    const x = gp.buttons[2]?.pressed ?? false;
    const y = gp.buttons[3]?.pressed ?? false;
    const start = gp.buttons[9]?.pressed ?? false;
    const buttons = gp.buttons.map((bt) => bt.pressed);
    const rising = (i: number) => buttons[i] && !this.prevButtons[i];
    const anyActive = steer !== 0 || rt > 0.05 || lt > 0.05 || buttons.some(Boolean);
    const now = performance.now();
    if (anyActive) this.gamepadActiveUntil = now + 2000;
    if (rising(9) || (start && !this.prevButtons[9])) out.pause = true;
    if (rising(3)) out.cameraToggle = true;
    if (rising(1)) out.respawn = true;
    if (rising(2)) out.mute = true;
    this.prevButtons = buttons;
    if (now > this.gamepadActiveUntil) return false;
    this.source = 'gamepad';
    out.steering = steer;
    out.throttle = rt > 0.05 ? rt : (a ? 1 : 0);
    out.brake = lt > 0.3 || x;
    if (lt > 0.05 && rt < 0.05) out.throttle = -lt;
    out.handbrake = (gp.buttons[5]?.pressed ?? false) || (gp.buttons[4]?.pressed ?? false) || (b && !y);
    return true;
  }

  public getInputSource(): InputSource {
    return this.source;
  }

  public isTouchActive(): boolean {
    return this.touch.active;
  }

  public dispose(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.releaseAll);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('gamepadconnected', this.onGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this.onGamepadDisconnected);
    this.keys.clear();
    this.pending.clear();
  }
}
