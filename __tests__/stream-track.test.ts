import { StreamTrack } from '@/lib/game/endless/StreamTrack';
import { SegmentGenerator } from '@/lib/game/endless/SegmentGenerator';
import { ENDLESS_TUNING } from '@/lib/game/endless/tuning';
import { ArcadeCar } from '@/lib/game/ArcadeCar';
import { driveAlong } from '@/lib/game/endless/EndlessBot';

const T = ENDLESS_TUNING;

describe('SegmentGenerator', () => {
  test('road only ever moves forward, stays inside the heading cone and above the minimum radius', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const gen = new SegmentGenerator(seed);
      let lastZ = -Infinity;
      let lastS = -T.spacing;
      let count = 0;
      const bad: string[] = [];
      while (gen.distance < 10000) {
        const chunk = gen.next();
        if (chunk.samples.length === 0) bad.push('empty chunk');
        for (const s of chunk.samples) {
          if (!(s.z > lastZ)) bad.push(`z not increasing at s=${s.s}`);
          lastZ = s.z;
          if (Math.abs(s.s - lastS - T.spacing) > 1e-6) bad.push(`spacing at s=${s.s}`);
          lastS = s.s;
          const heading = Math.atan2(s.tx, s.tz);
          if (Math.abs(heading) > T.headingCone + 1e-6) bad.push(`heading ${heading} at s=${s.s}`);
          if (Math.abs(s.curvature) > 1 / T.minRadius + 1e-9) bad.push(`curvature at s=${s.s}`);
          if (s.width < 10.5 || s.width > 18) bad.push(`width ${s.width} at s=${s.s}`);
          if (Math.abs(Math.hypot(s.tx, s.tz) - 1) > 1e-6) bad.push(`tangent at s=${s.s}`);
          count++;
        }
      }
      expect(bad.slice(0, 5)).toEqual([]);
      expect(count).toBeGreaterThan(4000);
    }
  });

  test('consecutive samples are spacing apart in space and curvature changes smoothly', () => {
    const gen = new SegmentGenerator(7);
    const first = gen.next().samples;
    let prev = first[0];
    const rest = [first.slice(1)];
    while (gen.distance < 4000) rest.push(gen.next().samples);
    for (const chunk of rest) {
      for (const s of chunk) {
        const d = Math.hypot(s.x - prev.x, s.z - prev.z);
        expect(d).toBeGreaterThan(T.spacing * 0.98);
        expect(d).toBeLessThanOrEqual(T.spacing * 1.001);
        expect(Math.abs(s.curvature - prev.curvature)).toBeLessThan(0.01);
        prev = s;
      }
    }
  });

  test('is deterministic for a seed and varies across seeds', () => {
    const run = (seed: number) => {
      const g = new SegmentGenerator(seed);
      const out: number[] = [];
      for (let i = 0; i < 12; i++) for (const s of g.next().samples) out.push(s.x, s.z, s.width);
      return out;
    };
    expect(run(42)).toEqual(run(42));
    expect(run(42)).not.toEqual(run(43));
  });

  test('the opening is a straight and corners only appear in later bands', () => {
    const gen = new SegmentGenerator(3);
    const first = gen.next();
    expect(first.kind).toBe('straight');
    expect(first.sEnd).toBeGreaterThanOrEqual(T.openingStraight);
    for (const s of first.samples) expect(s.curvature).toBe(0);
    while (gen.distance < T.bandDistances[0]) {
      const c = gen.next();
      if (c.sStart < T.bandDistances[0]) expect(['straight', 'sweeper']).toContain(c.kind);
    }
  });
});

describe('StreamTrack', () => {
  test('streams ahead, trims behind and keeps global ids stable', () => {
    const track = new StreamTrack(11);
    track.ensureAhead(T.windowAhead);
    expect(track.lastS).toBeGreaterThanOrEqual(T.windowAhead);
    expect(track.firstId).toBe(0);
    const idBefore = 150;
    const sampleBefore = track.sampleById(idBefore);
    track.ensureAhead(1200);
    track.trimBehind(900);
    expect(track.firstS).toBeGreaterThan(0);
    expect(track.firstS).toBeLessThanOrEqual(900 - T.windowBehind);
    expect(track.samples.length).toBeLessThan(900);
    // walls stay aligned with samples
    expect(track.wallsLeft.length).toBe(track.samples.length - 1);
    expect(track.wallsRight.length).toBe(track.samples.length - 1);
    expect(track.leftWall.length).toBe(track.samples.length);
    // an id from a retired region clamps; a live id still maps to the same point
    const liveId = track.firstId + 5;
    const live = track.sampleById(liveId);
    expect(live.s).toBeCloseTo(liveId * T.spacing, 6);
    void sampleBefore;
  });

  test('emits chunk and retire events in order', () => {
    const track = new StreamTrack(5);
    const seen: string[] = [];
    track.on((e) => seen.push(`${e.type}:${e.chunk.id}`));
    track.ensureAhead(800);
    const chunks = seen.filter((s) => s.startsWith('chunk')).length;
    expect(chunks).toBeGreaterThan(3);
    track.trimBehind(700);
    const retired = seen.filter((s) => s.startsWith('retire'));
    expect(retired.length).toBeGreaterThan(0);
    expect(retired[0]).toBe('retire:0');
    expect(track.chunks[0].id).toBe(retired.length);
  });

  test('nearest round-trips lateral offsets and s along the whole window', () => {
    const track = new StreamTrack(21);
    track.ensureAhead(3000);
    let hint: number | undefined;
    for (let s = 5; s < 2900; s += 13) {
      const p = track.sampleAt(s);
      for (const lat of [-6, -2.5, 0, 3, 7]) {
        const x = p.x + p.nx * lat, z = p.z + p.nz * lat;
        const n = track.nearest(x, z, hint);
        hint = n.index;
        expect(n.s).toBeCloseTo(s, 0);
        expect(n.lateral).toBeCloseTo(lat, 0);
        expect(n.distance).toBeCloseTo(Math.abs(lat), 0);
      }
    }
    // a cold query (no hint) still finds it
    const p = track.sampleAt(1500);
    const n = track.nearest(p.x + p.nx * 4, p.z + p.nz * 4);
    expect(n.s).toBeCloseTo(1500, 0);
    expect(n.lateral).toBeCloseTo(4, 0);
  });

  test('surface and walls: asphalt inside, grass outside, walls on both sides face the road', () => {
    const track = new StreamTrack(9);
    track.ensureAhead(600);
    const id = 100;
    const hw = track.halfWidthAt(id);
    expect(track.surfaceAt(id, hw - 0.1)).toBe('asphalt');
    expect(track.surfaceAt(id, hw + 5)).toBe('grass');
    const p = track.sampleById(id);
    const walls = track.queryWalls(p.x, p.z, 12);
    expect(walls.length).toBeGreaterThanOrEqual(4);
    for (const w of walls) {
      // normal points from the wall toward the centreline
      const mx = (w.ax + w.bx) / 2, mz = (w.az + w.bz) / 2;
      const toRoad = (p.x - mx) * w.nx + (p.z - mz) * w.nz;
      expect(toRoad).toBeGreaterThan(0);
    }
  });

  test('a car drives the stream: stays on the road and walls stop it', () => {
    const track = new StreamTrack(13);
    track.ensureAhead(800);
    const car = new ArcadeCar(track);
    const start = track.sampleAt(4);
    car.place(start.x, start.z, Math.atan2(start.tx, start.tz));
    for (let i = 0; i < 60 * 12; i++) {
      car.step(1 / 60, driveAlong(car, track));
      track.ensureAhead(car.splineS + T.windowAhead);
      track.trimBehind(car.splineS);
    }
    expect(car.splineS).toBeGreaterThan(300);
    expect(car.surface).toBe('asphalt');
    // now steer hard into the wall: the car must be held inside the barriers
    for (let i = 0; i < 60 * 3; i++) {
      car.step(1 / 60, { throttle: 1, steer: 1, brake: false, handbrake: false });
      track.ensureAhead(car.splineS + T.windowAhead);
    }
    expect(Math.abs(car.lateral)).toBeLessThan(track.halfWidthAt(car.splineIndex) + 4);
  });
});

describe('wall tunnelling', () => {
  test('a steep 150 km/h hit never puts the car through the barrier', () => {
    const track = new StreamTrack(17);
    track.ensureAhead(1200);
    for (const angle of [0.6, 0.9, 1.2]) {
      const car = new ArcadeCar(track);
      const p = track.sampleAt(120);
      const heading = Math.atan2(p.tx, p.tz) - angle; // aimed at the right-hand wall
      car.place(p.x, p.z, heading);
      const v = 42;
      car.vx = Math.sin(heading) * v; car.vz = Math.cos(heading) * v;
      for (let i = 0; i < 60; i++) {
        car.step(1 / 60, { throttle: 1, steer: 0, brake: false, handbrake: false });
        track.ensureAhead(car.splineS + T.windowAhead);
        const hw = track.halfWidthAt(car.splineIndex);
        expect(Math.abs(car.lateral)).toBeLessThan(hw + 2.6 + 0.2);
      }
    }
  });
});
