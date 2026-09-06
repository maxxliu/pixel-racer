import { StreamTrack } from '@/lib/game/endless/StreamTrack';
import { Pursuer, type PursuerTarget } from '@/lib/game/endless/Pursuer';
import { EndlessDirector, type EndlessEvent } from '@/lib/game/endless/EndlessDirector';
import { ENDLESS_TUNING } from '@/lib/game/endless/tuning';
import { driveAlong, cornerLimitAt } from '@/lib/game/endless/EndlessBot';

const T = ENDLESS_TUNING;
const DT = 1 / 60;

/** A scripted player that moves along the road at a given speed profile, braking for corners like a car. */
function ghost(track: StreamTrack, startS: number): PursuerTarget & { advance(dt: number, speed: number): void } {
  const g = {
    splineS: startS, splineIndex: Math.round(startS / T.spacing), forwardSpeed: 0, lateral: 0,
    advance(dt: number, wanted: number) {
      const limit = Math.min(wanted, cornerLimitAt(track, g.splineS, wanted));
      const speed = Math.min(limit, g.forwardSpeed + 20 * dt); // a car-like acceleration cap
      g.forwardSpeed = speed;
      g.splineS += speed * dt;
      g.splineIndex = Math.round(g.splineS / T.spacing);
      track.ensureAhead(g.splineS + T.windowAhead);
      track.trimBehind(g.splineS - 200);
    },
  };
  return g;
}

describe('Pursuer gap model', () => {
  test('under steady clean driving the gap settles at the comfort gap and never catches', () => {
    const track = new StreamTrack(1);
    track.ensureAhead(T.windowAhead);
    const player = ghost(track, T.playerStart);
    const rival = new Pursuer(track, T.playerStart - T.rivalStartGap);
    let caught = false;
    rival.on((e) => { if (e.type === 'caught') caught = true; });
    let t = 0;
    for (let i = 0; i < 60 * 40; i++) {
      t += DT;
      player.advance(DT, 38);
      rival.step(DT, player, 0, t); // distance 0 → pressure 0 → early comfort gap
    }
    expect(caught).toBe(false);
    expect(rival.gap).toBeGreaterThan(T.desiredGapStart - 5);
    expect(rival.gap).toBeLessThan(T.desiredGapStart + 5);
    expect(Math.abs(rival.v - player.forwardSpeed)).toBeLessThan(6);
  });

  test('the mistake budget: a cone clip is survivable and slow to recover from; a block hit from the comfort gap is not', () => {
    const track = new StreamTrack(2);
    track.ensureAhead(T.windowAhead);
    const player = ghost(track, T.playerStart);
    const rival = new Pursuer(track, T.playerStart - T.rivalStartGap);
    let caught = false;
    rival.on((e) => { if (e.type === 'caught') caught = true; });
    let t = 0;
    for (let i = 0; i < 60 * 30; i++) { t += DT; player.advance(DT, 40); rival.step(DT, player, 0, t); }
    const before = rival.gap;
    // a cone clip: light surge plus a brief 15% speed loss
    rival.surge(false);
    for (let i = 0; i < 60 * 2; i++) { t += DT; player.advance(DT, i < 20 ? 34 : 40); rival.step(DT, player, 0, t); }
    const after = rival.gap;
    expect(caught).toBe(false);
    expect(before - after).toBeGreaterThanOrEqual(4);
    // recovery: clean driving reopens it, but it never drifts far past where it sat before
    for (let i = 0; i < 60 * 8; i++) { t += DT; player.advance(DT, 40); rival.step(DT, player, 0, t); }
    expect(rival.gap).toBeGreaterThan(after);
    expect(rival.gap).toBeLessThan(before + 4);
    // now a block: heavy surge plus a 45% speed loss for a second. From here that is a pass.
    rival.surge(true);
    for (let i = 0; i < 60 * 4 && !caught; i++) { t += DT; player.advance(DT, i < 60 ? 22 : 40); rival.step(DT, player, 0, t); }
    expect(caught).toBe(true);
    expect(rival.gap).toBeLessThan(T.overtakeDistance + 0.5);
  });

  test('the rival is never more than maxGap behind, even against a flat-out player', () => {
    const track = new StreamTrack(6);
    track.ensureAhead(T.windowAhead);
    const player = ghost(track, T.playerStart);
    const rival = new Pursuer(track, T.playerStart - T.rivalStartGap);
    let t = 0;
    let maxGap = 0;
    // a player somehow 3x faster than the rival can pace: the leash clamps the gap
    for (let i = 0; i < 60 * 30; i++) {
      t += DT;
      player.splineS += 90 * DT; player.forwardSpeed = 90; player.splineIndex = Math.round(player.splineS / T.spacing);
      track.ensureAhead(player.splineS + T.windowAhead); track.trimBehind(player.splineS - 200);
      rival.step(DT, player, 0, t);
      maxGap = Math.max(maxGap, rival.gap);
    }
    expect(maxGap).toBeLessThanOrEqual(T.maxGap + 1);
  });

  test('the catch is an overtake, not a touch: alongside is survivable, passed is not', () => {
    const track = new StreamTrack(8);
    track.ensureAhead(T.windowAhead);
    const player = ghost(track, T.playerStart);
    const rival = new Pursuer(track, T.playerStart - 2); // nose on your door from the start
    let caught = false;
    rival.on((e) => { if (e.type === 'caught') caught = true; });
    let t = T.startGrace + 1;
    player.forwardSpeed = 30; rival.v = 30; rival.vRef = 30; // both already up to speed
    for (let i = 0; i < 20; i++) { t += DT; player.advance(DT, 30); rival.step(DT, player, 0, t); }
    expect(caught).toBe(false);
    expect(rival.overtakeSide).not.toBe(0);
    // it commits and pushes through while the player dawdles
    for (let i = 0; i < 60 * 4 && !caught; i++) { t += DT; player.advance(DT, 20); rival.step(DT, player, 0, t); }
    expect(caught).toBe(true);
    expect(rival.gap).toBeLessThan(T.overtakeDistance + 0.01);
    // it passed on the asphalt, offset from the player's line
    const n = track.nearest(rival.x, rival.z, Math.round(rival.s / T.spacing));
    expect(n.distance).toBeLessThan(track.halfWidthAt(n.index));
    expect(Math.abs(rival.lateral - player.lateral)).toBeGreaterThan(1.5);
  });

  test('two mistakes in a row get you caught; the catch never fires during the start grace', () => {
    const track = new StreamTrack(3);
    track.ensureAhead(T.windowAhead);
    const player = ghost(track, T.playerStart);
    const rival = new Pursuer(track, T.playerStart - 12);
    const events: string[] = [];
    rival.on((e) => events.push(e.type));
    // stopped player inside the grace window: rival closes but must not catch
    for (let i = 0; i < 60 * 2; i++) { player.advance(DT, 0); rival.step(DT, player, 0, i * DT); }
    expect(events).not.toContain('caught');
    let t = T.startGrace + 1;
    for (let i = 0; i < 60 * 30; i++) { t += DT; player.advance(DT, 40); rival.step(DT, player, 0, t); }
    rival.surge(true);
    for (let i = 0; i < 60 * 1.5; i++) { t += DT; player.advance(DT, 16); rival.step(DT, player, 0, t); }
    rival.surge(true);
    for (let i = 0; i < 60 * 3; i++) { t += DT; player.advance(DT, 14); rival.step(DT, player, 0, t); }
    expect(events).toContain('closing');
    expect(events).toContain('caught');
    expect(rival.caught).toBe(true);
  });

  test('pressure shrinks the comfort gap with distance and the leash keeps a fast player in play', () => {
    const track = new StreamTrack(4);
    track.ensureAhead(T.windowAhead);
    const player = ghost(track, T.playerStart);
    const rival = new Pursuer(track, T.playerStart - T.rivalStartGap);
    let t = 0;
    for (let i = 0; i < 60 * 40; i++) { t += DT; player.advance(DT, 45); rival.step(DT, player, T.pressureDistance, t); }
    expect(rival.desiredGap).toBeCloseTo(T.desiredGapEnd, 0);
    expect(rival.gap).toBeLessThan(T.desiredGapEnd + 6);
    // a player pulling away at full boost never gets more than the leash ahead
    let maxGap = 0;
    for (let i = 0; i < 60 * 30; i++) {
      t += DT;
      player.advance(DT, 58);
      rival.step(DT, player, 0, t);
      maxGap = Math.max(maxGap, rival.gap);
    }
    expect(maxGap).toBeLessThan(T.desiredGapStart + T.leashExtra + 25);
    expect(rival.gap).toBeLessThan(T.desiredGapStart + 10);
  });

  test('the rival follows the player line and stays on the asphalt', () => {
    const track = new StreamTrack(5);
    track.ensureAhead(T.windowAhead);
    const player = ghost(track, T.playerStart);
    player.lateral = 3;
    const rival = new Pursuer(track, T.playerStart - 20);
    let t = 0;
    for (let i = 0; i < 60 * 20; i++) {
      t += DT; player.advance(DT, 35); rival.step(DT, player, 0, t);
      const n = track.nearest(rival.x, rival.z, Math.round(rival.s / T.spacing));
      expect(n.distance).toBeLessThan(track.halfWidthAt(n.index));
      expect(Math.abs(n.s - rival.s)).toBeLessThan(1.5);
    }
    expect(rival.lateral).toBeCloseTo(3, 0);
    expect(Number.isFinite(rival.heading)).toBe(true);
  });
});

describe('EndlessDirector', () => {
  const NONE = { throttle: 0, steer: 0, brake: false, handbrake: false };

  test('counts down, then GO, and the perfect start boost works', () => {
    const d = new EndlessDirector({ seed: 1 });
    const events: EndlessEvent[] = [];
    d.on((e) => events.push(e));
    for (let i = 0; i < 60 * 3; i++) {
      const elapsed = i * DT;
      d.update(DT, { ...NONE, throttle: elapsed > 2.8 ? 1 : 0 });
    }
    d.update(DT, { ...NONE, throttle: 1 });
    expect(d.phase).toBe('running');
    expect(events.filter((e) => e.type === 'countdown').map((e) => (e as { value: number }).value)).toEqual([2, 1]);
    expect(events.some((e) => e.type === 'go')).toBe(true);
    expect(events.some((e) => e.type === 'startBoost')).toBe(true);
    expect(d.car.boostTime).toBeGreaterThan(0);
  });

  test('a scripted 3 km drive: score grows with distance × multiplier, milestones fire once, memory stays bounded', () => {
    const d = new EndlessDirector({ seed: 9, bestScore: 300 });
    const events: EndlessEvent[] = [];
    d.on((e) => events.push(e));
    for (let i = 0; i < 60 * 3 + 2; i++) d.update(DT, NONE);
    let maxSamples = 0, maxObstacles = 0;
    let steps = 0;
    while (d.distance < 3000 && d.phase === 'running' && steps < 60 * 400) {
      d.update(DT, driveAlong(d.car, d.track, { speedScale: 0.9, avoid: d.obstacles.obstacles }));
      maxSamples = Math.max(maxSamples, d.track.samples.length);
      maxObstacles = Math.max(maxObstacles, d.obstacles.obstacles.length);
      steps++;
    }
    // the simple bot clips things now and then; against this rival that can end the run, and that is fine
    expect(d.distance).toBeGreaterThanOrEqual(400);
    if (d.distance < 3000) expect(d.phase).toBe('caught');
    expect(d.score).toBeGreaterThanOrEqual(d.distance - 1);
    expect(maxSamples).toBeLessThan((T.windowAhead + T.windowBehind + 500) / T.spacing);
    expect(maxObstacles).toBeLessThan(120);
    const milestones = events.filter((e) => e.type === 'milestone').map((e) => (e as { metres: number }).metres);
    const expected = [];
    for (let m = 500; m <= d.distance; m += 500) expected.push(m);
    expect(milestones).toEqual(expected);
    expect(events.filter((e) => e.type === 'record').length).toBe(1);
    expect(d.results().distance).toBe(Math.floor(d.distance));
    expect(d.results().isRecord).toBe(true);
  });

  test('a stopped player gets caught and the run ends with results', () => {
    const d = new EndlessDirector({ seed: 2 });
    const events: EndlessEvent[] = [];
    d.on((e) => events.push(e));
    for (let i = 0; i < 60 * 3 + 2; i++) d.update(DT, NONE);
    for (let i = 0; i < 60 * 6; i++) d.update(DT, { ...NONE, throttle: 1 });
    for (let i = 0; i < 60 * 30 && d.phase === 'running'; i++) d.update(DT, { ...NONE, brake: true });
    expect(d.phase).toBe('caught');
    const caught = events.find((e) => e.type === 'caught') as Extract<EndlessEvent, { type: 'caught' }>;
    expect(caught).toBeDefined();
    expect(caught.results.mode).toBe('endless');
    expect(caught.results.score).toBeGreaterThan(0);
    expect(caught.results.time).toBeGreaterThan(5);
  });

  test('combo builds on clean patterns and near misses, multiplier tiers, and any hit resets it', () => {
    const d = new EndlessDirector({ seed: 3 });
    const events: EndlessEvent[] = [];
    d.on((e) => events.push(e));
    for (let i = 0; i < 60 * 3 + 2; i++) d.update(DT, NONE);
    // drive the private hooks directly: the field emits, the director scores
    const field = d.obstacles;
    const fake = (type: 'patternClear' | 'nearMiss' | 'hit') => {
      const obstacle = { id: 0, kind: 'block', s: 0, lateral: 0, x: 0, z: 0, heading: 0, radius: 1.5, alive: true, hit: false, passed: true, patternId: 0, minClearance: 0.5, speedAtClosest: 30, chunkId: 0 } as const;
      if (type === 'patternClear') field['emit']({ type, patternId: 1, name: 'gate' });
      else if (type === 'nearMiss') field['emit']({ type, obstacle: { ...obstacle }, clearance: 0.5 });
      else field['emit']({ type, obstacle: { ...obstacle }, impact: 12 });
    };
    for (let i = 0; i < T.comboPerTier; i++) fake('patternClear');
    expect(d.combo).toBe(T.comboPerTier);
    expect(d.multiplier).toBe(2);
    const scoreBefore = d.score;
    fake('nearMiss');
    expect(d.score - scoreBefore).toBe(T.nearMissPoints * 2);
    expect(d.nearMisses).toBe(1);
    for (let i = 0; i < T.comboPerTier * 10; i++) fake('patternClear');
    expect(d.multiplier).toBe(T.maxMultiplier);
    fake('hit');
    expect(d.combo).toBe(0);
    expect(d.multiplier).toBe(1);
    expect(d.hits).toBe(1);
    expect(events.some((e) => e.type === 'comboLost')).toBe(true);
    expect(events.some((e) => e.type === 'surge')).toBe(true);
    expect(d.bestCombo).toBeGreaterThan(T.comboPerTier * 10);
  });

  test('a wall scrape resets the combo and surges the rival', () => {
    const d = new EndlessDirector({ seed: 4 });
    const events: EndlessEvent[] = [];
    d.on((e) => events.push(e));
    for (let i = 0; i < 60 * 3 + 2; i++) d.update(DT, NONE);
    d['setCombo'](5);
    for (let i = 0; i < 60 * 6 && !events.some((e) => e.type === 'hit'); i++) d.update(DT, { ...NONE, throttle: 1, steer: i > 60 ? 1 : 0 });
    const hit = events.find((e) => e.type === 'hit') as Extract<EndlessEvent, { type: 'hit' }>;
    expect(hit).toBeDefined();
    expect(hit.kind).toBe('wall');
    expect(d.combo).toBe(0);
    expect(events.some((e) => e.type === 'surge')).toBe(true);
  });
});
