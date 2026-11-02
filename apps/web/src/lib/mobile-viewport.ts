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

function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** iOS: faixa entre layout viewport e visual viewport (PWA / Safari). */
function iosVisualBottomGap() {
  if (typeof window === "undefined" || !isIosDevice()) return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;
  const gap = window.innerHeight - (vv.offsetTop + vv.height);
  return Math.max(0, Math.round(gap));
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
  const visualGap = iosVisualBottomGap();
  return {
    top: parseFloat(s.paddingTop) || 0,
    bottom: Math.max(parseFloat(s.paddingBottom) || 0, visualGap),
    left: parseFloat(s.paddingLeft) || 0,
    right: parseFloat(s.paddingRight) || 0
  };
}

function applySafeAreaCssVars(insets: ReturnType<typeof readSafeAreaInsets>) {
  const root = document.documentElement;
  root.style.setProperty("--expo-safe-top", `${insets.top}px`);
  root.style.setProperty("--expo-safe-right", `${insets.right}px`);
  root.style.setProperty("--expo-safe-bottom", `${insets.bottom}px`);
  root.style.setProperty("--expo-safe-left", `${insets.left}px`);
  root.style.setProperty("--safe-top", `${insets.top}px`);
  root.style.setProperty("--safe-right", `${insets.right}px`);
  root.style.setProperty("--safe-bottom", `${insets.bottom}px`);
  root.style.setProperty("--safe-left", `${insets.left}px`);
  root.style.setProperty("--ios-visual-bottom-gap", `${iosVisualBottomGap()}px`);
}

/** Altura visível (PWA iOS); só expõe --app-vh — não trava height inline no body. */
function syncAppViewportHeight() {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const vv = window.visualViewport;
  const height = Math.round(vv?.height ?? window.innerHeight);
  document.documentElement.style.setProperty("--app-vh", `${height}px`);
  document.documentElement.style.setProperty(
    "--app-vh-offset-top",
    `${Math.round(vv?.offsetTop ?? 0)}px`
  );
}

function dockedNavBackground(isLight: boolean) {
  return isLight ? "rgba(255, 255, 255, 0.98)" : "var(--app-bg-soft, #0b101c)";
}

function applyDockedNavStyles(root: HTMLElement, navEl: HTMLElement, safeBottomPx: number) {
  const html = document.documentElement;
  const isLight = html.classList.contains("light");
  const safeBottom = Math.max(0, Math.round(safeBottomPx));
  const navBg = dockedNavBackground(isLight);

  root.style.setProperty("display", "flex", "important");
  root.style.setProperty("flex-direction", "column", "important");
  root.style.setProperty("justify-content", "flex-end", "important");
  root.style.setProperty("align-items", "stretch", "important");
  root.style.setProperty("background", navBg, "important");
  root.style.setProperty("padding-top", "0", "important");
  root.style.setProperty("padding-left", "0", "important");
  root.style.setProperty("padding-right", "0", "important");
  root.style.setProperty("padding-bottom", `${safeBottom}px`, "important");

  navEl.style.setProperty("position", "relative", "important");
  navEl.style.setProperty("left", "auto", "important");
  navEl.style.setProperty("right", "auto", "important");
  navEl.style.setProperty("bottom", "auto", "important");
  navEl.style.setProperty("top", "auto", "important");
  navEl.style.setProperty("width", "100%", "important");
  navEl.style.setProperty("max-width", "100%", "important");
  navEl.style.setProperty("margin", "0", "important");
  navEl.style.setProperty("margin-top", "0", "important");
  navEl.style.setProperty("min-height", "var(--student-nav-bar, 64px)", "important");
  navEl.style.setProperty("height", "auto", "important");
  navEl.style.setProperty("max-height", "none", "important");
  navEl.style.setProperty("flex", "none", "important");
  navEl.style.setProperty("transform", "none", "important");
  navEl.style.setProperty("box-sizing", "border-box", "important");
  navEl.style.setProperty("display", "grid", "important");
  navEl.style.setProperty("grid-template-columns", "repeat(5, minmax(0, 1fr))", "important");
  navEl.style.setProperty("align-content", "end", "important");
  navEl.style.setProperty("padding", "6px 12px 6px", "important");
  navEl.style.setProperty("border-radius", "18px 18px 0 0", "important");
  navEl.style.setProperty("z-index", "120", "important");
  navEl.style.setProperty("pointer-events", "auto", "important");
  navEl.style.setProperty("background", navBg, "important");
  navEl.style.setProperty("box-shadow", "0 -8px 24px rgba(0, 0, 0, 0.12)", "important");
  navEl.style.setProperty("border-top", "1px solid rgba(212, 175, 55, 0.14)", "important");
}

function measureAndApplyDockClearance(root: HTMLElement, navEl: HTMLElement, safeBottomPx: number) {
  applyDockedNavStyles(root, navEl, safeBottomPx);
  const html = document.documentElement;
  const dockHeight = Math.ceil(root.getBoundingClientRect().height);
  const navBarPx = 64;
  const minClearance = navBarPx + 12 + Math.max(0, Math.round(safeBottomPx));
  const clearance = Math.max(dockHeight, minClearance);
  if (clearance > 0) {
    html.style.setProperty("--student-bottom-nav-dock-height", `${clearance}px`);
    html.style.setProperty("--student-scroll-nav-clearance", `${clearance}px`);
  }
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
    return;
  }

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

  const insets = readSafeAreaInsets();
  const navEl = nav as HTMLElement;
  measureAndApplyDockClearance(root, navEl, insets.bottom);

  const remeasure = () => {
    const latest = readSafeAreaInsets();
    applySafeAreaCssVars(latest);
    measureAndApplyDockClearance(root, navEl, latest.bottom);
  };

  window.requestAnimationFrame(() => {
    remeasure();
    window.requestAnimationFrame(remeasure);
  });
  if (isIosDevice() || isStandalonePwa()) {
    window.setTimeout(remeasure, 120);
    window.setTimeout(remeasure, 400);
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
  window.visualViewport?.addEventListener("scroll", schedule);
  schedule();
}

/** Mobile / PWA: safe-area vars + observer do menu inferior. */
export function wireMobileStudentViewport() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => undefined;

  const root = document.documentElement;
  const isIos = isIosDevice();

  function sync() {
    const pwa = isStandalonePwa();
    const mobile = pwa || isIos || window.matchMedia("(max-width: 900px)").matches;
    if (!mobile) {
      root.classList.remove("is-mobile-student-layout", "is-ios-pwa");
      return;
    }

    root.classList.add("is-mobile-student-layout");
    root.classList.toggle("is-ios-pwa", pwa && isIos);

    syncAppViewportHeight();

    const insets = readSafeAreaInsets();
    applySafeAreaCssVars(insets);

    const navBarPx = 64;
    root.style.setProperty("--student-nav-bar", `${navBarPx}px`);
    const dockPx = navBarPx + 12 + insets.bottom;
    root.style.setProperty("--student-nav-offset", `${dockPx}px`);
    if (!root.classList.contains("has-student-nav-pinned")) {
      root.style.setProperty("--student-bottom-nav-dock-height", `${dockPx}px`);
      root.style.setProperty("--student-scroll-nav-clearance", `${dockPx}px`);
    }

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
    navPinWired = false;
  };
}
