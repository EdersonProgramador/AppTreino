import { useCallback, useEffect, useState } from "react";

const PWA_BANNER_DISMISS_KEY = "atlly-pwa-banner-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isIosSafari(): boolean {
  if (!isIosDevice()) return false;
  const ua = navigator.userAgent;
  return /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome/i.test(ua);
}

/** Instagram, WhatsApp, Facebook e outros webviews onde não dá para instalar direto. */
export function isIosInAppBrowser(): boolean {
  if (!isIosDevice()) return false;
  const ua = navigator.userAgent;
  if (/Instagram|FBAN|FBAV|FB_IAB|WhatsApp|Line\/|Twitter|LinkedInApp|TikTok|Snapchat|GoogleApp|GSA\//i.test(ua)) {
    return true;
  }
  if (isIosSafari()) return false;
  if (/CriOS|FxiOS|EdgiOS|OPiOS|EdgA|Chrome|Firefox/i.test(ua)) return false;
  return true;
}

export type PwaInstallHints = {
  canInstall: boolean;
  iosDevice: boolean;
  iosInApp: boolean;
  iosSafari: boolean;
  installing: boolean;
};

export function isNativeAppShell(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /AppTreinoMobile/i.test(navigator.userAgent) ||
    new URLSearchParams(window.location.search).get("app") === "mobile"
  );
}

/** App aberto pela tela inicial (PWA) ou equivalente no iOS. */
export function isPwaStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

/** Mostrar textos e passo a passo (menu, /baixar-app, configurações). */
export function canShowPwaInstallHelp(): boolean {
  if (typeof window === "undefined") return false;
  if (isPwaStandalone()) return false;
  if (!window.isSecureContext && !import.meta.env.DEV) return false;
  return true;
}

/** Prompt nativo de instalação (Android) — não dentro do WebView do app Expo. */
export function canOfferPwaInstall(): boolean {
  if (!canShowPwaInstallHelp()) return false;
  if (isNativeAppShell()) return false;
  return true;
}

export function isPwaBannerDismissed(): boolean {
  try {
    return localStorage.getItem(PWA_BANNER_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissPwaBanner(): void {
  try {
    localStorage.setItem(PWA_BANNER_DISMISS_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [iosDevice] = useState(() => isIosDevice());
  const [iosInApp] = useState(() => isIosInAppBrowser());
  const [iosSafari] = useState(() => isIosSafari());

  useEffect(() => {
    if (!canOfferPwaInstall()) return;

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }

    function onInstalled() {
      setDeferredPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setDeferredPrompt(null);
        return true;
      }
      return false;
    } finally {
      setInstalling(false);
    }
  }, [deferredPrompt]);

  const hints: PwaInstallHints = {
    canInstall: Boolean(deferredPrompt),
    iosDevice,
    iosInApp,
    iosSafari,
    installing
  };

  return {
    ...hints,
    /** @deprecated use iosDevice */
    iosHint: iosSafari,
    promptInstall,
    showSection: canOfferPwaInstall() && (Boolean(deferredPrompt) || iosDevice)
  };
}
