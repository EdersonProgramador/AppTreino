/** URLs públicas das lojas — preencha na Vercel quando o app estiver publicado. */
function readStoreUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export const appStoreUrls = {
  android: readStoreUrl(import.meta.env.VITE_APP_STORE_ANDROID_URL),
  ios: readStoreUrl(import.meta.env.VITE_APP_STORE_IOS_URL)
} as const;

export function hasPublishedStoreListing(): boolean {
  return Boolean(appStoreUrls.android || appStoreUrls.ios);
}
