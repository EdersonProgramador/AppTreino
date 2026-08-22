import { Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const THEME_KEY = "app-treino-theme";

export type UiTheme = "dark" | "light";

const listeners = new Set<(theme: UiTheme) => void>();
let theme: UiTheme = "light";
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

function applyNativeTheme(next: UiTheme) {
  try {
    if (typeof Appearance.setColorScheme === "function") {
      Appearance.setColorScheme(next);
    }
  } catch {
    // runtime sem setColorScheme
  }
}

function notify() {
  for (const listener of listeners) listener(theme);
  queueMicrotask(() => applyNativeTheme(theme));
}

export function subscribeTheme(listener: (theme: UiTheme) => void) {
  listeners.add(listener);
  listener(theme);
  return () => {
    listeners.delete(listener);
  };
}

export function getTheme() {
  return theme;
}

export async function hydrateTheme() {
  if (hydrated) return;
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_KEY);
        if (hydrated) return;
        theme = saved === "dark" ? "dark" : "light";
      } catch {
        if (!hydrated) theme = "light";
      } finally {
        hydrated = true;
        notify();
      }
    })();
  }
  await hydratePromise;
}

export function setTheme(next: UiTheme) {
  theme = next;
  hydrated = true;
  notify();
  void AsyncStorage.setItem(THEME_KEY, next).catch(() => {
    // Preferência já está aplicada na sessão.
  });
}
