import { StreamTrack } from '@/lib/game/endless/StreamTrack';
import { ObstacleField, OBSTACLE_SPECS, type Obstacle, type ObstacleEvent } from '@/lib/game/endless/ObstacleField';
import { ENDLESS_TUNING, bandAt } from '@/lib/game/endless/tuning';
import { ArcadeCar, CAR_TUNING } from '@/lib/game/ArcadeCar';
import { driveAlong } from './helpers/streamBot';

const T = ENDLESS_TUNING;
const DT = 1 / 60;

/** Stream `length` metres of road with obstacles, keeping every chunk (no trimming). */
function build(seed: number, length: number) {
  const track = new StreamTrack(seed);
  const field = new ObstacleField(track, seed);
  const events: ObstacleEvent[] = [];
  field.on((e) => events.push(e));
  track.on((e) => { if (e.type === 'chunk') field.populate(e.chunk); });
  track.ensureAhead(length + 300); // placement lags one chunk
  return { track, field, events };
}

function rowsOf(obstacles: Obstacle[]): Map<string, Obstacle[]> {
  const rows = new Map<string, Obstacle[]>();
  for (const o of obstacles) {
    if (!OBSTACLE_SPECS[o.kind].solid) continue;
    const key = `${o.patternId}:${Math.round(o.s / 6)}`;
    rows.set(key, [...(rows.get(key) ?? []), o]);
  }
  return rows;
}

describe('ObstacleField placement', () => {
  test('every row leaves a clear lane, nothing sits off the asphalt, nothing before the quiet start', () => {
    const bad: string[] = [];
    let total = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const { track, field } = build(seed, 6000);
      total += field.obstacles.length;
      for (const o of field.obstacles) {
        const hw = track.sampleAt(o.s).width / 2;
        if (Math.abs(o.lateral) + o.radius > hw + 0.05) bad.push(`seed ${seed}: ${o.kind} off asphalt at s=${o.s}`);
        if (o.s < T.quietStart) bad.push(`seed ${seed}: obstacle before quiet start at s=${o.s}`);
        if (bandAt(o.s) < T.cornerBand && Math.abs(track.sampleAt(o.s).curvature) > T.blindCurvature) bad.push(`seed ${seed}: blind-corner obstacle at s=${o.s}`);
      }
      for (const [key, row] of rowsOf(field.obstacles)) {
        const hw = track.sampleAt(row[0].s).width / 2;
        const spans = row.map((o) => ({ lo: o.lateral - o.radius, hi: o.lateral + o.radius })).sort((a, b) => a.lo - b.lo);
        let cursor = -hw, best = 0;
        for (const sp of spans) { best = Math.max(best, sp.lo - cursor); cursor = Math.max(cursor, sp.hi); }
        best = Math.max(best, hw - cursor);
        if (best < T.clearLane - 1e-6) bad.push(`seed ${seed}: row ${key} lane ${best.toFixed(2)}`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(total).toBeGreaterThan(20 * 40);
  });

  test('patterns respect band spacing and density rises with distance', () => {
    const { field } = build(4, 6000);
    const starts = new Map<number, number>();
    const hazardPatterns = new Set(field.obstacles.filter((o) => OBSTACLE_SPECS[o.kind].solid).map((o) => o.patternId));
    for (const o of field.obstacles) {
      if (!hazardPatterns.has(o.patternId)) continue; // standalone boost pads are not hazards
      starts.set(o.patternId, Math.min(starts.get(o.patternId) ?? Infinity, o.s));
    }
    const ordered = [...starts.values()].sort((a, b) => a - b);
    // consecutive pattern starts are at least the band spacing apart (patterns are ≤ 48 m long)
    for (let i = 1; i < ordered.length; i++) {
      const band = bandAt(ordered[i - 1]);
      const minGap = Math.max(T.patternSpacing[band], T.reactionTime * T.expectedSpeed[band] + T.reactionBase);
      expect(ordered[i] - ordered[i - 1]).toBeGreaterThanOrEqual(minGap - 1e-6);
    }
    const perKm = (a: number, b: number) => ordered.filter((s) => s >= a && s < b).length;
    expect(perKm(4000, 6000)).toBeGreaterThan(perKm(0, 2000));
  });

  test('boost pads arrive on a cadence and hard patterns only in later bands', () => {
    const { field } = build(8, 6000);
    const boosts = field.obstacles.filter((o) => o.kind === 'boost');
    expect(boosts.length).toBeGreaterThanOrEqual(5);
    const early = field.obstacles.filter((o) => o.s < T.bandDistances[0]);
    expect(early.every((o) => o.kind === 'cones' || o.kind === 'boost')).toBe(true);
    const oils = field.obstacles.filter((o) => o.kind === 'oil');
    expect(oils.every((o) => bandAt(o.s) >= 2)).toBe(true);
  });

  test('is deterministic per seed and retiring a chunk removes its obstacles', () => {
    const a = build(77, 2500), b = build(77, 2500);
    expect(a.field.obstacles.map((o) => [o.kind, o.s, o.lateral])).toEqual(b.field.obstacles.map((o) => [o.kind, o.s, o.lateral]));
    const before = a.field.obstacles.length;
    const removed: number[] = [];
    a.field.on((e) => { if (e.type === 'remove') removed.push(e.obstacle.id); });
    a.track.trimBehind(2000);
    a.track.on(() => {});
    // retire the chunks the track dropped
    // (StreamTrack emitted retire events before we subscribed above, so replay manually)
    for (const o of [...a.field.obstacles]) if (o.s < a.track.firstS) a.field.retire({ id: o.chunkId } as never);
    expect(a.field.obstacles.length).toBeLessThan(before);
    expect(a.field.obstacles.every((o) => o.s >= a.track.firstS)).toBe(true);
  });
});

describe('ObstacleField interaction', () => {
  function carAt(track: StreamTrack, s: number, lateral: number, speed: number): ArcadeCar {
    const car = new ArcadeCar(track);
    const p = track.sampleAt(s);
    car.place(p.x + p.nx * lateral, p.z + p.nz * lateral, Math.atan2(p.tx, p.tz));
    car.vx = p.tx * speed; car.vz = p.tz * speed;
    return car;
  }

  function setup(seed = 3) {
    const track = new StreamTrack(seed);
    track.ensureAhead(1000);
    const field = new ObstacleField(track, seed);
    const events: ObstacleEvent[] = [];
    field.on((e) => events.push(e));
    return { track, field, events };
  }

  test('driving into a block costs a big chunk of speed and hits once; cones cost less and scatter', () => {
    for (const kind of ['block', 'cones'] as const) {
      const { track, field, events } = setup();
      field['place'](kind, 300, 0, 99, 0);
      const car = carAt(track, 280, 0, 40);
      const v0 = car.forwardSpeed;
      let minSpeed = v0;
      let peak = v0;
      for (let i = 0; i < 60; i++) {
        car.step(DT, { throttle: 1, steer: 0, brake: false, handbrake: false });
        field.step(car);
        if (!events.some((e) => e.type === 'hit')) peak = Math.max(peak, car.speed);
        minSpeed = Math.min(minSpeed, car.speed);
      }
      const hits = events.filter((e) => e.type === 'hit');
      expect(hits.length).toBe(1);
      const o = field.obstacles[0];
      expect(o.hit).toBe(true);
      expect(o.alive).toBe(kind === 'block');
      // the hit removes at least the kind's loss fraction, and never stops the car dead
      expect(minSpeed).toBeLessThanOrEqual(peak * (1 - OBSTACLE_SPECS[kind].loss) + 0.5);
      expect(minSpeed).toBeGreaterThan(v0 * 0.3);
      expect(car.forwardSpeed).toBeGreaterThan(10);
    }
  });

  test('oil makes the car slick, a boost pad grants a boost and disappears', () => {
    const { track, field, events } = setup();
    field['place']('oil', 300, 0, 98, 0);
    field['place']('boost', 340, 0, 97, 0);
    const car = carAt(track, 290, 0, 30);
    for (let i = 0; i < 150; i++) { car.step(DT, driveAlong(car, track)); field.step(car); }
    expect(events.some((e) => e.type === 'oil')).toBe(true);
    expect(events.some((e) => e.type === 'boost')).toBe(true);
    expect(field.obstacles.find((o) => o.kind === 'boost')!.alive).toBe(false);
    expect(car.boostTier).toBeGreaterThanOrEqual(0);
  });

  test('slick tyres hold lateral speed longer than dry ones', () => {
    const { track } = setup();
    const decay = (slick: boolean) => {
      const car = carAt(track, 200, 0, 30);
      if (slick) car.slickTime = 2;
      const h = car.heading;
      car.vx += -Math.cos(h) * 6; car.vz += Math.sin(h) * 6;
      const start = Math.abs(car.lateralSpeed);
      for (let i = 0; i < 20; i++) car.step(DT, { throttle: 1, steer: 0, brake: false, handbrake: false });
      return Math.abs(car.lateralSpeed) / start;
    };
    expect(decay(true)).toBeGreaterThan(decay(false) * 2);
  });

  test('passing a block within a metre at speed is a near miss; passing wide is a clean pattern', () => {
    const run = (lateralGap: number) => {
      const { track, field, events } = setup();
      field['patterns'].set(5, { name: 'block-centre', total: 1, passed: 0, hit: false, done: false });
      field['place']('block', 200, 0, 5, 0);
      const r = OBSTACLE_SPECS.block.radius;
      const car = carAt(track, 170, r + CAR_TUNING.bodyRadius + lateralGap, 32);
      for (let i = 0; i < 90; i++) {
        car.step(DT, driveAlong(car, track, { lateral: r + CAR_TUNING.bodyRadius + lateralGap }));
        field.step(car);
      }
      return events;
    };
    const close = run(0.4);
    expect(close.some((e) => e.type === 'nearMiss')).toBe(true);
    expect(close.some((e) => e.type === 'patternClear')).toBe(true);
    expect(close.some((e) => e.type === 'hit')).toBe(false);
    const wide = run(2.5);
    expect(wide.some((e) => e.type === 'nearMiss')).toBe(false);
    expect(wide.some((e) => e.type === 'patternClear')).toBe(true);
  });

  test('a hit pattern never reports a clean pass', () => {
    const { track, field, events } = setup();
    field['patterns'].set(6, { name: 'gate', total: 2, passed: 0, hit: false, done: false });
    field['place']('block', 300, -3, 6, 0);
    field['place']('block', 300, 3, 6, 0);
    const car = carAt(track, 280, 3, 35);
    for (let i = 0; i < 90; i++) { car.step(DT, { throttle: 1, steer: 0, brake: false, handbrake: false }); field.step(car); }
    expect(events.some((e) => e.type === 'hit')).toBe(true);
    expect(events.some((e) => e.type === 'patternClear')).toBe(false);
  });
});
