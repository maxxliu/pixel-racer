/** Format milliseconds as m:ss.mmm (or ss.mmm without minutes when `short`). */
export function formatTime(ms: number, opts: { precision?: 2 | 3; blank?: boolean } = {}): string {
  const precision = opts.precision ?? 3;
  if (!Number.isFinite(ms) || ms < 0 || (opts.blank && ms === 0)) {
    return precision === 3 ? '--:--.---' : '--:--.--';
  }
  const total = Math.floor(ms);
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const frac = total % 1000;
  const fracStr = precision === 3
    ? frac.toString().padStart(3, '0')
    : Math.floor(frac / 10).toString().padStart(2, '0');
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${fracStr}`;
}

/** Signed delta, e.g. "+0.421" / "-1.203". */
export function formatDelta(ms: number): string {
  if (!Number.isFinite(ms)) return '';
  const sign = ms < 0 ? '-' : '+';
  const abs = Math.abs(ms);
  const seconds = Math.floor(abs / 1000);
  const frac = Math.floor(abs % 1000);
  return `${sign}${seconds}.${frac.toString().padStart(3, '0')}`;
}

export function formatTrackLength(lengthM: number): string {
  if (!Number.isFinite(lengthM)) return '?';
  if (lengthM >= 1000) return `${(lengthM / 1000).toFixed(2)} km`;
  return `${Math.round(lengthM)} m`;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
