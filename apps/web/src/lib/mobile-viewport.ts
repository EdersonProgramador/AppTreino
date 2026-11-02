export function getStudentBottomNavPortalRoot(): HTMLElement {
  if (typeof document === "undefined") {
    return null as unknown as HTMLElement;
  }
  return document.getElementById("atlly-student-nav-root") ?? document.body;
}

export function shouldPinStudentBottomNavToViewport(): boolean {
  if (typeof window === "undefined") return false;
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const native =
    /AppTreinoMobile/i.test(navigator.userAgent) ||
    new URLSearchParams(window.location.search).get("app") === "mobile";
  return ios || standalone || native || window.matchMedia("(max-width: 900px)").matches;
}

let safeAreaProbe: HTMLDivElement | null = null;

function isStandalonePwa() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Mobile / PWA: expõe safe-area e altura útil via CSS vars (sem estilo inline no nav). */
export function wireMobileStudentViewport() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => undefined;

  const root = document.documentElement;
  const isIos =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  function readSafeAreaInsets() {
    if (!document.body) return { bottom: 0, top: 0, left: 0, right: 0 };

    if (!safeAreaProbe) {
      safeAreaProbe = document.createElement("div");
      safeAreaProbe.setAttribute("aria-hidden", "true");
      safeAreaProbe.setAttribute(
        "style",
        "position:fixed;bottom:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);"
      );
      document.body.appendChild(safeAreaProbe);
    }

    const s = getComputedStyle(safeAreaProbe);
    return {
      top: parseFloat(s.paddingTop) || 0,
      bottom: parseFloat(s.paddingBottom) || 0,
      left: parseFloat(s.paddingLeft) || 0,
      right: parseFloat(s.paddingRight) || 0
    };
  }

  function sync() {
    const pwa = isStandalonePwa();
    const mobile = pwa || isIos || window.matchMedia("(max-width: 900px)").matches;
    if (!mobile) {
      root.classList.remove("is-mobile-student-layout");
      return;
    }

    root.classList.add("is-mobile-student-layout");

    const layoutHeight = Math.round(window.visualViewport?.height ?? window.innerHeight ?? 0);
    if (layoutHeight > 0) {
      root.style.setProperty("--pwa-vh", `${layoutHeight}px`);
    }

    const insets = readSafeAreaInsets();
    if (insets.top > 0) root.style.setProperty("--safe-top", `${insets.top}px`);
    if (insets.left > 0) root.style.setProperty("--safe-left", `${insets.left}px`);
    if (insets.right > 0) root.style.setProperty("--safe-right", `${insets.right}px`);
    if (insets.bottom > 0) {
      root.style.setProperty("--safe-bottom", `${insets.bottom}px`);
      root.style.setProperty("--expo-safe-bottom", `${insets.bottom}px`);
    }

    const navBarPx = 64;
    const safeBottom = insets.bottom;
    root.style.setProperty("--student-nav-offset", `calc(var(--student-nav-bar, ${navBarPx}px) + ${safeBottom}px)`);
    root.style.setProperty("--student-bottom-nav-dock-height", `${navBarPx + safeBottom}px`);
  }

  sync();
  window.addEventListener("resize", sync);
  window.addEventListener("orientationchange", () => window.setTimeout(sync, 100));
  window.visualViewport?.addEventListener("resize", sync);

  return () => {
    window.removeEventListener("resize", sync);
    window.visualViewport?.removeEventListener("resize", sync);
  };
}

export function refreshStudentBottomNavDock() {
  /* noop — layout do nav é 100% CSS */
}
