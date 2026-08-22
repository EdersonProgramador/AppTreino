import { haversineMeters, type GpsPoint, type OutdoorSportKind } from "./activity-geo.js";

export type AntiCheatReport = {
  ok: boolean;
  flags: string[];
  maxImpliedSpeedMps: number;
  teleportCount: number;
  spikeCount: number;
  /** 0 limpo → 100 suspeito */
  score: number;
  source: "server" | "merged";
};

const MAX_SPEED_MPS: Record<OutdoorSportKind, number> = {
  WALK: 3.5,
  RUN: 9.0,
  RIDE: 25.0
};

const MAX_ACCEL_MPS2: Record<OutdoorSportKind, number> = {
  WALK: 3,
  RUN: 5,
  RIDE: 8
};

const TELEPORT_M = 80;
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

/** Normaliza flags legadas do client. */
export function normalizeAntiCheatFlags(flags: string[]): string[] {
  return [
    ...new Set(
      flags.map((f) => {
        if (f === "TELEPORT" || f === "TELEPORT_SPIKE") return "TELEPORT_PATTERN";
        if (f === "SPEED_SPIKE") return "SPEED_CAP_EXCEEDED";
        if (f === "ACCEL_SPIKE") return "ACCEL_SPIKES";
        return f;
      })
    )
  ];
}

/** Reavalia o track no servidor (não confia só no cliente). */
export function evaluateAntiCheat(sport: OutdoorSportKind, points: GpsPoint[]): AntiCheatReport {
  const flags: string[] = [];
  let maxImplied = 0;
  let teleportCount = 0;
  let spikeCount = 0;

  if (points.length < 2) {
    return {
      ok: true,
      flags,
      maxImpliedSpeedMps: 0,
      teleportCount: 0,
      spikeCount: 0,
      score: 0,
      source: "server"
    };
  }

  let prevSpeed = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const dt = Math.max(0.001, (b.t - a.t) / 1000);
    const dist = haversineMeters(a, b);
    const implied = dist / dt;
    maxImplied = Math.max(maxImplied, implied);

    if (dt < 2 && dist > TELEPORT_M) teleportCount += 1;

    const accel = Math.abs(implied - prevSpeed) / dt;
    if (accel > MAX_ACCEL_MPS2[sport] * 2.5 && dist > 5) spikeCount += 1;
    prevSpeed = implied;
  }

  if (maxImplied > MAX_SPEED_MPS[sport] * 1.35) flags.push("SPEED_CAP_EXCEEDED");
  if (teleportCount >= 3) flags.push("TELEPORT_PATTERN");
  if (spikeCount >= 8) flags.push("ACCEL_SPIKES");

  const jitter = points.filter((p) => (p.accuracy ?? 0) > 25).length;
  if (jitter > points.length * 0.45 && points.length > 40) flags.push("POOR_GPS_QUALITY");

  const unique = [...new Set(flags)];
  return {
    ok: unique.length === 0,
    flags: unique,
    maxImpliedSpeedMps: maxImplied,
    teleportCount,
    spikeCount,
    score: scoreFrom(unique, teleportCount, spikeCount),
    source: "server"
  };
}

export function mergeAntiCheat(
  server: AntiCheatReport,
  client?: { ok?: boolean; flags?: string[]; score?: number } | null
): AntiCheatReport {
  const flags = normalizeAntiCheatFlags([...(server.flags ?? []), ...(client?.flags ?? [])]);
  const score = Math.max(server.score, client?.score ?? 0, scoreFrom(flags, server.teleportCount, server.spikeCount));
  return {
    ...server,
    flags,
    score,
    ok: flags.length === 0 && score < 30,
    source: "merged"
  };
}

/** Flags graves → bloqueia publicação no feed (atividade ainda é salva). */
export function shouldBlockPublish(report: AntiCheatReport): boolean {
  return report.score >= 60 || report.flags.some((flag) => HARD_FLAGS.has(flag));
}

export function shouldQuarantine(report: AntiCheatReport): boolean {
  return shouldBlockPublish(report);
}

export function antiCheatUserMessage(report: AntiCheatReport): string | null {
  if (report.ok) return null;
  if (shouldBlockPublish(report)) {
    return "GPS inconsistente: atividade salva, mas não publicada no feed.";
  }
  return "Atividade salva com avisos de qualidade do GPS.";
}
