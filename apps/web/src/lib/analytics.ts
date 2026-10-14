import type { MarketingAttribution } from "@app-treino/shared";
import {
  initGoogleAdsAndGa4,
  trackGa4FunnelEvent,
  trackGoogleAdsConversion,
  trackGoogleAdsConversionPathHit,
  trackGoogleAdsPageView
} from "./google-ads";

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

const PURCHASE_DEDUPE_KEY = "atlly-analytics-purchase-ids";

function ensureDataLayer() {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
}

export function initAnalytics() {
  if (typeof document === "undefined") return;

  initGoogleAdsAndGa4();

  const gtmId = import.meta.env.VITE_GTM_ID?.trim();
  if (!gtmId || document.getElementById("atlly-gtm")) return;

  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

  const script = document.createElement("script");
  script.id = "atlly-gtm";
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
  document.head.appendChild(script);

  const noscript = document.createElement("noscript");
  const iframe = document.createElement("iframe");
  iframe.src = `https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(gtmId)}`;
  iframe.height = "0";
  iframe.width = "0";
  iframe.style.display = "none";
  iframe.style.visibility = "hidden";
  noscript.appendChild(iframe);
  document.body.prepend(noscript);
}

export function trackAnalyticsEvent(
  event: string,
  params?: Record<string, unknown>,
  attribution?: MarketingAttribution | null
) {
  ensureDataLayer();
  if (!window.dataLayer) return;

  const payload: Record<string, unknown> = {
    event,
    ...params
  };

  if (attribution?.utmSource) payload.utm_source = attribution.utmSource;
  if (attribution?.utmMedium) payload.utm_medium = attribution.utmMedium;
  if (attribution?.utmCampaign) payload.utm_campaign = attribution.utmCampaign;
  if (attribution?.utmContent) payload.utm_content = attribution.utmContent;
  if (attribution?.utmTerm) payload.utm_term = attribution.utmTerm;

  window.dataLayer.push(payload);
}

export function trackPageView(path: string, title?: string) {
  trackAnalyticsEvent("page_view", {
    page_path: path,
    page_title: title ?? document.title
  });
  trackGoogleAdsPageView(path, title);
  trackGoogleAdsConversionPathHit(path);
}

export function trackCompleteRegistration(planCode?: string | null) {
  trackAnalyticsEvent("complete_registration", {
    plan_code: planCode ?? undefined
  });
  trackGoogleAdsConversion("signup", { planCode: planCode ?? undefined });
  trackGa4FunnelEvent("sign_up", { planCode: planCode ?? undefined });
}

export function trackInitiateCheckout(input: { planCode: string; valueCents?: number | null }) {
  trackAnalyticsEvent("begin_checkout", {
    plan_code: input.planCode,
    value: input.valueCents != null ? input.valueCents / 100 : undefined,
    currency: "BRL"
  });
  trackGoogleAdsConversion("begin_checkout", {
    planCode: input.planCode,
    valueCents: input.valueCents
  });
  trackGa4FunnelEvent("begin_checkout", {
    planCode: input.planCode,
    valueCents: input.valueCents
  });
}

export function trackPurchase(input: {
  transactionId: string;
  planCode?: string | null;
  valueCents?: number | null;
}) {
  try {
    const raw = window.sessionStorage.getItem(PURCHASE_DEDUPE_KEY);
    const seen = raw ? (JSON.parse(raw) as string[]) : [];
    if (seen.includes(input.transactionId)) return;
    const next = [...seen, input.transactionId].slice(-40);
    window.sessionStorage.setItem(PURCHASE_DEDUPE_KEY, JSON.stringify(next));
  } catch {
    // ignore dedupe errors
  }

  trackAnalyticsEvent("purchase", {
    transaction_id: input.transactionId,
    plan_code: input.planCode ?? undefined,
    value: input.valueCents != null ? input.valueCents / 100 : undefined,
    currency: "BRL"
  });

  trackGoogleAdsConversion("purchase", {
    transactionId: input.transactionId,
    planCode: input.planCode,
    valueCents: input.valueCents
  });
  trackGa4FunnelEvent("purchase", {
    transactionId: input.transactionId,
    planCode: input.planCode,
    valueCents: input.valueCents
  });
}
