/**
 * Every knob of the endless mode in one place. Distances are metres, times seconds,
 * speeds m/s. Values are starting points; tune by playing.
 */
export const ENDLESS_TUNING = {
  /** Arc length between centreline samples. */
  spacing: 2,
  /** Road kept generated ahead of / behind the player. */
  windowAhead: 600,
  windowBehind: 120,
  /** Opening straight so the first seconds are a clean launch (the grid sits inside it). */
  openingStraight: 240,
  /** Where the player starts along the road; the rival starts `rivalStartGap` behind. */
  playerStart: 70,
  openingWidth: 16,
  /** Heading is confined to this cone around +Z so the road never folds back. */
  headingCone: (70 * Math.PI) / 180,
  headingBiasFrom: (40 * Math.PI) / 180,
  minRadius: 32,
  /** Curvature ramps in/out over this length at each end of an arc. */
  rampMin: 8,
  rampMax: 14,
  /** Distance thresholds for difficulty bands 1..4 (band 0 below the first). */
  bandDistances: [280, 800, 1600, 2800],

  // --- obstacles ---
  clearLane: 4.4,
  /** Minimum gap between obstacle patterns per band. */
  patternSpacing: [90, 75, 62, 50, 45],
  /** Speed used for the reaction-distance floor per band: gap ≥ reactionTime·v + reactionBase. */
  expectedSpeed: [30, 36, 42, 46, 50],
  reactionTime: 0.7,
  reactionBase: 15,
  /** At bands ≥ 3 every Nth pattern slot is left empty as a breather. */
  restEvery: 4,
  /** No obstacles in the first metres of a run. */
  quietStart: 250,
  /** Below this band obstacles avoid corners tighter than `blindCurvature`. */
  cornerBand: 2,
  blindCurvature: 0.02,
  /** A boost pad roughly every this many metres. */
  boostCadence: 700,
  nearMissDistance: 1.0,
  nearMissSpeed: 20,

  // --- rival ---
  // Mistake budget: the rival lives on your bumper. With the early comfort gap of 10 m a cone
  // clip costs ~5 m (surge plus the speed you lose) and takes ~20 s to win back, leaving it on
  // your door; a second clip before then is a pass. A block or hard wall hit is a pass from
  // anywhere. Late in the run the comfort gap is 4 m and any touch is fatal.
  rivalStartGap: 16,
  pressureDistance: 3000,
  pressureMax: 1.3,
  desiredGapStart: 10,
  desiredGapEnd: 4,
  desiredGapFloor: 2.5,
  /** The rival is never further back than this, whatever the player does. */
  maxGap: 50,
  /** Player speed low-pass (s) the rival paces itself against: short, so braking for a corner costs little but a crash does. */
  refTau: 0.6,
  rivalTau: 0.45,
  rivalAccel: 22,
  paceMaxStart: 66,
  paceMaxEnd: 84,
  /** Rival cornering: lateral grip budget (m/s²) and braking used to plan corner speed. */
  rivalLatAccel: 11,
  rivalBrake: 22,
  /** Extra corner grip while surging or committed to a pass, so a mistake in a corner still costs you. */
  surgeGrip: 2.2,
  closeRateStart: 1.8,
  closeRateEnd: 2.8,
  recedeRateStart: 0.05,
  recedeRateEnd: 0.02,
  recedeFloor: 0.7,
  /** Beyond comfort + leashExtra the closing rate doubles; beyond comfort + 50 it triples. */
  leashExtra: 10,
  // (the rival's speed filter realises roughly two thirds of a surge)
  surgeLight: { speed: 6, time: 1.2 },
  surgeHeavy: { speed: 13, time: 1.8 },
  heavyImpact: 6,
  /** Caught when the rival's centre is this far ahead of the player's (negative = it has passed you). */
  overtakeDistance: -1.5,
  /** Under this gap the rival pulls alongside and, once there, stops receding for `commitTime`. */
  overtakeGap: 6,
  commitGap: 3,
  commitTime: 1.5,
  startGrace: 4,
  closingWarnGap: 7,

  // --- scoring ---
  nearMissPoints: 100,
  boostPadPoints: 50,
  driftPointsPerTier: 30,
  comboPerTier: 3,
  maxMultiplier: 8,
  comboLostMin: 3,
  milestoneEvery: 500,

  // --- feel ---
  hitStopSteps: 4,
  captureSlowMo: 0.3,
  captureSlowMoTime: 1.2,
} as const;

export type EndlessTuning = typeof ENDLESS_TUNING;

/** Difficulty band 0..4 for a distance along the road. */
export function bandAt(s: number, t: EndlessTuning = ENDLESS_TUNING): number {
  let band = 0;
  for (const d of t.bandDistances) if (s >= d) band++;
  return band;
}

export function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, u));
}

export function smoothstep(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
}
