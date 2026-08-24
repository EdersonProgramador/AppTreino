import { Camera, RefreshCcw, Video, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type CaptureMode = "photo" | "video";
type Facing = "user" | "environment";

function recorderMime() {
  const types = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4"
  ];
  return types.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) || "";
}

export function StudentCameraCapture({
  open,
  mode,
  onClose,
  onCapture,
  maxVideoSeconds = 60,
  layout = "default"
}: {
  open: boolean;
  mode: CaptureMode;
  onClose: () => void;
  onCapture: (file: File) => void;
  maxVideoSeconds?: number;
  /** Vertical 9:16 for Clipes / Live */
  layout?: "default" | "vertical";
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const sessionRef = useRef(0);
  const nativeRef = useRef<HTMLInputElement>(null);

  const [facing, setFacing] = useState<Facing>("environment");
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [fallback, setFallback] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  function stopTimer() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }

  async function startCamera(nextFacing: Facing) {
    if (!navigator.mediaDevices?.getUserMedia) {
      setFallback(true);
      return;
    }
    const session = ++sessionRef.current;
    stopStream();
    setReady(false);
    setHint(null);

    const bind = async (stream: MediaStream) => {
      if (session !== sessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setFallback(false);
      setReady(true);
    };

    try {
      await bind(
        await navigator.mediaDevices.getUserMedia({
          audio: mode === "video",
          video:
            layout === "vertical"
              ? {
                  facingMode: { ideal: nextFacing },
                  width: { ideal: 1080 },
                  height: { ideal: 1920 },
                  aspectRatio: { ideal: 9 / 16 }
                }
              : { facingMode: { ideal: nextFacing }, width: { ideal: 1280 }, height: { ideal: 720 } }
        })
      );
    } catch {
      try {
        await bind(await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: nextFacing } } }));
      } catch {
        if (session === sessionRef.current) {
          setFallback(true);
          setHint("Não foi possível abrir a câmera. Use a câmera do aparelho.");
        }
      }
    }
  }

  useEffect(() => {
    if (!open) return;
    void startCamera(facing);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      sessionRef.current += 1;
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
      recorderRef.current = null;
      chunksRef.current = [];
      stopTimer();
      stopStream();
      setRecording(false);
      setElapsed(0);
      setReady(false);
      document.body.style.overflow = previous;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facing, mode, layout]);

  function takePhoto() {
    const video = videoRef.current;
    if (!video?.videoWidth) {
      setHint("Aguarde a câmera carregar.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (facing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setHint("Não foi possível capturar a foto.");
          return;
        }
        onCapture(new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92
    );
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = recorderMime();
    if (!mimeType && typeof MediaRecorder === "undefined") {
      nativeRef.current?.click();
      return;
    }
    chunksRef.current = [];
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      stopTimer();
      setRecording(false);
      const type = recorder.mimeType || mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      if (!blob.size) {
        setHint("O vídeo ficou vazio. Tente de novo.");
        return;
      }
      const ext = type.includes("mp4") ? "mp4" : "webm";
      onCapture(new File([blob], `camera-${Date.now()}.${ext}`, { type }));
    };
    recorder.start();
    setElapsed(0);
    setRecording(true);
    timerRef.current = window.setInterval(() => {
      setElapsed((current) => {
        const next = current + 1;
        if (next >= maxVideoSeconds) recorder.stop();
        return next;
      });
    }, 1000);
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
  }

  if (!open) return null;

  return (
    <div
      className={`student-camera-sheet${layout === "vertical" ? " is-vertical" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={mode === "video" ? "Câmera de vídeo" : "Câmera"}
    >
      <header>
        <button type="button" onClick={onClose} aria-label="Fechar">
          <X size={22} />
        </button>
        <strong>{mode === "video" ? "Vídeo" : "Câmera"}</strong>
        <button
          type="button"
          disabled={recording || fallback}
          onClick={() => setFacing((current) => (current === "user" ? "environment" : "user"))}
          aria-label="Virar câmera"
        >
          <RefreshCcw size={20} />
        </button>
      </header>

      <div className="student-camera-stage">
        {fallback ? (
          <div className="student-camera-fallback">
            <p>{hint || "Use a câmera do aparelho."}</p>
            <button type="button" className="student-green-button" onClick={() => nativeRef.current?.click()}>
              Abrir câmera do dispositivo
            </button>
          </div>
        ) : (
          <video ref={videoRef} playsInline muted autoPlay className={facing === "user" ? "is-mirror" : ""} />
        )}
        {!ready && !fallback && <span className="student-camera-loading">Abrindo câmera…</span>}
      </div>

      <footer>
        <p>{mode === "video" ? (recording ? `Gravando ${elapsed}s` : `Vídeo de até ${maxVideoSeconds}s`) : "Toque para capturar"}</p>
        {hint && !fallback && <small>{hint}</small>}
        <button
          type="button"
          className={`student-camera-shutter${recording ? " is-recording" : ""}`}
          onClick={() => {
            if (mode === "photo") takePhoto();
            else if (recording) stopRecording();
            else startRecording();
          }}
          disabled={!ready && !fallback}
          aria-label={mode === "photo" ? "Tirar foto" : recording ? "Parar gravação" : "Gravar vídeo"}
        >
          {mode === "photo" ? <Camera size={26} /> : <Video size={26} />}
        </button>
      </footer>

      <input
        ref={nativeRef}
        type="file"
        accept={mode === "video" ? "video/*" : "image/*"}
        capture="environment"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onCapture(file);
        }}
      />
    </div>
  );
}
