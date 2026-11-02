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

/** iPhone / mobile web: altura estável + safe-area quando env() falha no PWA. */
export function wireMobileStudentViewport() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => undefined;

  const root = document.documentElement;
  const isIos =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  function readSafeAreaBottomPx() {
    if (!document.body) return isIos ? 34 : 0;

    if (!safeAreaProbe) {
      safeAreaProbe = document.createElement("div");
      safeAreaProbe.setAttribute("aria-hidden", "true");
      safeAreaProbe.setAttribute(
        "style",
        "position:fixed;bottom:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom);padding-bottom:constant(safe-area-inset-bottom);"
      );
      document.body.appendChild(safeAreaProbe);
    }

    const fromEnv = parseFloat(getComputedStyle(safeAreaProbe).paddingBottom) || 0;
    if (fromEnv > 0) return fromEnv;

    const vv = window.visualViewport;
    if (vv) {
      const gap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      if (gap > 0) return gap;
    }

    return isIos ? 34 : 0;
  }

  function sync() {
    const mobile = isIos || window.matchMedia("(max-width: 900px)").matches;
    if (!mobile) {
      root.classList.remove("is-mobile-student-layout");
      return;
    }

    root.classList.add("is-mobile-student-layout");

    const safeBottom = readSafeAreaBottomPx();
    root.style.setProperty("--safe-bottom", `${safeBottom}px`);
    root.style.setProperty("--expo-safe-bottom", `${safeBottom}px`);

    const navBarPx = 64;
    root.style.setProperty("--student-nav-offset", `calc(var(--student-nav-bar, ${navBarPx}px) + ${safeBottom}px)`);
    root.style.setProperty("--student-bottom-nav-dock-height", `${navBarPx + safeBottom + 12}px`);
  }

  let syncRaf = 0;
  const scheduleSync = () => {
    if (syncRaf) return;
    syncRaf = window.requestAnimationFrame(() => {
      syncRaf = 0;
      sync();
    });
  };

  const start = () => {
    scheduleSync();
    window.setTimeout(scheduleSync, 300);
  };

  if (document.body) {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  }

  const dockObserver = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.classList.contains("student-bottom-nav-dock") || node.querySelector(".student-bottom-nav-dock")) {
          scheduleSync();
          return;
        }
      }
    }
  });
  if (document.body) {
    dockObserver.observe(document.body, { childList: true, subtree: false });
  }

  window.visualViewport?.addEventListener("resize", scheduleSync);
  window.visualViewport?.addEventListener("scroll", scheduleSync);
  window.addEventListener("resize", scheduleSync);
  window.addEventListener("orientationchange", () => window.setTimeout(scheduleSync, 150));
  const onDockRefresh = () => scheduleSync();
  window.addEventListener("atlly:refresh-bottom-nav", onDockRefresh);

  return () => {
    dockObserver.disconnect();
    if (syncRaf) window.cancelAnimationFrame(syncRaf);
    window.visualViewport?.removeEventListener("resize", scheduleSync);
    window.visualViewport?.removeEventListener("scroll", scheduleSync);
    window.removeEventListener("resize", scheduleSync);
    window.removeEventListener("atlly:refresh-bottom-nav", onDockRefresh);
  };
}

/** Re-sync após o menu inferior montar (portal). */
export function refreshStudentBottomNavDock() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("atlly:refresh-bottom-nav"));
}
