import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import {
  ChevronsRight,
  Heart,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward
} from "lucide-react";
import { playableMediaUrl } from "../../../lib/urls";
import { useMusicPlayerStore } from "../../../stores/musicPlayerStore";
import { ControlButton } from "./ControlButton";
import { MusicProgressBar } from "./MusicProgressBar";
import { WorkoutAlbumPicker } from "./WorkoutAlbumPicker";

export type WorkoutMusicPlayerProps = {
  centerAriaLabel: string;
  centerDisabled?: boolean;
  centerResting?: boolean;
  centerStyle?: CSSProperties;
  centerContent: ReactNode;
  onCenterClick: () => void;
  nextExerciseAriaLabel: string;
  nextExerciseDisabled?: boolean;
  nextExerciseLabel?: string;
  onNextExercise: () => void;
  nextExerciseIcon?: ReactNode;
};

export function WorkoutMusicPlayer({
  centerAriaLabel,
  centerDisabled = false,
  centerResting = false,
  centerStyle,
  centerContent,
  onCenterClick,
  nextExerciseAriaLabel,
  nextExerciseDisabled = false,
  nextExerciseLabel = "Próximo exercício",
  onNextExercise,
  nextExerciseIcon
}: WorkoutMusicPlayerProps) {
  const [albumsOpen, setAlbumsOpen] = useState(false);
  const queue = useMusicPlayerStore((state) => state.queue);
  const index = useMusicPlayerStore((state) => state.index);
  const playing = useMusicPlayerStore((state) => state.playing);
  const progress = useMusicPlayerStore((state) => state.progress);
  const duration = useMusicPlayerStore((state) => state.duration);
  const shuffle = useMusicPlayerStore((state) => state.shuffle);
  const repeat = useMusicPlayerStore((state) => state.repeat);
  const toggle = useMusicPlayerStore((state) => state.toggle);
  const next = useMusicPlayerStore((state) => state.next);
  const prev = useMusicPlayerStore((state) => state.prev);
  const seek = useMusicPlayerStore((state) => state.seek);
  const toggleShuffle = useMusicPlayerStore((state) => state.toggleShuffle);
  const cycleRepeat = useMusicPlayerStore((state) => state.cycleRepeat);
  const likedIds = useMusicPlayerStore((state) => state.likedIds);
  const toggleLike = useMusicPlayerStore((state) => state.toggleLike);
  const current = queue[index] ?? null;
  const hasTrack = Boolean(current);
  const liked = Boolean(current && likedIds.includes(current.id));
  const RepeatIcon = repeat === "one" ? Repeat1 : Repeat;
  const cover = current?.coverUrl ? playableMediaUrl(current.coverUrl) : "";
  const icon = { size: 20, strokeWidth: 1.8 } as const;
  const trackDuration = duration > 0 ? duration : current?.durationSec || 0;

  return (
    <>
      <div className={`workout-music-bar${playing ? " is-playing" : ""}${hasTrack ? " has-track" : ""}`} data-testid="workout-music-bar">
        <div className="workout-music-ambient workout-music-ambient--left" aria-hidden="true" />
        <div className="workout-music-ambient workout-music-ambient--center" aria-hidden="true" />

        <div className="workout-music-bar-main">
          <div className="workout-music-bar-controls">
            <div className="workout-music-bar-group workout-music-bar-group--left">
              <ControlButton
                active={shuffle}
                aria-label={shuffle ? "Desativar aleatório" : "Ativar aleatório"}
                disabled={!hasTrack || queue.length < 2}
                icon={<Shuffle {...icon} />}
                label="Aleatório"
                onClick={() => toggleShuffle()}
              />
              <ControlButton
                active={repeat !== "off"}
                aria-label={
                  repeat === "off"
                    ? "Repetir desligado"
                    : repeat === "all"
                      ? "Repetir playlist"
                      : "Repetir faixa"
                }
                disabled={!hasTrack}
                icon={<RepeatIcon {...icon} />}
                label="Repetir"
                onClick={() => cycleRepeat()}
              />
              <ControlButton
                aria-label="Música anterior"
                disabled={!hasTrack}
                icon={<SkipBack {...icon} />}
                label="Anterior"
                onClick={() => prev()}
              />
            </div>

            <div className="workout-music-bar-center">
              <button
                aria-label={centerAriaLabel}
                className={`runner-start-button workout-music-start${centerResting ? " resting" : ""}${playing ? " is-playing" : ""}`}
                disabled={centerDisabled}
                onClick={onCenterClick}
                style={centerStyle}
                type="button"
              >
                {centerContent}
              </button>
            </div>

            <div className="workout-music-bar-group workout-music-bar-group--right">
              <ControlButton
                aria-label={nextExerciseAriaLabel}
                className="workout-music-ctrl--next-exercise"
                disabled={nextExerciseDisabled}
                icon={nextExerciseIcon ?? <ChevronsRight size={20} strokeWidth={1.8} />}
                label={nextExerciseLabel}
                onClick={onNextExercise}
                tone="workout"
              />
              <ControlButton
                aria-label="Tocar música"
                className="workout-music-ctrl--play"
                disabled={!hasTrack || playing}
                icon={<Play {...icon} />}
                label="Play"
                onClick={() => {
                  if (!playing) toggle();
                }}
              />
              <ControlButton
                active={playing}
                aria-label="Pausar música"
                className="workout-music-ctrl--pause"
                disabled={!hasTrack || !playing}
                icon={<Pause {...icon} />}
                label="Pause"
                onClick={() => {
                  if (playing) toggle();
                }}
              />
              <ControlButton
                aria-label="Próxima música"
                disabled={!hasTrack}
                icon={<SkipForward {...icon} />}
                label="Próxima música"
                onClick={() => next()}
              />
            </div>
          </div>
        </div>

        <div className="workout-music-bar-footer">
          <div className="student-play-tracks workout-music-session">
            <div
              className={`student-play-track${hasTrack ? " is-active" : ""}${playing ? " is-playing" : ""}`}
            >
              <button
                aria-label="Ver álbuns disponíveis"
                className="student-play-track-main"
                onClick={() => setAlbumsOpen(true)}
                type="button"
              >
                <span className={`workout-music-eq${playing ? " is-playing" : ""}`} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </span>
                <div className={`student-play-track-cover${cover ? " has-art" : ""}`}>
                  {cover ? (
                    <img alt="" className="student-play-track-cover-img" src={cover} />
                  ) : (
                    <span className="student-play-track-cover-placeholder" />
                  )}
                </div>
                <span className="student-play-track-meta">
                  <strong>{current?.title || "Escolher álbum"}</strong>
                  <small>{current?.artist || (hasTrack ? "App Treino" : "Toque para ver álbuns")}</small>
                </span>
              </button>
              <div className="student-play-track-progress">
                <MusicProgressBar
                  disabled={!hasTrack}
                  duration={hasTrack ? trackDuration : 0}
                  onSeek={(ratio) => seek(ratio)}
                  playing={playing}
                  progress={hasTrack ? progress : 0}
                />
              </div>
              <button
                aria-label={liked ? "Remover dos favoritos" : "Favoritar"}
                className={`student-play-like${liked ? " is-on" : ""}`}
                disabled={!hasTrack}
                onClick={() => current && toggleLike(current.id)}
                type="button"
              >
                <Heart size={22} strokeWidth={1.6} fill={liked ? "currentColor" : "none"} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <WorkoutAlbumPicker onClose={() => setAlbumsOpen(false)} open={albumsOpen} />
    </>
  );
}
