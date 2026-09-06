export type GpsScaleTierDefinition = {
  id: "phase1" | "phase2" | "phase3";
  label: string;
  settingKey: string;
  defaultLimit: number;
  infraSummary: string;
};

/** Capacidade alvo de corredores GPS simultâneos (LIVE/PAUSED) por fase de infra. */
export const GPS_SCALE_TIER_DEFINITIONS: GpsScaleTierDefinition[] = [
  {
    id: "phase1",
    label: "Fase 1",
    settingKey: "gps_scale_limit_phase1",
    defaultLimit: 1000,
    infraSummary: "Render Standard, fila no finish, /points incremental"
  },
  {
    id: "phase2",
    label: "Fase 2",
    settingKey: "gps_scale_limit_phase2",
    defaultLimit: 5000,
    infraSummary: "Point chunks, ingest separado, Neon Business"
  },
  {
    id: "phase3",
    label: "Fase 3",
    settingKey: "gps_scale_limit_phase3",
    defaultLimit: 10000,
    infraSummary: "Auto-scale, fila Mapbox, ingest dedicado"
  }
];

export type GpsScaleTierStatus = "ok" | "warning" | "critical";

export type GpsScaleTierProgress = {
  id: GpsScaleTierDefinition["id"];
  label: string;
  limit: number;
  current: number;
  percent: number;
  headroom: number;
  status: GpsScaleTierStatus;
  infraSummary: string;
};

export function resolveGpsScaleTierLimit(
  settingKey: string,
  defaultLimit: number,
  settings: Record<string, string | undefined>
): number {
  const raw = settings[settingKey]?.trim();
  if (!raw) return defaultLimit;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultLimit;
}

export function buildGpsScaleTierProgress(
  definition: GpsScaleTierDefinition,
  currentLive: number,
  settings: Record<string, string | undefined>
): GpsScaleTierProgress {
  const limit = resolveGpsScaleTierLimit(definition.settingKey, definition.defaultLimit, settings);
  const current = Math.max(0, currentLive);
  const percent = limit > 0 ? Math.min(100, Math.round((current / limit) * 1000) / 10) : 0;
  const headroom = Math.max(0, limit - current);
  let status: GpsScaleTierStatus = "ok";
  if (current >= limit) status = "critical";
  else if (current >= limit * 0.8) status = "warning";

  return {
    id: definition.id,
    label: definition.label,
    limit,
    current,
    percent,
    headroom,
    status,
    infraSummary: definition.infraSummary
  };
}

export function buildGpsScaleTierProgressList(
  currentLive: number,
  settings: Record<string, string | undefined> = {}
): GpsScaleTierProgress[] {
  return GPS_SCALE_TIER_DEFINITIONS.map((definition) =>
    buildGpsScaleTierProgress(definition, currentLive, settings)
  );
}

/** Fase operacional recomendada com base na carga LIVE atual. */
export function resolveActiveGpsScalePhase(currentLive: number, settings: Record<string, string | undefined> = {}) {
  const tiers = buildGpsScaleTierProgressList(currentLive, settings);
  const phase1 = tiers.find((tier) => tier.id === "phase1");
  const phase2 = tiers.find((tier) => tier.id === "phase2");
  if (!phase1 || !phase2) return tiers[0]?.id ?? "phase1";
  if (currentLive > phase2.limit) return "phase3";
  if (currentLive > phase1.limit) return "phase2";
  return "phase1";
}
