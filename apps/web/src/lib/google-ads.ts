export type GoogleAdsConversionKind = "purchase" | "signup" | "begin_checkout";

/** Conta Google Ads ATLLY (Customer ID). */
export const ATLLY_GOOGLE_ADS_CUSTOMER_ID = "244-230-6941";

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

  if (typeof window !== "undefined") {
    const host = window.location.hostname.toLowerCase();
    if (host === "atlly.com.br" || host === "www.atlly.com.br") {
      return normalizeGoogleAdsCustomerId(ATLLY_GOOGLE_ADS_CUSTOMER_ID);
    }
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

export function formatGoogleAdsSendTo(adsId: string | null | undefined, label: string | null | undefined): string | null {
  const normalizedLabel = label?.trim();
  if (!normalizedLabel) return null;
  if (normalizedLabel.includes("/")) return normalizedLabel;

  const normalizedAdsId = adsId?.trim();
  if (!normalizedAdsId || !isConfiguredGoogleAdsId(normalizedAdsId)) return null;
  return `${normalizedAdsId}/${normalizedLabel}`;
}

/** Monta `AW-xxx/label` a partir do ID da conta e do rótulo da ação de conversão. */
export function buildGoogleAdsSendTo(kind: GoogleAdsConversionKind): string | null {
  const directKey = {
    purchase: "VITE_GOOGLE_ADS_SEND_TO_PURCHASE",
    signup: "VITE_GOOGLE_ADS_SEND_TO_SIGNUP",
    begin_checkout: "VITE_GOOGLE_ADS_SEND_TO_BEGIN_CHECKOUT"
  } satisfies Record<GoogleAdsConversionKind, keyof ImportMetaEnv>;

  const direct = readEnv(directKey[kind]);
  if (direct?.includes("/")) return direct;

  const adsId = readEnv("VITE_GOOGLE_ADS_ID");
  const labelKey = {
    purchase: "VITE_GOOGLE_ADS_CONVERSION_PURCHASE",
    signup: "VITE_GOOGLE_ADS_CONVERSION_SIGNUP",
    begin_checkout: "VITE_GOOGLE_ADS_CONVERSION_BEGIN_CHECKOUT"
  } satisfies Record<GoogleAdsConversionKind, keyof ImportMetaEnv>;

  return formatGoogleAdsSendTo(adsId, readEnv(labelKey[kind]));
}

export function initGoogleAdsAndGa4() {
  if (typeof document === "undefined") return;

  pushGoogleAdsAccountMetadata();

  const adsId = readEnv("VITE_GOOGLE_ADS_ID");
  const ga4Id = readEnv("VITE_GA4_MEASUREMENT_ID");
  const validAdsId = adsId && isConfiguredGoogleAdsId(adsId) ? adsId : null;
  const validGa4Id = ga4Id && isConfiguredGa4Id(ga4Id) ? ga4Id : null;

  if (!validAdsId && !validGa4Id) return;
  if (document.getElementById("atlly-gtag")) return;

  window.dataLayer = window.dataLayer ?? [];
  function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  }
  window.gtag = gtag;
  gtag("js", new Date());

  const loaderId = validGa4Id ?? validAdsId!;
  const script = document.createElement("script");
  script.id = "atlly-gtag";
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(loaderId)}`;
  document.head.appendChild(script);

  if (validGa4Id) {
    gtag("config", validGa4Id, { send_page_view: false });
  }
  if (validAdsId) {
    const customer = resolveGoogleAdsCustomerId();
    gtag("config", validAdsId, {
      allow_enhanced_conversions: true,
      ...(customer ? { customer_id: customer.digits } : {})
    });
  }
}

function gtagEvent(...args: unknown[]) {
  if (typeof window.gtag !== "function") return;
  window.gtag(...args);
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
  const sendTo = buildGoogleAdsSendTo(kind);
  if (!sendTo) return;

  const value = input?.valueCents != null ? input.valueCents / 100 : undefined;

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
