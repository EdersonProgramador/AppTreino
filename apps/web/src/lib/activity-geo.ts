export function formatClock(totalSeconds: number) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${String(h).padStart(2, "0")}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatPace(secPerKm: number | null | undefined) {
  if (!secPerKm || !Number.isFinite(secPerKm) || secPerKm <= 0 || secPerKm > 3600) return "--:--";
  const m = Math.floor(secPerKm / 60);
  const s = Math.floor(secPerKm % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatKm(meters: number | null | undefined) {
  return ((meters ?? 0) / 1000).toFixed(2);
}

const EARTH_M = 6371000;

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function liveDistance(points: Array<{ lat: number; lng: number }>) {
  let distance = 0;
  for (let i = 1; i < points.length; i += 1) distance += haversineMeters(points[i - 1], points[i]);
  return distance;
}

export function liveSpeedKmh(points: Array<{ lat: number; lng: number; t?: number }>) {
  if (points.length < 2) return 0;
  const last = points[points.length - 1];
  const from = points[Math.max(0, points.length - 6)];
  const meters = liveDistance(points.slice(Math.max(0, points.length - 6)));
  const dt = Math.max(0, (last.t ?? 0) - (from.t ?? 0)) / 1000;
  if (dt < 0.8) return 0;
  return (meters / dt) * 3.6;
}

export const LAP_RADIUS_M = 22;

export type LapMarker = { lat: number; lng: number; radiusMeters?: number };
export type LapState = { away: boolean; count: number };

export function updateLapCrossing(
  marker: LapMarker,
  point: { lat: number; lng: number },
  state: LapState
): LapState & { completed: boolean } {
  const radius = marker.radiusMeters && marker.radiusMeters > 0 ? marker.radiusMeters : LAP_RADIUS_M;
  const inside = haversineMeters(marker, point) <= radius;
  if (inside && state.away) {
    return { away: false, count: state.count + 1, completed: true };
  }
  if (!inside && !state.away) {
    return { away: true, count: state.count, completed: false };
  }
  return { away: state.away, count: state.count, completed: false };
}
