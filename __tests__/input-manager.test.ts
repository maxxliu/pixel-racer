/**
 * @jest-environment jsdom
 */
import { InputManager } from '@/lib/input/InputManager';

function key(type: 'keydown' | 'keyup', code: string, repeat = false) {
  window.dispatchEvent(new KeyboardEvent(type, { code, repeat, bubbles: true }));
}

describe('InputManager', () => {
  test('keyboard drives throttle/steering and releases on blur', () => {
    const im = new InputManager();
    key('keydown', 'KeyW');
    key('keydown', 'KeyD');
    let s = im.update();
    expect(s.throttle).toBe(1);
    expect(s.steering).toBe(1);
    window.dispatchEvent(new Event('blur'));
    s = im.update();
    expect(s.throttle).toBe(0);
    expect(s.steering).toBe(0);
    im.dispose();
  });

  test('pause is edge-triggered once per press, even if held across frames', () => {
    const im = new InputManager();
    key('keydown', 'Escape');
    expect(im.update().pause).toBe(true);
    expect(im.update().pause).toBe(false);
    key('keydown', 'Escape', true);
    expect(im.update().pause).toBe(false);
    key('keyup', 'Escape');
    key('keydown', 'Escape');
    expect(im.update().pause).toBe(true);
    im.dispose();
  });

  test('touch state wins while active and clears cleanly', () => {
    const im = new InputManager();
    key('keydown', 'KeyW');
    im.setTouchState({ active: true, steering: -0.5, throttle: 0.7, brake: false, handbrake: true }, { respawn: true });
    let s = im.update();
    expect(s.throttle).toBeCloseTo(0.7);
    expect(s.steering).toBeCloseTo(-0.5);
    expect(s.handbrake).toBe(true);
    expect(s.respawn).toBe(true);
    expect(im.update().respawn).toBe(false);
    im.clearTouchState();
    s = im.update();
    expect(s.throttle).toBe(1);
    im.dispose();
  });

  test('disabled input ignores movement but keeps releasing keys', () => {
    const im = new InputManager();
    key('keydown', 'KeyW');
    im.setEnabled(false);
    expect(im.update().throttle).toBe(0);
    key('keyup', 'KeyW');
    im.setEnabled(true);
    expect(im.update().throttle).toBe(0);
    im.dispose();
  });
});
