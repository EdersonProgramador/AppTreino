import { useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";
import {
  Camera,
  Download,
  ImagePlus,
  Share2,
  Trophy,
  UserRound,
  Video,
  X
} from "lucide-react";
import { apiUpload } from "../../api";
import { blobToBase64, isNativeAppShell, postNativeMessage } from "../../lib/native-bridge";
import { uiSounds } from "../../lib/ui-sounds";
import { isVideoFile, VIDEO_FILE_ACCEPT } from "../../lib/video-formats";
import { WorkoutSharePreview } from "./WorkoutSharePreview";

type ShareStep = "choose" | "photo" | "camera" | "ready";
type ShareModel = "simple" | "photo";

export type WorkoutShareMediaItem = {
  url: string;
  type: "IMAGE" | "VIDEO";
  coverUrl?: string | null;
};

export type WorkoutSharePayload = {
  publish: boolean;
  caption?: string;
  photoUrl?: string | null;
  videoUrl?: string | null;
  mediaItems?: WorkoutShareMediaItem[];
  exerciseCount?: number;
};

interface WorkoutShareFlowProps {
  token: string;
  programTitle: string;
  blockTitle: string;
  exerciseCount: number;
  durationLabel: string;
  busy?: boolean;
  onPublish: (payload: WorkoutSharePayload) => void | Promise<void>;
  onFinishWithoutPublish: () => void | Promise<void>;
}

function sharePageUrl() {
  if (typeof window === "undefined") return "https://edersonprogramador.com";
  return window.location.origin;
}

function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function WorkoutShareFlow({
  token,
  programTitle,
  blockTitle,
  exerciseCount,
  durationLabel,
  busy = false,
  onPublish,
  onFinishWithoutPublish
}: WorkoutShareFlowProps) {
  const [step, setStep] = useState<ShareStep>("choose");
  const [model, setModel] = useState<ShareModel | null>(null);
  const [mediaItems, setMediaItems] = useState<WorkoutShareMediaItem[]>([]);
  const [caption, setCaption] = useState("");
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStarting, setCameraStarting] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const cameraFallbackInputRef = useRef<HTMLInputElement>(null);
  const finishingRef = useRef(false);

  const shareUrl = sharePageUrl();
  const shareTitle = "O TREINO DE HOJE ESTÁ PAGO!";
  const shareText = `${shareTitle} Concluí ${blockTitle} (${programTitle}) em ${durationLabel} no App Treino Social.${
    caption.trim() ? `\n${caption.trim()}` : ""
  }`;
  const showCardInline = step === "ready";
  const photoUrl = mediaItems.find((item) => item.type === "IMAGE")?.url ?? null;
  const videoUrl = mediaItems.find((item) => item.type === "VIDEO")?.url ?? null;
  const ready = Boolean(model) && (model !== "photo" || mediaItems.length > 0);
  const locked = busy || sharing || downloading || uploading;

  function releaseCamera() {
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  useEffect(() => {
    return () => {
      releaseCamera();
    };
  }, []);

  useEffect(() => {
    if (step !== "camera") {
      releaseCamera();
      return;
    }

    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;

    video.srcObject = stream;
    void video.play().catch(() => {
      /* autoplay pode falhar; o stream já está ativo */
    });
  }, [step]);

  function selectModel(next: ShareModel) {
    uiSounds.itemSelect();
    setModel(next);
    setCameraError(null);
    if (next === "photo") {
      setStep("photo");
      return;
    }
    setStep("ready");
  }

  async function uploadFile(file: File) {
    const form = new FormData();
    form.append("file", file);
    const uploaded = await apiUpload<{ file: { url: string } }>("/student/social/uploads", form, token);
    const type: "IMAGE" | "VIDEO" = isVideoFile(file) ? "VIDEO" : "IMAGE";
    return {
      url: uploaded.file.url,
      type,
      coverUrl: type === "IMAGE" ? uploaded.file.url : null
    } satisfies WorkoutShareMediaItem;
  }

  async function addMediaFile(file: File | undefined) {
    if (!file || uploading || busy) return;
    setCameraError(null);
    setUploading(true);
    try {
      const item = await uploadFile(file);
      setMediaItems((current) => [...current, item].slice(0, 10));
      uiSounds.screenshot();
      releaseCamera();
      setStep("ready");
    } catch {
      setCameraError("Não foi possível enviar a mídia. Tente de novo.");
      uiSounds.error();
    } finally {
      setUploading(false);
    }
  }

  async function openLiveCamera() {
    if (busy || cameraStarting || uploading) return;
    setCameraError(null);
    setCameraStarting(true);
    uiSounds.itemSelect();

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("unsupported");
      }

      releaseCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "user" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      streamRef.current = stream;
      setStep("camera");
    } catch {
      setCameraError("Não foi possível abrir a câmera. Permita o acesso ou use a galeria.");
      uiSounds.error();
      cameraFallbackInputRef.current?.click();
    } finally {
      setCameraStarting(false);
    }
  }

  function snapPhotoFromCamera() {
    const video = videoRef.current;
    if (!video || video.videoWidth <= 0) {
      setCameraError("Aguarde a câmera carregar e tente de novo.");
      uiSounds.error();
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("Não foi possível capturar a foto.");
      uiSounds.error();
      return;
    }

    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCameraError("Não foi possível capturar a foto.");
          uiSounds.error();
          return;
        }
        void addMediaFile(new File([blob], `treino-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92
    );
  }

  function goBack() {
    uiSounds.popupClose();
    setCameraError(null);
    if (step === "camera") {
      releaseCamera();
      setStep("photo");
      return;
    }
    if (step === "ready" && model === "photo") {
      setStep("photo");
      return;
    }
    if (step === "ready" || step === "photo") {
      setStep("choose");
      setModel(null);
      return;
    }
  }

  async function captureCardBlob() {
    const node = cardRef.current;
    if (!node) return null;
    const canvas = await html2canvas(node, {
      backgroundColor: "#ffffff",
      scale: Math.min(2, window.devicePixelRatio || 2),
      useCORS: true,
      allowTaint: true,
      logging: false
    });
    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/png");
    });
  }

  function sharePayload(publish: boolean): WorkoutSharePayload {
    return {
      publish,
      caption: caption.trim() || undefined,
      photoUrl,
      videoUrl,
      mediaItems: mediaItems.length ? mediaItems : undefined,
      exerciseCount
    };
  }

  async function finish(publish: boolean) {
    if (finishingRef.current || locked) return;
    if (publish && !ready) return;
    finishingRef.current = true;
    uiSounds.submit();
    try {
      if (publish) await onPublish(sharePayload(true));
      else await onFinishWithoutPublish();
    } finally {
      finishingRef.current = false;
    }
  }

  async function downloadViaAnchor(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "treino-pago.png";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function persistCardImage(blob: Blob) {
    if (isNativeAppShell()) {
      const base64 = await blobToBase64(blob);
      const sent = postNativeMessage({
        type: "DOWNLOAD_IMAGE",
        base64,
        filename: "treino-pago.png"
      });
      if (!sent) {
        throw new Error("native-download-failed");
      }
      return;
    }
    await downloadViaAnchor(blob);
  }

  async function downloadCardImage() {
    if (locked || !model || step !== "ready") return;
    if (model === "photo" && !mediaItems.length) return;
    setDownloading(true);
    uiSounds.submit();
    try {
      const blob = await captureCardBlob();
      if (!blob) {
        uiSounds.error();
        return;
      }
      await persistCardImage(blob);
    } catch {
      uiSounds.error();
    } finally {
      setDownloading(false);
    }
  }

  async function shareNative() {
    if (locked || !model || step !== "ready") return;
    if (model === "photo" && !mediaItems.length) return;
    setSharing(true);
    uiSounds.submit();
    try {
      const blob = await captureCardBlob();
      if (!blob) {
        uiSounds.error();
        return;
      }

      if (isNativeAppShell()) {
        const base64 = await blobToBase64(blob);
        const sent = postNativeMessage({
          type: "SHARE_IMAGE",
          save: false,
          base64,
          filename: "treino-pago.png",
          title: shareTitle,
          text: shareText
        });
        if (!sent) {
          uiSounds.error();
        }
        return;
      }

      if (typeof navigator.share !== "function") {
        await downloadViaAnchor(blob);
        return;
      }

      const file = new File([blob], "treino-pago.png", { type: "image/png" });
      await navigator.share({
        title: shareTitle,
        text: shareText,
        url: shareUrl,
        files: [file]
      });
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === "AbortError";
      if (!aborted) uiSounds.error();
    } finally {
      setSharing(false);
    }
  }

  const previewCard = (
    <WorkoutSharePreview
      blockTitle={blockTitle}
      cardRef={cardRef}
      durationLabel={durationLabel}
      exerciseCount={exerciseCount}
      photoUrl={photoUrl}
      programTitle={programTitle}
      videoUrl={videoUrl}
    />
  );

  return (
    <div className="runner-confirm-backdrop runner-share-backdrop" role="presentation">
      <section
        className="runner-share-modal runner-share-flow"
        role="dialog"
        aria-modal="true"
        aria-labelledby="runner-share-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          aria-hidden={!showCardInline}
          className={showCardInline ? undefined : "runner-share-card-capture"}
        >
          {previewCard}
        </div>

        {step === "choose" ? (
          <>
            <h2 id="runner-share-title">Treino concluído</h2>
            <p>Escolha o modelo e publique. Tempo, exercícios e as demais métricas vão para o Feed.</p>

            <div className="runner-share-model-grid">
              <button type="button" className="runner-share-model-card" onClick={() => selectModel("simple")} disabled={locked}>
                <span className="runner-share-model-circle" aria-hidden="true">
                  <Trophy size={32} />
                </span>
                <strong>Modelo simples</strong>
              </button>
              <button type="button" className="runner-share-model-card" onClick={() => selectModel("photo")} disabled={locked}>
                <span className="runner-share-model-circle with-photo" aria-hidden="true">
                  <UserRound size={32} />
                </span>
                <strong>Com foto ou vídeo</strong>
              </button>
            </div>
          </>
        ) : null}

        {step === "photo" ? (
          <>
            <div className="runner-share-icon" aria-hidden="true">
              <Camera size={48} />
            </div>
            <h2 id="runner-share-title">É HORA DE FOTO!</h2>
            <p>Tire uma selfie, escolha da galeria ou anexe um vídeo para o Feed.</p>

            <input
              ref={cameraFallbackInputRef}
              className="runner-share-file-input"
              type="file"
              accept="image/*"
              capture="user"
              onChange={(event) => {
                void addMediaFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <input
              ref={galleryInputRef}
              className="runner-share-file-input"
              type="file"
              accept="image/*"
              onChange={(event) => {
                void addMediaFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <input
              ref={videoInputRef}
              className="runner-share-file-input"
              type="file"
              accept={VIDEO_FILE_ACCEPT}
              onChange={(event) => {
                void addMediaFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />

            {cameraError ? <p className="runner-share-error">{cameraError}</p> : null}

            <div className="runner-share-photo-actions">
              <button
                type="button"
                className="runner-share-primary"
                disabled={locked || cameraStarting}
                onClick={() => void openLiveCamera()}
              >
                <Camera size={18} /> {cameraStarting ? "Abrindo câmera..." : uploading ? "Enviando..." : "Tirar foto"}
              </button>
              <button
                type="button"
                className="runner-share-secondary"
                disabled={locked || cameraStarting}
                onClick={() => galleryInputRef.current?.click()}
              >
                <ImagePlus size={18} /> Galeria
              </button>
              <button
                type="button"
                className="runner-share-secondary"
                disabled={locked || cameraStarting}
                onClick={() => videoInputRef.current?.click()}
              >
                <Video size={18} /> Vídeo
              </button>
            </div>

            <button type="button" className="runner-share-cancel" disabled={locked || cameraStarting} onClick={goBack}>
              Voltar
            </button>
          </>
        ) : null}

        {step === "camera" ? (
          <>
            <h2 id="runner-share-title">É HORA DE FOTO!</h2>
            <p>Posicione-se e toque em capturar.</p>

            <div className="runner-share-camera-stage">
              <video ref={videoRef} className="runner-share-camera-video" playsInline muted autoPlay />
            </div>

            {cameraError ? <p className="runner-share-error">{cameraError}</p> : null}

            <div className="runner-share-photo-actions">
              <button type="button" className="runner-share-primary" disabled={locked} onClick={snapPhotoFromCamera}>
                <Camera size={18} /> {uploading ? "Enviando..." : "Capturar"}
              </button>
              <button type="button" className="runner-share-cancel" disabled={locked} onClick={goBack}>
                Voltar
              </button>
            </div>
          </>
        ) : null}

        {step === "ready" ? (
          <>
            <h2 id="runner-share-title">Percurso do treino pronto</h2>
            <p>Publique no Feed com as métricas. Foto e vídeo entram na mesma publicação.</p>

            <textarea
              className="runner-share-caption"
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="Como foi o treino?"
              rows={3}
              maxLength={2000}
              disabled={locked}
            />

            {model === "photo" && !mediaItems.length ? (
              <button type="button" className="runner-share-secondary" disabled={locked} onClick={() => setStep("photo")}>
                <ImagePlus size={18} /> Adicionar foto ou vídeo
              </button>
            ) : (
              <>
                {model === "photo" && mediaItems.length < 10 ? (
                  <button type="button" className="runner-share-secondary" disabled={locked} onClick={() => setStep("photo")}>
                    <ImagePlus size={18} /> Adicionar outra mídia
                  </button>
                ) : null}
                <button
                  type="button"
                  className="runner-share-primary"
                  data-testid="workout-share-publish"
                  disabled={locked || !ready}
                  onClick={() => void finish(true)}
                >
                  {busy ? "Publicando..." : "Publicar no Feed"}
                </button>
                <button
                  type="button"
                  className="runner-share-secondary"
                  data-testid="workout-share-share"
                  disabled={locked}
                  onClick={() => void shareNative()}
                >
                  <Share2 size={18} /> {sharing ? "Abrindo..." : "Compartilhar"}
                </button>
                <button
                  type="button"
                  className="runner-share-secondary"
                  data-testid="workout-share-download"
                  disabled={locked}
                  onClick={() => void downloadCardImage()}
                >
                  <Download size={18} /> {downloading ? "Baixando..." : "Baixar imagem"}
                </button>
              </>
            )}

            {cameraError ? <p className="runner-share-error">{cameraError}</p> : null}

            <button type="button" className="runner-share-cancel" disabled={locked} onClick={goBack}>
              Voltar
            </button>
          </>
        ) : null}

        <button
          type="button"
          className="runner-share-cancel"
          data-testid="workout-share-close"
          disabled={locked}
          onClick={() => {
            uiSounds.popupClose();
            void finish(false);
          }}
        >
          <X size={18} /> {busy ? "Salvando..." : "Finalizar sem publicar"}
        </button>
      </section>
    </div>
  );
}
