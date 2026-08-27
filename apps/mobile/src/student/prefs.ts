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

const COMPASS_KEY = "app-treino-map-compass";

const compassListeners = new Set<(on: boolean) => void>();
let compassOn = true;
let compassHydrated = false;

function notifyCompass() {
  for (const listener of compassListeners) listener(compassOn);
}

export function subscribeMapCompass(listener: (on: boolean) => void) {
  compassListeners.add(listener);
  listener(compassOn);
  return () => {
    compassListeners.delete(listener);
  };
}

export function isMapCompassEnabled() {
  return compassOn;
}

export async function hydrateMapCompass() {
  if (compassHydrated) return compassOn;
  try {
    const saved = await AsyncStorage.getItem(COMPASS_KEY);
    if (saved === "0") compassOn = false;
    else if (saved === "1") compassOn = true;
  } catch {
    compassOn = true;
  }
  compassHydrated = true;
  notifyCompass();
  return compassOn;
}

export function setMapCompassEnabled(next: boolean) {
  compassOn = next;
  compassHydrated = true;
  notifyCompass();
  void AsyncStorage.setItem(COMPASS_KEY, next ? "1" : "0").catch(() => undefined);
}
