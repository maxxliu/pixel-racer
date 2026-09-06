import { ArcadeCar } from '@/lib/game/ArcadeCar';
import { TrackSpline, DEFAULT_WAYPOINTS } from '@/lib/game/TrackSpline';
import { RaceDirector, type RaceEvent } from '@/lib/game/RaceDirector';

const DT = 1 / 60;

function moveTo(car: ArcadeCar, spline: TrackSpline, s: number, lateral = 0) {
  const p = spline.sampleAt(s);
  car.prevX = car.x; car.prevZ = car.z;
  car.x = p.x + p.nx * lateral;
  car.z = p.z + p.nz * lateral;
  const n = spline.nearest(car.x, car.z, car.splineIndex);
  car.splineIndex = n.index;
  car.splineS = n.s;
  car.lateral = n.lateral;
  car.vx = 5; car.vz = 5;
}

function setup(laps = 2) {
  const spline = new TrackSpline(DEFAULT_WAYPOINTS);
  const director = new RaceDirector(spline, { laps });
  const car = new ArcadeCar(spline);
  const slot = spline.gridSlot(0);
  car.place(slot.x, slot.z, slot.rotation);
  const racer = director.addRacer(car, 'YOU', 0xff0000, true);
  const events: RaceEvent[] = [];
  director.on((e) => events.push(e));
  for (let i = 0; i < 60 * 3 + 2; i++) director.update(DT);
  return { spline, director, car, racer, events };
}

function drive(ctx: ReturnType<typeof setup>, from: number, to: number, step = 1, lateral = 0) {
  const L = ctx.spline.length;
  let s = from;
  const dir = Math.sign(to - from) || 1;
  while (dir > 0 ? s < to : s > to) {
    s += dir * step;
    moveTo(ctx.car, ctx.spline, ((s % L) + L) % L, lateral);
    ctx.director.update(DT);
  }
}

describe('RaceDirector', () => {
  test('countdown runs 3-2-1 then GO, timer starts at GO', () => {
    const spline = new TrackSpline(DEFAULT_WAYPOINTS);
    const d = new RaceDirector(spline, { laps: 1 });
    const car = new ArcadeCar(spline);
    car.place(spline.gridSlot(0).x, spline.gridSlot(0).z, 0);
    d.addRacer(car, 'p', 1, true);
    const values: number[] = [];
    let go = false;
    d.on((e) => { if (e.type === 'countdown') values.push(e.value); if (e.type === 'go') go = true; });
    expect(d.phase).toBe('countdown');
    for (let i = 0; i < 60 * 1.5; i++) d.update(DT);
    expect(d.phase).toBe('countdown');
    for (let i = 0; i < 60 * 1.6; i++) d.update(DT);
    expect(go).toBe(true);
    expect(d.phase).toBe('racing');
    expect(values).toEqual([2, 1]);
    expect(d.raceTime).toBeLessThan(0.1);
  });

  test('a full lap through every gate counts', () => {
    const ctx = setup(2);
    const L = ctx.spline.length;
    drive(ctx, -6, L + 5);
    expect(ctx.racer.lapsCompleted).toBe(1);
    expect(ctx.racer.lap).toBe(2);
    expect(ctx.events.find((e) => e.type === 'lap')).toBeDefined();
    expect(ctx.racer.lapTimes.length).toBe(1);
  });

  test('reversing back and forth over the line never counts a lap', () => {
    const ctx = setup(2);
    drive(ctx, -6, 20);
    for (let k = 0; k < 3; k++) {
      drive(ctx, 20, -30);
      drive(ctx, -30, 20);
    }
    expect(ctx.racer.lapsCompleted).toBe(0);
    expect(ctx.events.some((e) => e.type === 'lap')).toBe(false);
  });

  test('cutting the course (gates missed off-track) invalidates the lap', () => {
    const ctx = setup(2);
    const L = ctx.spline.length;
    drive(ctx, -6, 30);
    drive(ctx, 30, L - 40, 1, 40);
    drive(ctx, L - 40, L + 10);
    expect(ctx.racer.lapsCompleted).toBe(0);
    expect(ctx.events.some((e) => e.type === 'invalidLap')).toBe(true);
    drive(ctx, 10, L + 10);
    expect(ctx.racer.lapsCompleted).toBe(1);
  });

  test('finishing the last lap ends the race with standings', () => {
    const ctx = setup(1);
    const L = ctx.spline.length;
    drive(ctx, -6, L + 5);
    expect(ctx.director.phase).toBe('finished');
    const finish = ctx.events.find((e) => e.type === 'finish');
    expect(finish && finish.type === 'finish' && finish.standings[0].isPlayer).toBe(true);
    expect(ctx.racer.finishTime).toBeGreaterThan(0);
  });

  test('wrong-way flags after driving backwards and clears going forward', () => {
    const ctx = setup(2);
    drive(ctx, -6, 40);
    drive(ctx, 40, 20);
    expect(ctx.racer.wrongWay).toBe(true);
    expect(ctx.events.some((e) => e.type === 'wrongWay' && e.active)).toBe(true);
    drive(ctx, 20, 60);
    expect(ctx.racer.wrongWay).toBe(false);
  });

  test('positions follow progress and the leader has position 1', () => {
    const spline = new TrackSpline(DEFAULT_WAYPOINTS);
    const d = new RaceDirector(spline, { laps: 3 });
    const a = new ArcadeCar(spline); const b = new ArcadeCar(spline);
    a.place(spline.gridSlot(0).x, spline.gridSlot(0).z, 0);
    b.place(spline.gridSlot(1).x, spline.gridSlot(1).z, 0);
    const ra = d.addRacer(a, 'A', 1, true);
    const rb = d.addRacer(b, 'B', 2, false);
    for (let i = 0; i < 60 * 3 + 2; i++) d.update(DT);
    for (let s = -6; s < 80; s++) {
      moveTo(a, spline, ((s % spline.length) + spline.length) % spline.length);
      moveTo(b, spline, (((s + 3) % spline.length) + spline.length) % spline.length);
      d.update(DT);
    }
    expect(rb.position).toBe(1);
    expect(ra.position).toBe(2);
  });

  test('respawn returns the car to the last gate facing forward', () => {
    const ctx = setup(2);
    const L = ctx.spline.length;
    drive(ctx, -6, L * 0.45);
    ctx.director.respawn(ctx.racer);
    const g = ctx.spline.gates[ctx.racer.nextGate - 1];
    const n = ctx.spline.nearest(ctx.car.x, ctx.car.z);
    expect(n.distance).toBeLessThan(0.5);
    expect(n.s - g.s).toBeGreaterThan(0);
    expect(n.s - g.s).toBeLessThan(6);
    expect(Math.abs(ctx.car.heading - ctx.spline.headingAt(n.s))).toBeLessThan(0.05);
    expect(ctx.car.ghostTime).toBeGreaterThan(0);
  });

  test('perfect start boost is granted when throttle is pressed right before GO', () => {
    const spline = new TrackSpline(DEFAULT_WAYPOINTS);
    const d = new RaceDirector(spline, { laps: 1 });
    const car = new ArcadeCar(spline);
    car.place(spline.gridSlot(0).x, spline.gridSlot(0).z, 0);
    const r = d.addRacer(car, 'p', 1, true);
    let boosted = false;
    d.on((e) => { if (e.type === 'startBoost') boosted = true; });
    for (let i = 0; i < 60 * 3; i++) {
      const elapsed = i * DT;
      d.noteThrottle(r, elapsed > 2.8 ? 1 : 0, elapsed);
      d.update(DT);
    }
    d.update(DT);
    expect(d.phase).toBe('racing');
    expect(boosted).toBe(true);
    expect(car.boostTime).toBeGreaterThan(0);
  });
});
