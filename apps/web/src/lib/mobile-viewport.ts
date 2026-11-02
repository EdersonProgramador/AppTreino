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

/** iPhone / mobile web: altura estável + safe-area quando env() falha no PWA. */
export function wireMobileStudentViewport() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => undefined;

  const root = document.documentElement;
  const isIos =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  function readSafeAreaBottomPx() {
    const probe = document.createElement("div");
    probe.setAttribute(
      "style",
      "position:fixed;bottom:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom);padding-bottom:constant(safe-area-inset-bottom);"
    );
    document.body.appendChild(probe);
    const fromEnv = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
    probe.remove();

    if (fromEnv > 0) return fromEnv;

    const vv = window.visualViewport;
    if (vv) {
      const gap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      if (gap > 0) return gap;
    }

    return isIos ? 34 : 0;
  }

  function syncStudentBottomNavDock(safeBottom: number) {
    const dock = document.querySelector<HTMLElement>(".student-bottom-nav-dock");
    if (!dock) return;

    dock.style.setProperty("position", "fixed", "important");
    dock.style.setProperty("left", "0", "important");
    dock.style.setProperty("right", "0", "important");
    dock.style.setProperty("width", "100%", "important");
    dock.style.setProperty("margin", "0", "important");
    dock.style.setProperty("z-index", "120", "important");
    dock.style.setProperty("bottom", "0", "important");
    dock.style.setProperty("padding-bottom", `${safeBottom}px`, "important");
    dock.style.setProperty("transform", "none", "important");

    const rect = dock.getBoundingClientRect();
    const layoutBottom = window.innerHeight;
    const gap = layoutBottom - rect.bottom;
    if (gap > 0.5 && gap < 96) {
      dock.style.setProperty("transform", `translateY(${gap}px)`, "important");
    }
  }

  function sync() {
    const mobile = isIos || window.matchMedia("(max-width: 900px)").matches;
    if (!mobile) {
      root.classList.remove("is-mobile-student-layout");
      return;
    }

    root.classList.add("is-mobile-student-layout");

    const safeBottom = readSafeAreaBottomPx();
    if (safeBottom > 0) {
      root.style.setProperty("--safe-bottom", `${safeBottom}px`);
      root.style.setProperty("--expo-safe-bottom", `${safeBottom}px`);
    }

    const vv = window.visualViewport?.height ?? 0;
    const layoutH = window.innerHeight || root.clientHeight || 0;
    const vh = Math.round(Math.max(layoutH, vv));
    root.style.setProperty("--mobile-vh", `${vh}px`);
    const navBarPx = 64;
    root.style.setProperty("--student-nav-offset", `calc(var(--student-nav-bar, ${navBarPx}px) + ${safeBottom}px)`);
    root.style.setProperty("--student-bottom-nav-dock-height", `${navBarPx + 10 + safeBottom}px`);

    syncStudentBottomNavDock(safeBottom);
  }

  sync();

  const dockObserver = new MutationObserver(() => sync());
  if (document.body) {
    dockObserver.observe(document.body, { childList: true, subtree: true });
  }

  window.visualViewport?.addEventListener("resize", sync);
  window.visualViewport?.addEventListener("scroll", sync);
  window.addEventListener("resize", sync);
  window.addEventListener("orientationchange", () => window.setTimeout(sync, 150));
  window.requestAnimationFrame(() => sync());
  window.setTimeout(sync, 300);

  return () => {
    dockObserver.disconnect();
    window.visualViewport?.removeEventListener("resize", sync);
    window.visualViewport?.removeEventListener("scroll", sync);
    window.removeEventListener("resize", sync);
  };
}
