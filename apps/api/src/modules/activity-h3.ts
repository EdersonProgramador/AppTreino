import {
  cellToLatLng as h3CellToLatLng,
  gridDisk,
  isValidCell,
  latLngToCell as h3LatLngToCell
} from "h3-js";

/** H3 real (Uber) — res 9 ≈ 174m / res 11 ≈ 25m de aresta. */
export function latLngToCell(lat: number, lng: number, res: 9 | 11 = 9): string {
  return h3LatLngToCell(lat, lng, res);
}

/** Centro da célula H3 (heatmap). Aceita também legado `h9:x:y`. */
export function cellToLatLng(cell: string): { lat: number; lng: number } | null {
  if (isValidCell(cell)) {
    const [lat, lng] = h3CellToLatLng(cell);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }

  const match = /^h(9|11):(-?\d+):(-?\d+)$/.exec(cell);
  if (!match) return null;
  const res = Number(match[1]) as 9 | 11;
  const x = Number(match[2]);
  const y = Number(match[3]);
  const size = res === 9 ? 174 : 25;
  const lat = ((y + 0.5) * size) / 111_320;
  const xCenter = y % 2 === 0 ? x + 0.5 : x;
  const lng = (xCenter * size) / (111_320 * Math.cos((lat * Math.PI) / 180));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/** Anel de vizinhos H3 (k=1 ≈ ~7 células). */
export function cellDisk(cell: string, k = 1): string[] {
  if (!isValidCell(cell)) return [cell];
  try {
    return gridDisk(cell, k);
  } catch {
    return [cell];
  }
}
