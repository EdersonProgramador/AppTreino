import type { RawFix, Sport } from "../types";
import { haversineMeters } from "../geo";
import { FIELD_CALIBRATION } from "../fieldCalibration";

export const MAX_ACCURACY_M = FIELD_CALIBRATION.maxAccuracyM;
export const MAX_SPEED_MPS = FIELD_CALIBRATION.maxSpeedMps;

/** Retorna motivo de rejeição ou null se o fix é válido. */
export function noiseRejectReason(sport: Sport, fix: RawFix, prev?: RawFix | null): string | null {
  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lng)) return "INVALID_COORDS";
  if (Math.abs(fix.lat) > 90 || Math.abs(fix.lng) > 180) return "OUT_OF_BOUNDS";
  if (fix.accuracyM != null && fix.accuracyM > MAX_ACCURACY_M) return "BAD_ACCURACY";
  if (!prev) return null;
  if (fix.t < prev.t) return "OUT_OF_ORDER";

  const dtSec = Math.max(0.001, (fix.t - prev.t) / 1000);
  const dist = haversineMeters(prev, fix);
  if (dist < FIELD_CALIBRATION.duplicateJitterM && dtSec < FIELD_CALIBRATION.duplicateJitterSec) {
    return "DUPLICATE_JITTER";
  }

  const implied = dist / dtSec;
  if (implied > MAX_SPEED_MPS[sport] * 1.15) return "IMPOSSIBLE_SPEED";
  return null;
}
