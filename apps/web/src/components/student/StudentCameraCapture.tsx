import { Camera, Image as ImageIcon, RefreshCcw, Sparkles, Video, X, Zap, ZapOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type CaptureMode = "photo" | "video";
type Facing = "user" | "environment";

export const CAMERA_FILTERS = [
  { id: "none", label: "Original", css: "none" },
  { id: "clarendon", label: "Claro", css: "contrast(1.15) saturate(1.25)" },
  { id: "gingham", label: "Suave", css: "brightness(1.08) sepia(0.12) contrast(0.95)" },
  { id: "moon", label: "Lua", css: "grayscale(1) contrast(1.15) brightness(1.05)" },
  { id: "lark", label: "Lark", css: "brightness(1.12) contrast(0.92) saturate(1.1)" },
  { id: "reyes", label: "Reyes", css: "sepia(0.22) brightness(1.1) contrast(0.9)" },
  { id: "juno", label: "Juno", css: "contrast(1.12) saturate(1.4) hue-rotate(-8deg)" },
  { id: "valencia", label: "Valencia", css: "sepia(0.18) contrast(1.08) brightness(1.08) saturate(1.2)" }
] as const;

export type CameraFilterId = (typeof CAMERA_FILTERS)[number]["id"];

export function cameraFilterCss(id: CameraFilterId | string) {
  return CAMERA_FILTERS.find((item) => item.id === id)?.css ?? "none";
}

function recorderMime() {
  const types = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  return types.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) || "";
}

function applyFilterToCanvas(ctx: CanvasRenderingContext2D, filterCss: string) {
  ctx.filter = filterCss === "none" ? "none" : filterCss;
}

export function StudentCameraCapture({
  open,
  mode,
  onClose,
  onCapture,
  maxVideoSeconds = 60,
  title,
  allowModeSwitch = false
}: {
  open: boolean;
  mode: CaptureMode;
  onClose: () => void;
  onCapture: (file: File) => void;
  maxVideoSeconds?: number;
  title?: string;
  /** Permite alternar foto/vídeo no próprio sheet (Publicar / Momento). */
  allowModeSwitch?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const sessionRef = useRef(0);
  const nativeRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const [captureMode, setCaptureMode] = useState<CaptureMode>(mode);
  const [facing, setFacing] = useState<Facing>("environment");
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [fallback, setFallback] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [filterId, setFilterId] = useState<CameraFilterId>("none");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [viewportH, setViewportH] = useState(() =>
    typeof window !== "undefined" ? Math.round(window.visualViewport?.height ?? window.innerHeight) : 0
  );

  const filterCss = cameraFilterCss(filterId);

  useEffect(() => {
    setCaptureMode(mode);
  }, [mode, open]);

  useEffect(() => {
    if (!open) return;
    const sync = () => {
      const h = Math.round(window.visualViewport?.height ?? window.innerHeight);
      setViewportH(h);
      if (sheetRef.current) {
        sheetRef.current.style.height = `${h}px`;
        sheetRef.current.style.top = `${Math.round(window.visualViewport?.offsetTop ?? 0)}px`;
      }
    };
    sync();
    window.visualViewport?.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    return () => {
      window.visualViewport?.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [open]);

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setTorchOn(false);
    setTorchSupported(false);
  }

  function stopTimer() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }

  async function startCamera(nextFacing: Facing, nextMode: CaptureMode) {
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
      const videoTrack = stream.getVideoTracks()[0];
      const caps = videoTrack?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean } | undefined;
      setTorchSupported(Boolean(caps?.torch));
      const video = videoRef.current;
      if (video) {
        video.setAttribute("playsinline", "true");
        video.setAttribute("webkit-playsinline", "true");
        video.muted = true;
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      setFallback(false);
      setReady(true);
    };

    const constraints: MediaStreamConstraints = {
      audio: nextMode === "video",
      video: {
        facingMode: { ideal: nextFacing },
        width: { ideal: 1080 },
        height: { ideal: 1920 },
        aspectRatio: { ideal: 9 / 16 }
      }
    };

    try {
      await bind(await navigator.mediaDevices.getUserMedia(constraints));
    } catch {
      try {
        await bind(
          await navigator.mediaDevices.getUserMedia({
            audio: nextMode === "video",
            video: { facingMode: nextFacing }
          })
        );
      } catch {
        try {
          await bind(await navigator.mediaDevices.getUserMedia({ video: true, audio: nextMode === "video" }));
        } catch {
          if (session === sessionRef.current) {
            setFallback(true);
            setHint("Não foi possível abrir a câmera. Use a câmera do aparelho.");
          }
        }
      }
    }
  }

  useEffect(() => {
    if (!open) return;
    void startCamera(facing, captureMode);
    const previousOverflow = document.body.style.overflow;
    const previousTouch = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
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
      document.body.style.overflow = previousOverflow;
      document.body.style.touchAction = previousTouch;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facing, captureMode]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0] as MediaStreamTrack & {
      applyConstraints?: (c: MediaTrackConstraints) => Promise<void>;
    };
    if (!track?.applyConstraints || !torchSupported) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setHint("Lanterna indisponível neste aparelho.");
    }
  }

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
    applyFilterToCanvas(ctx, filterCss);
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
    const video = videoRef.current;
    if (!stream || !video) return;
    const mimeType = recorderMime();
    if (!mimeType && typeof MediaRecorder === "undefined") {
      nativeRef.current?.click();
      return;
    }

    let recordStream: MediaStream = stream;
    let raf = 0;
    const stopDraw = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    if (filterCss !== "none" && video.videoWidth > 0) {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const draw = () => {
          applyFilterToCanvas(ctx, filterCss);
          if (facing === "user") {
            ctx.save();
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            ctx.restore();
          } else {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          }
          raf = requestAnimationFrame(draw);
        };
        draw();
        const canvasStream = canvas.captureStream(30);
        stream.getAudioTracks().forEach((track) => canvasStream.addTrack(track));
        recordStream = canvasStream;
      }
    }

    chunksRef.current = [];
    const recorder = mimeType ? new MediaRecorder(recordStream, { mimeType }) : new MediaRecorder(recordStream);
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      stopDraw();
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
    recorder.start(250);
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

  if (!open || typeof document === "undefined") return null;

  const heading =
    title ??
    (captureMode === "video" ? (recording ? `Gravando ${elapsed}s` : "Vídeo") : "Foto");

  return createPortal(
    <div
      ref={sheetRef}
      className="student-camera-sheet is-fullscreen"
      role="dialog"
      aria-modal="true"
      aria-label={heading}
      style={viewportH ? { height: viewportH } : undefined}
    >
      <div className="student-camera-stage">
        {fallback ? (
          <div className="student-camera-fallback">
            <p>{hint || "Use a câmera do aparelho."}</p>
            <button type="button" className="student-green-button" onClick={() => nativeRef.current?.click()}>
              Abrir câmera do dispositivo
            </button>
          </div>
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={facing === "user" ? "is-mirror" : ""}
            style={{ filter: filterCss }}
          />
        )}
        {!ready && !fallback && <span className="student-camera-loading">Abrindo câmera…</span>}
        {recording && (
          <div className="student-camera-rec-badge" aria-live="polite">
            <span /> REC {elapsed}s
          </div>
        )}
      </div>

      <header className="student-camera-chrome-top">
        <button type="button" onClick={onClose} aria-label="Fechar">
          <X size={22} />
        </button>
        <strong>{heading}</strong>
        <div className="student-camera-top-actions">
          {facing === "environment" && torchSupported ? (
            <button type="button" onClick={() => void toggleTorch()} aria-label={torchOn ? "Desligar lanterna" : "Lanterna"}>
              {torchOn ? <Zap size={20} /> : <ZapOff size={20} />}
            </button>
          ) : null}
          <button
            type="button"
            disabled={recording || fallback}
            onClick={() => setFacing((current) => (current === "user" ? "environment" : "user"))}
            aria-label="Virar câmera"
          >
            <RefreshCcw size={20} />
          </button>
        </div>
      </header>

      <div className="student-camera-chrome-bottom">
        <div className="student-camera-filters" role="listbox" aria-label="Filtros">
          {CAMERA_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={filterId === item.id}
              className={filterId === item.id ? "is-on" : ""}
              disabled={recording}
              onClick={() => setFilterId(item.id)}
            >
              <span className="student-camera-filter-swatch" style={{ filter: item.css }} />
              {item.label}
            </button>
          ))}
        </div>

        {hint && !fallback ? <small className="student-camera-hint">{hint}</small> : null}

        {allowModeSwitch ? (
          <div className="student-camera-mode-switch">
            <button
              type="button"
              className={captureMode === "photo" ? "is-on" : ""}
              disabled={recording}
              onClick={() => setCaptureMode("photo")}
            >
              <ImageIcon size={14} /> Foto
            </button>
            <button
              type="button"
              className={captureMode === "video" ? "is-on" : ""}
              disabled={recording}
              onClick={() => setCaptureMode("video")}
            >
              <Video size={14} /> Vídeo
            </button>
          </div>
        ) : (
          <p className="student-camera-caption">
            {captureMode === "video"
              ? recording
                ? "Toque para parar"
                : `Até ${maxVideoSeconds}s · filtro aplicado na prévia`
              : "Toque para capturar · filtro na foto"}
          </p>
        )}

        <div className="student-camera-shutter-row">
          <button type="button" className="student-camera-side-btn" onClick={() => nativeRef.current?.click()} aria-label="Galeria">
            <ImageIcon size={20} />
          </button>
          <button
            type="button"
            className={`student-camera-shutter${recording ? " is-recording" : ""}`}
            onClick={() => {
              if (captureMode === "photo") takePhoto();
              else if (recording) stopRecording();
              else startRecording();
            }}
            disabled={!ready && !fallback}
            aria-label={captureMode === "photo" ? "Tirar foto" : recording ? "Parar gravação" : "Gravar vídeo"}
          >
            {captureMode === "photo" ? <Camera size={26} /> : recording ? <span className="student-camera-stop" /> : <Video size={26} />}
          </button>
          <button
            type="button"
            className="student-camera-side-btn"
            disabled={recording}
            onClick={() => setFilterId((current) => (current === "none" ? "clarendon" : "none"))}
            aria-label="Filtro rápido"
          >
            <Sparkles size={20} />
          </button>
        </div>
      </div>

      <input
        ref={nativeRef}
        type="file"
        accept={captureMode === "video" ? "video/*" : "image/*"}
        capture={facing === "user" ? "user" : "environment"}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onCapture(file);
        }}
      />
    </div>,
    document.body
  );
}
