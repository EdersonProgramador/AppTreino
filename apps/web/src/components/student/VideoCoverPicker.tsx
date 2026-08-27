import { useEffect, useRef, useState } from "react";
import { mediaUrl, retryVideoAsCompatible } from "../../lib/urls";
import {
  ensureVideoDuration,
  formatVideoClock,
  frameFromVideo,
  isBlobPlaybackUrl,
  readVideoDuration
} from "../../lib/video-cover";

type Props = {
  /** URL persistida (upload/API) — usada se não houver `localSrc`. */
  videoSrc: string;
  /** Blob local do arquivo/gravação — evita CORS na captura de frames. */
  localSrc?: string | null;
  coverPreview?: string | null;
  onCoverChange: (previewUrl: string) => void;
  label?: string;
  compact?: boolean;
  mirror?: boolean;
};

/** Seletor de frame/capa para qualquer publicação com vídeo. */
export function VideoCoverPicker({
  videoSrc,
  localSrc,
  coverPreview,
  onCoverChange,
  label = "Escolher capa",
  compact = false,
  mirror = false
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [durationSec, setDurationSec] = useState(0.1);
  const [coverAt, setCoverAt] = useState(0);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const playbackSrc = localSrc || (isBlobPlaybackUrl(videoSrc) ? videoSrc : mediaUrl(videoSrc));
  const needsCrossOrigin = !localSrc && !isBlobPlaybackUrl(playbackSrc);

  useEffect(() => {
    setCoverAt(0);
    setDurationSec(0.1);
    setCaptureError(null);
    setLoading(true);
  }, [playbackSrc]);

  async function syncDuration(video: HTMLVideoElement) {
    const duration = await ensureVideoDuration(video);
    setDurationSec(Math.max(duration, 0.1));
    setLoading(false);
    try {
      video.currentTime = Math.min(0.05, Math.max(duration - 0.05, 0));
    } catch {
      // ignore
    }
  }

  async function captureFrame() {
    const video = videoRef.current;
    if (!video) return;
    const frame = await frameFromVideo(video, mirror);
    if (!frame) {
      setCaptureError("Não foi possível gerar a capa deste vídeo.");
      return;
    }
    setCaptureError(null);
    onCoverChange(URL.createObjectURL(frame));
  }

  function seekToRatio(ratio: number) {
    const video = videoRef.current;
    if (!video) return;
    const duration = readVideoDuration(video) || durationSec;
    if (duration <= 0) return;
    const safeRatio = Math.min(Math.max(ratio, 0), 1);
    try {
      video.currentTime = safeRatio * duration;
    } catch {
      setCaptureError("Não foi possível avançar no vídeo.");
    }
  }

  return (
    <div className={`student-video-cover-picker${compact ? " is-compact" : ""}`}>
      <div className="student-video-cover-preview">
        <video
          ref={videoRef}
          src={playbackSrc}
          playsInline
          muted
          preload="auto"
          crossOrigin={needsCrossOrigin ? "anonymous" : undefined}
          onLoadedMetadata={(event) => {
            void syncDuration(event.currentTarget);
          }}
          onDurationChange={(event) => {
            const duration = readVideoDuration(event.currentTarget);
            if (duration > 0) setDurationSec(duration);
          }}
          onSeeked={() => void captureFrame()}
          onError={(event) => {
            if (retryVideoAsCompatible(event.currentTarget, videoSrc)) {
              setLoading(true);
              setCaptureError(null);
              return;
            }
            setLoading(false);
            setCaptureError("Não foi possível carregar o vídeo para escolher a capa.");
          }}
        />
        {loading ? <span className="student-video-cover-loading">Carregando vídeo…</span> : null}
        {coverPreview ? <img className="student-video-cover-thumb" src={coverPreview} alt="Capa" /> : null}
      </div>
      <label className="student-video-cover-scrub">
        <span>
          {label} · {formatVideoClock(Math.floor(durationSec))}
        </span>
        <input
          type="range"
          min={0}
          max={1000}
          value={coverAt}
          disabled={loading || Boolean(captureError && !coverPreview)}
          onChange={(event) => {
            const next = Number(event.target.value);
            setCoverAt(next);
            seekToRatio(next / 1000);
          }}
        />
      </label>
      {captureError ? <p className="student-video-cover-error">{captureError}</p> : null}
    </div>
  );
}
