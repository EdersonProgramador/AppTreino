export type MarketingAttribution = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  landingPath?: string;
  capturedAt?: string;
};

export const MARKETING_UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term"
] as const;

export type MarketingUtmKey = (typeof MARKETING_UTM_KEYS)[number];

const FIELD_BY_PARAM: Record<MarketingUtmKey, keyof MarketingAttribution> = {
  utm_source: "utmSource",
  utm_medium: "utmMedium",
  utm_campaign: "utmCampaign",
  utm_content: "utmContent",
  utm_term: "utmTerm"
};

const MAX_FIELD_LEN = 120;
const MAX_PATH_LEN = 512;

function trimField(value: string | null | undefined, maxLen: number): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

export function marketingAttributionHasSignal(input: MarketingAttribution | null | undefined): boolean {
  if (!input) return false;
  return Boolean(
    input.utmSource ||
      input.utmMedium ||
      input.utmCampaign ||
      input.utmContent ||
      input.utmTerm
  );
}

export function parseMarketingAttributionFromSearch(
  search: string | URLSearchParams,
  landingPath?: string | null
): MarketingAttribution | null {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const next: MarketingAttribution = {};

  for (const key of MARKETING_UTM_KEYS) {
    const field = FIELD_BY_PARAM[key];
    const value = trimField(params.get(key), MAX_FIELD_LEN);
    if (value) next[field] = value;
  }

  const hasUtm = Boolean(
    next.utmSource || next.utmMedium || next.utmCampaign || next.utmContent || next.utmTerm
  );
  if (!hasUtm) return null;

  const path = trimField(landingPath ?? undefined, MAX_PATH_LEN);
  if (path) next.landingPath = path;
  next.capturedAt = new Date().toISOString();
  return next;
}

export function normalizeMarketingAttribution(input: unknown): MarketingAttribution | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const next: MarketingAttribution = {
    utmSource: trimField(typeof raw.utmSource === "string" ? raw.utmSource : undefined, MAX_FIELD_LEN),
    utmMedium: trimField(typeof raw.utmMedium === "string" ? raw.utmMedium : undefined, MAX_FIELD_LEN),
    utmCampaign: trimField(typeof raw.utmCampaign === "string" ? raw.utmCampaign : undefined, MAX_FIELD_LEN),
    utmContent: trimField(typeof raw.utmContent === "string" ? raw.utmContent : undefined, MAX_FIELD_LEN),
    utmTerm: trimField(typeof raw.utmTerm === "string" ? raw.utmTerm : undefined, MAX_FIELD_LEN),
    landingPath: trimField(typeof raw.landingPath === "string" ? raw.landingPath : undefined, MAX_PATH_LEN),
    capturedAt: trimField(typeof raw.capturedAt === "string" ? raw.capturedAt : undefined, 40)
  };

  if (!marketingAttributionHasSignal(next)) return null;
  if (!next.capturedAt) next.capturedAt = new Date().toISOString();
  return next;
}

export function mergeMarketingAttribution(
  current: MarketingAttribution | null,
  incoming: MarketingAttribution | null
): MarketingAttribution | null {
  if (!incoming) return current;
  if (!current) return incoming;
  return {
    ...current,
    ...incoming,
    capturedAt: current.capturedAt ?? incoming.capturedAt
  };
}
