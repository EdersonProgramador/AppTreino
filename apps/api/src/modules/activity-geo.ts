export type GpsPoint = {
  lat: number;
  lng: number;
  t: number;
  ele?: number | null;
  accuracy?: number | null;
};

export type OutdoorSportKind = "RUN" | "WALK" | "RIDE";

const EARTH_M = 6371000;
const MOVING_MIN_MPS = 0.4;
const GAP_MS = 8000;
const DEFAULT_KG = 70;

const MET: Record<OutdoorSportKind, number> = {
  RUN: 9.8,
  WALK: 3.5,
  RIDE: 7.5
};

export function haversineMeters(a: Pick<GpsPoint, "lat" | "lng">, b: Pick<GpsPoint, "lat" | "lng">) {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function sanitizePoints(raw: unknown): GpsPoint[] {
  if (!Array.isArray(raw)) return [];
  const points: GpsPoint[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    const t = Number(row.t);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(t)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    points.push({
      lat,
      lng,
      t,
      ele: Number.isFinite(Number(row.ele)) ? Number(row.ele) : null,
      accuracy: Number.isFinite(Number(row.accuracy)) ? Number(row.accuracy) : null
    });
  }
  return points.sort((a, b) => a.t - b.t);
}

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

export function sportLabel(sport: OutdoorSportKind) {
  if (sport === "WALK") return "Caminhada";
  if (sport === "RIDE") return "Ciclismo";
  return "Corrida";
}

export function activityTitle(sport: OutdoorSportKind, at = new Date()) {
  const hour = at.getHours();
  const moment =
    hour < 6 ? "noturna" : hour < 12 ? "matinal" : hour < 18 ? "da tarde" : "noturna";
  return `${sportLabel(sport)} ${moment}`;
}

export type KmSplit = {
  km: number;
  /** metros deste split (1000 ou parcial final) */
  distance: number;
  /** segundos decorridos no split */
  elapsedTime: number;
  averageSpeed: number;
  paceSecPerKm: number;
  elevationDifference: number;
  partial: boolean;
};

export type SplitsAnalysis = {
  splits: KmSplit[];
  bestKm: number | null;
  worstKm: number | null;
  bestPaceSecPerKm: number | null;
  worstPaceSecPerKm: number | null;
  avgCompletedPaceSecPerKm: number | null;
};

/** Splits métricos (estilo Strava) + parcial do último km. */
export function computeKmSplits(points: GpsPoint[]): KmSplit[] {
  if (points.length < 2) return [];
  const splits: KmSplit[] = [];
  let distance = 0;
  let splitStartDist = 0;
  let splitStartT = points[0].t;
  let splitStartEle = points[0].ele ?? 0;
  let kmIndex = 1;

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    const segment = haversineMeters(prev, cur);
    if (segment <= 0) continue;
    const nextDist = distance + segment;

    while (nextDist - splitStartDist >= 1000) {
      const need = 1000 - (distance - splitStartDist);
      const ratio = Math.min(1, Math.max(0, need / segment));
      const splitEndT = prev.t + (cur.t - prev.t) * ratio;
      const splitMs = Math.max(1, splitEndT - splitStartT);
      const elevEnd =
        typeof prev.ele === "number" && typeof cur.ele === "number"
          ? prev.ele + (cur.ele - prev.ele) * ratio
          : (cur.ele ?? splitStartEle);
      splits.push({
        km: kmIndex,
        distance: 1000,
        elapsedTime: Math.round(splitMs / 1000),
        averageSpeed: 1000 / (splitMs / 1000),
        paceSecPerKm: splitMs / 1000,
        elevationDifference: elevEnd - splitStartEle,
        partial: false
      });
      kmIndex += 1;
      splitStartDist += 1000;
      splitStartT = splitEndT;
      splitStartEle = elevEnd;
      distance = splitStartDist;
    }

    distance = nextDist;
    const dt = Math.max(0, cur.t - prev.t);
    void dt;
  }

  const remainder = distance - splitStartDist;
  if (remainder >= 25) {
    const last = points[points.length - 1];
    const splitMs = Math.max(1, last.t - splitStartT);
    const pace = (splitMs / 1000) / (remainder / 1000);
    splits.push({
      km: kmIndex,
      distance: Math.round(remainder * 10) / 10,
      elapsedTime: Math.round(splitMs / 1000),
      averageSpeed: remainder / (splitMs / 1000),
      paceSecPerKm: pace,
      elevationDifference: (last.ele ?? splitStartEle) - splitStartEle,
      partial: true
    });
  }

  return splits;
}

export function analyzeSplits(splits: KmSplit[]): SplitsAnalysis {
  const completed = splits.filter((s) => !s.partial && s.distance >= 950);
  if (!completed.length) {
    return {
      splits,
      bestKm: null,
      worstKm: null,
      bestPaceSecPerKm: null,
      worstPaceSecPerKm: null,
      avgCompletedPaceSecPerKm: null
    };
  }
  let best = completed[0];
  let worst = completed[0];
  let sumPace = 0;
  for (const split of completed) {
    sumPace += split.paceSecPerKm;
    if (split.paceSecPerKm < best.paceSecPerKm) best = split;
    if (split.paceSecPerKm > worst.paceSecPerKm) worst = split;
  }
  return {
    splits,
    bestKm: best.km,
    worstKm: worst.km,
    bestPaceSecPerKm: best.paceSecPerKm,
    worstPaceSecPerKm: worst.paceSecPerKm,
    avgCompletedPaceSecPerKm: sumPace / completed.length
  };
}

export type BestEffort = {
  label: string;
  distanceMeters: number;
  elapsedSeconds: number;
  paceSecPerKm: number;
  startIndex: number;
  endIndex: number;
};

const BEST_EFFORT_TARGETS: Array<{ label: string; meters: number }> = [
  { label: "400m", meters: 400 },
  { label: "1K", meters: 1000 },
  { label: "5K", meters: 5000 },
  { label: "10K", meters: 10000 },
  { label: "Half", meters: 21097 }
];

/** Melhores esforços por janela deslizante de distância. */
export function computeBestEfforts(points: GpsPoint[]): BestEffort[] {
  if (points.length < 2) return [];
  const prefix: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    prefix.push(prefix[i - 1]! + haversineMeters(points[i - 1]!, points[i]!));
  }
  const total = prefix[prefix.length - 1]!;
  const out: BestEffort[] = [];

  for (const target of BEST_EFFORT_TARGETS) {
    if (total < target.meters * 0.98) continue;
    let bestSec = Infinity;
    let bestStart = 0;
    let bestEnd = 0;
    let j = 0;
    for (let i = 0; i < points.length; i += 1) {
      while (j < points.length && prefix[j]! - prefix[i]! < target.meters) j += 1;
      if (j >= points.length) break;
      const sec = (points[j]!.t - points[i]!.t) / 1000;
      if (sec > 0 && sec < bestSec) {
        bestSec = sec;
        bestStart = i;
        bestEnd = j;
      }
    }
    if (!Number.isFinite(bestSec) || bestSec <= 0) continue;
    out.push({
      label: target.label,
      distanceMeters: target.meters,
      elapsedSeconds: Math.round(bestSec),
      paceSecPerKm: bestSec / (target.meters / 1000),
      startIndex: bestStart,
      endIndex: bestEnd
    });
  }
  return out;
}

/**
 * Potência estimada bike (modelo simples CdA/Crr/m*g*grade).
 * Retorna null se inputs inválidos.
 */
export function estimateBikePowerWatts(speedMps: number, grade: number, massKg = DEFAULT_KG): number | null {
  if (!Number.isFinite(speedMps) || speedMps < 1) return null;
  const g = 9.81;
  const crr = 0.005;
  const cda = 0.32;
  const rho = 1.225;
  const rolling = crr * massKg * g * speedMps;
  const gravity = massKg * g * grade * speedMps;
  const aero = 0.5 * cda * rho * speedMps ** 3;
  const watts = rolling + gravity + aero;
  if (!Number.isFinite(watts) || watts < 0) return Math.max(0, Math.round(watts));
  return Math.round(watts);
}

export function summarizeTrack(sport: OutdoorSportKind, points: GpsPoint[], pauseMs = 0) {
  if (points.length === 0) {
    return {
      distanceMeters: 0,
      elapsedSeconds: 0,
      movingSeconds: 0,
      avgPaceSecPerKm: null as number | null,
      avgSpeedMps: null as number | null,
      maxSpeedMps: 0,
      elevationGainMeters: 0,
      elevationLossMeters: 0,
      estimatedPowerWatts: null as number | null,
      calories: 0,
      splits: [] as KmSplit[],
      splitsAnalysis: analyzeSplits([]),
      bestEfforts: [] as BestEffort[],
      startLatlng: null as [number, number] | null,
      endLatlng: null as [number, number] | null
    };
  }

  const first = points[0];
  const last = points[points.length - 1];
  const elapsedMs = Math.max(0, last.t - first.t - pauseMs);
  let distance = 0;
  let movingMs = 0;
  let maxSpeed = 0;
  let elevationGain = 0;
  let elevationLoss = 0;
  let powerSum = 0;
  let powerN = 0;

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    const dt = Math.max(0, cur.t - prev.t);
    const d = haversineMeters(prev, cur);
    distance += d;
    const speed = dt > 0 ? d / (dt / 1000) : 0;
    if (speed > maxSpeed && speed < 25) maxSpeed = speed;
    if (dt > 0 && dt < GAP_MS && speed >= MOVING_MIN_MPS) movingMs += dt;
    if (typeof cur.ele === "number" && typeof prev.ele === "number") {
      const climb = cur.ele - prev.ele;
      if (climb > 0.4) elevationGain += climb;
      if (climb < -0.4) elevationLoss += -climb;
      if (sport === "RIDE" && d > 0.5 && dt > 0) {
        const grade = climb / d;
        const watts = estimateBikePowerWatts(speed, grade);
        if (watts != null) {
          powerSum += watts;
          powerN += 1;
        }
      }
    }
  }

  const splits = computeKmSplits(points);
  const splitsAnalysis = analyzeSplits(splits);
  const bestEfforts = computeBestEfforts(points);
  const elapsedSeconds = Math.max(0, Math.round(elapsedMs / 1000));
  const movingSeconds = Math.max(0, Math.round(movingMs / 1000));
  const avgSpeed = elapsedSeconds > 0 ? distance / elapsedSeconds : null;
  const avgPace = distance >= 20 ? elapsedSeconds / (distance / 1000) : null;
  const hours = Math.max(elapsedSeconds, movingSeconds) / 3600;
  const calories = Math.round(MET[sport] * DEFAULT_KG * Math.max(hours, 0));

  return {
    distanceMeters: distance,
    elapsedSeconds,
    movingSeconds,
    avgPaceSecPerKm: avgPace,
    avgSpeedMps: avgSpeed,
    maxSpeedMps: maxSpeed,
    elevationGainMeters: elevationGain,
    elevationLossMeters: elevationLoss,
    estimatedPowerWatts: powerN > 0 ? Math.round(powerSum / powerN) : null,
    calories,
    splits,
    splitsAnalysis,
    bestEfforts,
    startLatlng: [first.lat, first.lng] as [number, number],
    endLatlng: [last.lat, last.lng] as [number, number]
  };
}

export function buildStravaSummary(
  sport: OutdoorSportKind,
  startedAt: Date,
  points: GpsPoint[],
  pauseMs: number,
  extras?: { is3d?: boolean; mapType?: string; caption?: string | null }
) {
  const stats = summarizeTrack(sport, points, pauseMs);
  const type = sport === "WALK" ? "Walk" : sport === "RIDE" ? "Ride" : "Run";
  return {
    ...stats,
    name: activityTitle(sport, startedAt),
    type,
    sport_type: type,
    start_date: startedAt.toISOString(),
    start_date_local: startedAt.toISOString(),
    elapsed_time: stats.elapsedSeconds,
    moving_time: stats.movingSeconds,
    distance: Math.round(stats.distanceMeters * 10) / 10,
    average_speed: stats.avgSpeedMps,
    max_speed: stats.maxSpeedMps,
    average_pace: stats.avgPaceSecPerKm,
    total_elevation_gain: Math.round(stats.elevationGainMeters * 10) / 10,
    total_elevation_loss: Math.round(stats.elevationLossMeters * 10) / 10,
    average_watts: stats.estimatedPowerWatts,
    best_efforts: stats.bestEfforts,
    start_latlng: stats.startLatlng,
    end_latlng: stats.endLatlng,
    splits_metric: stats.splits,
    splitsAnalysis: stats.splitsAnalysis,
    map: {
      polyline: points.map((point) => ({ lat: point.lat, lng: point.lng, t: point.t, ele: point.ele ?? null })),
      is_3d: Boolean(extras?.is3d),
      map_type: extras?.mapType ?? "standard"
    },
    description: extras?.caption ?? null
  };
}
