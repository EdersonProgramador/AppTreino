import { useEffect } from "react";
import { Pause, Play, SkipForward } from "lucide-react";
import { musicAudio } from "../../lib/music-audio";
import { isNativeAppShell } from "../../lib/native-bridge";
import {
  fromNativeMusicTracks,
  installNativeMusicSyncBridge,
  nativeRequestMusicSync,
  subscribeNativeMusicSync
} from "../../lib/native-music";
import { playableMediaUrl } from "../../lib/urls";
import { useMusicPlayerStore } from "../../stores/musicPlayerStore";
import { StudentNowPlaying } from "./StudentNowPlaying";

type HostProps = {
  compact?: boolean;
  hideMini?: boolean;
};

function resolveMediaUrl(url: string) {
  return playableMediaUrl(url);
}

export function StudentMusicMini({ compact = false }: { compact?: boolean }) {
  const queue = useMusicPlayerStore((state) => state.queue);
  const index = useMusicPlayerStore((state) => state.index);
  const playing = useMusicPlayerStore((state) => state.playing);
  const expanded = useMusicPlayerStore((state) => state.expanded);
  const setPlaying = useMusicPlayerStore((state) => state.setPlaying);
  const next = useMusicPlayerStore((state) => state.next);
  const expand = useMusicPlayerStore((state) => state.expand);
  const current = queue[index] ?? null;

  if (!current || expanded) return null;

  const coverStyle = current.coverUrl
    ? { backgroundImage: `url(${resolveMediaUrl(current.coverUrl)})` }
    : undefined;

  return (
    <div
      className={`student-play-dock student-music-mini${playing ? " is-playing" : ""}${compact ? " is-compact" : ""}`}
      data-testid="student-music-mini"
    >
      <button
        className="student-play-dock-cover"
        onClick={() => expand()}
        style={coverStyle}
        type="button"
        aria-label="Abrir player"
      />
      <button className="student-play-dock-meta" data-testid="student-music-mini-meta" onClick={() => expand()} type="button">
        <strong>{current.title}</strong>
        <span>{current.artist || "App Treino"}</span>
      </button>
      <div className="student-play-dock-center">
        <div className="student-play-dock-controls">
          <button
            aria-label={playing ? "Pausar" : "Tocar"}
            className="student-play-dock-main"
            onClick={() => setPlaying(!playing)}
            type="button"
          >
            {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          </button>
          <button aria-label="Proxima" onClick={() => next()} type="button">
            <SkipForward size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function StudentMusicPlayerHost({ compact = false, hideMini = false }: HostProps) {
  const queue = useMusicPlayerStore((state) => state.queue);
  const index = useMusicPlayerStore((state) => state.index);
  const playing = useMusicPlayerStore((state) => state.playing);
  const volume = useMusicPlayerStore((state) => state.volume);
  const muted = useMusicPlayerStore((state) => state.muted);
  const duration = useMusicPlayerStore((state) => state.duration);
  const seekRatio = useMusicPlayerStore((state) => state.seekRatio);
  const seekToken = useMusicPlayerStore((state) => state.seekToken);
  const expanded = useMusicPlayerStore((state) => state.expanded);
  const setPlaying = useMusicPlayerStore((state) => state.setPlaying);
  const next = useMusicPlayerStore((state) => state.next);
  const prev = useMusicPlayerStore((state) => state.prev);
  const ended = useMusicPlayerStore((state) => state.ended);
  const toggle = useMusicPlayerStore((state) => state.toggle);
  const setProgress = useMusicPlayerStore((state) => state.setProgress);
  const setDuration = useMusicPlayerStore((state) => state.setDuration);
  const consumeSeek = useMusicPlayerStore((state) => state.consumeSeek);
  const collapse = useMusicPlayerStore((state) => state.collapse);
  const toggleMute = useMusicPlayerStore((state) => state.toggleMute);
  const current = queue[index] ?? null;

  // Eventos HTML5 só na web. No Expo o áudio é nativo e sincroniza via bridge.
  useEffect(() => {
    if (isNativeAppShell()) {
      installNativeMusicSyncBridge();
      nativeRequestMusicSync();
      const off = subscribeNativeMusicSync((payload) => {
        if (payload.tracks?.length) {
          const incoming = fromNativeMusicTracks(payload.tracks);
          const current = useMusicPlayerStore.getState();
          const sameQueue =
            current.queue.length === incoming.length &&
            current.queue.every((track, i) => track.id === incoming[i]?.id);
          if (!sameQueue) {
            current.hydrateFromNative(
              incoming,
              payload.index ?? 0,
              Boolean(payload.playing),
              payload.progress ?? 0,
              payload.duration ?? 0
            );
            return;
          }
        }
        if (typeof payload.progress === "number") setProgress(payload.progress);
        if (typeof payload.duration === "number" && payload.duration > 0) setDuration(payload.duration);
        if (typeof payload.playing === "boolean") {
          useMusicPlayerStore.setState({ playing: payload.playing });
        }
        if (typeof payload.index === "number") {
          const queue = useMusicPlayerStore.getState().queue;
          if (queue[payload.index]) {
            useMusicPlayerStore.setState({
              index: payload.index,
              duration: queue[payload.index]?.durationSec ?? useMusicPlayerStore.getState().duration
            });
          }
        }
        if (payload.ended) ended();
      });

      const retries = [200, 800, 1600].map((ms) => window.setTimeout(() => nativeRequestMusicSync(), ms));

      return () => {
        retries.forEach((id) => window.clearTimeout(id));
        off();
      };
    }

    const offTime = musicAudio.on("timeupdate", (audio) => {
      setProgress(audio.currentTime || 0);
    });
    const offMeta = musicAudio.on("loadedmetadata", (audio) => {
      setDuration(audio.duration || 0);
    });
    const offDuration = musicAudio.on("durationchange", (audio) => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    });
    const offEnded = musicAudio.on("ended", () => {
      ended();
    });
    const offError = musicAudio.on("error", () => {
      setPlaying(false);
    });

    return () => {
      offTime();
      offMeta();
      offDuration();
      offEnded();
      offError();
    };
  }, [ended, setDuration, setPlaying, setProgress]);

  useEffect(() => {
    if (isNativeAppShell()) return;
    musicAudio.setVolume(volume, muted);
  }, [volume, muted]);

  useEffect(() => {
    if (seekRatio == null) return;
    if (isNativeAppShell()) {
      consumeSeek();
      return;
    }
    const audio = musicAudio.element;
    if (audio) {
      const total = duration || audio.duration || 0;
      if (total > 0) {
        audio.currentTime = Math.max(0, total * seekRatio);
        setProgress(audio.currentTime);
      }
      if (playing) {
        void musicAudio.play().then((result) => {
          if (!result.ok) setPlaying(false);
        });
      }
    }
    consumeSeek();
  }, [seekToken, seekRatio, duration, playing, consumeSeek, setProgress, setPlaying]);

  useEffect(() => {
    if (isNativeAppShell()) return;
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const setHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // ignore
      }
    };

    if (!current) {
      session.metadata = null;
      session.playbackState = "none";
      setHandler("play", null);
      setHandler("pause", null);
      setHandler("previoustrack", null);
      setHandler("nexttrack", null);
      setHandler("seekto", null);
      return;
    }

    session.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist || "App Treino",
      artwork: current.coverUrl
        ? [{ src: resolveMediaUrl(current.coverUrl), sizes: "512x512", type: "image/jpeg" }]
        : []
    });
    session.playbackState = playing ? "playing" : "paused";
    setHandler("play", () => setPlaying(true));
    setHandler("pause", () => setPlaying(false));
    setHandler("previoustrack", () => prev());
    setHandler("nexttrack", () => next());
    setHandler("seekto", (details) => {
      if (typeof details.seekTime === "number") {
        const audio = musicAudio.element;
        if (audio) {
          audio.currentTime = details.seekTime;
          setProgress(details.seekTime);
        }
      }
    });
    try {
      const total = duration || musicAudio.getDuration();
      const position = useMusicPlayerStore.getState().progress;
      if (total > 0) {
        session.setPositionState({
          duration: total,
          playbackRate: 1,
          position: Math.min(total, Math.max(0, position))
        });
      }
    } catch {
      // setPositionState pode falhar se duration/position forem inválidos
    }
    return undefined;
  }, [current, playing, duration, next, prev, setPlaying, setProgress]);

  useEffect(() => {
    if (isNativeAppShell()) return;

    const resumeIfNeeded = () => {
      if (document.visibilityState !== "visible") return;
      const state = useMusicPlayerStore.getState();
      if (!state.playing || !state.queue.length) return;
      const audio = musicAudio.element;
      if (audio && audio.paused) {
        void musicAudio.play().then((result) => {
          if (!result.ok) setPlaying(false);
        });
      }
    };

    document.addEventListener("visibilitychange", resumeIfNeeded);
    window.addEventListener("focus", resumeIfNeeded);
    return () => {
      document.removeEventListener("visibilitychange", resumeIfNeeded);
      window.removeEventListener("focus", resumeIfNeeded);
    };
  }, [setPlaying]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /input|textarea|select/i.test(target.tagName)) return;
      if (!current) return;
      if (event.code === "Space") {
        event.preventDefault();
        toggle();
      } else if (event.code === "ArrowRight") {
        next();
      } else if (event.code === "ArrowLeft") {
        prev();
      } else if (event.key.toLowerCase() === "m") {
        toggleMute();
      } else if (event.key === "Escape" && expanded) {
        collapse();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, expanded, toggle, next, prev, toggleMute, collapse]);

  const showMini = Boolean(current) && !expanded && !hideMini;

  return (
    <>
      {expanded && current ? <StudentNowPlaying /> : null}
      {showMini ? <StudentMusicMini compact={compact} /> : null}
    </>
  );
}
