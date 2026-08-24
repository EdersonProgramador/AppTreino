import {
  ChevronDown,
  Heart,
  ListMusic,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX
} from "lucide-react";
import { playableMediaUrl } from "../../lib/urls";
import { brand } from "../../lib/brand";
import { useMusicPlayerStore } from "../../stores/musicPlayerStore";

function resolveMediaUrl(url: string) {
  return playableMediaUrl(url);
}

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function StudentNowPlaying() {
  const queue = useMusicPlayerStore((state) => state.queue);
  const index = useMusicPlayerStore((state) => state.index);
  const playing = useMusicPlayerStore((state) => state.playing);
  const progress = useMusicPlayerStore((state) => state.progress);
  const duration = useMusicPlayerStore((state) => state.duration);
  const volume = useMusicPlayerStore((state) => state.volume);
  const muted = useMusicPlayerStore((state) => state.muted);
  const shuffle = useMusicPlayerStore((state) => state.shuffle);
  const repeat = useMusicPlayerStore((state) => state.repeat);
  const queueOpen = useMusicPlayerStore((state) => state.queueOpen);
  const likedIds = useMusicPlayerStore((state) => state.likedIds);
  const setPlaying = useMusicPlayerStore((state) => state.setPlaying);
  const next = useMusicPlayerStore((state) => state.next);
  const prev = useMusicPlayerStore((state) => state.prev);
  const seek = useMusicPlayerStore((state) => state.seek);
  const setVolume = useMusicPlayerStore((state) => state.setVolume);
  const toggleMute = useMusicPlayerStore((state) => state.toggleMute);
  const toggleShuffle = useMusicPlayerStore((state) => state.toggleShuffle);
  const cycleRepeat = useMusicPlayerStore((state) => state.cycleRepeat);
  const toggleLike = useMusicPlayerStore((state) => state.toggleLike);
  const collapse = useMusicPlayerStore((state) => state.collapse);
  const toggleQueueOpen = useMusicPlayerStore((state) => state.toggleQueueOpen);
  const playAt = useMusicPlayerStore((state) => state.playAt);
  const current = queue[index] ?? null;

  if (!current) return null;

  const cover = current.coverUrl ? resolveMediaUrl(current.coverUrl) : "";
  const silent = muted || volume === 0;
  const liked = likedIds.includes(current.id);
  const VolumeIcon = silent ? VolumeX : volume < 0.45 ? Volume1 : Volume2;
  const RepeatIcon = repeat === "one" ? Repeat1 : Repeat;
  const ratio = duration ? progress / duration : 0;

  return (
    <div className="student-now-playing" role="dialog" aria-label="Player completo">
      <div className="student-now-playing-bg" style={cover ? { backgroundImage: `url(${cover})` } : undefined} />
      <div className="student-now-playing-veil" />

      <header className="student-now-playing-top">
        <button aria-label="Minimizar player" onClick={() => collapse()} type="button">
          <ChevronDown size={28} />
        </button>
        <div>
          <span>Tocando agora</span>
          <strong>{current.artist || brand.musicDefaultArtist}</strong>
        </div>
        <button
          aria-label={queueOpen ? "Fechar fila" : "Abrir fila"}
          className={queueOpen ? "is-on" : ""}
          onClick={() => toggleQueueOpen()}
          type="button"
        >
          <ListMusic size={22} />
        </button>
      </header>

      {queueOpen ? (
        <div className="student-now-queue">
          <p>Fila · {queue.length} faixas</p>
          <div className="student-now-queue-list">
            {queue.map((track, trackIndex) => {
              const active = trackIndex === index;
              return (
                <button
                  className={`student-now-queue-item${active ? " is-active" : ""}`}
                  key={`${track.id}-${trackIndex}`}
                  onClick={() => playAt(trackIndex)}
                  type="button"
                >
                  <span
                    className="student-now-queue-cover"
                    style={track.coverUrl ? { backgroundImage: `url(${resolveMediaUrl(track.coverUrl)})` } : undefined}
                  />
                  <span>
                    <strong>{track.title}</strong>
                    <small>{track.artist || brand.musicDefaultArtist}</small>
                  </span>
                  <em>{active && playing ? "tocando" : formatClock(track.durationSec ?? 0)}</em>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="student-now-playing-art" style={cover ? { backgroundImage: `url(${cover})` } : undefined} />
      )}

      <div className="student-now-playing-body">
        <div className="student-now-playing-meta">
          <div>
            <h2>{current.title}</h2>
            <p>{current.artist || brand.musicDefaultArtist}</p>
          </div>
          <button
            aria-label={liked ? "Remover dos favoritos" : "Favoritar"}
            className={`student-now-like${liked ? " is-on" : ""}`}
            onClick={() => toggleLike(current.id)}
            type="button"
          >
            <Heart size={22} fill={liked ? "currentColor" : "none"} />
          </button>
        </div>

        <div className="student-now-progress">
          <input
            aria-label="Progresso"
            max={1}
            min={0}
            onChange={(event) => seek(Number(event.target.value))}
            step={0.001}
            type="range"
            value={ratio}
          />
          <div>
            <span>{formatClock(progress)}</span>
            <span>{formatClock(duration || current.durationSec || 0)}</span>
          </div>
        </div>

        <div className="student-now-transport">
          <button
            aria-label={shuffle ? "Desativar aleatório" : "Ativar aleatório"}
            className={shuffle ? "is-on" : ""}
            onClick={() => toggleShuffle()}
            type="button"
          >
            <Shuffle size={20} />
          </button>
          <button aria-label="Anterior" onClick={() => prev()} type="button">
            <SkipBack size={28} fill="currentColor" />
          </button>
          <button
            aria-label={playing ? "Pausar" : "Tocar"}
            className="student-now-main"
            onClick={() => setPlaying(!playing)}
            type="button"
          >
            {playing ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" />}
          </button>
          <button aria-label="Proxima" onClick={() => next()} type="button">
            <SkipForward size={28} fill="currentColor" />
          </button>
          <button
            aria-label={
              repeat === "one" ? "Repetir faixa" : repeat === "all" ? "Repetir fila" : "Repetição desligada"
            }
            className={repeat !== "off" ? "is-on" : ""}
            onClick={() => cycleRepeat()}
            type="button"
          >
            <RepeatIcon size={20} />
          </button>
        </div>

        <div className="student-now-volume">
          <button aria-label={silent ? "Ativar som" : "Silenciar"} onClick={() => toggleMute()} type="button">
            <VolumeIcon size={18} />
          </button>
          <input
            aria-label="Volume"
            max={1}
            min={0}
            onChange={(event) => setVolume(Number(event.target.value))}
            step={0.01}
            type="range"
            value={silent ? 0 : volume}
          />
        </div>
      </div>
    </div>
  );
}
