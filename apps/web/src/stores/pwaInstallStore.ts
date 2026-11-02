import { create } from "zustand";

const PWA_INSTALLED_KEY = "atlly-pwa-installed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let listenersWired = false;

export function isPwaMarkedInstalled(): boolean {
  try {
    return localStorage.getItem(PWA_INSTALLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markPwaInstallComplete() {
  try {
    localStorage.setItem(PWA_INSTALLED_KEY, "1");
  } catch {
    /* ignore */
  }
}

function markPwaInstalled() {
  markPwaInstallComplete();
}

type PwaInstallState = {
  deferredPrompt: BeforeInstallPromptEvent | null;
  installing: boolean;
  promptInstall: () => Promise<boolean>;
  clearPrompt: () => void;
};

export const usePwaInstallStore = create<PwaInstallState>((set, get) => ({
  deferredPrompt: null,
  installing: false,
  clearPrompt: () => set({ deferredPrompt: null }),
  promptInstall: async () => {
    const deferredPrompt = get().deferredPrompt;
    if (!deferredPrompt) return false;
    set({ installing: true });
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        markPwaInstalled();
        set({ deferredPrompt: null });
        return true;
      }
      return false;
    } finally {
      set({ installing: false });
    }
  }
}));

/** Um único listener global — compartilha o prompt entre banner, menu e /baixar-app. */
export function wirePwaInstallPrompt() {
  if (listenersWired || typeof window === "undefined") return;
  listenersWired = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    usePwaInstallStore.setState({ deferredPrompt: event as BeforeInstallPromptEvent });
  });

  window.addEventListener("appinstalled", () => {
    markPwaInstalled();
    usePwaInstallStore.setState({ deferredPrompt: null });
  });
}
