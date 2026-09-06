import { generateTrack, generateOvalTrack } from '@/lib/track/ProceduralTrackGenerator';
import { validateTrack } from '@/lib/track/TrackValidator';
import { TrackSpline, validateWaypoints } from '@/lib/game/TrackSpline';

const DIFFS = ['easy', 'medium', 'hard', 'expert'] as const;

describe('procedural track generator', () => {
  test('every difficulty produces a valid, buildable track on the first call', () => {
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= 10; seed++) {
        const t = generateTrack({ difficulty, worldSize: 200, seed });
        expect(t).not.toBeNull();
        const v = validateTrack(t!.map((w) => ({ x: w.x, z: w.z })), t!.map((w) => w.width));
        expect(v.isValid).toBe(true);
        expect(validateWaypoints(t!)).toBeNull();
        expect(() => new TrackSpline(t!)).not.toThrow();
      }
    }
  });

  test('is reproducible for a seed', () => {
    const a = generateTrack({ difficulty: 'hard', seed: 42 });
    const b = generateTrack({ difficulty: 'hard', seed: 42 });
    expect(a).toEqual(b);
  });

  test('harder settings produce more turns', () => {
    const turns = (d: (typeof DIFFS)[number]) => {
      let total = 0;
      for (let seed = 1; seed <= 8; seed++) {
        const t = generateTrack({ difficulty: d, seed })!;
        total += validateTrack(t.map((w) => ({ x: w.x, z: w.z })), t.map((w) => w.width)).stats.turnCount;
      }
      return total;
    };
    expect(turns('expert')).toBeGreaterThan(turns('easy'));
  });

  test('oval fallback validates', () => {
    const o = generateOvalTrack(200);
    const v = validateTrack(o.map((w) => ({ x: w.x, z: w.z })), o.map((w) => w.width));
    expect(v.isValid).toBe(true);
  });
});
