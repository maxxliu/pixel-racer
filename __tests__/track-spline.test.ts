import { TrackSpline, DEFAULT_WAYPOINTS, validateWaypoints, WALL_OFFSET } from '@/lib/game/TrackSpline';
import type { TrackWaypoint } from '@/lib/game/types';

function circle(radius: number, n = 24, clockwise = false, phase = 0): TrackWaypoint[] {
  const out: TrackWaypoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2 * (clockwise ? -1 : 1);
    out.push({ x: Math.cos(a) * radius, z: Math.sin(a) * radius, width: 12, speedLimit: 100, isCheckpoint: i === 0 });
  }
  return out;
}

describe('TrackSpline', () => {
  const spline = new TrackSpline(DEFAULT_WAYPOINTS);

  test('rejects degenerate tracks instead of hanging', () => {
    expect(validateWaypoints([])).toMatch(/waypoints/);
    const dup = Array.from({ length: 8 }, () => ({ x: 0, z: 0, width: 12, speedLimit: 100 }));
    expect(validateWaypoints(dup)).toMatch(/overlap/);
    const tiny = circle(3, 8);
    expect(validateWaypoints(tiny)).toMatch(/short/);
    expect(() => new TrackSpline(tiny)).toThrow();
  });

  test('samples are evenly spaced and cover the loop', () => {
    expect(spline.samples.length).toBeGreaterThan(100);
    expect(spline.spacing).toBeCloseTo(spline.length / spline.samples.length, 6);
    const last = spline.samples[spline.samples.length - 1];
    expect(last.s).toBeLessThan(spline.length);
  });

  test('start is at the checkpoint waypoint and heads along the track', () => {
    expect(Math.hypot(spline.start.x, spline.start.z)).toBeLessThan(3);
    expect(Math.abs(spline.start.rotation)).toBeLessThan(0.2);
  });

  test('nearest() returns the right sample and signed lateral offset', () => {
    const s = spline.samples[40];
    const onLine = spline.nearest(s.x, s.z);
    expect(Math.abs(onLine.index - 40)).toBeLessThanOrEqual(1);
    expect(onLine.distance).toBeLessThan(0.1);
    const right = spline.nearest(s.x + s.nx * 3, s.z + s.nz * 3, 40);
    expect(right.lateral).toBeCloseTo(3, 1);
    const left = spline.nearest(s.x - s.nx * 3, s.z - s.nz * 3);
    expect(left.lateral).toBeCloseTo(-3, 1);
  });

  test('nearest() with a stale hint still finds the true nearest sample', () => {
    const s = spline.samples[150];
    const r = spline.nearest(s.x, s.z, 5);
    expect(Math.abs(r.index - 150)).toBeLessThanOrEqual(1);
  });

  test('surface classification: asphalt inside the width, grass well outside', () => {
    const i = 10;
    const hw = spline.halfWidthAt(i);
    expect(spline.surfaceAt(i, hw - 0.1)).toBe('asphalt');
    expect(spline.surfaceAt(i, hw + 5)).toBe('grass');
  });

  test('kerbs appear on corners only', () => {
    const straight = spline.samples.slice(2, 10).map((_, k) => spline.hasKerb(k + 2));
    expect(straight.every((v) => !v)).toBe(true);
    const anyKerb = spline.samples.some((_, k) => spline.hasKerb(k));
    expect(anyKerb).toBe(true);
  });

  test('grid slots sit behind the start line, laterally offset, facing forward', () => {
    const slot0 = spline.gridSlot(0);
    const slot1 = spline.gridSlot(1);
    const n0 = spline.nearest(slot0.x, slot0.z);
    expect(n0.s).toBeGreaterThan(spline.length - 12);
    expect(Math.sign(n0.lateral)).toBe(-1);
    expect(Math.sign(spline.nearest(slot1.x, slot1.z).lateral)).toBe(1);
    expect(Math.abs(slot0.rotation - spline.headingAt(n0.s))).toBeLessThan(0.05);
  });

  test('grid slots are rotated correctly on a track whose start heading is not zero', () => {
    const c = circle(60, 32, false, 1.1);
    const sp = new TrackSpline(c);
    const heading = sp.start.rotation;
    expect(Math.abs(heading)).toBeGreaterThan(0.5);
    const slot = sp.gridSlot(2);
    const n = sp.nearest(slot.x, slot.z);
    expect(n.distance).toBeLessThan(3.5);
    expect(n.s).toBeGreaterThan(sp.length - 20);
  });

  test('walls stay outside the road on both sides', () => {
    for (const seg of spline.wallSegments) {
      const n = spline.nearest(seg.ax, seg.az);
      expect(n.distance).toBeGreaterThan(spline.halfWidthAt(n.index) + WALL_OFFSET - 0.6);
    }
  });

  test('minimap outer ring is the larger one regardless of winding', () => {
    for (const cw of [false, true]) {
      const sp = new TrackSpline(circle(60, 32, cw));
      const mm = sp.getMinimapData();
      const area = (path: string) => {
        const pts = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
        let a = 0;
        for (let i = 0; i < pts.length; i += 2) {
          const j = (i + 2) % pts.length;
          a += pts[i] * pts[j + 1] - pts[j] * pts[i + 1];
        }
        return Math.abs(a / 2);
      };
      expect(area(mm.outerPath)).toBeGreaterThan(area(mm.innerPath));
    }
  });

  test('gates are spread around the lap starting at the line', () => {
    expect(spline.gates[0].s).toBe(0);
    for (let i = 1; i < spline.gates.length; i++) expect(spline.gates[i].s).toBeGreaterThan(spline.gates[i - 1].s);
  });
});
