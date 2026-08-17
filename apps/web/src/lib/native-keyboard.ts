/**
 * Keyboard avoiding no WebView:
 * - Expo injeta --keyboard-height via Keyboard API
 * - visualViewport complementa no iOS/Android
 * - .login-page age como ScrollView (overflow-y: auto)
 */
export function wireNativeKeyboardViewport() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => undefined;
  }

  const root = document.documentElement;
  let focusTimer = 0;

  const readNativeKeyboard = () => {
    const raw = getComputedStyle(root).getPropertyValue("--keyboard-height").trim();
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const sync = () => {
    const vv = window.visualViewport;
    const layoutHeight = window.innerHeight || root.clientHeight || 0;
    const vvHeight = vv?.height ?? layoutHeight;
    const offsetTop = vv?.offsetTop ?? 0;
    const vvInset = Math.max(0, Math.round(layoutHeight - vvHeight - offsetTop));
    const nativeInset = Math.max(0, Math.round(readNativeKeyboard()));
    const keyboardInset = Math.max(vvInset, nativeInset);
    const height = Math.max(1, Math.round(vvHeight));

    root.style.setProperty("--vv-height", `${height}px`);
    root.style.setProperty("--vv-offset-top", `${Math.round(offsetTop)}px`);
    root.style.setProperty("--keyboard-inset", `${keyboardInset}px`);
    if (nativeInset <= 0 && vvInset > 0) {
      root.style.setProperty("--keyboard-height", `${vvInset}px`);
    }
    root.classList.toggle("keyboard-open", keyboardInset > 40);
  };

  const scrollFocusedIntoView = (target: HTMLElement) => {
    window.clearTimeout(focusTimer);
    focusTimer = window.setTimeout(() => {
      sync();
      const scroller =
        (target.closest(".login-page") as HTMLElement | null) ||
        (document.querySelector(".login-page") as HTMLElement | null);
      if (scroller) {
        const targetRect = target.getBoundingClientRect();
        const scrollerRect = scroller.getBoundingClientRect();
        const padding = Math.min(120, scrollerRect.height * 0.22);
        const nextTop = targetRect.top - scrollerRect.top - padding + scroller.scrollTop;
        scroller.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
        return;
      }
      target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    }, 120);
  };

  const onFocusIn = (event: FocusEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.matches("input, textarea, select, [contenteditable='true']")) return;
    root.classList.add("keyboard-open");
    scrollFocusedIntoView(target);
  };

  const onFocusOut = () => {
    window.clearTimeout(focusTimer);
    focusTimer = window.setTimeout(() => {
      sync();
      const active = document.activeElement;
      const stillEditing =
        active instanceof HTMLElement &&
        active.matches("input, textarea, select, [contenteditable='true']");
      if (!stillEditing && readNativeKeyboard() <= 40) {
        const inset = Number.parseFloat(root.style.getPropertyValue("--keyboard-inset") || "0");
        if (inset <= 40) root.classList.remove("keyboard-open");
      }
    }, 160);
  };

  sync();
  window.visualViewport?.addEventListener("resize", sync);
  window.visualViewport?.addEventListener("scroll", sync);
  window.addEventListener("resize", sync);
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);

  return () => {
    window.clearTimeout(focusTimer);
    window.visualViewport?.removeEventListener("resize", sync);
    window.visualViewport?.removeEventListener("scroll", sync);
    window.removeEventListener("resize", sync);
    document.removeEventListener("focusin", onFocusIn);
    document.removeEventListener("focusout", onFocusOut);
    root.classList.remove("keyboard-open");
    root.style.removeProperty("--vv-height");
    root.style.removeProperty("--vv-offset-top");
    root.style.removeProperty("--keyboard-inset");
  };
}
