import { registerSW } from "virtual:pwa-register";
import { usePwaUpdateStore } from "../stores/pwaUpdateStore";

let started = false;

function wireReloadOnControllerChange() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (usePwaUpdateStore.getState().applying) {
      window.location.reload();
    }
  });
}

/** Registra SW e avisa quando houver build novo (PWA / Safari com SW). */
export function startPwaUpdateWatcher() {
  if (started || !import.meta.env.PROD || typeof window === "undefined") return;
  started = true;
  wireReloadOnControllerChange();

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      usePwaUpdateStore.getState().notifyUpdateAvailable(() => {
        void updateSW(true);
      });
    },
    onRegistered(registration) {
      if (!registration) return;
      const check = () => {
        void registration.update().catch(() => undefined);
      };
      check();
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
      window.addEventListener("focus", check);
    }
  });
}
