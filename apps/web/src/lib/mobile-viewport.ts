export function getStudentBottomNavPortalRoot(): HTMLElement {
  if (typeof document === "undefined") {
    return null as unknown as HTMLElement;
  }
  return document.getElementById("atlly-student-nav-root") ?? document.body;
}

export function shouldPinStudentBottomNavToViewport(): boolean {
  if (typeof window === "undefined") return false;
  const native =
    /AppTreinoMobile/i.test(navigator.userAgent) ||
    new URLSearchParams(window.location.search).get("app") === "mobile";
  // Expo: tab bar no fluxo do flex (header | scroll | nav), não portal fixo.
  if (native || isStandalonePwa()) return false;
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios || window.matchMedia("(max-width: 900px)").matches;
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

function isIphoneDevice() {
  if (typeof navigator === "undefined") return false;
  return /iPhone/.test(navigator.userAgent) && !/iPad/.test(navigator.userAgent);
}

function isMobileViewport() {
  if (typeof window === "undefined") return false;
  return (
    isStandalonePwa() ||
    isAppleTouchDevice() ||
    window.matchMedia("(max-width: 900px)").matches
  );
}

/** Bottom edge of the visual viewport in layout coordinates + layout/viewport gap. */
export function readVisualViewportMetrics() {
  if (typeof window === "undefined") {
    return {
      visualBottom: 0,
      layoutHeight: 0,
      layoutGap: 0,
      offsetTop: 0,
      visualHeight: 0
    };
  }
  const vv = window.visualViewport;
  const layoutHeight = window.innerHeight;
  const offsetTop = vv?.offsetTop ?? 0;
  const visualHeight = vv?.height ?? layoutHeight;
  const visualBottom = offsetTop + visualHeight;
  return {
    visualBottom: Math.round(visualBottom),
    layoutHeight,
    layoutGap: Math.round(Math.max(0, layoutHeight - visualBottom)),
    offsetTop: Math.round(offsetTop),
    visualHeight: Math.round(visualHeight)
  };
}

/** When env(safe-area-inset-bottom) is 0 (comum no PWA iOS), estima pelo gap ou tamanho da tela. */
export function estimateBottomSafeInset(layoutGap: number): number {
  if (layoutGap >= 4) return Math.round(layoutGap);
  if (typeof window === "undefined") return 0;

  if (isStandalonePwa() && isIphoneDevice()) {
    const shortSide = Math.min(window.screen.width, window.screen.height);
    return Math.min(34, Math.max(20, Math.round(shortSide * 0.042)));
  }
  if (isStandalonePwa() && isAppleTouchDevice()) {
    return Math.min(20, Math.max(0, Math.round(layoutGap)));
  }
  return layoutGap >= 1 ? Math.round(layoutGap) : 0;
}

function visualViewportBottom() {
  return readVisualViewportMetrics().visualBottom;
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

/** Inset medido + fallback dinâmico quando env() zera (PWA iOS) ou há gap de viewport. */
function resolveMobileSafeInsets(
  insets: { top: number; right: number; bottom: number; left: number },
  layoutGap: number
) {
  let bottom = insets.bottom;
  if (bottom <= 0) {
    bottom = estimateBottomSafeInset(layoutGap);
  } else if (layoutGap > bottom) {
    bottom = Math.max(bottom, Math.round(layoutGap));
  }
  return {
    top: Math.round(insets.top),
    right: Math.round(insets.right),
    left: Math.round(insets.left),
    bottom: Math.round(bottom)
  };
}

/** Só grava px quando > 0 — zero quebra o fallback env() no CSS. */
function applySafeAreaCssVars(layoutGap = readVisualViewportMetrics().layoutGap) {
  const root = document.documentElement;
  const raw = readSafeAreaInsets();
  const resolved = resolveMobileSafeInsets(raw, layoutGap);
  const expoPairs: Array<[string, number]> = [
    ["--expo-safe-top", raw.top],
    ["--expo-safe-right", raw.right],
    ["--expo-safe-bottom", raw.bottom],
    ["--expo-safe-left", raw.left]
  ];
  for (const [name, px] of expoPairs) {
    if (px > 0) root.style.setProperty(name, `${px}px`);
    else root.style.removeProperty(name);
  }

  if (!isMobileViewport()) return;

  const safePairs: Array<[string, number]> = [
    ["--safe-top", resolved.top],
    ["--safe-right", resolved.right],
    ["--safe-left", resolved.left],
    ["--safe-bottom", resolved.bottom]
  ];
  for (const [name, px] of safePairs) {
    if (px > 0) root.style.setProperty(name, `${px}px`);
    else root.style.removeProperty(name);
  }
}

function syncAppViewportHeight() {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const { visualBottom } = readVisualViewportMetrics();
  document.documentElement.style.setProperty("--app-vh", `${visualBottom}px`);
}

/** Mobile: home indicator, gap da layout viewport e padding único do menu inferior. */
function syncMobileLayoutMetrics() {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  if (!isMobileViewport()) return;

  const html = document.documentElement;
  const raw = readSafeAreaInsets();
  const { layoutGap } = readVisualViewportMetrics();
  html.style.setProperty("--ios-layout-viewport-gap", `${layoutGap}px`);

  const resolved = resolveMobileSafeInsets(raw, layoutGap);
  let bottomPad = resolved.bottom;
  if (bottomPad <= 0) {
    bottomPad =
      parseFloat(getComputedStyle(html).getPropertyValue("--safe-bottom")) ||
      parseFloat(getComputedStyle(html).getPropertyValue("--expo-safe-bottom")) ||
      0;
  }
  if (bottomPad > 0) {
    html.style.setProperty("--ios-safe-bottom-pad", `${Math.round(Math.max(bottomPad, 6))}px`);
  } else {
    html.style.removeProperty("--ios-safe-bottom-pad");
  }

  const fill = Math.max(bottomPad, layoutGap);
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
  const { visualBottom, layoutGap, layoutHeight, offsetTop } = readVisualViewportMetrics();
  html.style.setProperty("--app-vh", `${visualBottom}px`);
  html.style.setProperty("--vv-offset-top", `${offsetTop}px`);

  if (!isStandalonePwa()) {
    html.style.removeProperty("--pwa-bottom-gap");
    html.style.removeProperty("--standalone-nav-safe-bottom");
    return;
  }

  let gap = Math.max(layoutGap, Math.round(visualBottom - layoutHeight));
  const navRoot = document.getElementById("atlly-student-nav-root");
  const inFlowNav = document.querySelector(
    ".student-app-shell:not(.workout-immersive) .student-bottom-nav"
  );
  const stickyCta = document.querySelector(".home-landing .home-sticky-cta");
  for (const el of [navRoot, inFlowNav, stickyCta]) {
    if (!el || !(el as HTMLElement).getBoundingClientRect) continue;
    const rect = (el as HTMLElement).getBoundingClientRect();
    if (rect.height <= 0 && rect.width <= 0) continue;
    gap = Math.max(gap, Math.round(visualBottom - rect.bottom));
  }
  html.style.setProperty("--pwa-bottom-gap", `${Math.min(gap, 120)}px`);

  if (!isMobileViewport()) return;
  const resolved = resolveMobileSafeInsets(readSafeAreaInsets(), gap);
  if (resolved.top > 0) html.style.setProperty("--safe-top", `${resolved.top}px`);
  if (resolved.right > 0) html.style.setProperty("--safe-right", `${resolved.right}px`);
  if (resolved.left > 0) html.style.setProperty("--safe-left", `${resolved.left}px`);
  if (resolved.bottom > 0) {
    html.style.setProperty("--safe-bottom", `${resolved.bottom}px`);
    html.style.setProperty("--standalone-nav-safe-bottom", `${resolved.bottom}px`);
  }
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
    syncMobileLayoutMetrics();
    return;
  }

  clearDockInlineGeometry(root, nav as HTMLElement);

  const measure = () => {
    const { layoutGap } = readVisualViewportMetrics();
    applySafeAreaCssVars(layoutGap);
    syncStandaloneViewport();
    publishDockClearance(root);
  };

  syncMobileLayoutMetrics();
  measure();
  window.requestAnimationFrame(() => {
    syncMobileLayoutMetrics();
    measure();
    window.requestAnimationFrame(() => {
      syncMobileLayoutMetrics();
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

    const mobile = isMobileViewport();
    if (!mobile) {
      root.classList.remove("is-mobile-student-layout");
      syncAppViewportHeight();
      syncStandaloneViewport();
      return;
    }

    root.classList.add("is-mobile-student-layout");

    const { layoutGap } = readVisualViewportMetrics();
    applySafeAreaCssVars(layoutGap);
    syncStandaloneViewport();
    syncMobileLayoutMetrics();

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
