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

export function getStudentBottomNavPortalRoot(): HTMLElement {
  if (typeof document === "undefined") {
    throw new Error("document unavailable");
  }
  return document.getElementById("atlly-bottom-nav-root") ?? document.body;
}

function pinStudentBottomNavDockToViewport(safeBottom: number) {
  const dock = document.querySelector<HTMLElement>("#atlly-bottom-nav-root .student-bottom-nav-dock, .student-bottom-nav-dock");
  if (!dock) return;
  dock.style.setProperty("position", "fixed", "important");
  dock.style.setProperty("left", "0", "important");
  dock.style.setProperty("right", "0", "important");
  dock.style.setProperty("bottom", "0", "important");
  dock.style.setProperty("width", "100%", "important");
  dock.style.setProperty("margin", "0", "important");
  dock.style.setProperty("transform", "none", "important");
  dock.style.setProperty("z-index", "120", "important");
  dock.style.setProperty("padding-bottom", `${safeBottom}px`, "important");
}

function isStandalonePwa() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone / mobile web / PWA: viewport cheia + safe-area. */
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
        "position:fixed;bottom:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);"
      );
      document.body.appendChild(safeAreaProbe);
    }

    const probeStyle = getComputedStyle(safeAreaProbe);
    const safeTop = parseFloat(probeStyle.paddingTop) || 0;
    const safeLeft = parseFloat(probeStyle.paddingLeft) || 0;
    const safeRight = parseFloat(probeStyle.paddingRight) || 0;
    if (safeTop > 0) root.style.setProperty("--safe-top", `${safeTop}px`);
    if (safeLeft > 0) root.style.setProperty("--safe-left", `${safeLeft}px`);
    if (safeRight > 0) root.style.setProperty("--safe-right", `${safeRight}px`);

    const fromEnv = parseFloat(probeStyle.paddingBottom) || 0;
    if (fromEnv > 0) return fromEnv;

    return isIos ? 34 : 0;
  }

  function sync() {
    const pwa = isStandalonePwa();
    const mobile = pwa || isIos || window.matchMedia("(max-width: 900px)").matches;
    if (!mobile) {
      root.classList.remove("is-mobile-student-layout");
      root.classList.remove("is-pwa-fullscreen");
      return;
    }

    root.classList.add("is-mobile-student-layout");
    root.classList.toggle("is-pwa-fullscreen", pwa);

    const vh = Math.round(window.innerHeight || document.documentElement.clientHeight || 0);
    if (vh > 0) {
      root.style.setProperty("--pwa-vh", `${vh}px`);
    }

    const safeBottom = readSafeAreaBottomPx();
    root.style.setProperty("--safe-bottom", `${safeBottom}px`);
    root.style.setProperty("--expo-safe-bottom", `${safeBottom}px`);

    const navBarPx = 64;
    root.style.setProperty("--student-nav-offset", `calc(var(--student-nav-bar, ${navBarPx}px) + ${safeBottom}px)`);
    root.style.setProperty("--student-bottom-nav-dock-height", `${navBarPx + safeBottom + 12}px`);

    pinStudentBottomNavDockToViewport(safeBottom);
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
  const portalRoot = document.getElementById("atlly-bottom-nav-root");
  if (portalRoot) {
    dockObserver.observe(portalRoot, { childList: true, subtree: true });
  }
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
function readSafeBottomFromRoot(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--safe-bottom").trim();
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function refreshStudentBottomNavDock() {
  if (typeof window === "undefined") return;
  pinStudentBottomNavDockToViewport(readSafeBottomFromRoot());
  window.dispatchEvent(new Event("atlly:refresh-bottom-nav"));
}
