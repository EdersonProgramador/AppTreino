import {
  normalizeMarketingAttribution,
  parseMarketingAttributionFromSearch,
  type MarketingAttribution
} from "@app-treino/shared";

const STORAGE_KEY = "atlly-marketing-attribution";
const TTL_MS = 1000 * 60 * 60 * 24 * 90;

type StoredMarketingAttribution = MarketingAttribution & { expiresAt: number };

function readStored(): StoredMarketingAttribution | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredMarketingAttribution;
    if (!parsed || typeof parsed.expiresAt !== "number" || parsed.expiresAt <= Date.now()) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(attribution: MarketingAttribution) {
  try {
    const payload: StoredMarketingAttribution = {
      ...attribution,
      expiresAt: Date.now() + TTL_MS
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // storage blocked
  }
}

/** Captura UTMs da URL atual e persiste first-touch (90 dias). */
export function captureMarketingAttributionFromLocation(search: string, pathname: string) {
  const incoming = parseMarketingAttributionFromSearch(search, pathname);
  if (!incoming) return readMarketingAttribution();

  const stored = readStored();
  if (stored) return normalizeMarketingAttribution(stored);

  writeStored(incoming);
  return incoming;
}

export function readMarketingAttribution(): MarketingAttribution | null {
  const stored = readStored();
  if (!stored) return null;
  return normalizeMarketingAttribution(stored);
}

/** Payload enviado no cadastro / checkout register. */
export function readMarketingAttributionForApi(): MarketingAttribution | null {
  return readMarketingAttribution();
}
