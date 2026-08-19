import { getApiBaseUrl } from "../api";

export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;

/**
 * Path relativo só para uploads LOCAIS da API (`/uploads/images|lessons|...`).
 * Não confundir com `/wp-content/uploads/` de sites externos.
 */
export function uploadRelativePath(path?: string | null): string | null {
  if (!path) return null;

  const trimmed = path.trim();
  if (!trimmed || /^data:/i.test(trimmed)) return null;

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      // Somente pathname que COMEÇA com /uploads/ (API App Treino).
      if (!/^\/uploads\//i.test(url.pathname)) {
        return null;
      }
      return decodeURIComponent(url.pathname.slice("/uploads/".length));
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

/**
 * Resolve URL de mídia cadastrada.
 * - http(s) externos (GIF/vídeo/imagem): intactos
 * - uploads da API: `/uploads/...` (proxy Vite)
 * - `/assets/...`: assets do front
 */
export const mediaUrl = (path?: string | null) => {
  if (!path) return "";
  const raw = path.trim();
  if (!raw) return "";
  if (/^data:/i.test(raw)) return raw;

  // URLs absolutas: externas ficam iguais; só /uploads/ da API vira same-origin.
  if (/^https?:\/\//i.test(raw)) {
    const relative = uploadRelativePath(raw);
    if (relative) {
      return `/uploads/${relative}`;
    }
    return raw;
  }

  const relative = uploadRelativePath(raw);
  if (relative) {
    return `/uploads/${relative}`;
  }

  const trimmed = raw.replace(/^\/+/, "");
  return assetUrl(trimmed);
};

export function playableMediaUrl(path?: string | null) {
  const resolved = mediaUrl(path);
  if (!resolved) return "";
  if (/^(data:|blob:)/i.test(resolved)) return resolved;
  if (typeof window === "undefined") return resolved;

  // Relativo same-origin → proxy Vite (/uploads)
  if (resolved.startsWith("/")) {
    return resolved;
  }

  try {
    const url = new URL(resolved, window.location.href);
    // Qualquer host apontando para /uploads/ da API → same-origin relativo
    if (/^\/uploads\//i.test(url.pathname)) {
      return `${url.pathname}${url.search}`;
    }
    if (url.origin === window.location.origin) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
    return url.href;
  } catch {
    return resolved;
  }
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
