import type { Sport } from "../types";
import { haversineMeters } from "../geo";
import { MAX_SPEED_MPS } from "./NoiseGates";

export type CheatPoint = {
  lat: number;
  lng: number;
  t: number;
  speedMps?: number | null;
  accuracyM?: number | null;
};

/** Flags alinhadas ao servidor (`activity-anti-cheat.ts`). */
export type AntiCheatReport = {
  ok: boolean;
  flags: string[];
  maxImpliedSpeedMps: number;
  teleportCount: number;
  spikeCount: number;
  /** 0 = limpo, 100 = altamente suspeito */
  score: number;
};

const TELEPORT_M = 80;
const MAX_ACCEL_MPS2: Record<Sport, number> = {
  WALK: 3,
  RUN: 5,
  RIDE: 8
};

const HARD_FLAGS = new Set(["SPEED_CAP_EXCEEDED", "TELEPORT_PATTERN"]);

function scoreFrom(flags: string[], teleportCount: number, spikeCount: number): number {
  let score = 0;
  if (flags.includes("SPEED_CAP_EXCEEDED")) score += 45;
  if (flags.includes("TELEPORT_PATTERN")) score += 40;
  if (flags.includes("ACCEL_SPIKES")) score += 15;
  if (flags.includes("POOR_GPS_QUALITY")) score += 10;
  score += Math.min(20, teleportCount * 4 + spikeCount);
  return Math.min(100, score);
}

export function evaluateAntiCheat(sport: Sport, points: CheatPoint[]): AntiCheatReport {
  const flags: string[] = [];
  let maxImplied = 0;
  let teleportCount = 0;
  let spikeCount = 0;

  if (points.length < 2) {
    return { ok: true, flags, maxImpliedSpeedMps: 0, teleportCount: 0, spikeCount: 0, score: 0 };
  }

  let prevSpeed = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const dt = Math.max(0.001, (b.t - a.t) / 1000);
    const dist = haversineMeters(a, b);
    const implied = dist / dt;
    maxImplied = Math.max(maxImplied, implied);

    if (dist > TELEPORT_M && dt < 2) teleportCount += 1;

    const accel = Math.abs(implied - prevSpeed) / dt;
    if (accel > MAX_ACCEL_MPS2[sport] * 2.5 && dist > 5) spikeCount += 1;
    prevSpeed = implied;
  }

  if (maxImplied > MAX_SPEED_MPS[sport] * 1.35) flags.push("SPEED_CAP_EXCEEDED");
  if (teleportCount >= 3) flags.push("TELEPORT_PATTERN");
  if (spikeCount >= 8) flags.push("ACCEL_SPIKES");

  const jitter = points.filter((p) => (p.accuracyM ?? 0) > 25).length;
  if (jitter > points.length * 0.45 && points.length > 40) flags.push("POOR_GPS_QUALITY");

  const unique = [...new Set(flags)];
  const score = scoreFrom(unique, teleportCount, spikeCount);
  return {
    ok: unique.length === 0,
    flags: unique,
    maxImpliedSpeedMps: maxImplied,
    teleportCount,
    spikeCount,
    score
  };
}

export function shouldQuarantine(report: AntiCheatReport): boolean {
  return report.score >= 60 || report.flags.some((f) => HARD_FLAGS.has(f));
}
