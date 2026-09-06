import { formatTime, formatDelta, formatTrackLength, ordinal } from '@/lib/utils/format';
import { sanitizeSettings, DEFAULT_SETTINGS } from '@/lib/settings';
import { parseIntParam, sanitizeSearch, cleanString, validateTrackWaypoints, validateLapTimes, validateStartPosition } from '@/lib/api/validate';
import { generateThumbnailSvg } from '@/lib/track/thumbnail';
import { DEFAULT_WAYPOINTS } from '@/lib/game/TrackSpline';
import { GameLoop } from '@/lib/game/GameLoop';

describe('format', () => {
  test('formatTime', () => {
    expect(formatTime(0)).toBe('0:00.000');
    expect(formatTime(0, { blank: true })).toBe('--:--.---');
    expect(formatTime(83456)).toBe('1:23.456');
    expect(formatTime(83456.7, { precision: 2 })).toBe('1:23.45');
    expect(formatTime(NaN)).toBe('--:--.---');
  });
  test('formatDelta / length / ordinal', () => {
    expect(formatDelta(1234)).toBe('+1.234');
    expect(formatDelta(-50)).toBe('-0.050');
    expect(formatTrackLength(950)).toBe('950 m');
    expect(formatTrackLength(1500)).toBe('1.50 km');
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(22)).toBe('22nd');
  });
});

describe('settings', () => {
  test('bad blobs fall back to defaults field by field', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('junk')).toEqual(DEFAULT_SETTINGS);
    const s = sanitizeSettings({ laps: 99, aiCount: -3, difficulty: 'nightmare', audio: { master: 7 } });
    expect(s.laps).toBe(10);
    expect(s.aiCount).toBe(0);
    expect(s.difficulty).toBe('normal');
    expect(s.audio.master).toBe(1);
    expect(s.audio.engine).toBe(DEFAULT_SETTINGS.audio.engine);
  });
});

describe('api validation', () => {
  test('parseIntParam clamps and rejects NaN', () => {
    expect(parseIntParam('abc', 20, 1, 50)).toBe(20);
    expect(parseIntParam('999999', 20, 1, 50)).toBe(50);
    expect(parseIntParam('-4', 0, 0, 100)).toBe(0);
    expect(parseIntParam('7.9', 0, 0, 100)).toBe(7);
  });
  test('sanitizeSearch strips PostgREST specials', () => {
    expect(sanitizeSearch('name,eq.x)')).toBe('name eq x');
    expect(sanitizeSearch('%%%')).toBeNull();
    expect(sanitizeSearch('a'.repeat(200))!.length).toBe(60);
  });
  test('cleanString rejects non-strings and control chars', () => {
    expect(cleanString(42, 10)).toBeNull();
    expect(cleanString('  hithere ', 10)).toBe('hithere');
    expect(cleanString('x'.repeat(30), 5)).toBe('xxxxx');
  });
  test('validateTrackWaypoints accepts the default track and rejects junk', () => {
    const ok = validateTrackWaypoints(DEFAULT_WAYPOINTS);
    expect('waypoints' in ok).toBe(true);
    expect('error' in validateTrackWaypoints('nope')).toBe(true);
    expect('error' in validateTrackWaypoints([{ x: 'a', z: 0, width: 10 }])).toBe(true);
    expect('error' in validateTrackWaypoints(Array(8).fill({ x: 0, z: 0, width: 10 }))).toBe(true);
    expect('error' in validateTrackWaypoints(Array(500).fill({ x: 0, z: 0, width: 10 }))).toBe(true);
  });
  test('validateStartPosition', () => {
    expect(validateStartPosition({ x: 1, z: 2, rotation: 0 })).toEqual({ x: 1, z: 2, rotation: 0 });
    expect(validateStartPosition({ x: 'a' })).toBeNull();
    expect(validateStartPosition({ x: 99999, z: 0, rotation: 0 })).toBeNull();
  });
  test('validateLapTimes must add up', () => {
    expect(validateLapTimes([30000, 30000], 60000)).toEqual([30000, 30000]);
    expect(validateLapTimes([30000, 30000], 90000)).toHaveProperty('error');
    expect(validateLapTimes([10], 60000)).toHaveProperty('error');
    expect(validateLapTimes(undefined, 60000)).toBeNull();
  });
});

describe('thumbnail', () => {
  test('is a well-formed SVG with no scripts or handlers', () => {
    const svg = generateThumbnailSvg(DEFAULT_WAYPOINTS);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).not.toMatch(/<script|on\w+=|javascript:/i);
    expect(svg.length).toBeLessThan(20000);
  });
  test('malicious waypoint values cannot escape into markup', () => {
    const svg = generateThumbnailSvg([
      { x: 0, z: 0, width: 10, speedLimit: 1 },
      { x: '"><script>' as unknown as number, z: 1, width: 10, speedLimit: 1 },
      { x: 5, z: 5, width: 10, speedLimit: 1 },
      { x: 10, z: 0, width: 10, speedLimit: 1 },
    ]);
    expect(svg).not.toContain('<script');
  });
});

describe('GameLoop', () => {
  test('clamps the accumulator so a stall never fast-forwards', () => {
    let now = 0;
    const frames: ((t: number) => void)[] = [];
    const g = globalThis as unknown as {
      requestAnimationFrame: (cb: (t: number) => void) => number;
      cancelAnimationFrame: (id: number) => void;
      performance: { now: () => number };
    };
    g.requestAnimationFrame = (cb) => { frames.push(cb); return frames.length; };
    g.cancelAnimationFrame = () => undefined;
    g.performance = { now: () => now };
    const loop = new GameLoop(1 / 60, 4);
    let updates = 0;
    loop.onUpdate(() => { updates++; });
    loop.start();
    const pump = (t: number) => { now = t; const cb = frames.shift(); cb?.(t); };
    pump(16);
    const first = updates;
    pump(16 + 2000);
    expect(updates - first).toBeLessThanOrEqual(4);
    loop.stop();
  });
});
