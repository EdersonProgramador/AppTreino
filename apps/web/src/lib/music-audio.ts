import { playableMediaUrl } from "./urls";

type PlayResult = { ok: true } | { ok: false; error: string };

type AudioListener = (audio: HTMLAudioElement) => void;

function normalizeSrc(src: string) {
  if (!src) return "";
  try {
    return new URL(src, typeof window !== "undefined" ? window.location.href : "http://localhost").href;
  } catch {
    return src;
  }
}

/** URL absoluta (Expo / expo-av precisa de http(s) completo). */
export function absolutePlayableUrl(path?: string | null) {
  const playable = playableMediaUrl(path);
  if (!playable) return "";
  if (/^(https?:|blob:|data:)/i.test(playable)) return playable;
  if (typeof window === "undefined") return playable;
  try {
    return new URL(playable, window.location.href).href;
  } catch {
    return playable;
  }
}

/**
 * Motor único do Play — um HTMLAudioElement fora do React.
 * Singleton em window para sobreviver a HMR/duplicata de módulo.
 */
class MusicAudioEngine {
  private audio: HTMLAudioElement | null = null;
  private boundSrc = "";
  private playToken = 0;

  private ensureAudio() {
    if (typeof window === "undefined") return null;
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = "auto";
      this.audio.autoplay = false;
      this.audio.setAttribute("playsinline", "true");
      this.audio.setAttribute("webkit-playsinline", "true");
      this.audio.setAttribute("x-webkit-airplay", "allow");
    }
    return this.audio;
  }

  get element() {
    return this.audio ?? this.ensureAudio();
  }

  on(event: string, listener: AudioListener) {
    const audio = this.ensureAudio();
    if (!audio) return () => undefined;
    const handler = () => listener(audio);
    audio.addEventListener(event, handler);
    return () => audio.removeEventListener(event, handler);
  }

  /**
   * Play no estilo audio-smoke.html: src + play() no mesmo gesto do clique.
   * Sem await/Zustand antes do play().
   */
  playNow(url: string, volume = 0.85): Promise<void> {
    const audio = this.ensureAudio();
    if (!audio) return Promise.reject(new Error("Áudio indisponível."));
    const next = playableMediaUrl(url);
    if (!next) return Promise.reject(new Error("URL de áudio inválida."));

    this.playToken += 1;
    audio.muted = false;
    audio.volume = Math.min(1, Math.max(0.05, volume || 0.85));
    if (normalizeSrc(audio.getAttribute("src") || audio.src || "") !== normalizeSrc(next)) {
      audio.src = next;
    }
    this.boundSrc = next;
    try {
      if (Number.isFinite(audio.currentTime) && audio.currentTime > 0.05) {
        audio.currentTime = 0;
      }
    } catch {
      // ignore
    }
    return audio.play();
  }

  setSource(url: string, { forceReload = false } = {}) {
    const audio = this.ensureAudio();
    if (!audio) return "";
    const next = playableMediaUrl(url);
    if (!next) {
      audio.pause();
      audio.removeAttribute("src");
      this.boundSrc = "";
      return "";
    }

    const current = normalizeSrc(audio.getAttribute("src") || audio.src || this.boundSrc);
    if (current === normalizeSrc(next) && !forceReload) {
      this.boundSrc = next;
      return next;
    }

    audio.pause();
    audio.src = next;
    this.boundSrc = next;
    return next;
  }

  setVolume(volume: number, muted: boolean) {
    const audio = this.ensureAudio();
    if (!audio) return;
    const next = Math.min(1, Math.max(0, volume));
    audio.muted = muted;
    audio.volume = muted ? 0 : next;
  }

  /**
   * Chamar no gesto do clique. Sem await antes de audio.play().
   */
  async playSource(url: string, volume = 0.85, muted = false, { fromStart = true } = {}): Promise<PlayResult> {
    const audio = this.ensureAudio();
    if (!audio) return { ok: false, error: "Áudio indisponível neste ambiente." };

    const token = ++this.playToken;
    const next = this.setSource(url);
    if (!next) return { ok: false, error: "URL de áudio inválida." };

    this.setVolume(volume, muted);

    if (fromStart) {
      try {
        if (Number.isFinite(audio.currentTime) && audio.currentTime > 0.05) {
          audio.currentTime = 0;
        }
      } catch {
        // metadata ainda não pronta
      }
    }

    try {
      // play() imediatamente — qualquer await antes perde o gesto no Safari/Chrome.
      const playPromise = audio.play();
      await playPromise;
      if (token !== this.playToken) return { ok: false, error: "Reprodução cancelada." };
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : "Falha ao iniciar a reprodução.";

      // Fallback: URL absoluta (alguns WebViews falham com path relativo).
      const absolute = absolutePlayableUrl(url);
      if (absolute && absolute !== next) {
        try {
          if (token !== this.playToken) return { ok: false, error: "Reprodução cancelada." };
          audio.src = absolute;
          this.boundSrc = absolute;
          await audio.play();
          return { ok: true };
        } catch {
          // keep original
        }
      }

      try {
        if (token !== this.playToken) return { ok: false, error: "Reprodução cancelada." };
        await new Promise<void>((resolve) => {
          if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
            resolve();
            return;
          }
          const finish = () => {
            window.clearTimeout(timer);
            audio.removeEventListener("canplay", finish);
            audio.removeEventListener("loadeddata", finish);
            resolve();
          };
          const timer = window.setTimeout(finish, 2500);
          audio.addEventListener("canplay", finish, { once: true });
          audio.addEventListener("loadeddata", finish, { once: true });
        });
        if (token !== this.playToken) return { ok: false, error: "Reprodução cancelada." };
        await audio.play();
        return { ok: true };
      } catch {
        return { ok: false, error: message };
      }
    }
  }

  async play(): Promise<PlayResult> {
    const audio = this.ensureAudio();
    if (!audio) return { ok: false, error: "Áudio indisponível neste ambiente." };
    if (!audio.getAttribute("src") && !audio.src && this.boundSrc) {
      audio.src = this.boundSrc;
    }
    try {
      await audio.play();
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : "Falha ao iniciar a reprodução.";
      return { ok: false, error: message };
    }
  }

  pause() {
    this.playToken += 1;
    this.audio?.pause();
  }

  stop() {
    this.playToken += 1;
    if (!this.audio) return;
    this.audio.pause();
    this.audio.removeAttribute("src");
    try {
      this.audio.load();
    } catch {
      // ignore
    }
    this.boundSrc = "";
  }

  /** Fração já em buffer (0–1) para LinearProgress variant="buffer". */
  getBufferedRatio() {
    const audio = this.audio;
    if (!audio) return 0;
    const total = audio.duration;
    if (!Number.isFinite(total) || total <= 0 || !audio.buffered.length) return 0;
    try {
      const end = audio.buffered.end(audio.buffered.length - 1);
      return Math.min(1, Math.max(0, end / total));
    } catch {
      return 0;
    }
  }

  getDuration() {
    const total = this.audio?.duration ?? 0;
    return Number.isFinite(total) && total > 0 ? total : 0;
  }

  seekRatio(ratio: number, fallbackDuration = 0) {
    const audio = this.ensureAudio();
    if (!audio) return null;
    const total =
      this.getDuration() ||
      (Number.isFinite(fallbackDuration) && fallbackDuration > 0 ? fallbackDuration : 0);
    if (total <= 0) return null;
    const time = Math.min(total, Math.max(0, total * Math.min(1, Math.max(0, ratio))));
    try {
      if (typeof audio.fastSeek === "function") {
        audio.fastSeek(time);
      } else {
        audio.currentTime = time;
      }
    } catch {
      try {
        audio.currentTime = time;
      } catch {
        return null;
      }
    }
    return Number.isFinite(audio.currentTime) ? audio.currentTime : time;
  }

  getDebugState() {
    const audio = this.audio;
    if (!audio) return { boundSrc: this.boundSrc, audio: null };
    return {
      boundSrc: this.boundSrc,
      src: audio.currentSrc || audio.src,
      paused: audio.paused,
      currentTime: audio.currentTime,
      readyState: audio.readyState,
      networkState: audio.networkState,
      volume: audio.volume,
      muted: audio.muted,
      error: audio.error ? { code: audio.error.code, message: audio.error.message } : null
    };
  }
}

function getMusicAudio(): MusicAudioEngine {
  if (typeof window === "undefined") {
    return new MusicAudioEngine();
  }
  const root = window as Window & { __APP_TREINO_MUSIC_AUDIO__?: MusicAudioEngine };
  if (!root.__APP_TREINO_MUSIC_AUDIO__) {
    root.__APP_TREINO_MUSIC_AUDIO__ = new MusicAudioEngine();
  }
  return root.__APP_TREINO_MUSIC_AUDIO__;
}

export const musicAudio = getMusicAudio();
