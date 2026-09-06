import { ArcadeCar } from '@/lib/game/ArcadeCar';
import { TrackSpline, DEFAULT_WAYPOINTS } from '@/lib/game/TrackSpline';
import { AIDriver } from '@/lib/game/ai/AIDriver';

const DT = 1 / 60;

describe('AIDriver', () => {
  const spline = new TrackSpline(DEFAULT_WAYPOINTS);

  test('accelerates on the start straight', () => {
    const car = new ArcadeCar(spline);
    car.place(spline.start.x, spline.start.z, spline.start.rotation);
    const ai = new AIDriver(car, spline, 'balanced', 1);
    let last = { throttle: 0, steer: 0, brake: false, handbrake: false };
    for (let i = 0; i < 30; i++) { last = ai.think(DT, { others: [], gapToPlayer: 0 }); car.step(DT, last); }
    expect(last.throttle).toBeGreaterThan(0.5);
    expect(last.brake).toBe(false);
    expect(car.forwardSpeed).toBeGreaterThan(5);
  });

  test('brakes when approaching the hairpin at speed', () => {
    let best = 0;
    spline.samples.forEach((s, i) => { if (Math.abs(s.curvature) > Math.abs(spline.samples[best].curvature)) best = i; });
    const apexS = spline.samples[best].s;
    const car = new ArcadeCar(spline);
    const p = spline.sampleAt(apexS - 35);
    car.place(p.x, p.z, Math.atan2(p.tx, p.tz));
    car.vx = p.tx * 45; car.vz = p.tz * 45;
    const ai = new AIDriver(car, spline, 'balanced', 1);
    let braked = false;
    for (let i = 0; i < 20; i++) {
      const input = ai.think(DT, { others: [], gapToPlayer: 0 });
      if (input.brake || input.throttle < 0.2) braked = true;
      car.step(DT, input);
    }
    expect(braked).toBe(true);
  });

  test('completes a lap on the default track without leaving the road for long', () => {
    const car = new ArcadeCar(spline);
    car.place(spline.start.x, spline.start.z, spline.start.rotation);
    const ai = new AIDriver(car, spline, 'aggressive', 1);
    let offRoadSteps = 0;
    let steps = 0;
    let progress = 0;
    let lastS = car.splineS;
    while (progress < spline.length && steps < 60 * 90) {
      car.step(DT, ai.think(DT, { others: [], gapToPlayer: 0 }));
      let ds = car.splineS - lastS;
      if (ds < -spline.length / 2) ds += spline.length;
      if (ds > spline.length / 2) ds -= spline.length;
      progress += ds;
      lastS = car.splineS;
      if (car.surface === 'grass') offRoadSteps++;
      steps++;
    }
    expect(progress).toBeGreaterThanOrEqual(spline.length);
    expect(steps / 60).toBeLessThan(60);
    expect(offRoadSteps / steps).toBeLessThan(0.08);
  });

  test('rubber band scales max speed', () => {
    const car = new ArcadeCar(spline);
    car.place(spline.start.x, spline.start.z, spline.start.rotation);
    const ai = new AIDriver(car, spline, 'balanced', 1);
    ai.think(DT, { others: [], gapToPlayer: 400 });
    const behind = car.maxSpeedScale;
    ai.think(DT, { others: [], gapToPlayer: -400 });
    const ahead = car.maxSpeedScale;
    expect(behind).toBeGreaterThan(ahead);
  });
});
