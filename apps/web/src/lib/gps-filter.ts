/** Filtro GPS para atividade outdoor na web (paridade com o mobile). */

export type OutdoorSportKind = "RUN" | "WALK" | "RIDE";

export type RawGpsFix = {
  t: number;
  lat: number;
  lng: number;
  ele: number | null;
  accuracyM: number | null;
  speedMps: number | null;
};

export type AcceptedGpsPoint = {
  lat: number;
  lng: number;
  t: number;
  ele: number | null;
  accuracy: number | null;
};

export const GPS_CALIBRATION = {
  maxAccuracyM: 25,
  maxSpeedMps: {
    WALK: 3.5,
    RUN: 9.0,
    RIDE: 25.0
  } as Record<OutdoorSportKind, number>,
  duplicateJitterM: 0.4,
  duplicateJitterSec: 0.35,
  minDistanceStepM: 0.6
} as const;

const EARTH_M = 6_371_000;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

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

export function noiseRejectReason(
  sport: OutdoorSportKind,
  fix: RawGpsFix,
  prev?: RawGpsFix | null
): string | null {
  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lng)) return "INVALID_COORDS";
  if (Math.abs(fix.lat) > 90 || Math.abs(fix.lng) > 180) return "OUT_OF_BOUNDS";
  // Primeiro lock costuma vir com 20–40 m; o restante exige o teto de calibração.
  const maxAccuracy = prev ? GPS_CALIBRATION.maxAccuracyM : GPS_CALIBRATION.maxAccuracyM * 2.5;
  if (fix.accuracyM != null && fix.accuracyM > maxAccuracy) return "BAD_ACCURACY";
  if (!prev) return null;
  if (fix.t < prev.t) return "OUT_OF_ORDER";

  const dtSec = Math.max(0.001, (fix.t - prev.t) / 1000);
  const dist = haversineMeters(prev, fix);
  if (dist < GPS_CALIBRATION.duplicateJitterM && dtSec < GPS_CALIBRATION.duplicateJitterSec) {
    return "DUPLICATE_JITTER";
  }

  const implied = dist / dtSec;
  if (implied > GPS_CALIBRATION.maxSpeedMps[sport] * 1.15) return "IMPOSSIBLE_SPEED";
  return null;
}

/** Kalman CV 2D (lat/lng) + speed 1D. R cresce com accuracy GPS. */
export class GeoKalmanFilter {
  private lat = 0;
  private lng = 0;
  private vLat = 0;
  private vLng = 0;
  private speed = 0;
  private initialized = false;
  private lastT = 0;

  reset(fix?: RawGpsFix) {
    if (!fix) {
      this.initialized = false;
      return;
    }
    this.lat = fix.lat;
    this.lng = fix.lng;
    this.vLat = 0;
    this.vLng = 0;
    this.speed = Math.max(0, fix.speedMps ?? 0);
    this.initialized = true;
    this.lastT = fix.t;
  }

  update(fix: RawGpsFix): { lat: number; lng: number; speedMps: number } {
    if (!this.initialized) {
      this.reset(fix);
      return { lat: fix.lat, lng: fix.lng, speedMps: Math.max(0, fix.speedMps ?? 0) };
    }

    const dt = clamp((fix.t - this.lastT) / 1000, 0.05, 5);
    let lat = this.lat + this.vLat * dt;
    let lng = this.lng + this.vLng * dt;
    let vLat = this.vLat;
    let vLng = this.vLng;
    let speed = this.speed;

    const accuracy = fix.accuracyM ?? 10;
    const kPos = clamp(1 / (1 + accuracy / 8), 0.08, 0.85);
    const kVel = clamp(kPos * 0.65, 0.05, 0.55);

    const measVLat = (fix.lat - this.lat) / dt;
    const measVLng = (fix.lng - this.lng) / dt;

    lat += kPos * (fix.lat - lat);
    lng += kPos * (fix.lng - lng);
    vLat += kVel * (measVLat - vLat);
    vLng += kVel * (measVLng - vLng);

    const mLat = 111_320;
    const mLng = 111_320 * Math.cos((lat * Math.PI) / 180);
    const speedFromVel = Math.sqrt((vLat * mLat) ** 2 + (vLng * mLng) ** 2);
    const measSpeed = fix.speedMps != null && fix.speedMps >= 0 ? fix.speedMps : speedFromVel;
    const kSpeed = clamp(kPos * 0.7, 0.05, 0.6);
    speed = Math.max(0, speed + kSpeed * (measSpeed - speed));

    this.lat = lat;
    this.lng = lng;
    this.vLat = vLat;
    this.vLng = vLng;
    this.speed = speed;
    this.lastT = fix.t;
    return { lat, lng, speedMps: speed };
  }
}

export type PipelineResult =
  | { accepted: false; reason: string }
  | {
      accepted: true;
      point: AcceptedGpsPoint;
      speedMps: number;
      distanceDeltaM: number;
    };

/** NoiseGates → Kalman → Δdistância mínima. */
export class WebGpsPipeline {
  private kalman = new GeoKalmanFilter();
  private prevRaw: RawGpsFix | null = null;
  private prevFiltered: { lat: number; lng: number; t: number } | null = null;

  reset() {
    this.kalman.reset();
    this.prevRaw = null;
    this.prevFiltered = null;
  }

  warmStart(lat: number, lng: number, t: number) {
    this.kalman.reset({
      t,
      lat,
      lng,
      ele: null,
      accuracyM: 8,
      speedMps: 0
    });
    this.prevFiltered = { lat, lng, t };
  }

  process(sport: OutdoorSportKind, raw: RawGpsFix): PipelineResult {
    const reject = noiseRejectReason(sport, raw, this.prevRaw);
    if (reject) return { accepted: false, reason: reject };
    this.prevRaw = raw;

    const filtered = this.kalman.update(raw);
    let distanceDeltaM = 0;
    if (this.prevFiltered) {
      distanceDeltaM = haversineMeters(this.prevFiltered, filtered);
      if (distanceDeltaM < GPS_CALIBRATION.minDistanceStepM) distanceDeltaM = 0;
    }
    this.prevFiltered = { lat: filtered.lat, lng: filtered.lng, t: raw.t };

    return {
      accepted: true,
      point: {
        lat: filtered.lat,
        lng: filtered.lng,
        t: raw.t,
        ele: raw.ele,
        accuracy: raw.accuracyM
      },
      speedMps: filtered.speedMps,
      distanceDeltaM
    };
  }
}

export function fixFromGeolocation(pos: GeolocationPosition): RawGpsFix {
  const c = pos.coords;
  return {
    t: pos.timestamp || Date.now(),
    lat: c.latitude,
    lng: c.longitude,
    ele: Number.isFinite(c.altitude) ? c.altitude : null,
    accuracyM: Number.isFinite(c.accuracy) ? c.accuracy : null,
    speedMps: Number.isFinite(c.speed) && (c.speed as number) >= 0 ? (c.speed as number) : null
  };
}
