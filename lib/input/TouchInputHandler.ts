/**
 * TouchInputHandler - Handles touch/pointer input for mobile game controls.
 *
 * Uses Pointer Events for unified touch + mouse handling.
 * Manages a virtual joystick on the left side and action buttons on the right.
 * All state is updated in event handlers and read by InputManager each frame.
 */

export interface TouchInputState {
  steering: number;   // -1 to 1
  throttle: number;   // -1 to 1
  brake: boolean;
  handbrake: boolean;
  // One-shot actions (reset each frame after read)
  pause: boolean;
  resetVehicle: boolean;
}

export interface JoystickState {
  active: boolean;
  pointerId: number;
  baseX: number;
  baseY: number;
  currentX: number;
  currentY: number;
}

export interface TouchControlsLayout {
  joystickZone: DOMRect | null;
  buttonZone: DOMRect | null;
}

export class TouchInputHandler {
  private state: TouchInputState;
  private joystick: JoystickState;
  private activePointers: Map<number, { zone: 'joystick' | 'gas' | 'brake' | 'handbrake' | 'pause' | 'reset' | 'none' }> = new Map();

  // Button press tracking
  private gasPressed = false;
  private brakePressed = false;
  private handbrakePressed = false;

  // Configuration
  private readonly maxJoystickRadius: number;
  private readonly deadZone = 0.1;

  // DOM element
  private element: HTMLElement | null = null;

  // Bound handlers for cleanup
  private boundPointerDown: (e: PointerEvent) => void;
  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerUp: (e: PointerEvent) => void;
  private boundPointerCancel: (e: PointerEvent) => void;

  // Screen dimensions for zone calculation
  private screenWidth = 0;
  private screenHeight = 0;

  // External button element references (set by React component)
  private buttonElements: Map<string, HTMLElement> = new Map();

  constructor(maxJoystickRadius = 60) {
    this.maxJoystickRadius = maxJoystickRadius;
    this.state = this.createDefaultState();
    this.joystick = {
      active: false,
      pointerId: -1,
      baseX: 0,
      baseY: 0,
      currentX: 0,
      currentY: 0,
    };

    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.boundPointerMove = this.handlePointerMove.bind(this);
    this.boundPointerUp = this.handlePointerUp.bind(this);
    this.boundPointerCancel = this.handlePointerUp.bind(this);
  }

  private createDefaultState(): TouchInputState {
    return {
      steering: 0,
      throttle: 0,
      brake: false,
      handbrake: false,
      pause: false,
      resetVehicle: false,
    };
  }

  public attach(element: HTMLElement): void {
    this.element = element;
    this.updateScreenDimensions();

    element.addEventListener('pointerdown', this.boundPointerDown, { passive: false });
    element.addEventListener('pointermove', this.boundPointerMove, { passive: true });
    element.addEventListener('pointerup', this.boundPointerUp, { passive: true });
    element.addEventListener('pointercancel', this.boundPointerCancel, { passive: true });

    // Listen for screen dimension changes
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', this.handleOrientationChange);
  }

  public detach(): void {
    if (this.element) {
      this.element.removeEventListener('pointerdown', this.boundPointerDown);
      this.element.removeEventListener('pointermove', this.boundPointerMove);
      this.element.removeEventListener('pointerup', this.boundPointerUp);
      this.element.removeEventListener('pointercancel', this.boundPointerCancel);
      this.element = null;
    }

    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleOrientationChange);
  }

  /**
   * Register a button element so we can detect hits against it.
   */
  public registerButton(name: string, element: HTMLElement): void {
    this.buttonElements.set(name, element);
  }

  public unregisterButton(name: string): void {
    this.buttonElements.delete(name);
  }

  private handleResize = (): void => {
    this.updateScreenDimensions();
  };

  private handleOrientationChange = (): void => {
    // Delay measurement since screen hasn't finished rotating
    setTimeout(() => this.updateScreenDimensions(), 150);
  };

  private updateScreenDimensions(): void {
    this.screenWidth = window.innerWidth;
    this.screenHeight = window.innerHeight;
  }

  /**
   * Determine which zone a pointer event falls into based on
   * whether it hits a registered button element or the joystick zone.
   */
  private getPointerZone(e: PointerEvent): 'joystick' | 'gas' | 'brake' | 'handbrake' | 'pause' | 'reset' | 'none' {
    // Check registered button elements first (most specific)
    for (const [name, el] of this.buttonElements) {
      const rect = el.getBoundingClientRect();
      if (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      ) {
        return name as 'gas' | 'brake' | 'handbrake' | 'pause' | 'reset';
      }
    }

    // Left half of screen is joystick zone
    if (e.clientX < this.screenWidth * 0.5) {
      return 'joystick';
    }

    return 'none';
  }

  private handlePointerDown = (e: PointerEvent): void => {
    // Only handle touch input (not mouse - that uses keyboard controls)
    if (e.pointerType !== 'touch') return;

    const zone = this.getPointerZone(e);
    this.activePointers.set(e.pointerId, { zone });
    if (zone !== 'none') {
      try { this.element?.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    }

    switch (zone) {
      case 'joystick':
        if (!this.joystick.active) {
          // Prevent default to avoid scrolling
          e.preventDefault();
          this.joystick.active = true;
          this.joystick.pointerId = e.pointerId;
          this.joystick.baseX = e.clientX;
          this.joystick.baseY = e.clientY;
          this.joystick.currentX = e.clientX;
          this.joystick.currentY = e.clientY;
        }
        break;
      case 'gas':
        e.preventDefault();
        this.gasPressed = true;
        break;
      case 'brake':
        e.preventDefault();
        this.brakePressed = true;
        break;
      case 'handbrake':
        e.preventDefault();
        this.handbrakePressed = true;
        break;
      case 'pause':
        e.preventDefault();
        this.state.pause = true;
        break;
      case 'reset':
        e.preventDefault();
        this.state.resetVehicle = true;
        break;
    }
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') return;

    if (this.joystick.active && e.pointerId === this.joystick.pointerId) {
      this.joystick.currentX = e.clientX;
      this.joystick.currentY = e.clientY;
    }
  };

  private handlePointerUp = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') return;

    const pointer = this.activePointers.get(e.pointerId);
    if (!pointer) return;

    switch (pointer.zone) {
      case 'joystick':
        if (e.pointerId === this.joystick.pointerId) {
          this.joystick.active = false;
          this.joystick.pointerId = -1;
        }
        break;
      case 'gas':
        this.gasPressed = false;
        break;
      case 'brake':
        this.brakePressed = false;
        break;
      case 'handbrake':
        this.handbrakePressed = false;
        break;
    }

    this.activePointers.delete(e.pointerId);
    try { this.element?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
  };

  /** Release every pressed control (used when the overlay unmounts or the game pauses). */
  public reset(): void {
    this.activePointers.clear();
    this.joystick.active = false;
    this.joystick.pointerId = -1;
    this.gasPressed = false;
    this.brakePressed = false;
    this.handbrakePressed = false;
    this.state = this.createDefaultState();
  }

  /**
   * Called once per frame by InputManager to get the current touch input state.
   * Computes joystick displacement and combines with button states.
   */
  public update(): TouchInputState {
    // Reset one-shot inputs
    const pauseTriggered = this.state.pause;
    const resetTriggered = this.state.resetVehicle;

    // Compute joystick steering
    if (this.joystick.active) {
      const dx = this.joystick.currentX - this.joystick.baseX;
      const dy = this.joystick.currentY - this.joystick.baseY;

      // Normalize by max radius
      const normalizedX = Math.max(-1, Math.min(1, dx / this.maxJoystickRadius));
      const normalizedY = Math.max(-1, Math.min(1, dy / this.maxJoystickRadius));

      // Apply dead zone
      this.state.steering = Math.abs(normalizedX) > this.deadZone ? normalizedX : 0;

      // Optional: vertical axis for throttle via joystick (negative Y = forward)
      // Only use if no gas button is pressed
      if (!this.gasPressed && !this.brakePressed) {
        if (Math.abs(normalizedY) > this.deadZone) {
          this.state.throttle = -normalizedY; // Up = forward (positive throttle)
        } else {
          this.state.throttle = 0;
        }
      }
    } else {
      this.state.steering = 0;
      if (!this.gasPressed && !this.brakePressed) {
        this.state.throttle = 0;
      }
    }

    // Button-based throttle/brake overrides joystick vertical
    if (this.gasPressed) {
      this.state.throttle = 1;
    }
    if (this.brakePressed) {
      if (this.gasPressed) {
        // Both pressed: brake takes priority for deceleration
        this.state.brake = true;
        this.state.throttle = 0;
      } else {
        this.state.throttle = -1;
        this.state.brake = false;
      }
    } else {
      this.state.brake = false;
    }

    this.state.handbrake = this.handbrakePressed;
    this.state.pause = pauseTriggered;
    this.state.resetVehicle = resetTriggered;

    // Return a copy and reset one-shot flags
    const result = { ...this.state };

    // Clear one-shot flags after reading
    this.state.pause = false;
    this.state.resetVehicle = false;

    return result;
  }

  /**
   * Get the current joystick visual state for rendering the overlay.
   */
  public getJoystickState(): JoystickState {
    return { ...this.joystick };
  }

  /**
   * Returns whether touch input is currently active.
   */
  public isActive(): boolean {
    return this.joystick.active || this.gasPressed || this.brakePressed || this.handbrakePressed;
  }

  public dispose(): void {
    this.detach();
    this.reset();
    this.buttonElements.clear();
  }

  /**
   * Check if the current device supports touch input.
   */
  public static isTouchDevice(): boolean {
    if (typeof window === 'undefined') return false;
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0
    );
  }
}
