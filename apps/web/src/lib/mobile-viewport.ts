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
let navResizeObserver: ResizeObserver | null = null;
let navPinWired = false;

function isStandalonePwa() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isAppleTouchDevice() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isIosDevice() {
  return isAppleTouchDevice();
}

function visualViewportBottom() {
  if (typeof window === "undefined") return window.innerHeight;
  const vv = window.visualViewport;
  if (!vv) return window.innerHeight;
  return vv.offsetTop + vv.height;
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
      "position:fixed;bottom:0;left:0;right:0;height:0;box-sizing:border-box;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);"
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

/**
 * Safari já fica acima da barra do browser: não inventar 34px lá.
 * Na Tela de Início o env() costuma vir 0 mesmo com Home Indicator.
 */
function resolveIosBottomInset(insets: { top: number; bottom: number }) {
  if (insets.bottom > 0) return insets.bottom;
  if (!isStandalonePwa() || !isAppleTouchDevice()) return 0;
  return 34;
}

function readSafeAreaInsetsResolved() {
  const insets = readSafeAreaInsets();
  const bottom = resolveIosBottomInset(insets);
  return { ...insets, bottom };
}

/** Só grava px quando > 0 — zero quebra o fallback env() no CSS. */
function applySafeAreaCssVars() {
  const root = document.documentElement;
  const resolved = isAppleTouchDevice()
    ? readSafeAreaInsetsResolved()
    : readSafeAreaInsets();
  const resolvedPairs: Array<[string, number]> = [
    ["--expo-safe-top", resolved.top],
    ["--expo-safe-right", resolved.right],
    ["--expo-safe-bottom", resolved.bottom],
    ["--expo-safe-left", resolved.left],
    ["--safe-top", resolved.top],
    ["--safe-right", resolved.right],
    ["--safe-bottom", resolved.bottom],
    ["--safe-left", resolved.left]
  ];
  for (const [name, px] of resolvedPairs) {
    if (px > 0) root.style.setProperty(name, `${px}px`);
    else root.style.removeProperty(name);
  }
}

function syncAppViewportHeight() {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const vv = window.visualViewport;
  const height = Math.round(vv?.height ?? window.innerHeight);
  document.documentElement.style.setProperty("--app-vh", `${height}px`);
}

/** iOS: home indicator, gap da layout viewport e padding único do menu inferior. */
function syncIosLayoutMetrics() {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  if (!isIosDevice()) return;

  const html = document.documentElement;
  const insets = readSafeAreaInsetsResolved();
  const visualBottom = visualViewportBottom();
  const layoutGap = Math.max(0, window.innerHeight - visualBottom);
  html.style.setProperty("--ios-layout-viewport-gap", `${Math.round(layoutGap)}px`);
  if (insets.bottom > 0) {
    html.style.setProperty("--ios-safe-bottom-pad", `${Math.round(Math.max(insets.bottom, 6))}px`);
  } else {
    html.style.removeProperty("--ios-safe-bottom-pad");
  }

  const fill = Math.max(insets.bottom, layoutGap);
  if (fill > 0.5) html.style.setProperty("--ios-viewport-bottom-fill", `${Math.round(fill)}px`);
  else html.style.removeProperty("--ios-viewport-bottom-fill");
}

function clearDockClearance() {
  const html = document.documentElement;
  html.style.removeProperty("--student-bottom-nav-dock-height");
  html.style.removeProperty("--student-scroll-nav-clearance");
}

function publishDockClearance(root: HTMLElement) {
  const html = document.documentElement;
  const dockHeight = Math.ceil(root.getBoundingClientRect().height);
  if (dockHeight > 0) {
    html.style.setProperty("--student-bottom-nav-dock-height", `${dockHeight}px`);
    html.style.setProperty("--student-scroll-nav-clearance", `${dockHeight}px`);
  } else {
    clearDockClearance();
  }
}

const DOCK_INLINE_PROPS = [
  "position",
  "left",
  "right",
  "bottom",
  "top",
  "width",
  "margin",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "transform",
  "height",
  "min-height",
  "max-height",
  "background",
  "display",
  "flex-direction",
  "justify-content",
  "align-items",
  "z-index",
  "box-sizing",
  "flex",
  "pointer-events"
];

/** O CSS é a fonte do encaixe. Inline !important antigo impedia o env() de valer. */
function clearDockInlineGeometry(root: HTMLElement, navEl: HTMLElement | null) {
  for (const prop of DOCK_INLINE_PROPS) {
    root.style.removeProperty(prop);
    navEl?.style.removeProperty(prop);
  }
  document.documentElement.style.removeProperty("--student-nav-dock-padding-bottom");
  document.documentElement.classList.remove("is-ios-home-indicator");
}

/**
 * Safari: bottom:0 já fica acima do menu do browser.
 * Tela inicial: se a layout viewport continuar na altura antiga, --pwa-bottom-gap
 * desce as barras fixas até o vidro. O padding da safe area fica no CSS.
 */
function syncStandaloneViewport() {
  const html = document.documentElement;
  const vv = window.visualViewport;
  const visualBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  html.style.setProperty("--app-vh", `${Math.round(visualBottom)}px`);

  if (!isStandalonePwa()) {
    html.style.removeProperty("--pwa-bottom-gap");
    html.style.removeProperty("--standalone-nav-safe-bottom");
    return;
  }

  const gap = Math.max(0, Math.round(visualBottom - window.innerHeight));
  html.style.setProperty("--pwa-bottom-gap", `${Math.min(gap, 120)}px`);

  if (!isAppleTouchDevice()) return;
  const pad = Math.max(34, Math.round(readSafeAreaInsets().bottom));
  html.style.setProperty("--safe-bottom", `${pad}px`);
  html.style.setProperty("--standalone-nav-safe-bottom", `${pad}px`);
}

/** Mede o nav portado. O encaixe visual fica no CSS, não em estilo inline. */
export function refreshStudentBottomNavDock() {
  if (typeof document === "undefined") return;

  syncStandaloneViewport();

  const root = document.getElementById("atlly-student-nav-root");
  const html = document.documentElement;
  if (!root) return;

  const nav = root.querySelector(".student-bottom-nav");
  if (!nav) {
    root.style.cssText = "";
    html.classList.remove("has-student-nav-pinned");
    html.style.removeProperty("--student-nav-dock-padding-bottom");
    clearDockClearance();
    syncIosLayoutMetrics();
    return;
  }

  clearDockInlineGeometry(root, nav as HTMLElement);

  const measure = () => {
    applySafeAreaCssVars();
    syncStandaloneViewport();
    publishDockClearance(root);
  };

  syncIosLayoutMetrics();
  measure();
  window.requestAnimationFrame(() => {
    syncIosLayoutMetrics();
    measure();
    window.requestAnimationFrame(() => {
      syncIosLayoutMetrics();
      measure();
    });
  });

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

  if (typeof ResizeObserver !== "undefined") {
    navResizeObserver = new ResizeObserver(schedule);
    navResizeObserver.observe(root);
  }

  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", () => window.setTimeout(schedule, 150));
  window.visualViewport?.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("scroll", schedule);
  schedule();
}

/** Mobile / PWA: safe-area vars + observer do menu inferior. */
export function wireMobileStudentViewport() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => undefined;

  const root = document.documentElement;
  const isIos = isIosDevice();

  function sync() {
    root.classList.toggle("is-ios-pwa", isIos);

    const pwa = isStandalonePwa();
    const mobile = pwa || isIos || window.matchMedia("(max-width: 900px)").matches;
    if (!mobile) {
      root.classList.remove("is-mobile-student-layout");
      syncAppViewportHeight();
      syncStandaloneViewport();
      if (isIos) {
        applySafeAreaCssVars();
        syncIosLayoutMetrics();
      }
      return;
    }

    root.classList.add("is-mobile-student-layout");

    applySafeAreaCssVars();
    syncStandaloneViewport();
    syncIosLayoutMetrics();

    root.style.setProperty("--student-nav-bar", "64px");
    refreshStudentBottomNavDock();
  }

  wireStudentBottomNavPinObserver();
  sync();
  window.addEventListener("resize", sync);
  window.addEventListener("orientationchange", () => window.setTimeout(sync, 100));
  window.visualViewport?.addEventListener("resize", sync);
  window.visualViewport?.addEventListener("scroll", sync);

  return () => {
    window.removeEventListener("resize", sync);
    window.visualViewport?.removeEventListener("resize", sync);
    window.visualViewport?.removeEventListener("scroll", sync);
    navPinObserver?.disconnect();
    navPinObserver = null;
    navResizeObserver?.disconnect();
    navResizeObserver = null;
    navPinWired = false;
  };
}
