import { getApiBaseUrl, getMediaBaseUrl } from "../api";

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

/** Legacy webm/mov/etc → API converts to H.264 MP4 (iOS + Android + web). Same as native. */
function playableUploadUrl(relativePath: string) {
  const cleaned = relativePath.replace(/^\/+/, "").split(/[?#]/)[0];
  if (/\.(webm|ogv|ogg|mov|mkv|avi)$/i.test(cleaned)) {
    const api = getApiBaseUrl().replace(/\/+$/, "");
    return `${api}/media/video?path=${encodeURIComponent(cleaned)}`;
  }
  return uploadPublicUrl(cleaned);
}

/**
 * Resolve URL de mídia cadastrada (web + Expo nativo usam a mesma regra).
 * - http(s) externos: intactos
 * - uploads MP4/imagem: CDN (`VITE_MEDIA_URL`) ou `/uploads` em dev
 * - containers legados: `{API}/media/video?path=`
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
