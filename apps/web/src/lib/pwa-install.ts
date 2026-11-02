import { useCallback } from "react";
import { isPwaMarkedInstalled, usePwaInstallStore, wirePwaInstallPrompt } from "../stores/pwaInstallStore";

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

export function isPwaStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

export function canShowPwaInstallHelp(): boolean {
  if (typeof window === "undefined") return false;
  if (isPwaStandalone() || isPwaMarkedInstalled()) return false;
  if (!window.isSecureContext && !import.meta.env.DEV) return false;
  return true;
}

export function canOfferPwaInstall(): boolean {
  if (!canShowPwaInstallHelp()) return false;
  if (isNativeAppShell()) return false;
  return true;
}

export function shouldShowPwaInstallBanner(): boolean {
  return canOfferPwaInstall() && canShowPwaInstallHelp();
}

export function usePwaInstall() {
  wirePwaInstallPrompt();

  const deferredPrompt = usePwaInstallStore((s) => s.deferredPrompt);
  const installing = usePwaInstallStore((s) => s.installing);
  const promptInstallStore = usePwaInstallStore((s) => s.promptInstall);

  const iosDevice = isIosDevice();
  const iosInApp = isIosInAppBrowser();
  const iosSafari = isIosSafari();

  const promptInstall = useCallback(async () => {
    return promptInstallStore();
  }, [promptInstallStore]);

  const hints: PwaInstallHints = {
    canInstall: Boolean(deferredPrompt),
    iosDevice,
    iosInApp,
    iosSafari,
    installing
  };

  return {
    ...hints,
    iosHint: iosSafari,
    promptInstall,
    showSection: canShowPwaInstallHelp()
  };
}

export type { BeforeInstallPromptEvent };
