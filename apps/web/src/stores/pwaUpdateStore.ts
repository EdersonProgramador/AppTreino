import { create } from "zustand";

type PwaUpdateState = {
  visible: boolean;
  applying: boolean;
  applyUpdate: (() => void) | null;
  notifyUpdateAvailable: (apply: () => void) => void;
  runUpdate: () => void;
  dismissForSession: () => void;
};

let reloadFallbackTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleReloadFallback() {
  if (reloadFallbackTimer) window.clearTimeout(reloadFallbackTimer);
  reloadFallbackTimer = window.setTimeout(() => {
    window.location.reload();
  }, 2500);
}

export const usePwaUpdateStore = create<PwaUpdateState>((set, get) => ({
  visible: false,
  applying: false,
  applyUpdate: null,
  notifyUpdateAvailable: (apply) => {
    if (sessionStorage.getItem("atlly-pwa-update-snooze") === "1") return;
    if (get().visible) {
      set({ applyUpdate: apply });
      return;
    }
    set({ visible: true, applyUpdate: apply });
  },
  runUpdate: () => {
    const apply = get().applyUpdate;
    if (!apply || get().applying) return;
    set({ applying: true });
    try {
      sessionStorage.removeItem("atlly-pwa-update-snooze");
    } catch {
      /* ignore */
    }
    scheduleReloadFallback();
    apply();
  },
  dismissForSession: () => {
    if (reloadFallbackTimer) {
      window.clearTimeout(reloadFallbackTimer);
      reloadFallbackTimer = null;
    }
    try {
      sessionStorage.setItem("atlly-pwa-update-snooze", "1");
    } catch {
      /* ignore */
    }
    set({ visible: false, applying: false });
  }
}));
