import { API_URL, WEB_URL } from "../config";

/**
 * Mesma regra da web (`apps/web/src/lib/urls.ts` + `getMediaBaseUrl`):
 * - uploads → CDN (EXPO_PUBLIC_MEDIA_URL / R2)
 * - containers legados (webm/mov/…) → R2 direto; fallback usa o MP4 irmão
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

const VIDEO_EXTENSION =
  /\.(mp4|m4v|mov|qt|webm|mkv|avi|divx|ogv|ogg|mpg|mpeg|mpe|m2v|mpv|ts|mts|m2ts|3gp|3g2|flv|f4v|wmv|asf|vob|mxf|rm|rmvb|rv|hevc|h265|h264|av1|ivf)(?=$|[?#])/i;
const resolvedCompatibleVideos = new Map<string, Promise<string | null>>();

function compatibleVideoRelativePath(relativePath: string) {
  const cleaned = relativePath.replace(/^\/+/, "").split(/[?#]/)[0];
  if (/\.compat\.mp4$/i.test(cleaned) || !VIDEO_EXTENSION.test(cleaned)) return null;
  if (/\.mp4$/i.test(cleaned)) {
    return cleaned.replace(/\.mp4$/i, ".compat.mp4");
  }
  return cleaned.replace(VIDEO_EXTENSION, ".mp4");
}

/**
 * Plano B sem passar pelo Render: o upload e o transcodificador persistem
 * `nome.mp4` ao lado do arquivo legado no R2. Range requests de vídeo no
 * `/media/video` acionavam o desafio 429 do Cloudflare antes de chegar à API.
 */
export function videoBridgeUrl(path?: string | null): string | null {
  const relative = uploadRelativePath(path);
  if (!relative) return null;
  const compatible = compatibleVideoRelativePath(relative);
  if (!compatible) return null;
  const bridged = uploadPublicUrl(compatible);
  return bridged === path ? null : bridged;
}

/**
 * Prepara vídeo antigo apenas quando o MP4 irmão ainda não existe.
 * Chamadas simultâneas para o mesmo arquivo compartilham uma única Promise,
 * impedindo rajadas no servidor.
 */
export function resolvePlayableVideoUrl(path?: string | null): Promise<string | null> {
  const relative = uploadRelativePath(path);
  if (!relative || !compatibleVideoRelativePath(relative)) return Promise.resolve(null);

  const cleaned = relative.replace(/^\/+/, "").split(/[?#]/)[0];
  const cached = resolvedCompatibleVideos.get(cleaned);
  if (cached) return cached;

  const task = fetch(`${originOf(API_URL)}/media/video-url?path=${encodeURIComponent(cleaned)}`, {
    headers: { Accept: "application/json" }
  })
    .then(async (response) => {
      if (response.ok) {
        const data = (await response.json()) as { url?: unknown };
        if (typeof data.url === "string" && /^https?:\/\//i.test(data.url)) {
          return encodeSpaces(data.url);
        }
      }

      // Compatibilidade enquanto `/media/video-url` ainda não estiver no
      // backend publicado: HEAD aciona o conversor antigo sem baixar o vídeo.
      if (response.status === 404) {
        // A rota antiga não força recodificação de MP4/HEVC; só a nova cria
        // `.compat.mp4`. Evita afirmar que um arquivo inexistente foi criado.
        if (/\.(mp4|m4v)$/i.test(cleaned)) return null;
        const legacy = await fetch(
          `${originOf(API_URL)}/media/video?path=${encodeURIComponent(cleaned)}`,
          { method: "HEAD" }
        );
        if (legacy.ok) {
          try {
            const finalUrl = new URL(legacy.url);
            // Sem redirect: a rota terminou de converter e respondeu ela mesma.
            if (/\/media\/video$/i.test(finalUrl.pathname)) {
              return videoBridgeUrl(cleaned);
            }
          } catch {
            // Continua pela verificação do caminho abaixo.
          }
          const redirectedPath = uploadRelativePath(legacy.url);
          if (!redirectedPath || !VIDEO_EXTENSION.test(redirectedPath)) {
            return videoBridgeUrl(cleaned);
          }
        }
      }
      return null;
    })
    .catch(() => null)
    .then((url) => {
      if (!url) resolvedCompatibleVideos.delete(cleaned);
      return url;
    });

  resolvedCompatibleVideos.set(cleaned, task);
  return task;
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

/** Toda mídia começa pelo CDN; AppVideo tenta o MP4 irmão se o codec falhar. */
function playableUploadUrl(relativePath: string) {
  const cleaned = relativePath.replace(/^\/+/, "").split(/[?#]/)[0];
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
