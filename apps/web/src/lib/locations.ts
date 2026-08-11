export function studentLocationLabel(profile?: { city?: string | null; state?: string | null } | null) {
  return [profile?.city, profile?.state].filter(Boolean).join(" - ") || "Sem município/UF";
}
