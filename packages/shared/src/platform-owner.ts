export const DEFAULT_PLATFORM_OWNER_EMAIL = "edersonprogramador@gmail.com";

export function normalizePlatformOwnerEmail(email: string | null | undefined): string {
  return String(email ?? "")
    .trim()
    .toLowerCase();
}

export function resolvePlatformOwnerEmail(configured?: string | null): string {
  const normalized = normalizePlatformOwnerEmail(configured);
  return normalized || DEFAULT_PLATFORM_OWNER_EMAIL;
}

export function isPlatformOwnerEmail(
  email: string | null | undefined,
  configuredOwnerEmail?: string | null
): boolean {
  const candidate = normalizePlatformOwnerEmail(email);
  if (!candidate) return false;
  return candidate === resolvePlatformOwnerEmail(configuredOwnerEmail);
}
