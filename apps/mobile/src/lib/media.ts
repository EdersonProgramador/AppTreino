import { API_URL, WEB_URL } from "../config";

/**
 * Mesma regra da web (`apps/web/src/lib/urls.ts` + `getMediaBaseUrl`):
 * - uploads → CDN (EXPO_PUBLIC_MEDIA_URL / R2)
 * - containers legados (webm/mov/…) → API `/media/video?path=` (MP4 H.264)
 * - http externos → intactos
 */

/** Cloudflare R2 public bucket — espelha o default de produção quando o env falta no Metro. */
const DEFAULT_MEDIA_URL = "https://pub-7bceff9c425e44b29161a5f8570c5266.r2.dev";
const MEDIA_URL = (process.env.EXPO_PUBLIC_MEDIA_URL || DEFAULT_MEDIA_URL).replace(/\/$/, "");

function originOf(url: string) {
  return url.replace(/\/$/, "");
}

function isLoopback(host: string) {
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1";
}

function isLanHost(host: string) {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
}

function isWebAssetPath(pathname: string) {
  return /^\/assets\//i.test(pathname);
}

function isKnownCdnHost(host: string) {
  return /(youtube\.com|youtu\.be|ytimg\.com|vimeo\.com|giphy\.com|tenor\.com|imgur\.com|cloudinary\.com|googleusercontent\.com|fbcdn\.net|r2\.dev|cloudflarestorage\.com|media\.edersonprogramador\.com)/i.test(
    host
  );
}

function encodeSpaces(href: string) {
  return href.includes(" ") ? encodeURI(href) : href;
}

function needsVideoBridge(path: string) {
  return /\.(webm|ogv|ogg|mov|mkv|avi)(\?|#|$)/i.test(path);
}

/** Path relativo de upload (`images|lessons|materials|audio/...`), igual à web. */
export function uploadRelativePath(path?: string | null): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed || /^(data:|file:|content:|blob:)/i.test(trimmed)) return null;

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      if (/^\/uploads\//i.test(url.pathname)) {
        return decodeURIComponent(url.pathname.slice("/uploads/".length));
      }
      if (/^\/media\/video/i.test(url.pathname)) {
        const mediaPath = url.searchParams.get("path");
        return mediaPath ? decodeURIComponent(mediaPath) : null;
      }
      const cdnPath = url.pathname.replace(/^\/+/, "");
      if (/^(images|lessons|materials|audio)\//i.test(cdnPath)) {
        return decodeURIComponent(cdnPath);
      }
      return null;
    }
  } catch {
    return null;
  }

  const cleaned = trimmed.replace(/^\/+/, "");
  if (cleaned.startsWith("uploads/")) return cleaned.slice("uploads/".length);
  if (/^(images|lessons|materials|audio)\//i.test(cleaned)) return cleaned;
  if (/^media\/video/i.test(cleaned) || cleaned.startsWith("media?")) {
    try {
      const q = new URL(trimmed.startsWith("http") ? trimmed : `https://x/${cleaned}`);
      const mediaPath = q.searchParams.get("path");
      return mediaPath ? decodeURIComponent(mediaPath) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function uploadPublicUrl(relativePath: string) {
  const cleaned = relativePath.replace(/^\/+/, "");
  return encodeSpaces(`${MEDIA_URL}/${cleaned}`);
}

/** Legado → bridge da API (igual web). MP4/imagem → CDN. */
function playableUploadUrl(relativePath: string) {
  const cleaned = relativePath.replace(/^\/+/, "").split(/[?#]/)[0];
  if (needsVideoBridge(cleaned)) {
    const api = originOf(API_URL);
    return `${api}/media/video?path=${encodeURIComponent(cleaned)}`;
  }
  return uploadPublicUrl(cleaned);
}

/**
 * Resolve mídia cadastrada — contrato alinhado com a web.
 */
export function mediaUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  const trimmed = path.trim();
  if (!trimmed) return undefined;
  if (/^(data:|file:|content:|blob:)/i.test(trimmed)) return trimmed;

  const api = originOf(API_URL);
  const web = originOf(WEB_URL);
  let raw = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
  if (/^(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com)\//i.test(raw)) {
    raw = `https://${raw}`;
  }

  const relative = uploadRelativePath(raw);
  if (relative) {
    return playableUploadUrl(relative);
  }

  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);
      if (isWebAssetPath(url.pathname)) {
        return encodeSpaces(`${web}${url.pathname}${url.search}`);
      }
      // Já é URL pública (CDN/externo) — manter (bridge já tratado via uploadRelativePath).
      if (isKnownCdnHost(url.hostname) || (!isLoopback(url.hostname) && !isLanHost(url.hostname))) {
        return encodeSpaces(url.href);
      }
      if (url.port === "5173" || url.port === "5174" || isWebAssetPath(url.pathname)) {
        const target = new URL(web);
        url.protocol = target.protocol;
        url.hostname = target.hostname;
        url.port = target.port;
        return encodeSpaces(`${url.origin}${url.pathname}${url.search}${url.hash}`);
      }
      if (/onrender\.com$/i.test(url.hostname) && /^\/uploads\//i.test(url.pathname)) {
        const rel = url.pathname.replace(/^\/uploads\//i, "");
        return playableUploadUrl(rel);
      }
      return encodeSpaces(url.href);
    }
  } catch {
    // path relativo abaixo
  }

  const cleaned = raw.replace(/^\/+/, "");
  if (/^assets\//i.test(cleaned)) {
    return encodeSpaces(`${web}/${cleaned}`);
  }
  if (raw.startsWith("/")) {
    return encodeSpaces(isWebAssetPath(raw) ? `${web}${raw}` : `${api}${raw}`);
  }
  return encodeSpaces(`${MEDIA_URL}/${cleaned}`);
}

export function getMediaBaseUrl() {
  return MEDIA_URL;
}
