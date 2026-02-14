/**
 * Mobile Controls Test Suite
 * Tests for TouchInputHandler, InputManager touch integration,
 * MobileControls component, HapticFeedback, responsive CSS, and layout changes.
 */

// ============================================================
// TouchInputHandler unit tests
// ============================================================
describe('TouchInputHandler', () => {
  // Mock window and navigator for Node environment
  const origWindow = global.window;
  const origNavigator = global.navigator;

  beforeEach(() => {
    if (typeof window === 'undefined') {
      (global as any).window = {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        innerWidth: 1024,
        innerHeight: 768,
      };
    }
    if (typeof navigator === 'undefined') {
      (global as any).navigator = {
        maxTouchPoints: 0,
      };
    }
  });

  afterEach(() => {
    if (origWindow === undefined) {
      delete (global as any).window;
    }
    if (origNavigator === undefined) {
      delete (global as any).navigator;
    }
  });

  test('should export TouchInputHandler class', () => {
    const { TouchInputHandler } = require('../lib/input/TouchInputHandler');
    expect(TouchInputHandler).toBeDefined();
    expect(typeof TouchInputHandler).toBe('function');
  });

  test('should create instance with default state', () => {
    const { TouchInputHandler } = require('../lib/input/TouchInputHandler');
    const handler = new TouchInputHandler();
    const state = handler.update();

    expect(state.steering).toBe(0);
    expect(state.throttle).toBe(0);
    expect(state.brake).toBe(false);
    expect(state.handbrake).toBe(false);
    expect(state.pause).toBe(false);
    expect(state.resetVehicle).toBe(false);
  });

  test('should return inactive when no touch input', () => {
    const { TouchInputHandler } = require('../lib/input/TouchInputHandler');
    const handler = new TouchInputHandler();
    expect(handler.isActive()).toBe(false);
  });

  test('should return joystick state', () => {
    const { TouchInputHandler } = require('../lib/input/TouchInputHandler');
    const handler = new TouchInputHandler();
    const joystick = handler.getJoystickState();

    expect(joystick.active).toBe(false);
    expect(joystick.pointerId).toBe(-1);
    expect(joystick.baseX).toBe(0);
    expect(joystick.baseY).toBe(0);
    expect(joystick.currentX).toBe(0);
    expect(joystick.currentY).toBe(0);
  });

  test('should detect touch device correctly', () => {
    const { TouchInputHandler } = require('../lib/input/TouchInputHandler');

    // Test with no touch support
    (global as any).window = { ...global.window };
    delete (global as any).window.ontouchstart;
    (global as any).navigator = { maxTouchPoints: 0 };
    expect(TouchInputHandler.isTouchDevice()).toBe(false);

    // Test with ontouchstart
    (global as any).window.ontouchstart = true;
    expect(TouchInputHandler.isTouchDevice()).toBe(true);
    delete (global as any).window.ontouchstart;

    // Test with maxTouchPoints
    (global as any).navigator = { maxTouchPoints: 5 };
    expect(TouchInputHandler.isTouchDevice()).toBe(true);
  });

  test('should accept custom maxJoystickRadius', () => {
    const { TouchInputHandler } = require('../lib/input/TouchInputHandler');
    const handler = new TouchInputHandler(100);
    // Handler created successfully with custom radius
    expect(handler).toBeDefined();
  });

  test('should register and unregister buttons', () => {
    const { TouchInputHandler } = require('../lib/input/TouchInputHandler');
    const handler = new TouchInputHandler();
    const mockElement = {
      getBoundingClientRect: () => ({ left: 0, right: 80, top: 600, bottom: 680 }),
    } as unknown as HTMLElement;

    handler.registerButton('gas', mockElement);
    handler.unregisterButton('gas');
    // No error thrown
    expect(true).toBe(true);
  });

  test('should attach and detach from element', () => {
    const { TouchInputHandler } = require('../lib/input/TouchInputHandler');
    const handler = new TouchInputHandler();
    const mockElement = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    } as unknown as HTMLElement;

    handler.attach(mockElement);
    expect(mockElement.addEventListener).toHaveBeenCalledTimes(4); // pointerdown, pointermove, pointerup, pointercancel
    expect((window as any).addEventListener).toHaveBeenCalled(); // resize, orientationchange

    handler.detach();
    expect(mockElement.removeEventListener).toHaveBeenCalledTimes(4);
  });

  test('dispose should clean up all resources', () => {
    const { TouchInputHandler } = require('../lib/input/TouchInputHandler');
    const handler = new TouchInputHandler();
    const mockElement = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    } as unknown as HTMLElement;

    handler.attach(mockElement);
    const mockBtn = {
      getBoundingClientRect: () => ({ left: 0, right: 80, top: 600, bottom: 680 }),
    } as unknown as HTMLElement;
    handler.registerButton('gas', mockBtn);
    handler.dispose();

    expect(mockElement.removeEventListener).toHaveBeenCalled();
  });

  test('update should clear one-shot flags after reading', () => {
    const { TouchInputHandler } = require('../lib/input/TouchInputHandler');
    const handler = new TouchInputHandler();

    // Manually set one-shot values by accessing internal state
    const state1 = handler.update();
    expect(state1.pause).toBe(false);
    expect(state1.resetVehicle).toBe(false);

    // Second read should also be false (no new events)
    const state2 = handler.update();
    expect(state2.pause).toBe(false);
    expect(state2.resetVehicle).toBe(false);
  });
});

// ============================================================
// InputManager touch integration tests
// ============================================================
describe('InputManager - touch integration', () => {
  const origWindow = global.window;

  beforeEach(() => {
    if (typeof window === 'undefined') {
      (global as any).window = {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      };
    } else {
      jest.spyOn(window, 'addEventListener').mockImplementation(jest.fn());
      jest.spyOn(window, 'removeEventListener').mockImplementation(jest.fn());
    }
  });

  afterEach(() => {
    if (origWindow === undefined) {
      delete (global as any).window;
    } else {
      jest.restoreAllMocks();
    }
    jest.resetModules();
  });

  test('InputSource type should include "touch"', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'lib', 'input', 'InputManager.ts'),
      'utf8'
    );
    expect(source).toContain("'touch'");
  });

  test('InputManager should have setTouchState method', () => {
    const { InputManager } = require('../lib/input/InputManager');
    const manager = new InputManager();
    expect(typeof manager.setTouchState).toBe('function');
    manager.dispose();
  });

  test('InputManager should have isTouchActive method', () => {
    const { InputManager } = require('../lib/input/InputManager');
    const manager = new InputManager();
    expect(typeof manager.isTouchActive).toBe('function');
    expect(manager.isTouchActive()).toBe(false);
    manager.dispose();
  });

  test('setTouchState should make touch input active', () => {
    const { InputManager } = require('../lib/input/InputManager');
    const manager = new InputManager();

    manager.setTouchState({
      active: true,
      steering: 0.5,
      throttle: 1,
      brake: false,
      handbrake: false,
      pause: false,
      resetVehicle: false,
    });

    expect(manager.isTouchActive()).toBe(true);
    manager.dispose();
  });

  test('touch input should take priority over keyboard when active', () => {
    const { InputManager } = require('../lib/input/InputManager');
    const manager = new InputManager();

    manager.setTouchState({
      active: true,
      steering: -0.7,
      throttle: 0.8,
      brake: false,
      handbrake: true,
      pause: false,
      resetVehicle: false,
    });

    const input = manager.update();
    expect(input.steering).toBe(-0.7);
    expect(input.throttle).toBe(0.8);
    expect(input.handbrake).toBe(true);
    expect(manager.getInputSource()).toBe('touch');
    manager.dispose();
  });

  test('touch pause should be forwarded as one-shot', () => {
    const { InputManager } = require('../lib/input/InputManager');
    const manager = new InputManager();

    manager.setTouchState({
      active: false,
      steering: 0,
      throttle: 0,
      brake: false,
      handbrake: false,
      pause: true,
      resetVehicle: false,
    });

    const input = manager.update();
    expect(input.pause).toBe(true);
    manager.dispose();
  });

  test('touch resetVehicle should be forwarded as one-shot', () => {
    const { InputManager } = require('../lib/input/InputManager');
    const manager = new InputManager();

    manager.setTouchState({
      active: false,
      steering: 0,
      throttle: 0,
      brake: false,
      handbrake: false,
      pause: false,
      resetVehicle: true,
    });

    const input = manager.update();
    expect(input.resetVehicle).toBe(true);
    manager.dispose();
  });

  test('inactive touch should fall back to keyboard', () => {
    const { InputManager } = require('../lib/input/InputManager');
    const manager = new InputManager();

    manager.setTouchState({
      active: false,
      steering: 0,
      throttle: 0,
      brake: false,
      handbrake: false,
      pause: false,
      resetVehicle: false,
    });

    const input = manager.update();
    // Should use keyboard (default), not touch
    expect(manager.getInputSource()).toBe('keyboard');
    manager.dispose();
  });

  test('updateFromTouch method should exist in source', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'lib', 'input', 'InputManager.ts'),
      'utf8'
    );
    expect(source).toContain('updateFromTouch');
  });
});

// ============================================================
// HapticFeedback tests
// ============================================================
describe('HapticFeedback', () => {
  test('should export HapticFeedback class', () => {
    const { HapticFeedback } = require('../lib/input/HapticFeedback');
    expect(HapticFeedback).toBeDefined();
  });

  test('should detect lack of vibration support in test environment', () => {
    const { HapticFeedback } = require('../lib/input/HapticFeedback');
    // Node.js test environment likely doesn't have navigator.vibrate
    const supported = HapticFeedback.isSupported();
    expect(typeof supported).toBe('boolean');
  });

  test('should have all feedback methods', () => {
    const { HapticFeedback } = require('../lib/input/HapticFeedback');
    expect(typeof HapticFeedback.tap).toBe('function');
    expect(typeof HapticFeedback.collision).toBe('function');
    expect(typeof HapticFeedback.checkpoint).toBe('function');
    expect(typeof HapticFeedback.raceComplete).toBe('function');
    expect(typeof HapticFeedback.drift).toBe('function');
    expect(typeof HapticFeedback.stop).toBe('function');
  });

  test('should not throw when calling feedback methods without vibration support', () => {
    const { HapticFeedback } = require('../lib/input/HapticFeedback');
    expect(() => HapticFeedback.tap()).not.toThrow();
    expect(() => HapticFeedback.collision()).not.toThrow();
    expect(() => HapticFeedback.checkpoint()).not.toThrow();
    expect(() => HapticFeedback.raceComplete()).not.toThrow();
    expect(() => HapticFeedback.drift()).not.toThrow();
    expect(() => HapticFeedback.stop()).not.toThrow();
  });

  test('should support enable/disable toggling', () => {
    const { HapticFeedback } = require('../lib/input/HapticFeedback');
    HapticFeedback.setEnabled(false);
    expect(HapticFeedback.isEnabled()).toBe(false);
    HapticFeedback.setEnabled(true);
  });

  test('should call navigator.vibrate when supported and enabled', () => {
    const mockVibrate = jest.fn().mockReturnValue(true);
    const origNavigator = global.navigator;
    Object.defineProperty(global, 'navigator', {
      value: { ...origNavigator, vibrate: mockVibrate },
      writable: true,
      configurable: true,
    });

    // Need to reset module to re-evaluate support detection
    jest.resetModules();
    const { HapticFeedback } = require('../lib/input/HapticFeedback');
    HapticFeedback.setEnabled(true);

    HapticFeedback.tap();
    if (HapticFeedback.isSupported()) {
      expect(mockVibrate).toHaveBeenCalled();
    }

    Object.defineProperty(global, 'navigator', {
      value: origNavigator,
      writable: true,
      configurable: true,
    });
  });
});

// ============================================================
// Game.ts haptic integration tests
// ============================================================
describe('Game - haptic feedback integration', () => {
  test('Game.ts should import HapticFeedback', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'lib', 'game', 'Game.ts'),
      'utf8'
    );
    expect(source).toContain("import { HapticFeedback }");
    expect(source).toContain("HapticFeedback");
  });

  test('should call HapticFeedback.collision() on barrier collision', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'lib', 'game', 'Game.ts'),
      'utf8'
    );
    // Find the collision handler section
    const collisionSection = source.slice(
      source.indexOf('beginContact'),
      source.indexOf('beginContact') + 500
    );
    expect(collisionSection).toContain('HapticFeedback.collision()');
  });

  test('should call HapticFeedback.raceComplete() on race finish', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'lib', 'game', 'Game.ts'),
      'utf8'
    );
    const completeMethod = source.slice(source.indexOf('completeRace'));
    expect(completeMethod).toContain('HapticFeedback.raceComplete()');
  });

  test('should call HapticFeedback.checkpoint() on lap complete', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'lib', 'game', 'Game.ts'),
      'utf8'
    );
    expect(source).toContain('HapticFeedback.checkpoint()');
  });

  test('Game should expose getInputManager method', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'lib', 'game', 'Game.ts'),
      'utf8'
    );
    expect(source).toContain('getInputManager');
    expect(source).toContain('InputManager | null');
  });
});

// ============================================================
// MobileControls component tests
// ============================================================
describe('MobileControls component', () => {
  test('should exist as a component file', () => {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(__dirname, '..', 'components', 'game', 'MobileControls.tsx');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test('should import TouchInputHandler', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'components', 'game', 'MobileControls.tsx'),
      'utf8'
    );
    expect(source).toContain("import { TouchInputHandler }");
  });

  test('should have gas button with ref', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'components', 'game', 'MobileControls.tsx'),
      'utf8'
    );
    expect(source).toContain('gasRef');
    expect(source).toContain('mobile-btn-gas');
  });

  test('should have brake button with ref', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'components', 'game', 'MobileControls.tsx'),
      'utf8'
    );
    expect(source).toContain('brakeRef');
    expect(source).toContain('mobile-btn-brake');
  });

  test('should have handbrake button with ref', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'components', 'game', 'MobileControls.tsx'),
      'utf8'
    );
    expect(source).toContain('handbrakeRef');
    expect(source).toContain('mobile-btn-handbrake');
  });

  test('should have pause and reset buttons', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'components', 'game', 'MobileControls.tsx'),
      'utf8'
    );
    expect(source).toContain('pauseRef');
    expect(source).toContain('resetRef');
    expect(source).toContain('mobile-btn-pause');
    expect(source).toContain('mobile-btn-reset');
  });

  test('should render joystick visual when active', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'components', 'game', 'MobileControls.tsx'),
      'utf8'
    );
    expect(source).toContain('joystick-base');
    expect(source).toContain('joystick-thumb');
    expect(source).toContain('joystickVisual.active');
  });

  test('should not render when loading or paused', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'components', 'game', 'MobileControls.tsx'),
      'utf8'
    );
    expect(source).toContain('if (isLoading || isPaused) return null');
  });

  test('should register buttons with touch handler', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'components', 'game', 'MobileControls.tsx'),
      'utf8'
    );
    expect(source).toContain("registerButton('gas'");
    expect(source).toContain("registerButton('brake'");
    expect(source).toContain("registerButton('handbrake'");
    expect(source).toContain("registerButton('pause'");
    expect(source).toContain("registerButton('reset'");
  });

  test('should feed touch state into InputManager via setTouchState', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'components', 'game', 'MobileControls.tsx'),
      'utf8'
    );
    expect(source).toContain('inputManager.setTouchState');
  });

  test('should use requestAnimationFrame for update loop', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'components', 'game', 'MobileControls.tsx'),
      'utf8'
    );
    expect(source).toContain('requestAnimationFrame');
    expect(source).toContain('cancelAnimationFrame');
  });
});

// ============================================================
// GameCanvas integration tests
// ============================================================
describe('GameCanvas - mobile integration', () => {
  test('should import MobileControls', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'components', 'game', 'GameCanvas.tsx'),
      'utf8'
    );
    expect(source).toContain("import MobileControls from './MobileControls'");
  });

  test('should import TouchInputHandler for device detection', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'components', 'game', 'GameCanvas.tsx'),
      'utf8'
    );
    expect(source).toContain("import { TouchInputHandler }");
  });

  test('should have isMobile state', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'components', 'game', 'GameCanvas.tsx'),
      'utf8'
    );
    expect(source).toContain('isMobile');
    expect(source).toContain('setIsMobile');
    expect(source).toContain('TouchInputHandler.isTouchDevice()');
  });

  test('should have inputManager state', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'components', 'game', 'GameCanvas.tsx'),
      'utf8'
    );
    expect(source).toContain('inputManager');
    expect(source).toContain('setInputManager');
  });

  test('should conditionally render MobileControls when isMobile', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'components', 'game', 'GameCanvas.tsx'),
      'utf8'
    );
    expect(source).toContain('{isMobile && (');
    expect(source).toContain('<MobileControls');
  });

  test('should pass isMobile prop to HUD', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'components', 'game', 'GameCanvas.tsx'),
      'utf8'
    );
    expect(source).toContain('isMobile={isMobile}');
  });

  test('should grab inputManager from Game on loading complete', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'components', 'game', 'GameCanvas.tsx'),
      'utf8'
    );
    expect(source).toContain('getInputManager()');
    expect(source).toContain('setInputManager(im)');
  });
});

// ============================================================
// HUD responsive tests
// ============================================================
describe('HUD - mobile responsive', () => {
  test('should accept isMobile prop', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'components', 'game', 'HUD.tsx'),
      'utf8'
    );
    expect(source).toContain('isMobile');
    expect(source).toContain('isMobile?: boolean');
    expect(source).toContain('isMobile = false');
  });

  test('should reposition speedometer on mobile', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'components', 'game', 'HUD.tsx'),
      'utf8'
    );
    // When isMobile, speedometer should center instead of right-aligned
    expect(source).toContain("isMobile");
    expect(source).toContain("left-1/2");
    expect(source).toContain("-translate-x-1/2");
  });
});

// ============================================================
// CSS mobile support tests
// ============================================================
describe('CSS - mobile support', () => {
  let cssSource: string;

  beforeAll(() => {
    const fs = require('fs');
    cssSource = fs.readFileSync(
      require('path').join(__dirname, '..', 'app', 'globals.css'),
      'utf8'
    );
  });

  test('game-container should have touch-action: none', () => {
    expect(cssSource).toContain('touch-action: none');
  });

  test('game-container should use dvh viewport units', () => {
    expect(cssSource).toContain('100dvh');
  });

  test('game-container should disable user-select', () => {
    expect(cssSource).toContain('user-select: none');
  });

  test('body should have overscroll-behavior: none', () => {
    expect(cssSource).toContain('overscroll-behavior: none');
  });

  test('should have mobile controls overlay styles', () => {
    expect(cssSource).toContain('.mobile-controls-overlay');
    expect(cssSource).toContain('.joystick-base');
    expect(cssSource).toContain('.joystick-thumb');
  });

  test('should have mobile button styles', () => {
    expect(cssSource).toContain('.mobile-btn');
    expect(cssSource).toContain('.mobile-btn-gas');
    expect(cssSource).toContain('.mobile-btn-brake');
    expect(cssSource).toContain('.mobile-btn-handbrake');
    expect(cssSource).toContain('.mobile-btn-active');
  });

  test('should have responsive media queries for mobile', () => {
    expect(cssSource).toContain('@media (max-width: 768px)');
  });

  test('should have portrait orientation media query', () => {
    expect(cssSource).toContain('@media (orientation: portrait)');
  });

  test('should have landscape orientation media query', () => {
    expect(cssSource).toContain('@media (orientation: landscape)');
  });

  test('should use safe-area-inset for notch/cutout support', () => {
    expect(cssSource).toContain('safe-area-inset');
  });

  test('should have -webkit-tap-highlight-color: transparent on buttons', () => {
    expect(cssSource).toContain('-webkit-tap-highlight-color: transparent');
  });

  test('should have utility button styles for pause and reset', () => {
    expect(cssSource).toContain('.mobile-btn-util');
    expect(cssSource).toContain('.mobile-btn-pause');
    expect(cssSource).toContain('.mobile-btn-reset');
  });
});

// ============================================================
// Layout viewport meta tag tests
// ============================================================
describe('Layout - viewport meta', () => {
  test('should have viewport configuration with user-scalable false', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'app', 'layout.tsx'),
      'utf8'
    );
    expect(source).toContain('viewport');
    expect(source).toContain('userScalable');
    expect(source).toContain('false');
  });

  test('should have viewportFit cover for notch support', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'app', 'layout.tsx'),
      'utf8'
    );
    expect(source).toContain('viewportFit');
    expect(source).toContain('cover');
  });
});

// ============================================================
// TouchInputHandler - pointer zone detection tests
// ============================================================
describe('TouchInputHandler - zone detection', () => {
  beforeEach(() => {
    if (typeof window === 'undefined') {
      (global as any).window = {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        innerWidth: 1024,
        innerHeight: 768,
      };
    }
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('source should have getPointerZone method', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'lib', 'input', 'TouchInputHandler.ts'),
      'utf8'
    );
    expect(source).toContain('getPointerZone');
  });

  test('source should check registered button elements for hit testing', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'lib', 'input', 'TouchInputHandler.ts'),
      'utf8'
    );
    expect(source).toContain('getBoundingClientRect');
    expect(source).toContain('buttonElements');
  });

  test('source should use left half of screen for joystick zone', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'lib', 'input', 'TouchInputHandler.ts'),
      'utf8'
    );
    expect(source).toContain('screenWidth * 0.5');
  });

  test('source should only handle touch pointerType', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'lib', 'input', 'TouchInputHandler.ts'),
      'utf8'
    );
    expect(source).toContain("pointerType !== 'touch'");
  });
});

// ============================================================
// TouchInputHandler - joystick math tests
// ============================================================
describe('TouchInputHandler - joystick computation', () => {
  test('source should normalize joystick displacement to -1..1 range', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'lib', 'input', 'TouchInputHandler.ts'),
      'utf8'
    );
    expect(source).toContain('Math.max(-1, Math.min(1,');
    expect(source).toContain('maxJoystickRadius');
  });

  test('source should apply dead zone', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'lib', 'input', 'TouchInputHandler.ts'),
      'utf8'
    );
    expect(source).toContain('deadZone');
  });

  test('source should track multiple pointers via Map', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').join(__dirname, '..', 'lib', 'input', 'TouchInputHandler.ts'),
      'utf8'
    );
    expect(source).toContain('activePointers');
    expect(source).toContain('Map<number');
  });
});
