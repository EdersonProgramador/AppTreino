import { isNativeAppShell, postNativeMessage } from "./native-bridge";

const PERSIST_KEYS = [
  "app-treino-token",
  "app-treino-user",
  "apptreino.student.panel",
  "apptreino.music.session",
  "apptreino.music.volume",
  "apptreino.music.repeat",
  "apptreino.music.shuffle",
  "apptreino.music.liked",
  "apptreino.workout.runner"
];

function collectLocalStorage() {
  const out: Record<string, string> = {};
  if (typeof localStorage === "undefined") return out;
  for (const key of PERSIST_KEYS) {
    const value = localStorage.getItem(key);
    if (value != null) out[key] = value;
  }
  return out;
}

export function flushShellStateToNative() {
  if (!isNativeAppShell() || typeof window === "undefined") return;
  postNativeMessage({
    type: "PERSIST_SHELL_STATE",
    href: window.location.href,
    localStorage: collectLocalStorage()
  });
}

function patchHistory(fn: "pushState" | "replaceState") {
  const original = history[fn].bind(history);
  history[fn] = ((...args: Parameters<History["pushState"]>) => {
    original(...args);
    flushShellStateToNative();
  }) as History["pushState"];
  return () => {
    history[fn] = original;
  };
}

export function installShellStateFlush() {
  if (!isNativeAppShell() || typeof window === "undefined") return () => undefined;

  const onHide = () => {
    if (document.visibilityState === "hidden") flushShellStateToNative();
  };

  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", flushShellStateToNative);
  window.addEventListener("popstate", flushShellStateToNative);
  const unpatchPush = patchHistory("pushState");
  const unpatchReplace = patchHistory("replaceState");
  const timer = window.setInterval(flushShellStateToNative, 2000);
  flushShellStateToNative();

  (window as Window & { __flushShellState?: () => void }).__flushShellState = flushShellStateToNative;

  return () => {
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", flushShellStateToNative);
    window.removeEventListener("popstate", flushShellStateToNative);
    unpatchPush();
    unpatchReplace();
    window.clearInterval(timer);
    delete (window as Window & { __flushShellState?: () => void }).__flushShellState;
  };
}
