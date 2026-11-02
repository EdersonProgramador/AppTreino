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
let navPinObserver: MutationObserver | null = null;
let navPinWired = false;

function isStandalonePwa() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function readSafeAreaInsets() {
  if (typeof document === "undefined" || !document.body) {
    return { bottom: 0, top: 0, left: 0, right: 0 };
  }

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

/** Mede o nav portado e aplica pin inline (funciona mesmo com CSS/SW antigo). */
export function refreshStudentBottomNavDock() {
  if (typeof document === "undefined") return;

  const root = document.getElementById("atlly-student-nav-root");
  const html = document.documentElement;
  if (!root) return;

  const nav = root.querySelector(".student-bottom-nav");
  if (!nav) {
    root.style.cssText = "";
    html.classList.remove("has-student-nav-pinned");
    return;
  }

  root.style.setProperty("position", "fixed", "important");
  root.style.setProperty("left", "0", "important");
  root.style.setProperty("right", "0", "important");
  root.style.setProperty("bottom", "0", "important");
  root.style.setProperty("z-index", "120", "important");
  root.style.setProperty("width", "100%", "important");
  root.style.setProperty("margin", "0", "important");
  root.style.setProperty("padding", "0", "important");
  root.style.setProperty("box-sizing", "border-box", "important");
  root.style.setProperty("pointer-events", "none", "important");
  root.style.setProperty("transform", "none", "important");
  root.style.setProperty("background", "transparent", "important");

  const navEl = nav as HTMLElement;
  navEl.style.setProperty("position", "fixed", "important");
  navEl.style.setProperty("left", "0", "important");
  navEl.style.setProperty("right", "0", "important");
  navEl.style.setProperty("bottom", "0", "important");
  navEl.style.setProperty("z-index", "120", "important");
  navEl.style.setProperty("width", "100%", "important");
  navEl.style.setProperty("margin", "0", "important");
  navEl.style.setProperty("margin-top", "0", "important");
  navEl.style.setProperty(
    "padding",
    "6px 12px calc(6px + env(safe-area-inset-bottom, 0px))",
    "important"
  );
  navEl.style.setProperty("box-sizing", "border-box", "important");
  navEl.style.setProperty("pointer-events", "auto", "important");
  navEl.style.setProperty("transform", "none", "important");

  const dockHeight = Math.ceil(navEl.getBoundingClientRect().height);
  if (dockHeight > 0) {
    html.style.setProperty("--student-bottom-nav-dock-height", `${dockHeight}px`);
    html.style.setProperty("--student-scroll-nav-clearance", `${dockHeight}px`);
  }

  html.classList.add("has-student-nav-pinned");
}

function wireStudentBottomNavPinObserver() {
  if (typeof document === "undefined" || navPinWired) return;
  navPinWired = true;

  const root = document.getElementById("atlly-student-nav-root");
  if (!root) return;

  const schedule = () => {
    window.requestAnimationFrame(() => refreshStudentBottomNavDock());
  };

  navPinObserver = new MutationObserver(schedule);
  navPinObserver.observe(root, { childList: true, subtree: true });
  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", () => window.setTimeout(schedule, 120));
  window.visualViewport?.addEventListener("resize", schedule);
  schedule();
}

/** Mobile / PWA: safe-area vars + observer do menu inferior. */
export function wireMobileStudentViewport() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => undefined;

  const root = document.documentElement;
  const isIos =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  function sync() {
    const pwa = isStandalonePwa();
    const mobile = pwa || isIos || window.matchMedia("(max-width: 900px)").matches;
    if (!mobile) {
      root.classList.remove("is-mobile-student-layout");
      return;
    }

    root.classList.add("is-mobile-student-layout");

    const insets = readSafeAreaInsets();
    if (insets.top > 0) root.style.setProperty("--safe-top", `${insets.top}px`);
    if (insets.left > 0) root.style.setProperty("--safe-left", `${insets.left}px`);
    if (insets.right > 0) root.style.setProperty("--safe-right", `${insets.right}px`);
    if (insets.bottom > 0) {
      root.style.setProperty("--safe-bottom", `${insets.bottom}px`);
      root.style.setProperty("--expo-safe-bottom", `${insets.bottom}px`);
    }

    const navBarPx = 64;
    const navPadPx = 8;
    const safeBottom = insets.bottom;
    root.style.setProperty("--student-nav-bar", `${navBarPx}px`);
    const dockPx = navBarPx + navPadPx + safeBottom;
    root.style.setProperty("--student-nav-offset", `${dockPx}px`);
    if (!root.classList.contains("has-student-nav-pinned")) {
      root.style.setProperty("--student-bottom-nav-dock-height", `${dockPx}px`);
    }

    refreshStudentBottomNavDock();
  }

  wireStudentBottomNavPinObserver();
  sync();
  window.addEventListener("resize", sync);
  window.addEventListener("orientationchange", () => window.setTimeout(sync, 100));
  window.visualViewport?.addEventListener("resize", sync);

  return () => {
    window.removeEventListener("resize", sync);
    window.visualViewport?.removeEventListener("resize", sync);
    navPinObserver?.disconnect();
    navPinObserver = null;
    navPinWired = false;
  };
}
