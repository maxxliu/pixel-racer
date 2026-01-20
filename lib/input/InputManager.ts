export interface InputState {
  throttle: number; // -1 to 1 (negative = reverse)
  steering: number; // -1 to 1 (negative = left, positive = right)
  brake: boolean;
  handbrake: boolean;
  // UI controls
  pause: boolean;
  cameraToggle: boolean;
  resetVehicle: boolean;
}

export type InputSource = 'keyboard' | 'gamepad';

export class InputManager {
  private keyState: Map<string, boolean> = new Map();
  private gamepadIndex: number | null = null;
  private currentInput: InputState;
  private inputSource: InputSource = 'keyboard';

  // Keyboard bindings
  private readonly keyBindings = {
    forward: ['KeyW', 'ArrowUp'],
    backward: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    brake: ['ShiftLeft', 'ShiftRight'],
    handbrake: ['Space'],
    pause: ['Escape'],
    cameraToggle: ['KeyC'],
    resetVehicle: ['KeyR'],
  };

  constructor() {
    this.currentInput = this.createDefaultInput();
    this.setupEventListeners();
  }

  private createDefaultInput(): InputState {
    return {
      throttle: 0,
      steering: 0,
      brake: false,
      handbrake: false,
      pause: false,
      cameraToggle: false,
      resetVehicle: false,
    };
  }

  private setupEventListeners(): void {
    // Keyboard events
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);

    // Gamepad events
    window.addEventListener('gamepadconnected', this.handleGamepadConnected);
    window.addEventListener('gamepaddisconnected', this.handleGamepadDisconnected);
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    // Don't capture input when user is typing in a form field
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    // Prevent default for game keys
    if (this.isGameKey(event.code)) {
      event.preventDefault();
    }
    this.keyState.set(event.code, true);
    this.inputSource = 'keyboard';
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    this.keyState.set(event.code, false);
  };

  private handleGamepadConnected = (event: GamepadEvent): void => {
    console.log('Gamepad connected:', event.gamepad.id);
    this.gamepadIndex = event.gamepad.index;
  };

  private handleGamepadDisconnected = (event: GamepadEvent): void => {
    console.log('Gamepad disconnected:', event.gamepad.id);
    if (this.gamepadIndex === event.gamepad.index) {
      this.gamepadIndex = null;
    }
  };

  private isGameKey(code: string): boolean {
    return Object.values(this.keyBindings).flat().includes(code);
  }

  private isKeyPressed(keys: string[]): boolean {
    return keys.some((key) => this.keyState.get(key));
  }

  public update(): InputState {
    // Reset one-shot inputs
    this.currentInput.pause = false;
    this.currentInput.cameraToggle = false;
    this.currentInput.resetVehicle = false;

    // Check for gamepad input first
    if (this.gamepadIndex !== null) {
      const gamepad = navigator.getGamepads()[this.gamepadIndex];
      if (gamepad) {
        this.updateFromGamepad(gamepad);
        return { ...this.currentInput };
      }
    }

    // Fall back to keyboard
    this.updateFromKeyboard();
    return { ...this.currentInput };
  }

  private updateFromKeyboard(): void {
    const forward = this.isKeyPressed(this.keyBindings.forward);
    const backward = this.isKeyPressed(this.keyBindings.backward);
    const left = this.isKeyPressed(this.keyBindings.left);
    const right = this.isKeyPressed(this.keyBindings.right);

    // Calculate throttle (-1 to 1)
    this.currentInput.throttle = 0;
    if (forward) this.currentInput.throttle = 1;
    if (backward) this.currentInput.throttle = -1;

    // Calculate steering (-1 to 1)
    this.currentInput.steering = 0;
    if (left) this.currentInput.steering = -1;
    if (right) this.currentInput.steering = 1;

    // Brake and handbrake
    this.currentInput.brake = this.isKeyPressed(this.keyBindings.brake);
    this.currentInput.handbrake = this.isKeyPressed(this.keyBindings.handbrake);

    // One-shot inputs (only trigger on key down, not hold)
    if (this.isKeyPressed(this.keyBindings.pause)) {
      this.currentInput.pause = true;
      this.keyState.set('Escape', false); // Reset to prevent repeated triggers
    }
    if (this.isKeyPressed(this.keyBindings.cameraToggle)) {
      this.currentInput.cameraToggle = true;
      this.keyState.set('KeyC', false);
    }
    if (this.isKeyPressed(this.keyBindings.resetVehicle)) {
      this.currentInput.resetVehicle = true;
      this.keyState.set('KeyR', false);
    }
  }

  private updateFromGamepad(gamepad: Gamepad): void {
    this.inputSource = 'gamepad';

    // Standard gamepad layout
    // Left stick for steering
    const stickDeadzone = 0.15;
    let steerX = gamepad.axes[0] || 0;
    if (Math.abs(steerX) < stickDeadzone) steerX = 0;
    this.currentInput.steering = steerX;

    // Triggers for throttle/brake
    // RT (index 7) for throttle, LT (index 6) for brake
    const rt = gamepad.buttons[7]?.value || 0;
    const lt = gamepad.buttons[6]?.value || 0;

    this.currentInput.throttle = rt - lt;
    this.currentInput.brake = lt > 0.5;

    // A button (index 0) for handbrake
    this.currentInput.handbrake = gamepad.buttons[0]?.pressed || false;

    // Start button (index 9) for pause
    if (gamepad.buttons[9]?.pressed) {
      this.currentInput.pause = true;
    }

    // Y button (index 3) for camera toggle
    if (gamepad.buttons[3]?.pressed) {
      this.currentInput.cameraToggle = true;
    }

    // B button (index 1) for reset
    if (gamepad.buttons[1]?.pressed) {
      this.currentInput.resetVehicle = true;
    }
  }

  public getInputSource(): InputSource {
    return this.inputSource;
  }

  public isGamepadConnected(): boolean {
    return this.gamepadIndex !== null;
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('gamepadconnected', this.handleGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this.handleGamepadDisconnected);
  }
}
