import { Camera, Image as ImageIcon, RefreshCcw, Sparkles, Video, X, Zap, ZapOff } from "lucide-react";
import { useEffect, useRef, useState, type TouchEvent } from "react";
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

export type CameraZoomCaps = { min: number; max: number; step: number; hardware: boolean };

/** Digital zoom stays in a native-like 1×–5× window with fine continuous steps. */
const DIGITAL_ZOOM: CameraZoomCaps = { min: 1, max: 5, step: 0.01, hardware: false };

export function readCameraZoomCaps(track: MediaStreamTrack | null | undefined): CameraZoomCaps {
  const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { zoom?: { min: number; max: number; step?: number } }) | undefined;
  if (caps?.zoom && Number.isFinite(caps.zoom.max) && caps.zoom.max > caps.zoom.min) {
    const min = caps.zoom.min;
    // Prefer a factory-like ceiling (~5×) even if the driver reports a huge optical range.
    const max = Math.min(caps.zoom.max, Math.max(min + 0.01, min * 5));
    return {
      min,
      max,
      step: 0.01,
      hardware: true
    };
  }
  return DIGITAL_ZOOM;
}

export async function applyCameraZoom(track: MediaStreamTrack | null | undefined, zoom: number, hardware: boolean) {
  if (!hardware || !track?.applyConstraints) return;
  try {
    await track.applyConstraints({ advanced: [{ zoom } as MediaTrackConstraintSet] });
  } catch {
    // fallback digital only
  }
}

/** Soft pinch curve (sub-linear) so zoom feels closer to the stock camera app. */
export function zoomFromPinch(startZoom: number, ratio: number, caps: CameraZoomCaps) {
  const softened = Math.pow(Math.max(0.05, ratio), 0.68);
  return Math.min(caps.max, Math.max(caps.min, startZoom * softened));
}

/** Round to UI step without making the slider feel stepped/stiff. */
export function clampCameraZoom(value: number, caps: CameraZoomCaps) {
  const clamped = Math.min(caps.max, Math.max(caps.min, value));
  return Math.round(clamped / caps.step) * caps.step;
}

/** Desenha o frame com crop central = zoom digital (+ filtro / espelho). */
export function drawCameraFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  opts: { zoom: number; digital: boolean; filterCss: string; mirror: boolean; width: number; height: number }
) {
  const { zoom, digital, filterCss, mirror, width, height } = opts;
  ctx.filter = filterCss === "none" ? "none" : filterCss;
  const z = digital ? Math.max(1, zoom) : 1;
  const sw = video.videoWidth / z;
  const sh = video.videoHeight / z;
  const sx = (video.videoWidth - sw) / 2;
  const sy = (video.videoHeight - sh) / 2;
  if (mirror) {
    ctx.save();
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
    ctx.restore();
  } else {
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
  }
}

export function CameraZoomControl({
  zoom,
  caps,
  disabled,
  onChange
}: {
  zoom: number;
  caps: CameraZoomCaps;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  const clamp = (value: number) => clampCameraZoom(value, caps);
  const display = caps.hardware && caps.min > 0 ? zoom / caps.min : zoom;
  return (
    <div className="student-camera-zoom" aria-label="Zoom">
      <button
        type="button"
        disabled={disabled || zoom <= caps.min}
        onClick={() => onChange(clamp(zoom - Math.max(caps.step, (caps.max - caps.min) * 0.04)))}
        aria-label="Diminuir zoom"
      >
        −
      </button>
      <input
        type="range"
        min={caps.min}
        max={caps.max}
        step={caps.step}
        value={zoom}
        disabled={disabled}
        onChange={(event) => onChange(clamp(Number(event.target.value)))}
        aria-valuetext={`${display.toFixed(1)}x`}
      />
      <button
        type="button"
        disabled={disabled || zoom >= caps.max}
        onClick={() => onChange(clamp(zoom + Math.max(caps.step, (caps.max - caps.min) * 0.04)))}
        aria-label="Aumentar zoom"
      >
        +
      </button>
      <span>{display.toFixed(1)}×</span>
    </div>
  );
}

function recorderMime() {
  const types = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  return types.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) || "";
}

function buildVideoConstraints(facing: Facing): MediaTrackConstraints {
  if (facing === "user") {
    // Front cams often only expose landscape/native modes; forcing 9:16 stretches the feed.
    return {
      facingMode: { ideal: "user" },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    };
  }
  return {
    facingMode: { ideal: "environment" },
    width: { ideal: 1080 },
    height: { ideal: 1920 },
    aspectRatio: { ideal: 9 / 16 }
  };
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
  const [zoom, setZoom] = useState(1);
  const [zoomCaps, setZoomCaps] = useState<CameraZoomCaps>(DIGITAL_ZOOM);
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);
  const zoomTrackRef = useRef<MediaStreamTrack | null>(null);
  const zoomHardwareRef = useRef(false);
  const zoomApplyTimerRef = useRef<number | null>(null);
  const [viewportH, setViewportH] = useState(() =>
    typeof window !== "undefined" ? Math.round(window.visualViewport?.height ?? window.innerHeight) : 0
  );

  const filterCss = cameraFilterCss(filterId);
  const digitalZoom = !zoomCaps.hardware;

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
      const videoTrack = stream.getVideoTracks()[0] ?? null;
      zoomTrackRef.current = videoTrack;
      const caps = videoTrack?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean } | undefined;
      setTorchSupported(Boolean(caps?.torch));
      const nextZoomCaps = readCameraZoomCaps(videoTrack);
      zoomHardwareRef.current = nextZoomCaps.hardware;
      setZoomCaps(nextZoomCaps);
      setZoom(nextZoomCaps.min);
      void applyCameraZoom(videoTrack, nextZoomCaps.min, nextZoomCaps.hardware);
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
      video: buildVideoConstraints(nextFacing)
    };

    try {
      await bind(await navigator.mediaDevices.getUserMedia(constraints));
    } catch {
      try {
        await bind(
          await navigator.mediaDevices.getUserMedia({
            audio: nextMode === "video",
            video: { facingMode: { ideal: nextFacing } }
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

  function setCameraZoom(next: number) {
    const clamped = clampCameraZoom(next, zoomCaps);
    setZoom(clamped);
    if (!zoomHardwareRef.current) return;
    if (zoomApplyTimerRef.current) window.clearTimeout(zoomApplyTimerRef.current);
    zoomApplyTimerRef.current = window.setTimeout(() => {
      zoomApplyTimerRef.current = null;
      void applyCameraZoom(zoomTrackRef.current, clamped, true);
    }, 32);
  }

  function onStageTouchStart(event: TouchEvent) {
    if (event.touches.length !== 2) return;
    const [a, b] = [event.touches[0], event.touches[1]];
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    pinchRef.current = { startDist: dist, startZoom: zoom };
  }

  function onStageTouchMove(event: TouchEvent) {
    if (event.touches.length !== 2 || !pinchRef.current) return;
    event.preventDefault();
    const [a, b] = [event.touches[0], event.touches[1]];
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const ratio = dist / Math.max(1, pinchRef.current.startDist);
    setCameraZoom(zoomFromPinch(pinchRef.current.startZoom, ratio, zoomCaps));
  }

  function onStageTouchEnd() {
    pinchRef.current = null;
    if (zoomHardwareRef.current) {
      void applyCameraZoom(zoomTrackRef.current, zoom, true);
    }
  }

  function onStageDoubleClick() {
    // Instagram-like: double tap resets zoom.
    setCameraZoom(zoomCaps.min);
  }

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
    drawCameraFrame(ctx, video, {
      zoom,
      digital: digitalZoom,
      filterCss,
      mirror: facing === "user",
      width: canvas.width,
      height: canvas.height
    });
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

    const needsCanvas = (filterCss !== "none" || digitalZoom) && video.videoWidth > 0;
    if (needsCanvas) {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const draw = () => {
          drawCameraFrame(ctx, video, {
            zoom,
            digital: digitalZoom,
            filterCss,
            mirror: facing === "user",
            width: canvas.width,
            height: canvas.height
          });
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
      <div
        className="student-camera-stage"
        onTouchStart={onStageTouchStart}
        onTouchMove={onStageTouchMove}
        onTouchEnd={onStageTouchEnd}
        onTouchCancel={onStageTouchEnd}
        onDoubleClick={onStageDoubleClick}
      >
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
            className={facing === "user" ? "is-mirror" : undefined}
            style={{
              filter: filterCss,
              // Keep mirror + zoom in one matrix so the front cam never non-uniformly stretches.
              transform: (() => {
                const z = digitalZoom && zoom > 1 ? zoom : 1;
                if (facing === "user") return `scale(${-z}, ${z})`;
                return z !== 1 ? `scale(${z})` : undefined;
              })(),
              transition: pinchRef.current ? "none" : "transform 90ms ease-out"
            }}
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
