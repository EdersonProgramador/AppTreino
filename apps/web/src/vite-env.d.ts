/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAPBOX_ACCESS_TOKEN?: string;
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  readonly VITE_GOOGLE_MAPS_MAP_ID?: string;
  readonly VITE_GTM_ID?: string;
  readonly VITE_GA4_MEASUREMENT_ID?: string;
  /** Conta Google Ads (ex.: 244-230-6941) — metadado para dataLayer / ferramentas. */
  readonly VITE_GOOGLE_ADS_CUSTOMER_ID?: string;
  readonly VITE_GOOGLE_ADS_ID?: string;
  readonly VITE_GOOGLE_ADS_CONVERSION_PURCHASE?: string;
  readonly VITE_GOOGLE_ADS_CONVERSION_SIGNUP?: string;
  readonly VITE_GOOGLE_ADS_CONVERSION_BEGIN_CHECKOUT?: string;
  /** Um rótulo válido usado para signup/checkout se os específicos estiverem vazios. */
  readonly VITE_GOOGLE_ADS_CONVERSION_DEFAULT?: string;
  readonly VITE_GOOGLE_ADS_SEND_TO_PURCHASE?: string;
  readonly VITE_GOOGLE_ADS_SEND_TO_SIGNUP?: string;
  readonly VITE_GOOGLE_ADS_SEND_TO_BEGIN_CHECKOUT?: string;
}
