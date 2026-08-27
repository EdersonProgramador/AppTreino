import { isVideoFile } from "./video-formats";

export const STORY_IMAGE_DURATION_MS = 6000;
export const STORY_VIDEO_MAX_SECONDS = 60;
export const STORY_VIDEO_MAX_MS = STORY_VIDEO_MAX_SECONDS * 1000;

/** Duração de um arquivo de vídeo local (segundos). */
export function readVideoFileDuration(file: File): Promise<number> {
  if (!isVideoFile(file)) return Promise.resolve(0);

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";

    const finish = (value: number) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };

    video.onerror = () => finish(0);
    video.onloadedmetadata = () => {
      void ensureVideoDuration(video).then((duration) => finish(duration));
    };
    video.src = url;
  });
}

export async function assertStoryVideoWithinLimit(file: File) {
  if (!isVideoFile(file)) return;
  const duration = await readVideoFileDuration(file);
  if (duration > STORY_VIDEO_MAX_SECONDS + 0.25) {
    throw new Error(`Vídeos de momento podem ter no máximo ${STORY_VIDEO_MAX_SECONDS} segundos.`);
  }
}

/** Duração utilizável mesmo em WebM gravado com `Infinity`. */
export function readVideoDuration(video: HTMLVideoElement) {
  if (Number.isFinite(video.duration) && video.duration > 0 && video.duration !== Infinity) {
    return video.duration;
  }
  try {
    if (video.seekable.length > 0) {
      const end = video.seekable.end(video.seekable.length - 1);
      if (Number.isFinite(end) && end > 0) return end;
    }
  } catch {
    // ignore
  }
  return 0;
}

/** Força cálculo de duração em blobs WebM (comum após MediaRecorder). */
export function ensureVideoDuration(video: HTMLVideoElement, timeoutMs = 2000): Promise<number> {
  const existing = readVideoDuration(video);
  if (existing > 0) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: number) => {
      if (settled) return;
      settled = true;
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("error", onError);
      window.clearTimeout(timer);
      resolve(value > 0 ? value : 0.1);
    };
    const onError = () => finish(0.1);
    const onTimeUpdate = () => {
      const next = readVideoDuration(video);
      if (next > 0) finish(next);
    };
    const onDurationChange = () => {
      const next = readVideoDuration(video);
      if (next > 0) finish(next);
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("error", onError, { once: true });

    const timer = window.setTimeout(() => finish(readVideoDuration(video)), timeoutMs);

    try {
      if (video.readyState >= 1) {
        video.currentTime = Math.min(0.05, 1);
      }
      window.setTimeout(() => {
        try {
          video.currentTime = 1e101;
        } catch {
          finish(readVideoDuration(video));
        }
      }, 0);
    } catch {
      finish(0.1);
    }
  });
}

/** Captura o frame atual de um <video> como JPEG. */
export async function frameFromVideo(video: HTMLVideoElement, mirror = false): Promise<Blob | null> {
  if (!video.videoWidth || !video.videoHeight) return null;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  try {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  } catch {
    return null;
  }
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.9);
    } catch {
      resolve(null);
    }
  });
}

export function formatVideoClock(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function isBlobPlaybackUrl(url: string) {
  return /^(blob:|data:)/i.test(url.trim());
}
