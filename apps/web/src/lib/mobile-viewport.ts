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

/** Só grava px quando > 0 — zero quebra o fallback env() no CSS. */
function applySafeAreaCssVars(insets: ReturnType<typeof readSafeAreaInsets>) {
  const root = document.documentElement;
  const pairs: Array<[string, number]> = [
    ["--expo-safe-top", insets.top],
    ["--expo-safe-right", insets.right],
    ["--expo-safe-bottom", insets.bottom],
    ["--expo-safe-left", insets.left],
    ["--safe-top", insets.top],
    ["--safe-right", insets.right],
    ["--safe-bottom", insets.bottom],
    ["--safe-left", insets.left]
  ];
  for (const [name, px] of pairs) {
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
  const insets = readSafeAreaInsets();
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

/** Cola o dock na borda inferior real (PWA iOS often leaves a gap with env() alone). */
function sealStudentNavDockToScreenBottom(root: HTMLElement, attempt = 0) {
  const html = document.documentElement;
  const insets = readSafeAreaInsets();
  const rect = root.getBoundingClientRect();
  const layoutGap = Math.max(0, window.innerHeight - rect.bottom);
  const safePad = Math.max(insets.bottom, 0);
  const totalPad = Math.round(safePad + layoutGap);

  if (totalPad > 0) {
    root.style.setProperty("padding-bottom", `${totalPad}px`, "important");
    html.style.setProperty("--student-nav-dock-padding-bottom", `${totalPad}px`);
  } else {
    root.style.removeProperty("padding-bottom");
    html.style.removeProperty("--student-nav-dock-padding-bottom");
  }

  if (attempt < 4) {
    window.requestAnimationFrame(() => {
      const nextGap = Math.max(0, window.innerHeight - root.getBoundingClientRect().bottom);
      if (nextGap > 0.75) sealStudentNavDockToScreenBottom(root, attempt + 1);
    });
  }
}

function applyDockPinStyles(root: HTMLElement, navEl: HTMLElement) {
  const html = document.documentElement;
  const isLight = html.classList.contains("light");
  const dockBg = isLight ? "rgba(255, 255, 255, 0.98)" : "var(--app-bg-soft, #0b101c)";

  root.style.setProperty("position", "fixed", "important");
  root.style.setProperty("left", "0", "important");
  root.style.setProperty("right", "0", "important");
  root.style.setProperty("bottom", "0", "important");
  root.style.setProperty("z-index", "120", "important");
  root.style.setProperty("width", "100%", "important");
  root.style.setProperty("margin", "0", "important");
  root.style.setProperty("box-sizing", "border-box", "important");
  root.style.setProperty("pointer-events", "none", "important");
  root.style.setProperty("transform", "none", "important");
  root.style.setProperty("display", "flex", "important");
  root.style.setProperty("flex-direction", "column", "important");
  root.style.setProperty("justify-content", "flex-end", "important");
  root.style.setProperty("align-items", "stretch", "important");
  root.style.setProperty("background", dockBg, "important");
  root.style.setProperty("padding-top", "0", "important");
  root.style.setProperty("padding-left", "0", "important");
  root.style.setProperty("padding-right", "0", "important");

  navEl.style.removeProperty("position");
  navEl.style.setProperty("position", "relative", "important");
  navEl.style.setProperty("width", "100%", "important");
  navEl.style.setProperty("margin", "0", "important");
  navEl.style.setProperty("flex", "none", "important");
  navEl.style.setProperty("transform", "none", "important");
  navEl.style.setProperty("pointer-events", "auto", "important");
  navEl.style.setProperty("box-sizing", "border-box", "important");
  navEl.style.setProperty("padding-bottom", "6px", "important");
  navEl.style.setProperty("margin-bottom", "0", "important");

  sealStudentNavDockToScreenBottom(root);
}

/** Mede o nav portado e aplica pin inline (funciona mesmo com CSS/SW antigo). */
export function refreshStudentBottomNavDock() {
  if (typeof document === "undefined") return;

  syncAppViewportHeight();

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

  const navEl = nav as HTMLElement;
  applyDockPinStyles(root, navEl);

  const measure = () => {
    applySafeAreaCssVars(readSafeAreaInsets());
    applyDockPinStyles(root, navEl);
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
      if (isIos) {
        applySafeAreaCssVars(readSafeAreaInsets());
        syncIosLayoutMetrics();
      }
      return;
    }

    root.classList.add("is-mobile-student-layout");

    syncAppViewportHeight();
    applySafeAreaCssVars(readSafeAreaInsets());
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
