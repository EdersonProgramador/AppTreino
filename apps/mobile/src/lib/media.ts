import { API_URL, WEB_URL } from "../config";

const MEDIA_URL = (process.env.EXPO_PUBLIC_MEDIA_URL ?? "").replace(/\/$/, "");

function originOf(url: string) {
  return url.replace(/\/$/, "");
}

function isLoopback(host: string) {
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1";
}

function isLanHost(host: string) {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
}

function isUploadPath(pathname: string) {
  return /^\/uploads\//i.test(pathname) || /^\/media(\/|$)/i.test(pathname);
}

function isWebAssetPath(pathname: string) {
  return /^\/assets\//i.test(pathname);
}

function isKnownCdnHost(host: string) {
  return /(youtube\.com|youtu\.be|ytimg\.com|vimeo\.com|giphy\.com|tenor\.com|imgur\.com|cloudinary\.com|googleusercontent\.com|fbcdn\.net|r2\.dev|cloudflarestorage\.com|media\.edersonprogramador\.com)/i.test(
    host
  );
}

function withOrigin(pathnameAndSearch: string, base: string) {
  const path = pathnameAndSearch.startsWith("/") ? pathnameAndSearch : `/${pathnameAndSearch}`;
  return `${originOf(base)}${path}`;
}

function rewriteHost(url: URL, base: string) {
  const target = new URL(base);
  url.protocol = target.protocol;
  url.hostname = target.hostname;
  url.port = target.port;
  return `${url.origin}${url.pathname}${url.search}${url.hash}`;
}

function encodeSpaces(href: string) {
  return href.includes(" ") ? encodeURI(href) : href;
}

/**
 * Resolve mídia cadastrada para o app nativo.
 * Uploads da API (`/uploads/...`) batem na API; `/assets/...` no front web.
 * Localhost/LAN gravado no banco é reescrito para o host atual do Expo.
 */
export function mediaUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  const trimmed = path.trim();
  if (!trimmed) return undefined;
  if (/^(data:|file:|content:|blob:)/i.test(trimmed)) return trimmed;

  const api = originOf(API_URL);
  const web = originOf(WEB_URL);
  const media = MEDIA_URL || `${api}/uploads`;
  let raw = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
  if (/^(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com)\//i.test(raw)) {
    raw = `https://${raw}`;
  }

  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);
      if (isUploadPath(url.pathname)) {
        const relative = url.pathname.replace(/^\/uploads\//i, "").replace(/^\/+/, "");
        return encodeSpaces(`${originOf(media)}/${relative}${url.search}`);
      }
      const cdnPath = url.pathname.replace(/^\/+/, "");
      if (/^(images|lessons|materials|audio)\//i.test(cdnPath)) {
        return encodeSpaces(`${originOf(media)}/${cdnPath}${url.search}`);
      }
      if (isWebAssetPath(url.pathname)) {
        return encodeSpaces(withOrigin(`${url.pathname}${url.search}`, web));
      }
      if (isKnownCdnHost(url.hostname) || (!isLoopback(url.hostname) && !isLanHost(url.hostname))) {
        return encodeSpaces(url.href);
      }
      if (url.port === "5173" || url.port === "5174" || isWebAssetPath(url.pathname)) {
        return encodeSpaces(rewriteHost(url, web));
      }
      return encodeSpaces(rewriteHost(url, api));
    }
  } catch {
    // path relativo abaixo
  }

  const cleaned = raw.replace(/^\/+/, "");
  if (/^(images|lessons|materials|audio)\//i.test(cleaned)) {
    return encodeSpaces(`${originOf(media)}/${cleaned}`);
  }
  if (/^uploads\//i.test(cleaned) || /^media(\?|\/|$)/i.test(cleaned)) {
    if (/^uploads\//i.test(cleaned)) {
      return encodeSpaces(`${originOf(media)}/${cleaned.slice("uploads/".length)}`);
    }
    return encodeSpaces(`${api}/${cleaned}`);
  }
  if (/^assets\//i.test(cleaned)) {
    return encodeSpaces(`${web}/${cleaned}`);
  }
  if (raw.startsWith("/")) {
    return encodeSpaces(isWebAssetPath(raw) ? `${web}${raw}` : `${api}${raw}`);
  }
  return encodeSpaces(`${api}/${cleaned}`);
}
