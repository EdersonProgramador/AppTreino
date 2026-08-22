export type RdpPoint = { lat: number; lng: number; t: number; ele?: number | null };

function perpendicularDistanceM(p: RdpPoint, a: RdpPoint, b: RdpPoint): number {
  const meanLat = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const x = (lng: number) => lng * Math.cos(meanLat) * 111_320;
  const y = (lat: number) => lat * 111_320;
  const ax = x(a.lng);
  const ay = y(a.lat);
  const bx = x(b.lng);
  const by = y(b.lat);
  const px = x(p.lng);
  const py = y(p.lat);
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Ramer–Douglas–Peucker — compacta o trajeto final.
 * epsilonM típico: WALK 4, RUN 6, RIDE 10.
 */
export function rdpCompress<T extends RdpPoint>(points: T[], epsilonM: number): T[] {
  if (points.length < 3) return points.slice();

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let maxDist = 0;
    let maxIdx = start;
    for (let i = start + 1; i < end; i += 1) {
      const d = perpendicularDistanceM(points[i], points[start], points[end]);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    if (maxDist > epsilonM) {
      keep[maxIdx] = 1;
      if (maxIdx - start > 1) stack.push([start, maxIdx]);
      if (end - maxIdx > 1) stack.push([maxIdx, end]);
    }
  }

  return points.filter((_, i) => keep[i] === 1);
}

export const RDP_EPSILON_M: Record<"RUN" | "WALK" | "RIDE", number> = {
  WALK: 4,
  RUN: 6,
  RIDE: 10
};
