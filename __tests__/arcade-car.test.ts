import { ArcadeCar, CAR_TUNING } from '@/lib/game/ArcadeCar';
import { TrackSpline } from '@/lib/game/TrackSpline';
import type { TrackWaypoint } from '@/lib/game/types';

const DT = 1 / 60;
const NONE = { throttle: 0, steer: 0, brake: false, handbrake: false };

function straightLoop(): TrackWaypoint[] {
  const pts: TrackWaypoint[] = [];
  for (let i = 0; i <= 10; i++) pts.push({ x: 0, z: i * 60, width: 16, speedLimit: 200, isCheckpoint: i === 3 });
  pts.push({ x: 40, z: 650, width: 16, speedLimit: 100 });
  for (let i = 10; i >= 0; i--) pts.push({ x: 80, z: i * 60, width: 16, speedLimit: 200 });
  pts.push({ x: 40, z: -50, width: 16, speedLimit: 100 });
  return pts;
}

describe('ArcadeCar', () => {
  const spline = new TrackSpline(straightLoop());

  function fresh(): ArcadeCar {
    const car = new ArcadeCar(spline);
    car.place(spline.start.x, spline.start.z, spline.start.rotation);
    return car;
  }

  test('accelerates, approaches but never exceeds max speed', () => {
    const car = fresh();
    let peak = 0;
    for (let i = 0; i < 60 * 8; i++) {
      car.step(DT, { ...NONE, throttle: 1 });
      peak = Math.max(peak, car.forwardSpeed);
    }
    expect(car.forwardSpeed).toBeGreaterThan(CAR_TUNING.maxSpeed * 0.85);
    expect(peak).toBeLessThanOrEqual(CAR_TUNING.maxSpeed * 1.01);
  });

  test('launch is strong and tapers (arcade curve)', () => {
    const car = fresh();
    for (let i = 0; i < 60; i++) car.step(DT, { ...NONE, throttle: 1 });
    const afterOne = car.forwardSpeed;
    for (let i = 0; i < 60 * 4; i++) car.step(DT, { ...NONE, throttle: 1 });
    const afterFive = car.forwardSpeed;
    expect(afterOne).toBeGreaterThan(15);
    expect(afterFive - afterOne).toBeLessThan(afterOne * 3);
  });

  test('brake stops the car and reverse works', () => {
    const car = fresh();
    for (let i = 0; i < 120; i++) car.step(DT, { ...NONE, throttle: 1 });
    for (let i = 0; i < 240; i++) car.step(DT, { ...NONE, throttle: 0, brake: true });
    expect(Math.abs(car.forwardSpeed)).toBeLessThan(0.5);
    for (let i = 0; i < 120; i++) car.step(DT, { ...NONE, throttle: -1 });
    expect(car.forwardSpeed).toBeLessThan(-3);
    expect(car.forwardSpeed).toBeGreaterThanOrEqual(-CAR_TUNING.reverseSpeed - 0.01);
    expect(car.gear).toBe(-1);
  });

  test('lateral velocity decays on asphalt (grip) and is held longer while drifting', () => {
    const decay = (drift: boolean) => {
      const car = fresh();
      for (let i = 0; i < 120; i++) car.step(DT, { ...NONE, throttle: 1 });
      const h = car.heading;
      car.vx += -Math.cos(h) * 8;
      car.vz += Math.sin(h) * 8;
      const start = Math.abs(car.lateralSpeed);
      for (let i = 0; i < 20; i++) car.step(DT, { ...NONE, throttle: 1, handbrake: drift });
      return Math.abs(car.lateralSpeed) / start;
    };
    const gripRatio = decay(false);
    const driftRatio = decay(true);
    expect(gripRatio).toBeLessThan(0.2);
    expect(driftRatio).toBeGreaterThan(gripRatio * 2);
  });

  test('steering turns the car and speed follows the nose', () => {
    const car = fresh();
    for (let i = 0; i < 90; i++) car.step(DT, { ...NONE, throttle: 1 });
    const h0 = car.heading;
    for (let i = 0; i < 30; i++) car.step(DT, { ...NONE, throttle: 1, steer: 1 });
    expect(car.heading).toBeLessThan(h0 - 0.1);
    expect(Math.abs(car.lateralSpeed)).toBeLessThan(car.forwardSpeed * 0.3);
  });

  test('no pivot at standstill: yaw needs speed', () => {
    const car = fresh();
    for (let i = 0; i < 30; i++) car.step(DT, { ...NONE, steer: 1 });
    expect(Math.abs(car.heading - spline.start.rotation)).toBeLessThan(0.01);
  });

  test('drifting charges and releasing grants a boost tier', () => {
    const car = fresh();
    const boosts: number[] = [];
    car.onBoost = (t) => boosts.push(t);
    for (let i = 0; i < 150; i++) car.step(DT, { ...NONE, throttle: 1 });
    for (let i = 0; i < 70; i++) car.step(DT, { ...NONE, throttle: 1, steer: 1, handbrake: true });
    expect(car.isDrifting).toBe(true);
    expect(car.driftCharge).toBeGreaterThan(CAR_TUNING.driftTiers[0]);
    car.step(DT, { ...NONE, throttle: 1 });
    expect(car.isDrifting).toBe(false);
    expect(boosts.length).toBe(1);
    expect(car.boostTier).toBeGreaterThanOrEqual(1);
    expect(car.boostTime).toBeGreaterThan(0);
  });

  test('grass caps speed well below asphalt', () => {
    const car = fresh();
    for (let i = 0; i < 60 * 8; i++) car.step(DT, { ...NONE, throttle: 1 });
    const onRoad = car.forwardSpeed;
    const grass = new ArcadeCar(spline);
    const s = spline.samples[20];
    grass.place(s.x + s.nx * 9.2, s.z + s.nz * 9.2, Math.atan2(s.tx, s.tz));
    for (let i = 0; i < 60 * 8; i++) grass.step(DT, { ...NONE, throttle: 1 });
    expect(grass.surface).toBe('grass');
    expect(grass.forwardSpeed).toBeLessThan(onRoad * 0.7);
  });

  test('walls stop the car and emit a single impact per hit', () => {
    const car = new ArcadeCar(spline);
    const s = spline.samples[30];
    const heading = Math.atan2(s.nx, s.nz);
    car.place(s.x, s.z, heading);
    const impacts: number[] = [];
    for (let i = 0; i < 120; i++) {
      car.step(DT, { ...NONE, throttle: 1 });
      for (const imp of car.impacts) impacts.push(imp.magnitude);
    }
    const n = spline.nearest(car.x, car.z);
    expect(n.distance).toBeLessThan(spline.halfWidthAt(n.index) + 4);
    expect(impacts.length).toBeGreaterThanOrEqual(1);
    expect(impacts.length).toBeLessThan(6);
    expect(impacts[0]).toBeGreaterThan(3);
  });

  test('stepping is deterministic', () => {
    const run = () => {
      const car = fresh();
      for (let i = 0; i < 200; i++) car.step(DT, { ...NONE, throttle: 1, steer: i > 100 ? 0.5 : 0 });
      return [car.x, car.z, car.heading, car.vx, car.vz];
    };
    expect(run()).toEqual(run());
  });

  test('stuck detection triggers when pushing into a wall', () => {
    const car = new ArcadeCar(spline);
    const s = spline.samples[30];
    car.place(s.x, s.z, Math.atan2(s.nx, s.nz));
    for (let i = 0; i < 60 * 4; i++) car.step(DT, { ...NONE, throttle: 1 });
    expect(car.stuck).toBe(true);
  });
});
