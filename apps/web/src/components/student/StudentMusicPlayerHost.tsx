import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pause, Play, SkipForward } from "lucide-react";
import { useMusicPlayerStore } from "../../stores/musicPlayerStore";
import { StudentNowPlaying } from "./StudentNowPlaying";

type Props = {
  compact?: boolean;
  hideMini?: boolean;
};

function resolveMediaUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return `${window.location.origin}${url}`;
  return url;
}

export function StudentMusicPlayerHost({ compact = false, hideMini = false }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
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
  const expand = useMusicPlayerStore((state) => state.expand);
  const collapse = useMusicPlayerStore((state) => state.collapse);
  const toggleMute = useMusicPlayerStore((state) => state.toggleMute);
  const current = queue[index] ?? null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    const nextSrc = resolveMediaUrl(current.audioUrl);
    if (audio.src !== nextSrc) {
      audio.src = nextSrc;
      setProgress(0);
    }
    if (playing) {
      void audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }, [current?.id, current?.audioUrl, playing, setPlaying, setProgress]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = muted ? 0 : volume;
    audio.muted = muted;
  }, [volume, muted, current]);

  useEffect(() => {
    if (seekRatio == null) return;
    const audio = audioRef.current;
    if (audio) {
      const total = duration || audio.duration || 0;
      audio.currentTime = Math.max(0, total * seekRatio);
      setProgress(audio.currentTime);
      if (playing) {
        void audio.play().catch(() => setPlaying(false));
      }
    }
    consumeSeek();
  }, [seekToken, seekRatio, duration, playing, consumeSeek, setProgress, setPlaying]);

  useEffect(() => {
    if (!current || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist || "App Treino",
      artwork: current.coverUrl
        ? [{ src: resolveMediaUrl(current.coverUrl), sizes: "512x512", type: "image/jpeg" }]
        : []
    });
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    navigator.mediaSession.setActionHandler("play", () => setPlaying(true));
    navigator.mediaSession.setActionHandler("pause", () => setPlaying(false));
    navigator.mediaSession.setActionHandler("previoustrack", () => prev());
    navigator.mediaSession.setActionHandler("nexttrack", () => next());
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (typeof details.seekTime === "number" && audioRef.current) {
        audioRef.current.currentTime = details.seekTime;
        setProgress(details.seekTime);
      }
    });
    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("seekto", null);
    };
  }, [current, playing, next, prev, setPlaying, setProgress]);

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

  const coverStyle = current?.coverUrl
    ? { backgroundImage: `url(${resolveMediaUrl(current.coverUrl)})` }
    : undefined;
  const showMini = Boolean(current) && !expanded && !hideMini;
  const [workoutSlot, setWorkoutSlot] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!compact) {
      setWorkoutSlot(null);
      return;
    }
    setWorkoutSlot(document.getElementById("student-workout-mini-slot"));
  }, [compact, showMini]);

  const mini = showMini && current ? (
    <div className={`student-play-dock student-music-mini${playing ? " is-playing" : ""}${compact ? " is-compact" : ""}`}>
      <button
        className="student-play-dock-cover"
        onClick={() => expand()}
        style={coverStyle}
        type="button"
        aria-label="Abrir player"
      />
      <button className="student-play-dock-meta" onClick={() => expand()} type="button">
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
            {playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
          </button>
          <button aria-label="Proxima" onClick={() => next()} type="button">
            <SkipForward size={18} />
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <audio
        ref={audioRef}
        onEnded={() => ended()}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime || 0)}
        preload="metadata"
        hidden
      />
      {expanded && current ? <StudentNowPlaying /> : null}
      {compact ? (workoutSlot && mini ? createPortal(mini, workoutSlot) : null) : mini}
    </>
  );
}
