import { create } from "zustand";

type PwaUpdateState = {
  visible: boolean;
  applying: boolean;
  applyUpdate: (() => void) | null;
  notifyUpdateAvailable: (apply: () => void) => void;
  runUpdate: () => void;
  dismissForSession: () => void;
};

export const usePwaUpdateStore = create<PwaUpdateState>((set, get) => ({
  visible: false,
  applying: false,
  applyUpdate: null,
  notifyUpdateAvailable: (apply) => {
    if (sessionStorage.getItem("atlly-pwa-update-snooze") === "1") return;
    set({ visible: true, applyUpdate: apply });
  },
  runUpdate: () => {
    const apply = get().applyUpdate;
    if (!apply) return;
    set({ applying: true });
    apply();
  },
  dismissForSession: () => {
    try {
      sessionStorage.setItem("atlly-pwa-update-snooze", "1");
    } catch {
      /* ignore */
    }
    set({ visible: false });
  }
}));
