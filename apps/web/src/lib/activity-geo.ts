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
  if (!secPerKm || !Number.isFinite(secPerKm) || secPerKm <= 0 || secPerKm > 5999) return "--:--";
  const m = Math.floor(secPerKm / 60);
  const s = Math.floor(secPerKm % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatKm(meters: number | null | undefined) {
  return ((meters ?? 0) / 1000).toFixed(2);
}

export function formatMeters(meters: number | null | undefined) {
  return `${Math.round(Math.max(0, meters ?? 0))} m`;
}

export function formatGrade(percent: number | null | undefined) {
  if (percent == null || !Number.isFinite(percent)) return "0.0%";
  const clamped = Math.max(-45, Math.min(45, percent));
  const sign = clamped > 0.05 ? "+" : "";
  return `${sign}${clamped.toFixed(1)}%`;
}

const MET: Record<"RUN" | "WALK" | "RIDE", number> = {
  RUN: 9.8,
  WALK: 3.5,
  RIDE: 7.5
};

/** Estimativa local — o servidor recalcula no finish com o peso da avaliação. */
export function estimateCalories(
  sport: "RUN" | "WALK" | "RIDE",
  elapsedSeconds: number,
  weightKg = 70
) {
  const kg = weightKg > 30 && weightKg < 250 ? weightKg : 70;
  const hours = Math.max(0, elapsedSeconds) / 3600;
  return Math.round(MET[sport] * kg * hours);
}

const ELE_MIN_M = 0.8;
const ELE_SPIKE_M = 8;

export function liveElevation(points: Array<{ ele?: number | null }>) {
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]?.ele;
    const cur = points[i]?.ele;
    if (typeof prev !== "number" || typeof cur !== "number") continue;
    const delta = cur - prev;
    if (Math.abs(delta) > ELE_SPIKE_M) continue;
    if (delta > ELE_MIN_M) gain += delta;
    else if (delta < -ELE_MIN_M) loss += -delta;
  }
  return { gain, loss };
}

export function liveElapsedSeconds(
  activity: {
    startedAt: string;
    status: string;
    pauseMs?: number | null;
    pausedAt?: string | null;
  },
  now = Date.now()
) {
  const started = new Date(activity.startedAt).getTime();
  const pauseMs = activity.pauseMs ?? 0;
  if (!Number.isFinite(started)) return 0;
  const pausedAtMs = activity.pausedAt ? new Date(activity.pausedAt).getTime() : NaN;
  if (activity.status === "PAUSED" || activity.status === "COMPLETED" || activity.status === "FINISHED") {
    const until = Number.isFinite(pausedAtMs) ? pausedAtMs : now;
    return Math.max(0, Math.floor((until - started - pauseMs) / 1000));
  }
  return Math.max(0, Math.floor((now - started - pauseMs) / 1000));
}

export type LiveSplit = {
  kmIndex: number;
  metersInSplit: number;
  paceSecPerKm: number | null;
  completed: Array<{ km: number; paceSecPerKm: number; elapsedTime: number }>;
};

export function liveKmSplit(points: Array<{ lat: number; lng: number; t?: number }>): LiveSplit {
  const completed: LiveSplit["completed"] = [];
  if (points.length < 2) {
    return { kmIndex: 1, metersInSplit: 0, paceSecPerKm: null, completed };
  }

  let distance = 0;
  let splitStartDist = 0;
  let splitStartT = points[0].t ?? 0;
  let kmIndex = 1;

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    const segment = haversineMeters(prev, cur);
    if (segment <= 0) continue;
    const nextDist = distance + segment;
    const prevT = prev.t ?? 0;
    const curT = cur.t ?? prevT;

    while (nextDist - splitStartDist >= 1000) {
      const need = 1000 - (distance - splitStartDist);
      const ratio = Math.min(1, Math.max(0, need / segment));
      const splitEndT = prevT + (curT - prevT) * ratio;
      const splitMs = Math.max(1, splitEndT - splitStartT);
      completed.push({
        km: kmIndex,
        paceSecPerKm: splitMs / 1000,
        elapsedTime: Math.round(splitMs / 1000)
      });
      kmIndex += 1;
      splitStartDist += 1000;
      splitStartT = splitEndT;
      distance = splitStartDist;
    }
    distance = nextDist;
  }

  const metersInSplit = distance - splitStartDist;
  const lastT = points[points.length - 1].t ?? splitStartT;
  const splitMs = Math.max(0, lastT - splitStartT);
  const paceSecPerKm =
    metersInSplit >= 15 && splitMs > 0 ? splitMs / 1000 / (metersInSplit / 1000) : null;

  return { kmIndex, metersInSplit, paceSecPerKm, completed };
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

/** Inclinação recente (%): desnível / distância no último trecho (~60 m). */
export function liveGradePercent(
  points: Array<{ lat: number; lng: number; ele?: number | null }>,
  windowMeters = 60
): number | null {
  if (points.length < 2) return null;
  let dist = 0;
  let endEle: number | null = null;
  let startEle: number | null = null;
  for (let i = points.length - 1; i > 0; i -= 1) {
    const cur = points[i];
    const prev = points[i - 1];
    if (endEle == null && typeof cur.ele === "number") endEle = cur.ele;
    dist += haversineMeters(prev, cur);
    if (typeof prev.ele === "number") startEle = prev.ele;
    if (dist >= windowMeters && startEle != null && endEle != null) break;
  }
  if (endEle == null || startEle == null || dist < 12) return null;
  return ((endEle - startEle) / dist) * 100;
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

export const LAP_RADIUS_M = 32;

/** Distância mínima do ponto de partida antes de uma reentrada contar volta. */
export const LAP_MIN_EXIT_M = 48;

export type LapMarker = { lat: number; lng: number; radiusMeters?: number };
export type LapState = { away: boolean; count: number; maxAwayMeters?: number };

export function updateLapCrossing(
  marker: LapMarker,
  point: { lat: number; lng: number },
  state: LapState
): LapState & { completed: boolean } {
  const radius = marker.radiusMeters && marker.radiusMeters > 0 ? marker.radiusMeters : LAP_RADIUS_M;
  const dist = haversineMeters(marker, point);
  const inside = dist <= radius;
  const maxAway = Math.max(state.maxAwayMeters ?? 0, dist);
  const minExit = Math.max(radius * 1.5, LAP_MIN_EXIT_M);
  if (inside && maxAway >= minExit) {
    return { away: false, count: state.count + 1, completed: true, maxAwayMeters: 0 };
  }
  return { away: !inside, count: state.count, completed: false, maxAwayMeters: maxAway };
}

const STRIDE_M: Record<"RUN" | "WALK" | "RIDE", number> = {
  RUN: 0.82,
  WALK: 0.72,
  RIDE: 5.4
};

/** Passos (corrida/caminhada) ou pedaladas (ciclismo) a partir da distância. */
export function estimateMotionCount(sport: "RUN" | "WALK" | "RIDE", distanceMeters: number) {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return 0;
  return Math.max(0, Math.round(distanceMeters / STRIDE_M[sport]));
}
