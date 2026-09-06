/**
 * Single source of truth for the "sunset arcade" palette.
 * Hex numbers for three.js, hex strings for CSS/SVG. Keep the two in sync.
 */
export const PALETTE = {
  skyTop: 0x2b1a5e,
  skyMid: 0xa4408a,
  horizon: 0xff8a5b,
  sun: 0xffd166,
  sunGlow: 0xffb070,
  asphalt: 0x3a3548,
  asphaltDark: 0x2f2b3d,
  edgeLine: 0xf4f1ea,
  kerbRed: 0xff4d4d,
  kerbWhite: 0xfff4e6,
  grassA: 0x4c9f5e,
  grassB: 0x3f8a50,
  grassDry: 0x8fb35a,
  wallRed: 0xe63946,
  wallWhite: 0xf8f3ea,
  mountainNear: 0x4a2a6b,
  mountainFar: 0x6b3d86,
  treeGreen: 0x2f7a4f,
  treeDark: 0x245f3d,
  trunk: 0x6b3f2a,
  rock: 0x8a7f8f,
  player: 0xff5c4d,
  ai: [0x3fb6ff, 0xc8ff3d, 0xffb347, 0xb38cff, 0x5ee6c3],
  glass: 0x1a1030,
  tyre: 0x1c1826,
  headlight: 0xfff2c4,
  brakeLight: 0xff2d2d,
  smoke: 0xd9d4e3,
  dust: 0xc9a86a,
  spark: 0xffb347,
  boost: [0x3fb6ff, 0xff8a5b, 0xb38cff],
} as const;

export const CSS = {
  ink: '#0f0a1e',
  surface: '#1a1030',
  coral: '#ff5c4d',
  lime: '#c8ff3d',
  sun: '#ffd166',
  pink: '#ff7ab8',
  sky: '#3fb6ff',
  text: '#fff7ef',
  muted: '#b7a9c9',
} as const;

export function hex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}
