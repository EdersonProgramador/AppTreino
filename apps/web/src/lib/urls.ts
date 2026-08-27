import { getApiBaseUrl, getMediaBaseUrl } from "../api";
import { VIDEO_FILE_EXTENSIONS } from "./video-formats";

export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;

/**
 * Path relativo só para uploads LOCAIS da API (`/uploads/images|lessons|...`).
 * Não confundir com `/wp-content/uploads/` de sites externos.
 * Contrato alinhado com `apps/mobile/src/lib/media.ts`.
 */
export function uploadRelativePath(path?: string | null): string | null {
  if (!path) return null;

  const trimmed = path.trim();
  if (!trimmed || /^data:/i.test(trimmed)) return null;

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
  if (cleaned.startsWith("uploads/")) {
    return cleaned.slice("uploads/".length);
  }

  if (/^(images|lessons|materials|audio)\//i.test(cleaned)) {
    return cleaned;
  }

  return null;
}

function uploadPublicUrl(relativePath: string) {
  const cleaned = relativePath.replace(/^\/+/, "");
  const mediaBase = getMediaBaseUrl().replace(/\/+$/, "");
  if (mediaBase) {
    return `${mediaBase}/${cleaned}`;
  }
  return `/uploads/${cleaned}`;
}

/**
 * Chrome e Firefox tocam WebM direto do CDN; só Safari precisa de conversão.
 * Perguntamos ao próprio navegador em vez de checar user agent.
 */
let webmSupport: boolean | null = null;
const ALL_VIDEO_EXTENSIONS = new Set<string>(VIDEO_FILE_EXTENSIONS);
const LEGACY_VIDEO_EXTENSIONS = new Set<string>(
  VIDEO_FILE_EXTENSIONS.filter((extension) => extension !== "mp4" && extension !== "m4v")
);

function videoExtension(path: string) {
  const match = path.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i);
  return match?.[1]?.toLowerCase() ?? "";
}

function canPlayWebm() {
  if (webmSupport !== null) return webmSupport;
  if (typeof document === "undefined") return false;
  const probe = document.createElement("video");
  webmSupport = Boolean(
    probe.canPlayType?.('video/webm; codecs="vp9,opus"') || probe.canPlayType?.("video/webm")
  );
  return webmSupport;
}

/**
 * Containers legados que o navegador não abre passam uma vez pelo resolvedor:
 * ele cria o MP4 antigo que estiver faltando e redireciona ao R2. Depois do
 * redirect, todos os Range GETs são feitos diretamente no CDN.
 */
function playableUploadUrl(relativePath: string) {
  const cleaned = relativePath.replace(/^\/+/, "").split(/[?#]/)[0];
  const extension = videoExtension(cleaned);
  const isWebm = extension === "webm";
  if (isWebm && canPlayWebm()) {
    return uploadPublicUrl(cleaned);
  }
  if (LEGACY_VIDEO_EXTENSIONS.has(extension)) {
    const api = getApiBaseUrl().replace(/\/+$/, "");
    return `${api}/media/video-url?path=${encodeURIComponent(cleaned)}&redirect=1`;
  }
  return uploadPublicUrl(cleaned);
}

/** URL usada uma única vez quando o navegador rejeita o codec/container. */
export function compatibleVideoUrl(path?: string | null) {
  const relative = uploadRelativePath(path);
  if (!relative) return "";
  const cleaned = relative.replace(/^\/+/, "").split(/[?#]/)[0];
  const extension = videoExtension(cleaned);
  if (!ALL_VIDEO_EXTENSIONS.has(extension) || /\.compat\.mp4$/i.test(cleaned)) return "";
  const api = getApiBaseUrl().replace(/\/+$/, "");
  return `${api}/media/video-url?path=${encodeURIComponent(cleaned)}&redirect=1`;
}

/**
 * Conecta ao `onError` de <video>. Evita loop por arquivo e preserva autoplay;
 * após o redirect, toda reprodução/Range GET acontece no R2.
 */
export function retryVideoAsCompatible(video: HTMLVideoElement, originalPath?: string | null) {
  const fallback = compatibleVideoUrl(originalPath);
  if (!fallback) return false;
  const key = uploadRelativePath(originalPath) ?? originalPath ?? "";
  if (video.dataset.compatAttempted === key) return false;
  video.dataset.compatAttempted = key;
  const shouldPlay = video.autoplay || !video.paused;
  video.src = fallback;
  video.load();
  if (shouldPlay) {
    void video.play().catch(() => undefined);
  }
  return true;
}

/**
 * Resolve URL de mídia cadastrada (web + Expo nativo usam a mesma regra).
 * - http(s) externos: intactos
 * - uploads MP4/imagem: CDN (`VITE_MEDIA_URL`) ou `/uploads` em dev
 * - containers legados: original no navegador compatível; caso contrário MP4 no CDN
 * - `/assets/...`: assets do front
 */
export const mediaUrl = (path?: string | null) => {
  if (!path) return "";
  const raw = path.trim();
  if (!raw) return "";
  if (/^(data:|blob:)/i.test(raw)) return raw;

  if (/^https?:\/\//i.test(raw)) {
    const relative = uploadRelativePath(raw);
    if (relative) {
      return playableUploadUrl(relative);
    }
    return raw;
  }

  const relative = uploadRelativePath(raw);
  if (relative) {
    return playableUploadUrl(relative);
  }

  const trimmed = raw.replace(/^\/+/, "");
  return assetUrl(trimmed);
};

export function playableMediaUrl(path?: string | null) {
  return mediaUrl(path);
}

type OptimizedMediaOptions = {
  width?: number;
  quality?: number;
};

/** Opcional: thumb derivado (só uploads locais de imagem). */
export function optimizedMediaUrl(path?: string | null, options: OptimizedMediaOptions = {}) {
  const full = mediaUrl(path);
  if (!full || !options.width) return full;

  const relative = uploadRelativePath(path);
  if (!relative) return full;

  if (!/\.(png|jpe?g|gif|webp|avif|bmp)(\?|#|$)/i.test(relative)) {
    return full;
  }

  const api = getApiBaseUrl().replace(/\/+$/, "");
  const params = new URLSearchParams({
    path: relative,
    w: String(Math.round(options.width))
  });
  if (options.quality) {
    params.set("q", String(Math.round(options.quality)));
  }

  return `${api}/media?${params.toString()}`;
}

export const googleClientId = import.meta.env?.VITE_GOOGLE_CLIENT_ID as string | undefined;
