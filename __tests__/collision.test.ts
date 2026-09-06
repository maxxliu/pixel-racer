import { circleVsSegment, circleVsCircle, closestPointOnSegment, SegmentHash, type Segment } from '@/lib/game/Collision';

describe('Collision helpers', () => {
  const wall: Segment = { ax: 0, az: 0, bx: 10, bz: 0, nx: 0, nz: 1 };

  test('closest point clamps to segment ends', () => {
    expect(closestPointOnSegment(-5, 3, 0, 0, 10, 0)).toMatchObject({ x: 0, z: 0, t: 0 });
    expect(closestPointOnSegment(15, 3, 0, 0, 10, 0)).toMatchObject({ x: 10, z: 0, t: 1 });
    expect(closestPointOnSegment(4, 3, 0, 0, 10, 0)).toMatchObject({ x: 4, z: 0 });
  });

  test('circle overlapping a wall from the road side reports depth along the normal', () => {
    const hit = circleVsSegment(5, 0.5, 1, wall);
    expect(hit).not.toBeNull();
    expect(hit!.depth).toBeCloseTo(0.5);
    expect(hit!.nx).toBe(0);
    expect(hit!.nz).toBe(1);
  });

  test('circle clear of the wall is not a hit', () => {
    expect(circleVsSegment(5, 3, 1, wall)).toBeNull();
  });

  test('circle fully behind a one-sided wall is ignored', () => {
    expect(circleVsSegment(5, -0.9, 1, wall)).toBeNull();
  });

  test('circle vs circle', () => {
    expect(circleVsCircle(0, 0, 1, 3, 0, 1)).toBeNull();
    const hit = circleVsCircle(0, 0, 1, 1.5, 0, 1);
    expect(hit).not.toBeNull();
    expect(hit!.depth).toBeCloseTo(0.5);
    expect(hit!.nx).toBeCloseTo(1);
  });

  test('segment hash returns candidates near a point only', () => {
    const segs: Segment[] = [wall, { ax: 100, az: 100, bx: 110, bz: 100, nx: 0, nz: 1 }];
    const hash = new SegmentHash(segs, 12);
    expect(hash.query(5, 0, 2)).toContain(0);
    expect(hash.query(5, 0, 2)).not.toContain(1);
    expect(hash.query(105, 100, 2)).toContain(1);
  });
});

describe('swept wall collision', () => {
  test('a probe that jumps behind the wall in one step is pushed back to the road side', async () => {
    const { sweptCircleVsSegment } = await import('@/lib/game/Collision');
    const wall: Segment = { ax: 0, az: 0, bx: 10, bz: 0, nx: 0, nz: 1 };
    // moving from z=0.8 (in front) to z=-1.2 (behind): crossed the plane inside the segment
    const hit = sweptCircleVsSegment(5, 0.8, 5.2, -1.2, 1, wall);
    expect(hit).not.toBeNull();
    expect(hit!.depth).toBeCloseTo(2.2);
    // crossing beyond the segment's ends is not a hit; already behind is not a hit either
    expect(sweptCircleVsSegment(14, 0.8, 14, -1.2, 1, wall)).toBeNull();
    expect(sweptCircleVsSegment(5, -3, 5, -4, 1, wall)).toBeNull();
  });
});
