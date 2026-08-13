export type LocationTypeCode = "ACADEMY" | "UNIT" | "CLUB";

/** Labels de negócio: Academias, Boxes e Studios. */
export const locationTypeLabel: Record<LocationTypeCode, string> = {
  ACADEMY: "Academia",
  UNIT: "Box",
  CLUB: "Studio"
};

/**
 * Normaliza valor do formulário/API para o enum do banco.
 * Aceita aliases BOX/STUDIO da UI antiga.
 */
export function normalizeLocationType(type?: string | null): LocationTypeCode {
  const value = String(type ?? "").trim().toUpperCase();
  if (value === "UNIT" || value === "BOX") return "UNIT";
  if (value === "CLUB" || value === "STUDIO") return "CLUB";
  return "ACADEMY";
}

export function labelLocationType(type?: string | null) {
  return locationTypeLabel[normalizeLocationType(type)];
}

export function studentLocationLabel(profile?: { city?: string | null; state?: string | null } | null) {
  return [profile?.city, profile?.state].filter(Boolean).join(" - ") || "Sem município/UF";
}
