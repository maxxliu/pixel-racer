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
  /** Opening straight so the first seconds are a clean launch. */
  openingStraight: 160,
  openingWidth: 16,
  /** Heading is confined to this cone around +Z so the road never folds back. */
  headingCone: (70 * Math.PI) / 180,
  headingBiasFrom: (40 * Math.PI) / 180,
  minRadius: 32,
  /** Curvature ramps in/out over this length at each end of an arc. */
  rampMin: 8,
  rampMax: 14,
  /** Distance thresholds for difficulty bands 1..4 (band 0 below the first). */
  bandDistances: [500, 1500, 3000, 5500],

  // --- obstacles ---
  clearLane: 4.4,
  /** Minimum gap between obstacle patterns per band. */
  patternSpacing: [110, 95, 80, 65, 55],
  /** Speed used for the reaction-distance floor per band. */
  expectedSpeed: [30, 36, 42, 46, 50],
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
  rivalStartGap: 60,
  pressureDistance: 7000,
  pressureMax: 1.25,
  desiredGapStart: 40,
  desiredGapEnd: 8,
  desiredGapFloor: 3,
  /** Player speed low-pass (s) the rival paces itself against. */
  refTau: 2.5,
  rivalTau: 1.2,
  rivalAccel: 10,
  paceMaxStart: 50,
  paceMaxEnd: 75,
  closeRateStart: 0.5,
  closeRateEnd: 1.2,
  recedeRateStart: 0.15,
  recedeRateEnd: 0.05,
  recedeFloor: 0.7,
  leashExtra: 45,
  surgeLight: { speed: 6, time: 1.5 },
  surgeHeavy: { speed: 10, time: 2.0 },
  heavyImpact: 6,
  catchDistance: 3.5,
  startGrace: 4,
  closingWarnGap: 15,

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
