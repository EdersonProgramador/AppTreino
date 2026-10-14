import type { MarketingAttribution } from "./marketing-attribution.js";

/** Conta Google Ads dedicada ATLLY (UI: 244-230-6941). */
export const ATLLY_GOOGLE_ADS_CUSTOMER_ID = "244-230-6941";

export const ATLLY_GOOGLE_ADS_CUSTOMER_ID_DIGITS = "2442306941";

/** Google tag (gtag) instalada em atlly.com.br. */
export const ATLLY_GOOGLE_ADS_TAG_ID = "AW-18513371658";

export const ATLLY_MARKETING_SITE_ORIGIN = "https://www.atlly.com.br";

export const ATLLY_FUNNEL_PATH = "/ativar";

/** Página pós-assinatura — conversão Google Ads por URL (contém `/aluno`). */
export const ATLLY_CONVERSION_PATH = "/aluno";

export const ATLLY_DEFAULT_PAID_COUPON = "GOOGLE15";

export type AtllyCampaignChannel = "google_search" | "google_pmax" | "google_display";

export type BuildAtllyCampaignUrlInput = {
  planCode?: string;
  coupon?: string | null;
  channel?: AtllyCampaignChannel;
  campaign?: string;
  content?: string;
  term?: string;
  /** Sobrescreve utm_medium (default depende do channel). */
  utmMedium?: string;
  /** Sobrescreve utm_source (default: google). */
  utmSource?: string;
};

const DEFAULT_CAMPAIGN_BY_CHANNEL: Record<AtllyCampaignChannel, string> = {
  google_search: "atlly_pro_search_br",
  google_pmax: "atlly_pro_pmax_br",
  google_display: "atlly_pro_display_br"
};

const DEFAULT_MEDIUM_BY_CHANNEL: Record<AtllyCampaignChannel, string> = {
  google_search: "paid_search",
  google_pmax: "paid",
  google_display: "display"
};

export function buildAtllyCampaignUrl(input: BuildAtllyCampaignUrlInput = {}): string {
  const channel = input.channel ?? "google_pmax";
  const params = new URLSearchParams();

  const plan = input.planCode?.trim();
  if (plan) params.set("plan", plan);

  const coupon = input.coupon?.trim();
  if (coupon) params.set("coupon", coupon);

  params.set("utm_source", input.utmSource?.trim() || "google");
  params.set("utm_medium", input.utmMedium?.trim() || DEFAULT_MEDIUM_BY_CHANNEL[channel]);
  params.set(
    "utm_campaign",
    input.campaign?.trim() || DEFAULT_CAMPAIGN_BY_CHANNEL[channel]
  );

  const content = input.content?.trim();
  if (content) params.set("utm_content", content);

  const term = input.term?.trim();
  if (term) params.set("utm_term", term);

  const query = params.toString();
  return `${ATLLY_MARKETING_SITE_ORIGIN}${ATLLY_FUNNEL_PATH}${query ? `?${query}` : ""}`;
}

/** URLs prontas para colar no Google Ads / Adrails (PMax final URL + variantes Search). */
export function buildAtllyCampaignUrlPack(options?: { planCode?: string; includeCoupon?: boolean }) {
  const planCode = options?.planCode ?? "PRO";
  const coupon = options?.includeCoupon === false ? undefined : ATLLY_DEFAULT_PAID_COUPON;
  const base = { planCode, coupon };

  return {
    customerId: ATLLY_GOOGLE_ADS_CUSTOMER_ID,
    tagId: ATLLY_GOOGLE_ADS_TAG_ID,
    conversionPathHint: ATLLY_CONVERSION_PATH,
    performanceMaxFinalUrl: buildAtllyCampaignUrl({ ...base, channel: "google_pmax" }),
    searchFinalUrl: buildAtllyCampaignUrl({ ...base, channel: "google_search" }),
    displayFinalUrl: buildAtllyCampaignUrl({ ...base, channel: "google_display" })
  };
}

export function marketingAttributionFromAtllyCampaignUrl(url: string): MarketingAttribution | null {
  try {
    const parsed = new URL(url);
    const search = parsed.searchParams;
    const utmSource = search.get("utm_source")?.trim();
    const utmMedium = search.get("utm_medium")?.trim();
    const utmCampaign = search.get("utm_campaign")?.trim();
    if (!utmSource && !utmMedium && !utmCampaign) return null;
    return {
      utmSource: utmSource || undefined,
      utmMedium: utmMedium || undefined,
      utmCampaign: utmCampaign || undefined,
      utmContent: search.get("utm_content")?.trim() || undefined,
      utmTerm: search.get("utm_term")?.trim() || undefined,
      landingPath: parsed.pathname || ATLLY_FUNNEL_PATH
    };
  } catch {
    return null;
  }
}
