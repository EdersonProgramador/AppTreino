import { useCallback, useEffect, useRef, useState } from "react";
import { Bookmark, X } from "lucide-react";
import { apiPost } from "../../api";
import {
  STORY_IMAGE_DURATION_MS,
  STORY_VIDEO_MAX_MS,
  STORY_VIDEO_MAX_SECONDS,
  ensureVideoDuration,
  readVideoDuration
} from "../../lib/video-cover";
import { mediaUrl, retryVideoAsCompatible } from "../../lib/urls";
import type { SocialStoryRail } from "../../types/student";

type Props = {
  rails: SocialStoryRail[];
  startRail: number;
  startItem?: number;
  token: string;
  onClose: () => void;
  onSaved?: () => void;
  archiveMode?: boolean;
};

export function StoryViewer({ rails, startRail, startItem = 0, token, onClose, onSaved, archiveMode = false }: Props) {
  const [railIndex, setRailIndex] = useState(startRail);
  const [itemIndex, setItemIndex] = useState(startItem);
  const [progressKey, setProgressKey] = useState(0);
  const [paused, setPaused] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  const [slideDurationMs, setSlideDurationMs] = useState(STORY_IMAGE_DURATION_MS);
  const timerRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const goNextRef = useRef<() => void>(() => undefined);

  const rail = rails[railIndex];
  const item = rail?.items[itemIndex];
  const isVideo = String(item?.mediaType || "").toUpperCase() === "VIDEO";
  const poster = item?.coverUrl ? mediaUrl(item.coverUrl) : undefined;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const goNext = useCallback(() => {
    if (!rail) {
      onClose();
      return;
    }
    if (itemIndex + 1 < rail.items.length) {
      setItemIndex((current) => current + 1);
      setProgressKey((current) => current + 1);
      return;
    }
    if (railIndex + 1 < rails.length) {
      setRailIndex((current) => current + 1);
      setItemIndex(0);
      setProgressKey((current) => current + 1);
      return;
    }
    onClose();
  }, [itemIndex, onClose, rail, railIndex, rails.length]);

  goNextRef.current = goNext;

  const goPrev = useCallback(() => {
    if (itemIndex > 0) {
      setItemIndex((current) => current - 1);
      setProgressKey((current) => current + 1);
      return;
    }
    if (railIndex > 0) {
      const previous = rails[railIndex - 1];
      setRailIndex((current) => current - 1);
      setItemIndex(Math.max(0, previous.items.length - 1));
      setProgressKey((current) => current + 1);
    }
  }, [itemIndex, railIndex, rails]);

  useEffect(() => {
    if (!item || archiveMode) return;
    void apiPost(`/student/social/stories/${item.id}/view`, {}, token).catch(() => undefined);
  }, [archiveMode, item, token]);

  useEffect(() => {
    setSlideDurationMs(isVideo ? STORY_VIDEO_MAX_MS : STORY_IMAGE_DURATION_MS);
  }, [isVideo, item?.id]);

  useEffect(() => {
    clearTimer();
    if (!item || paused || archiveMode) return;

    if (!isVideo) {
      timerRef.current = window.setTimeout(() => {
        goNextRef.current();
      }, STORY_IMAGE_DURATION_MS);
      return clearTimer;
    }

    const video = videoRef.current;
    let cancelled = false;

    const schedule = (durationMs: number) => {
      if (cancelled) return;
      setSlideDurationMs(durationMs);
      timerRef.current = window.setTimeout(() => {
        goNextRef.current();
      }, durationMs);
    };

    if (!video) {
      schedule(STORY_VIDEO_MAX_MS);
      return clearTimer;
    }

    void ensureVideoDuration(video).then((seconds) => {
      const ms = Math.min(Math.max(seconds, 0.1) * 1000, STORY_VIDEO_MAX_MS);
      schedule(ms);
    });

    return () => {
      cancelled = true;
      clearTimer();
    };
  }, [archiveMode, clearTimer, isVideo, item, itemIndex, paused, progressKey, railIndex]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo) return;
    if (paused) {
      video.pause();
      return;
    }
    video.currentTime = 0;
    void video.play().catch(() => undefined);
  }, [isVideo, item?.id, paused]);

  async function saveCurrent() {
    if (!item || !rail?.isMine || saveBusy || savedIds.has(item.id)) return;
    setSaveBusy(true);
    try {
      await apiPost(`/student/social/stories/${item.id}/gallery`, {}, token);
      setSavedIds((current) => new Set(current).add(item.id));
      onSaved?.();
    } finally {
      setSaveBusy(false);
    }
  }

  if (!rail || !item) return null;

  const expiresLabel =
    item.expiresAt && !archiveMode
      ? (() => {
          const diffMs = new Date(item.expiresAt).getTime() - Date.now();
          if (diffMs <= 0) return "Expirando…";
          const hours = Math.floor(diffMs / (60 * 60 * 1000));
          const minutes = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
          if (hours > 0) return `Expira em ${hours}h`;
          return `Expira em ${Math.max(minutes, 1)}min`;
        })()
      : null;

  const progressActive = !paused && !archiveMode;

  return (
    <div
      className="student-feed-story-viewer is-immersive"
      role="dialog"
      aria-label={archiveMode ? "Galeria" : "Momento"}
      onPointerDown={() => setPaused(true)}
      onPointerUp={() => setPaused(false)}
      onPointerCancel={() => setPaused(false)}
      onPointerLeave={() => setPaused(false)}
    >
      <div className="student-feed-story-viewer-stage">
        <div className="student-feed-story-progress" aria-hidden>
          {rail.items.map((entry, index) => (
            <span key={entry.id} className="student-feed-story-progress-segment">
              <span
                className={`student-feed-story-progress-fill${
                  index < itemIndex ? " is-done" : index === itemIndex && progressActive ? " is-active" : ""
                }`}
                style={
                  index === itemIndex && progressActive
                    ? { animationDuration: `${slideDurationMs}ms` }
                    : undefined
                }
              />
            </span>
          ))}
        </div>

        <header className="student-feed-story-viewer-top">
          <div>
            <strong>{archiveMode ? "Galeria" : rail.isMine ? "Você" : rail.username}</strong>
            {expiresLabel ? <small>{expiresLabel}</small> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
        </header>

        <div className="student-feed-story-viewer-media">
          {isVideo ? (
            <video
              ref={videoRef}
              key={item.id}
              src={mediaUrl(item.mediaUrl)}
              poster={poster}
              playsInline
              muted
              autoPlay
              onError={(event) => retryVideoAsCompatible(event.currentTarget, item.mediaUrl)}
              onLoadedMetadata={(event) => {
                const seconds = readVideoDuration(event.currentTarget);
                setSlideDurationMs(Math.min(Math.max(seconds, 0.1) * 1000, STORY_VIDEO_MAX_MS));
              }}
              onTimeUpdate={(event) => {
                if (archiveMode) return;
                if (event.currentTarget.currentTime >= STORY_VIDEO_MAX_SECONDS) {
                  clearTimer();
                  goNextRef.current();
                }
              }}
              onEnded={() => {
                if (archiveMode) return;
                clearTimer();
                goNextRef.current();
              }}
            />
          ) : (
            <img key={item.id} src={mediaUrl(item.mediaUrl)} alt="" />
          )}
        </div>

        {item.caption ? <p className="student-feed-story-viewer-caption">{item.caption}</p> : null}

        <button type="button" className="student-feed-story-tap is-prev" onClick={goPrev} aria-label="Anterior" />
        <button type="button" className="student-feed-story-tap is-next" onClick={goNext} aria-label="Próximo" />

        {rail.isMine && !archiveMode ? (
          <button
            type="button"
            className={`student-feed-story-save${savedIds.has(item.id) ? " is-saved" : ""}`}
            disabled={saveBusy || savedIds.has(item.id)}
            onClick={() => void saveCurrent()}
          >
            <Bookmark size={16} />
            {savedIds.has(item.id) ? "Salvo na galeria" : "Salvar na galeria"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
