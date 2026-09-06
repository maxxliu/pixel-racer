/**
 * Pure 2D collision helpers (xz plane). No three.js so they are unit-testable.
 */
export interface Segment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Unit normal pointing toward the drivable side of the wall. */
  nx: number;
  nz: number;
}

export interface CircleHit {
  /** Penetration depth (> 0 when overlapping). */
  depth: number;
  /** Push-out direction (unit), same as segment normal. */
  nx: number;
  nz: number;
  /** Closest point on the segment. */
  px: number;
  pz: number;
}

export function closestPointOnSegment(
  px: number, pz: number,
  ax: number, az: number,
  bx: number, bz: number,
): { x: number; z: number; t: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-9) return { x: ax, z: az, t: 0 };
  let t = ((px - ax) * dx + (pz - az) * dz) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: ax + dx * t, z: az + dz * t, t };
}

/** Circle vs. a one-sided wall segment. Only reports hits from the drivable side. */
export function circleVsSegment(
  cx: number, cz: number, radius: number, seg: Segment,
): CircleHit | null {
  const cp = closestPointOnSegment(cx, cz, seg.ax, seg.az, seg.bx, seg.bz);
  const dx = cx - cp.x;
  const dz = cz - cp.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist >= radius) return null;
  // Signed side: positive when the centre is on the drivable side.
  const side = dx * seg.nx + dz * seg.nz;
  if (dist > 1e-6 && side < -radius * 0.5) return null; // fully behind the wall
  return { depth: radius - dist, nx: seg.nx, nz: seg.nz, px: cp.x, pz: cp.z };
}

/**
 * Swept circle vs. wall: catches a probe that crossed the wall plane between two
 * positions in one step (tunnelling at high speed). Returns a hit that pushes the
 * circle back to the drivable side, or null when it did not cross.
 */
export function sweptCircleVsSegment(
  prevX: number, prevZ: number,
  cx: number, cz: number, radius: number, seg: Segment,
): CircleHit | null {
  const sidePrev = (prevX - seg.ax) * seg.nx + (prevZ - seg.az) * seg.nz;
  const sideNow = (cx - seg.ax) * seg.nx + (cz - seg.az) * seg.nz;
  if (sidePrev < -radius * 0.5 || sideNow >= radius) return null; // was already behind, or is still clear
  if (sideNow >= 0 && sideNow >= radius) return null;
  // where the path meets the wall plane
  const denom = sidePrev - sideNow;
  const t = denom > 1e-9 ? Math.min(1, Math.max(0, sidePrev / denom)) : 0;
  const ix = prevX + (cx - prevX) * t;
  const iz = prevZ + (cz - prevZ) * t;
  const cp = closestPointOnSegment(ix, iz, seg.ax, seg.az, seg.bx, seg.bz);
  const along = Math.hypot(cp.x - ix, cp.z - iz);
  if (along > radius) return null; // crossed the plane beyond the segment's ends
  return { depth: radius - sideNow, nx: seg.nx, nz: seg.nz, px: cp.x, pz: cp.z };
}

export function circleVsCircle(
  ax: number, az: number, ar: number,
  bx: number, bz: number, br: number,
): { depth: number; nx: number; nz: number } | null {
  const dx = bx - ax;
  const dz = bz - az;
  const d2 = dx * dx + dz * dz;
  const r = ar + br;
  if (d2 >= r * r) return null;
  const d = Math.sqrt(d2);
  if (d < 1e-6) return { depth: r, nx: 1, nz: 0 };
  return { depth: r - d, nx: dx / d, nz: dz / d };
}

/** Uniform grid spatial hash for static segments. */
export class SegmentHash {
  private cells = new Map<string, number[]>();
  constructor(public readonly segments: Segment[], private readonly cellSize = 12) {
    segments.forEach((s, i) => {
      const minX = Math.min(s.ax, s.bx) - 2, maxX = Math.max(s.ax, s.bx) + 2;
      const minZ = Math.min(s.az, s.bz) - 2, maxZ = Math.max(s.az, s.bz) + 2;
      for (let cx = Math.floor(minX / cellSize); cx <= Math.floor(maxX / cellSize); cx++) {
        for (let cz = Math.floor(minZ / cellSize); cz <= Math.floor(maxZ / cellSize); cz++) {
          const key = `${cx},${cz}`;
          const list = this.cells.get(key);
          if (list) list.push(i); else this.cells.set(key, [i]);
        }
      }
    });
  }

  /** Indices of segments whose cell overlaps a circle. May contain duplicates. */
  query(x: number, z: number, radius: number, out: number[] = []): number[] {
    out.length = 0;
    const c = this.cellSize;
    for (let cx = Math.floor((x - radius) / c); cx <= Math.floor((x + radius) / c); cx++) {
      for (let cz = Math.floor((z - radius) / c); cz <= Math.floor((z + radius) / c); cz++) {
        const list = this.cells.get(`${cx},${cz}`);
        if (list) for (const i of list) out.push(i);
      }
    }
    return out;
  }
}
