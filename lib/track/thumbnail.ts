import type { TrackWaypoint } from '@/lib/game/types';

/**
 * Server-safe SVG thumbnail from waypoints. Output contains only numeric
 * attributes and fixed colours, so it is safe to inline.
 */
export function generateThumbnailSvg(waypoints: TrackWaypoint[], size = 200): string {
  const pts = waypoints.filter((w) => Number.isFinite(w.x) && Number.isFinite(w.z));
  if (pts.length < 3) return '';
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const pad = 14;
  const w = maxX - minX + pad * 2;
  const h = maxZ - minZ + pad * 2;
  const f = (n: number) => (Math.round(n * 10) / 10).toString();
  const d = `M ${f(pts[0].x)} ${f(pts[0].z)} ` + pts.slice(1).map((p) => `L ${f(p.x)} ${f(p.z)}`).join(' ') + ' Z';
  const avgWidth = pts.reduce((a, p) => a + (Number.isFinite(p.width) ? p.width : 12), 0) / pts.length;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(minX - pad)} ${f(minZ - pad)} ${f(w)} ${f(h)}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet">` +
    `<rect x="${f(minX - pad)}" y="${f(minZ - pad)}" width="${f(w)}" height="${f(h)}" fill="#1a1030"/>` +
    `<path d="${d}" fill="none" stroke="#3a3548" stroke-width="${f(avgWidth)}" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="#fff7ef" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.6"/>` +
    `<circle cx="${f(pts[0].x)}" cy="${f(pts[0].z)}" r="${f(Math.max(3, avgWidth * 0.35))}" fill="#c8ff3d"/>` +
    `</svg>`
  );
}
