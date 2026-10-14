export type GoogleAdsConversionKind = "purchase" | "signup" | "begin_checkout";

/** Conta Google Ads ATLLY (Customer ID). */
export const ATLLY_GOOGLE_ADS_CUSTOMER_ID = "244-230-6941";

/** Google tag (gtag) — mesmo ID do snippet em Objetivos → Conversões. */
export const ATLLY_GOOGLE_ADS_TAG_ID = "AW-18513371658";

function isAtllyProductionHost() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return host === "atlly.com.br" || host === "www.atlly.com.br";
}

function resolveGoogleAdsTagId(): string | null {
  const fromEnv = readEnv("VITE_GOOGLE_ADS_ID");
  if (fromEnv && isConfiguredGoogleAdsId(fromEnv)) return fromEnv;
  if (isAtllyProductionHost() && isConfiguredGoogleAdsId(ATLLY_GOOGLE_ADS_TAG_ID)) {
    return ATLLY_GOOGLE_ADS_TAG_ID;
  }
  return null;
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

function readEnv(name: keyof ImportMetaEnv): string | null {
  const value = import.meta.env[name]?.trim();
  return value || null;
}

function isConfiguredGoogleAdsId(id: string) {
  return /^AW-\d+$/i.test(id);
}

function isConfiguredGa4Id(id: string) {
  return /^G-[A-Z0-9]+$/i.test(id);
}

export function normalizeGoogleAdsCustomerId(raw: string | null | undefined): {
  digits: string;
  formatted: string;
} | null {
  const digits = raw?.replace(/\D/g, "") ?? "";
  if (digits.length !== 10) return null;
  return {
    digits,
    formatted: `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  };
}

function resolveGoogleAdsCustomerId(): ReturnType<typeof normalizeGoogleAdsCustomerId> {
  const fromEnv = normalizeGoogleAdsCustomerId(readEnv("VITE_GOOGLE_ADS_CUSTOMER_ID"));
  if (fromEnv) return fromEnv;

  if (isAtllyProductionHost()) {
    return normalizeGoogleAdsCustomerId(ATLLY_GOOGLE_ADS_CUSTOMER_ID);
  }

  return null;
}

function pushGoogleAdsAccountMetadata() {
  const customer = resolveGoogleAdsCustomerId();
  if (!customer) return;

  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({
    event: "atlly_marketing_config",
    brand: "ATLLY",
    google_ads_customer_id: customer.digits,
    google_ads_customer_id_formatted: customer.formatted
  });
}

/** Rótulo real do Google Ads (rejeita placeholders da Vercel/docs). */
export function isValidGoogleAdsConversionLabel(label: string | null | undefined): boolean {
  const normalized = label?.trim();
  if (!normalized || normalized.length < 8 || normalized.length > 40) return false;
  if (normalized.includes("/") || normalized.includes("<") || normalized.includes(">")) return false;
  if (/rótulo|label|placeholder|xxxx/i.test(normalized)) return false;
  return /^[A-Za-z0-9_-]+$/.test(normalized);
}

export function formatGoogleAdsSendTo(adsId: string | null | undefined, label: string | null | undefined): string | null {
  const normalizedLabel = label?.trim();
  if (!normalizedLabel) return null;
  if (normalizedLabel.includes("/")) {
    return isValidGoogleAdsConversionLabel(normalizedLabel.split("/").pop()) ? normalizedLabel : null;
  }
  if (!isValidGoogleAdsConversionLabel(normalizedLabel)) return null;

  const normalizedAdsId = adsId?.trim();
  if (!normalizedAdsId || !isConfiguredGoogleAdsId(normalizedAdsId)) return null;
  return `${normalizedAdsId}/${normalizedLabel}`;
}

function readConversionLabel(envKey: keyof ImportMetaEnv): string | null {
  const raw = readEnv(envKey);
  return isValidGoogleAdsConversionLabel(raw) ? raw!.trim() : null;
}

function resolveConversionLabel(kind: GoogleAdsConversionKind): string | null {
  const byKind = {
    purchase: readConversionLabel("VITE_GOOGLE_ADS_CONVERSION_PURCHASE"),
    signup: readConversionLabel("VITE_GOOGLE_ADS_CONVERSION_SIGNUP"),
    begin_checkout: readConversionLabel("VITE_GOOGLE_ADS_CONVERSION_BEGIN_CHECKOUT")
  } satisfies Record<GoogleAdsConversionKind, string | null>;

  const direct = readEnv(
    {
      purchase: "VITE_GOOGLE_ADS_SEND_TO_PURCHASE",
      signup: "VITE_GOOGLE_ADS_SEND_TO_SIGNUP",
      begin_checkout: "VITE_GOOGLE_ADS_SEND_TO_BEGIN_CHECKOUT"
    }[kind]
  );
  if (direct?.includes("/")) {
    const sendTo = formatGoogleAdsSendTo(resolveGoogleAdsTagId(), direct);
    if (sendTo) return sendTo.split("/").pop() ?? null;
  }

  if (byKind[kind]) return byKind[kind];

  const fallbackDefault = readConversionLabel("VITE_GOOGLE_ADS_CONVERSION_DEFAULT");
  if (fallbackDefault) return fallbackDefault;

  if (kind !== "purchase" && byKind.purchase) return byKind.purchase;

  return null;
}

/** Monta `AW-xxx/label` a partir do ID da conta e do rótulo da ação de conversão. */
export function buildGoogleAdsSendTo(kind: GoogleAdsConversionKind): string | null {
  const directKey = {
    purchase: "VITE_GOOGLE_ADS_SEND_TO_PURCHASE",
    signup: "VITE_GOOGLE_ADS_SEND_TO_SIGNUP",
    begin_checkout: "VITE_GOOGLE_ADS_SEND_TO_BEGIN_CHECKOUT"
  } satisfies Record<GoogleAdsConversionKind, keyof ImportMetaEnv>;

  const direct = readEnv(directKey[kind]);
  if (direct?.includes("/")) {
    const parsed = formatGoogleAdsSendTo(null, direct);
    if (parsed) return parsed;
  }

  const adsId = resolveGoogleAdsTagId();
  return formatGoogleAdsSendTo(adsId, resolveConversionLabel(kind));
}

function trackGoogleAdsKeyEvent(
  kind: GoogleAdsConversionKind,
  input?: {
    valueCents?: number | null;
    transactionId?: string | null;
    planCode?: string | null;
  }
) {
  const value = input?.valueCents != null ? input.valueCents / 100 : undefined;
  const base = {
    value,
    currency: value != null ? "BRL" : undefined,
    transaction_id: input?.transactionId ?? undefined,
    plan_code: input?.planCode ?? undefined
  };

  if (kind === "purchase") {
    gtagEvent("event", "purchase", {
      ...base,
      items: input?.planCode
        ? [{ item_id: input.planCode, item_name: input.planCode, price: value }]
        : undefined
    });
    return;
  }
  if (kind === "signup") {
    gtagEvent("event", "sign_up", base);
    gtagEvent("event", "generate_lead", base);
    return;
  }
  gtagEvent("event", "begin_checkout", base);
}

function gtagLoaderScriptPresent(tagId: string) {
  return Array.from(document.querySelectorAll('script[src*="googletagmanager.com/gtag/js"]')).some((node) =>
    (node.getAttribute("src") ?? "").includes(tagId)
  );
}

function ensureGtagStub() {
  window.dataLayer = window.dataLayer ?? [];
  if (typeof window.gtag !== "function") {
    window.gtag = (...args: unknown[]) => {
      window.dataLayer!.push(args);
    };
  }
}

export function initGoogleAdsAndGa4() {
  if (typeof document === "undefined") return;

  pushGoogleAdsAccountMetadata();
  ensureGtagStub();

  const adsId = resolveGoogleAdsTagId();
  const ga4Id = readEnv("VITE_GA4_MEASUREMENT_ID");
  const validAdsId = adsId;
  const validGa4Id = ga4Id && isConfiguredGa4Id(ga4Id) ? ga4Id : null;

  const adsScriptInHtml = validAdsId ? gtagLoaderScriptPresent(validAdsId) : false;
  const ga4ScriptInHtml = validGa4Id ? gtagLoaderScriptPresent(validGa4Id) : false;

  if (validAdsId && adsScriptInHtml) {
    const customer = resolveGoogleAdsCustomerId();
    gtagEvent("config", validAdsId, {
      allow_enhanced_conversions: true,
      ...(customer ? { customer_id: customer.digits } : {})
    });
  }

  if (validGa4Id && !ga4ScriptInHtml && !document.getElementById("atlly-gtag-ga4")) {
    const script = document.createElement("script");
    script.id = "atlly-gtag-ga4";
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(validGa4Id)}`;
    document.head.appendChild(script);
    gtagEvent("config", validGa4Id, { send_page_view: false });
  }

  if (!validAdsId && !validGa4Id) return;
  if (adsScriptInHtml && (!validGa4Id || ga4ScriptInHtml)) return;
  if (document.getElementById("atlly-gtag")) return;

  const loaderId = validGa4Id && !ga4ScriptInHtml ? validGa4Id : validAdsId;
  if (!loaderId || gtagLoaderScriptPresent(loaderId)) return;

  const script = document.createElement("script");
  script.id = "atlly-gtag";
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(loaderId)}`;
  document.head.appendChild(script);

  if (validGa4Id && loaderId === validGa4Id) {
    gtagEvent("config", validGa4Id, { send_page_view: false });
  }
  if (validAdsId && loaderId === validAdsId) {
    const customer = resolveGoogleAdsCustomerId();
    gtagEvent("config", validAdsId, {
      allow_enhanced_conversions: true,
      ...(customer ? { customer_id: customer.digits } : {})
    });
  }
}

function gtagEvent(...args: unknown[]) {
  if (typeof window.gtag !== "function") return;
  window.gtag(...args);
}

/** Sinal no dataLayer quando o aluno abre `/aluno` (conversão Google Ads por URL). */
export function trackGoogleAdsConversionPathHit(pagePath: string) {
  if (!pagePath.includes("/aluno")) return;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({
    event: "atlly_conversion_page_view",
    page_path: pagePath,
    google_ads_tag_id: resolveGoogleAdsTagId() ?? undefined
  });
}

export function trackGoogleAdsPageView(pagePath: string, pageTitle?: string) {
  const ga4Id = readEnv("VITE_GA4_MEASUREMENT_ID");
  if (!ga4Id || !isConfiguredGa4Id(ga4Id)) return;

  gtagEvent("config", ga4Id, {
    page_path: pagePath,
    page_title: pageTitle ?? document.title
  });
  gtagEvent("event", "page_view", {
    page_path: pagePath,
    page_title: pageTitle ?? document.title
  });
}

export function trackGoogleAdsConversion(
  kind: GoogleAdsConversionKind,
  input?: {
    valueCents?: number | null;
    transactionId?: string | null;
    planCode?: string | null;
  }
) {
  const value = input?.valueCents != null ? input.valueCents / 100 : undefined;
  trackGoogleAdsKeyEvent(kind, input);

  const sendTo = buildGoogleAdsSendTo(kind);
  if (!sendTo) {
    window.dataLayer?.push({
      event: "google_ads_conversion_pending",
      google_ads_conversion_kind: kind,
      reason: "missing_or_invalid_conversion_label",
      value,
      currency: value != null ? "BRL" : undefined,
      transaction_id: input?.transactionId ?? undefined,
      plan_code: input?.planCode ?? undefined
    });
    return;
  }

  gtagEvent("event", "conversion", {
    send_to: sendTo,
    value,
    currency: value != null ? "BRL" : undefined,
    transaction_id: input?.transactionId ?? undefined
  });

  window.dataLayer?.push({
    event: "google_ads_conversion",
    google_ads_conversion_kind: kind,
    google_ads_send_to: sendTo,
    value,
    currency: value != null ? "BRL" : undefined,
    transaction_id: input?.transactionId ?? undefined,
    plan_code: input?.planCode ?? undefined
  });
}

export function trackGa4FunnelEvent(
  name: "sign_up" | "begin_checkout" | "purchase",
  input?: {
    valueCents?: number | null;
    transactionId?: string | null;
    planCode?: string | null;
  }
) {
  const ga4Id = readEnv("VITE_GA4_MEASUREMENT_ID");
  if (!ga4Id || !isConfiguredGa4Id(ga4Id)) return;

  const value = input?.valueCents != null ? input.valueCents / 100 : undefined;
  const params: Record<string, unknown> = {
    currency: value != null ? "BRL" : undefined,
    value,
    transaction_id: input?.transactionId ?? undefined,
    plan_code: input?.planCode ?? undefined
  };

  if (name === "purchase" && input?.planCode) {
    params.items = [
      {
        item_id: input.planCode,
        item_name: input.planCode,
        price: value
      }
    ];
  }

  gtagEvent("event", name, params);
}
