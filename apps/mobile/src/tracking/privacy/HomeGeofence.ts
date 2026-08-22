import { haversineMeters } from "../geo";

export type GeoPoint = { lat: number; lng: number; t: number; ele?: number | null };

export type HomeFence = {
  lat: number;
  lng: number;
  radiusM: number;
};

export const DEFAULT_HOME_RADIUS_M = 500;

export function applyHomeGeofence<T extends GeoPoint>(
  points: T[],
  home: HomeFence | null,
  mode: "drop" | "mask" = "drop"
): { points: T[]; maskedCount: number } {
  if (!home || !points.length) return { points: points.slice(), maskedCount: 0 };

  let maskedCount = 0;
  const out: T[] = [];
  for (const p of points) {
    const d = haversineMeters(p, home);
    if (d <= home.radiusM) {
      maskedCount += 1;
      if (mode === "mask") {
        const bearing = Math.random() * Math.PI * 2;
        const lat = home.lat + ((home.radiusM + 30) * Math.cos(bearing)) / 111_320;
        const lng =
          home.lng +
          ((home.radiusM + 30) * Math.sin(bearing)) / (111_320 * Math.cos((home.lat * Math.PI) / 180));
        out.push({ ...p, lat, lng });
      }
      continue;
    }
    out.push(p);
  }
  return { points: out, maskedCount };
}
