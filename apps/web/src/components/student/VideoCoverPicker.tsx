import { useEffect, useRef, useState } from "react";
import { mediaUrl } from "../../lib/urls";
import { formatVideoClock, frameFromVideo } from "../../lib/video-cover";

type Props = {
  videoSrc: string;
  coverPreview?: string | null;
  onCoverChange: (previewUrl: string) => void;
  label?: string;
  compact?: boolean;
};

/** Seletor de frame/capa para qualquer publicação com vídeo. */
export function VideoCoverPicker({
  videoSrc,
  coverPreview,
  onCoverChange,
  label = "Escolher capa",
  compact = false
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [durationSec, setDurationSec] = useState(0.1);
  const [coverAt, setCoverAt] = useState(0);
  const src = mediaUrl(videoSrc);

  useEffect(() => {
    setCoverAt(0);
    setDurationSec(0.1);
  }, [src]);

  async function captureFrame() {
    const video = videoRef.current;
    if (!video) return;
    const frame = await frameFromVideo(video, false);
    if (!frame) return;
    const next = URL.createObjectURL(frame);
    onCoverChange(next);
  }

  return (
    <div className={`student-video-cover-picker${compact ? " is-compact" : ""}`}>
      <div className="student-video-cover-preview">
        <video
          ref={videoRef}
          src={src}
          playsInline
          muted
          preload="metadata"
          onLoadedMetadata={(event) => {
            const duration = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 1;
            setDurationSec(Math.max(duration, 0.1));
            event.currentTarget.currentTime = Math.min(0.05, duration);
          }}
          onSeeked={() => void captureFrame()}
        />
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
          onChange={(event) => {
            const next = Number(event.target.value);
            setCoverAt(next);
            const video = videoRef.current;
            if (video && Number.isFinite(video.duration) && video.duration > 0) {
              video.currentTime = (next / 1000) * video.duration;
            }
          }}
        />
      </label>
    </div>
  );
}
