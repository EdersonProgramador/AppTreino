import { cellToLatLng, latLngToCell as h3LatLngToCell } from "h3-js";

/** H3 real — res 9 ≈ 174m / res 11 ≈ 25m. */
export function latLngToCell(lat: number, lng: number, res: 9 | 11): string {
  return h3LatLngToCell(lat, lng, res);
}

export function uniqueCells(points: Array<{ lat: number; lng: number }>, res: 9 | 11): string[] {
  const set = new Set<string>();
  for (const p of points) set.add(latLngToCell(p.lat, p.lng, res));
  return [...set];
}

export function cellCenter(cell: string): { lat: number; lng: number } {
  const [lat, lng] = cellToLatLng(cell);
  return { lat, lng };
}
