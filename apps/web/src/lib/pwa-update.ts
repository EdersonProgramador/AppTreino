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
      const apply = () => {
        void updateSW(true);
      };
      usePwaUpdateStore.getState().notifyUpdateAvailable(apply);
    },
    onRegistered(registration) {
      if (!registration) return;
      const check = () => {
        void registration.update().catch(() => undefined);
      };
      const promptIfWaiting = () => {
        if (!registration.waiting) return;
        usePwaUpdateStore.getState().notifyUpdateAvailable(() => {
          void updateSW(true);
        });
      };
      check();
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible") return;
        check();
        promptIfWaiting();
      });
      window.addEventListener("focus", () => {
        check();
        promptIfWaiting();
      });
    }
  });
}
