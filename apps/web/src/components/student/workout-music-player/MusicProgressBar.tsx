import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { musicAudio } from "../../../lib/music-audio";
import { uiSounds } from "../../../lib/ui-sounds";
import { formatClock } from "./formatClock";

type Props = {
  progress: number;
  duration: number;
  onSeek: (ratio: number) => void;
  disabled?: boolean;
  playing?: boolean;
  stacked?: boolean;
};

function clampRatio(value: number) {
  return Math.min(1, Math.max(0, value));
}

function ratioFromPoint(clientX: number, element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0) return 0;
  return clampRatio((clientX - rect.left) / rect.width);
}

export function MusicProgressBar({
  progress,
  duration,
  onSeek,
  disabled,
  playing = false,
  stacked = false
}: Props) {
  const [audioDuration, setAudioDuration] = useState(() => musicAudio.getDuration());
  const liveDuration = duration > 0 ? duration : audioDuration;
  const ratio = liveDuration > 0 ? clampRatio(progress / liveDuration) : 0;
  const [preview, setPreview] = useState<number | null>(null);
  const isDisabled = Boolean(disabled);
  const displayRatio = preview ?? ratio;
  const displayTime = liveDuration > 0 ? displayRatio * liveDuration : progress;
  const draggingRef = useRef(false);
  const lastTickRef = useRef(-1);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const syncDuration = (audio: HTMLAudioElement) => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setAudioDuration(audio.duration);
      }
    };
    const offMeta = musicAudio.on("loadedmetadata", syncDuration);
    const offDuration = musicAudio.on("durationchange", syncDuration);
    const offTime = musicAudio.on("timeupdate", syncDuration);
    return () => {
      offMeta();
      offDuration();
      offTime();
    };
  }, []);

  const applySeek = useCallback(
    (next: number) => {
      const clamped = clampRatio(next);
      setPreview(clamped);
      if (draggingRef.current) {
        const tick = Math.floor(clamped * 4);
        if (tick !== lastTickRef.current) {
          lastTickRef.current = tick;
          uiSounds.musicSeekTick();
        }
      }
      onSeek(clamped);
    },
    [onSeek]
  );

  const releaseDrag = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
    setPreview(null);
    uiSounds.musicSeekCommit();
  }, []);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (isDisabled) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    lastTickRef.current = Math.floor(displayRatio * 4);
    setIsDragging(true);
    uiSounds.musicSeekStart();
    applySeek(ratioFromPoint(event.clientX, event.currentTarget));
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    applySeek(ratioFromPoint(event.clientX, event.currentTarget));
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    releaseDrag();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isDisabled) return;
    const step = event.shiftKey ? 0.1 : 0.05;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      applySeek(displayRatio + step);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      applySeek(displayRatio - step);
    } else if (event.key === "Home") {
      event.preventDefault();
      applySeek(0);
    } else if (event.key === "End") {
      event.preventDefault();
      applySeek(1);
    }
  };

  const percent = `${displayRatio * 100}%`;

  return (
    <div
      className={`workout-music-progress${isDisabled ? " is-empty" : ""}${isDragging ? " is-dragging" : ""}${playing ? " is-playing" : ""}${stacked ? " is-stacked" : ""}`}
    >
      {stacked ? null : (
        <span className="workout-music-progress-time" aria-hidden="true">
          {formatClock(displayTime)}
        </span>
      )}
      <div
        aria-label="Avançar na faixa"
        aria-valuemax={Math.max(0, Math.round(liveDuration))}
        aria-valuemin={0}
        aria-valuenow={Math.max(0, Math.round(displayTime))}
        aria-valuetext={`${formatClock(displayTime)} de ${formatClock(liveDuration)}`}
        className={`workout-music-progress-track${isDisabled ? " is-disabled" : ""}${isDragging ? " is-dragging" : ""}`}
        onKeyDown={handleKeyDown}
        onPointerCancel={handlePointerUp}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        role="slider"
        tabIndex={isDisabled ? -1 : 0}
      >
        <span className="workout-music-progress-rail" aria-hidden="true" />
        <span className="workout-music-progress-bar" aria-hidden="true" style={{ width: percent }} />
        <span className="workout-music-progress-thumb" aria-hidden="true" style={{ left: percent }} />
      </div>
      {stacked ? (
        <div className="workout-music-progress-times">
          <span className="workout-music-progress-time" aria-hidden="true">
            {formatClock(displayTime)}
          </span>
          <span className="workout-music-progress-time" aria-hidden="true">
            {formatClock(liveDuration)}
          </span>
        </div>
      ) : (
        <span className="workout-music-progress-time" aria-hidden="true">
          {formatClock(liveDuration)}
        </span>
      )}
    </div>
  );
}
