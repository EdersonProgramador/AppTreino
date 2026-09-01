import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const CHUNK_RELOAD_KEY = "atlly-chunk-reload";
const CHUNK_RELOAD_COOLDOWN_MS = 15_000;

export function isChunkLoadError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("importing a module script failed") ||
    message.includes("error loading dynamically imported module") ||
    message.includes("failed to load module script")
  );
}

/** Reload once after deploy when a hashed chunk 404s. Returns true if reload was triggered. */
export function reloadForStaleChunk() {
  if (typeof window === "undefined") return false;

  const last = sessionStorage.getItem(CHUNK_RELOAD_KEY);
  const now = Date.now();
  if (last && now - Number(last) < CHUNK_RELOAD_COOLDOWN_MS) {
    return false;
  }

  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
  window.location.reload();
  return true;
}

export async function importWithChunkRetry<T>(factory: () => Promise<T>): Promise<T> {
  try {
    return await factory();
  } catch (error) {
    if (isChunkLoadError(error) && reloadForStaleChunk()) {
      return new Promise(() => {});
    }
    throw error;
  }
}

export function lazyWithChunkRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return lazy(() => importWithChunkRetry(factory));
}
