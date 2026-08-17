import { useEffect, useRef } from "react";
import { Pause, Play, SkipForward } from "lucide-react";
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

function audioSrcEquals(audio: HTMLAudioElement, nextSrc: string) {
  const current = audio.getAttribute("src") || audio.src || "";
  try {
    return new URL(current, window.location.href).href === new URL(nextSrc, window.location.href).href;
  } catch {
    return current === nextSrc;
  }
}

function stopAudio(audio: HTMLAudioElement | null) {
  if (!audio) return;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
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
  const collapse = useMusicPlayerStore((state) => state.collapse);
  const toggleMute = useMusicPlayerStore((state) => state.toggleMute);
  const current = queue[index] ?? null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!current) {
      stopAudio(audio);
      return;
    }
    const nextSrc = resolveMediaUrl(current.audioUrl);
    if (!nextSrc) {
      stopAudio(audio);
      return;
    }
    if (!audioSrcEquals(audio, nextSrc)) {
      audio.src = nextSrc;
      setProgress(0);
    }
    if (playing) {
      void audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }, [current?.id, current?.audioUrl, current, playing, setPlaying, setProgress]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => stopAudio(audio);
  }, []);

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
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const setHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Alguns browsers rejeitam handlers ausentes na saída.
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
      if (typeof details.seekTime === "number" && audioRef.current) {
        audioRef.current.currentTime = details.seekTime;
        setProgress(details.seekTime);
      }
    });
    return () => {
      setHandler("play", null);
      setHandler("pause", null);
      setHandler("previoustrack", null);
      setHandler("nexttrack", null);
      setHandler("seekto", null);
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

  // Mini no shell só fora do treino; no player o dock fica no WorkoutPlayer (evita duplicar).
  const showMini = Boolean(current) && !expanded && !hideMini;

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
      {showMini ? <StudentMusicMini compact={compact} /> : null}
    </>
  );
}
