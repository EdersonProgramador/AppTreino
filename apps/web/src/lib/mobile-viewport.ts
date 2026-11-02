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
      "position:fixed;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom);padding-bottom:constant(safe-area-inset-bottom);"
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

    const vh = Math.round(window.visualViewport?.height ?? window.innerHeight);
    root.style.setProperty("--mobile-vh", `${vh}px`);
  }

  sync();
  window.visualViewport?.addEventListener("resize", sync);
  window.visualViewport?.addEventListener("scroll", sync);
  window.addEventListener("resize", sync);
  window.addEventListener("orientationchange", () => window.setTimeout(sync, 150));

  return () => {
    window.visualViewport?.removeEventListener("resize", sync);
    window.visualViewport?.removeEventListener("scroll", sync);
    window.removeEventListener("resize", sync);
  };
}
