import { ChangeEvent, useEffect, useRef, useState } from "react";
import { IoClose } from "react-icons/io5";
import { MdOutlineCameraswitch, MdOutlinePhotoCamera, MdVideocam } from "react-icons/md";
import { toast } from "react-toastify";

type CaptureMode = "photo" | "video";
type Facing = "user" | "environment";
export type CameraKinds = "any" | "photo" | "video";

interface CameraCaptureProps {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  kinds?: CameraKinds;
  maxVideoSeconds?: number;
  title?: string;
  hint?: string;
}

function recorderMime() {
  const types = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4"
  ];
  return types.find(type => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) || "";
}

function defaultMode(kinds: CameraKinds): CaptureMode {
  return kinds === "video" ? "video" : "photo";
}

export function CameraCapture({
  open,
  onClose,
  onCapture,
  kinds = "any",
  maxVideoSeconds = 30,
  title = "Câmera",
  hint
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const nativePhotoRef = useRef<HTMLInputElement>(null);
  const nativeVideoRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);
  const sessionRef = useRef(0);

  const [mode, setMode] = useState<CaptureMode>(defaultMode(kinds));
  const [facing, setFacing] = useState<Facing>("environment");
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [fallback, setFallback] = useState(false);

  function stopStream() {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  function stopTimer() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function startCamera(nextFacing: Facing) {
    if (!navigator.mediaDevices?.getUserMedia) {
      setFallback(true);
      return;
    }

    const session = ++sessionRef.current;
    stopStream();
    setReady(false);

    const bindStream = async (stream: MediaStream) => {
      if (session !== sessionRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return false;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setFallback(false);
      setReady(true);
      return true;
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: kinds !== "photo",
        video: {
          facingMode: { ideal: nextFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      await bindStream(stream);
    } catch {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: nextFacing } }
        });
        await bindStream(stream);
      } catch {
        if (session === sessionRef.current) {
          setFallback(true);
          toast.warning("Não foi possível abrir a câmera neste navegador.");
        }
      }
    }
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    setMode(defaultMode(kinds));
    startCamera(facing);
    document.body.style.overflow = "hidden";

    return () => {
      sessionRef.current += 1;
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      recorderRef.current = null;
      chunksRef.current = [];
      stopTimer();
      stopStream();
      setRecording(false);
      setElapsed(0);
      setReady(false);
      document.body.style.overflow = "auto";
    };
  }, [open, facing, kinds]);

  function takePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      toast.warning("Aguarde a câmera carregar.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    if (facing === "user") {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, 0, 0);

    canvas.toBlob(blob => {
      if (!blob) {
        toast.error("Não foi possível capturar a foto.");
        return;
      }
      onCapture(new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.92);
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream) {
      return;
    }

    const mimeType = recorderMime();
    if (!mimeType && typeof MediaRecorder === "undefined") {
      nativeVideoRef.current?.click();
      return;
    }

    chunksRef.current = [];
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    recorderRef.current = recorder;
    recorder.ondataavailable = event => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    recorder.onstop = () => {
      stopTimer();
      setRecording(false);
      const type = recorder.mimeType || mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      if (blob.size === 0) {
        toast.warning("O vídeo ficou vazio. Tente de novo.");
        return;
      }
      const ext = type.includes("mp4") ? "mp4" : "webm";
      onCapture(new File([blob], `camera-${Date.now()}.${ext}`, { type }));
    };

    recorder.start();
    setElapsed(0);
    setRecording(true);
    timerRef.current = window.setInterval(() => {
      setElapsed(current => {
        const next = current + 1;
        if (next >= maxVideoSeconds) {
          recorder.stop();
        }
        return next;
      });
    }, 1000);
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }

  function handleShutter() {
    if (mode === "photo") {
      takePhoto();
      return;
    }
    if (recording) {
      stopRecording();
      return;
    }
    startRecording();
  }

  function onNativeFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      onCapture(file);
    }
  }

  const helpText = hint || (mode === "video"
    ? `Vídeo de até ${maxVideoSeconds}s`
    : "A foto entra na publicação");

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[140] flex flex-col bg-black">
      <header className="flex items-center justify-between px-4 py-3 text-white">
        <button type="button" className="border-0 bg-transparent p-2 text-2xl text-white" onClick={onClose} aria-label="Fechar câmera">
          <IoClose />
        </button>
        <div className="text-sm font-medium">{title}</div>
        <button
          type="button"
          className="border-0 bg-transparent p-2 text-2xl text-white disabled:opacity-40"
          disabled={recording || fallback}
          onClick={() => setFacing(current => current === "user" ? "environment" : "user")}
          aria-label="Virar câmera"
        >
          <MdOutlineCameraswitch />
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black">
        {fallback ? (
          <div className="max-w-sm px-6 text-center text-white">
            <p className="text-sm text-slate-200">Use a câmera do aparelho para capturar.</p>
            <div className="mt-4 flex justify-center gap-2">
              {kinds !== "video" ? (
                <button
                  type="button"
                  className="rounded-xl border-0 bg-white px-4 py-2 text-sm font-medium text-ink"
                  onClick={() => nativePhotoRef.current?.click()}
                >
                  Tirar foto
                </button>
              ) : null}
              {kinds !== "photo" ? (
                <button
                  type="button"
                  className="rounded-xl border-0 bg-white px-4 py-2 text-sm font-medium text-ink"
                  onClick={() => nativeVideoRef.current?.click()}
                >
                  Gravar vídeo
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }}
            muted
            playsInline
            autoPlay
          />
        )}

        {recording ? (
          <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-sm text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            {String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}
          </div>
        ) : null}
      </div>

      <footer className="flex flex-col items-center gap-4 px-4 py-6 text-white">
        {kinds === "any" ? (
          <div className="flex rounded-full bg-white/10 p-1">
            <button
              type="button"
              disabled={recording}
              className={`flex items-center gap-1 rounded-full border-0 px-4 py-2 text-sm ${mode === "photo" ? "bg-white text-ink" : "bg-transparent text-white"}`}
              onClick={() => setMode("photo")}
            >
              <MdOutlinePhotoCamera /> Foto
            </button>
            <button
              type="button"
              disabled={recording}
              className={`flex items-center gap-1 rounded-full border-0 px-4 py-2 text-sm ${mode === "video" ? "bg-white text-ink" : "bg-transparent text-white"}`}
              onClick={() => setMode("video")}
            >
              <MdVideocam /> Vídeo
            </button>
          </div>
        ) : null}

        {!fallback ? (
          <button
            type="button"
            disabled={!ready}
            aria-label={mode === "photo" ? "Capturar foto" : recording ? "Parar gravação" : "Gravar vídeo"}
            className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-transparent p-0 disabled:opacity-40"
            onClick={handleShutter}
          >
            <span className={`block ${recording ? "h-6 w-6 rounded-md bg-red-500" : "h-12 w-12 rounded-full bg-white"}`} />
          </button>
        ) : null}

        <p className="text-center text-[11px] text-slate-400">{helpText}</p>
      </footer>

      {kinds !== "video" ? (
        <input
          ref={nativePhotoRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onNativeFile}
        />
      ) : null}
      {kinds !== "photo" ? (
        <input
          ref={nativeVideoRef}
          type="file"
          accept="video/*"
          capture="environment"
          className="hidden"
          onChange={onNativeFile}
        />
      ) : null}
    </div>
  );
}
