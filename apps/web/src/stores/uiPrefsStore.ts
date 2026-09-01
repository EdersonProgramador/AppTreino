import { create } from "zustand";
import { setSoundEnabled as setLibrarySoundEnabled } from "react-sounds";

export type UiTheme = "dark" | "light";

const THEME_KEY = "app-treino-theme";
const SOUND_KEY = "app-treino-sound-enabled";

const readTheme = (): UiTheme => {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem(THEME_KEY);
  return saved === "dark" ? "dark" : "light";
};

const readSoundEnabled = (): boolean => {
  if (typeof window === "undefined") return true;
  const saved = window.localStorage.getItem(SOUND_KEY);
  if (saved === null) return true;
  return saved === "1" || saved === "true";
};

export const applyDocumentTheme = (theme: UiTheme) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document.body.classList.remove("bg-ink", "bg-sand", "text-sand", "text-ink");
  document.body.style.backgroundColor = theme === "dark" ? "#05070c" : "#f4f7fc";
  document.body.style.color = theme === "dark" ? "#ecf2fa" : "#0a0e16";
};

type UiPrefsState = {
  theme: UiTheme;
  soundEnabled: boolean;
  setTheme: (theme: UiTheme) => void;
  toggleTheme: () => void;
  setSoundEnabled: (enabled: boolean) => void;
  toggleSound: () => void;
  hydrate: () => void;
};

export const useUiPrefsStore = create<UiPrefsState>((set, get) => ({
  theme: "light",
  soundEnabled: true,
  hydrate: () => {
    const theme = readTheme();
    const soundEnabled = readSoundEnabled();
    applyDocumentTheme(theme);
    try {
      setLibrarySoundEnabled(soundEnabled);
    } catch {
      // howler/react-sounds indisponível
    }
    set({ theme, soundEnabled });
  },
  setTheme: (theme) => {
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // storage bloqueado
    }
    applyDocumentTheme(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    get().setTheme(next);
  },
  setSoundEnabled: (enabled) => {
    try {
      window.localStorage.setItem(SOUND_KEY, enabled ? "1" : "0");
    } catch {
      // storage bloqueado
    }
    try {
      setLibrarySoundEnabled(enabled);
    } catch {
      // howler/react-sounds indisponível
    }
    set({ soundEnabled: enabled });
  },
  toggleSound: () => {
    get().setSoundEnabled(!get().soundEnabled);
  }
}));
