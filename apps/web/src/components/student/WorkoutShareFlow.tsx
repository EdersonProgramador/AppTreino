import { useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";
import {
  Camera,
  ImagePlus,
  Share2,
  Trophy,
  UserRound,
  X
} from "lucide-react";
import {
  FacebookIcon,
  FacebookShareButton,
  TelegramIcon,
  TelegramShareButton,
  TwitterIcon,
  TwitterShareButton,
  WhatsappIcon,
  WhatsappShareButton
} from "react-share";
import { uiSounds } from "../../lib/ui-sounds";

type ShareStep = "choose" | "photo" | "camera" | "ready";
type ShareModel = "simple" | "photo";

interface WorkoutShareFlowProps {
  programTitle: string;
  blockTitle: string;
  exerciseCount: number;
  durationLabel: string;
  busy?: boolean;
  onDismiss: () => void | Promise<void>;
}

function sharePageUrl() {
  if (typeof window === "undefined") return "https://edersonprogramador.com";
  return window.location.origin;
}

function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function WorkoutShareFlow({
  programTitle,
  blockTitle,
  exerciseCount,
  durationLabel,
  busy = false,
  onDismiss
}: WorkoutShareFlowProps) {
  const [step, setStep] = useState<ShareStep>("choose");
  const [model, setModel] = useState<ShareModel | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStarting, setCameraStarting] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraFallbackInputRef = useRef<HTMLInputElement>(null);

  const shareUrl = sharePageUrl();
  const shareTitle = "O TREINO DE HOJE ESTÁ PAGO!";
  const shareText = `${shareTitle} Concluí ${blockTitle} (${programTitle}) em ${durationLabel} no App Treino.`;

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
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

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

  function applyPhotoUrl(nextUrl: string) {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(nextUrl);
    uiSounds.screenshot();
    releaseCamera();
    setStep("ready");
  }

  function handlePhotoFile(file: File | undefined) {
    if (!file) return;
    applyPhotoUrl(URL.createObjectURL(file));
  }

  async function openLiveCamera() {
    if (busy || cameraStarting) return;
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
      // Fallback: input nativo com capture (melhor em alguns mobile).
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

    // Espelha a selfie (facingMode user) para bater com o preview.
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
        applyPhotoUrl(URL.createObjectURL(blob));
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
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      logging: false
    });
    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/png");
    });
  }

  async function shareNative() {
    if (sharing || busy) return;
    setSharing(true);
    uiSounds.submit();
    try {
      const blob = await captureCardBlob();
      const file = blob ? new File([blob], "treino-pago.png", { type: "image/png" }) : null;
      if (file && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          files: [file]
        });
      } else if (navigator.share) {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl
        });
      } else if (file) {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(file);
        link.download = "treino-pago.png";
        link.click();
        URL.revokeObjectURL(link.href);
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(shareText);
        }
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
      }
      await onDismiss();
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === "AbortError";
      if (!aborted) uiSounds.error();
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="runner-confirm-backdrop runner-share-backdrop" role="presentation">
      <section
        className="runner-share-modal runner-share-flow"
        role="dialog"
        aria-modal="true"
        aria-labelledby="runner-share-title"
        onClick={(event) => event.stopPropagation()}
      >
        {step === "choose" ? (
          <>
            <div className="runner-share-social-row" aria-hidden="true">
              <WhatsappIcon size={28} round />
              <FacebookIcon size={28} round />
              <TwitterIcon size={28} round />
              <TelegramIcon size={28} round />
            </div>
            <h2 id="runner-share-title">É HORA DE COMPARTILHAR!</h2>
            <p>Selecione o tipo de imagem que você deseja compartilhar com seus amigos!</p>

            <div className="runner-share-model-grid">
              <button type="button" className="runner-share-model-card" onClick={() => selectModel("simple")} disabled={busy}>
                <span className="runner-share-model-circle" aria-hidden="true">
                  <Trophy size={32} />
                </span>
                <strong>Modelo Simples</strong>
              </button>
              <button type="button" className="runner-share-model-card" onClick={() => selectModel("photo")} disabled={busy}>
                <span className="runner-share-model-circle with-photo" aria-hidden="true">
                  <UserRound size={32} />
                </span>
                <strong>Modelo com sua foto</strong>
              </button>
            </div>

            <button
              type="button"
              className="runner-share-cancel"
              disabled={busy}
              onClick={() => {
                uiSounds.popupClose();
                void onDismiss();
              }}
            >
              <X size={18} /> Fechar
            </button>
          </>
        ) : null}

        {step === "photo" ? (
          <>
            <div className="runner-share-icon" aria-hidden="true">
              <Camera size={48} />
            </div>
            <h2 id="runner-share-title">É HORA DE FOTO!</h2>
            <p>Faça uma selfie bem divertida ou selecione uma imagem da sua galeria de fotos.</p>

            <input
              ref={cameraFallbackInputRef}
              className="runner-share-file-input"
              type="file"
              accept="image/*"
              capture="user"
              onChange={(event) => handlePhotoFile(event.target.files?.[0])}
            />
            <input
              ref={galleryInputRef}
              className="runner-share-file-input"
              type="file"
              accept="image/*"
              onChange={(event) => handlePhotoFile(event.target.files?.[0])}
            />

            {cameraError ? <p className="runner-share-error">{cameraError}</p> : null}

            <div className="runner-share-photo-actions">
              <button
                type="button"
                className="runner-share-primary"
                disabled={busy || cameraStarting}
                onClick={() => void openLiveCamera()}
              >
                <Camera size={18} /> {cameraStarting ? "Abrindo câmera..." : "Tirar foto"}
              </button>
              <button
                type="button"
                className="runner-share-secondary"
                disabled={busy || cameraStarting}
                onClick={() => galleryInputRef.current?.click()}
              >
                <ImagePlus size={18} /> Abrir galeria
              </button>
            </div>

            <button type="button" className="runner-share-cancel" disabled={busy || cameraStarting} onClick={goBack}>
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
              <button type="button" className="runner-share-primary" disabled={busy} onClick={snapPhotoFromCamera}>
                <Camera size={18} /> Capturar
              </button>
              <button type="button" className="runner-share-cancel" disabled={busy} onClick={goBack}>
                Voltar
              </button>
            </div>
          </>
        ) : null}

        {step === "ready" ? (
          <>
            <div className="runner-share-card" ref={cardRef}>
              <span className="runner-share-card-badge">App Treino</span>
              <h3>O TREINO DE HOJE ESTÁ PAGO!</h3>
              {model === "photo" && photoUrl ? (
                <div className="runner-share-card-photo">
                  <img src={photoUrl} alt="Sua foto do treino" />
                </div>
              ) : (
                <div className="runner-share-card-mark" aria-hidden="true">
                  <Trophy size={42} />
                </div>
              )}
              <dl className="runner-share-card-stats">
                <div>
                  <dt>Programa</dt>
                  <dd>{programTitle}</dd>
                </div>
                <div>
                  <dt>Treino</dt>
                  <dd>{blockTitle}</dd>
                </div>
                <div>
                  <dt>Exercícios</dt>
                  <dd>{exerciseCount}</dd>
                </div>
                <div>
                  <dt>Tempo</dt>
                  <dd>{durationLabel}</dd>
                </div>
              </dl>
            </div>

            <h2 id="runner-share-title">TUDO CERTO!</h2>
            <p>Agora é só escolher a sua rede social preferida e compartilhar com seus amigos.</p>

            <div className="runner-share-network-row">
              <WhatsappShareButton url={shareUrl} title={shareText} separator=" ">
                <WhatsappIcon size={44} round />
              </WhatsappShareButton>
              <FacebookShareButton url={shareUrl} hashtag="#AppTreino">
                <FacebookIcon size={44} round />
              </FacebookShareButton>
              <TwitterShareButton url={shareUrl} title={shareText}>
                <TwitterIcon size={44} round />
              </TwitterShareButton>
              <TelegramShareButton url={shareUrl} title={shareText}>
                <TelegramIcon size={44} round />
              </TelegramShareButton>
            </div>

            <button
              type="button"
              className="runner-share-primary"
              disabled={busy || sharing || (model === "photo" && !photoUrl)}
              onClick={() => void shareNative()}
            >
              <Share2 size={18} /> COMPARTILHAR
            </button>
            <button type="button" className="runner-share-cancel" disabled={busy || sharing} onClick={goBack}>
              Voltar
            </button>
          </>
        ) : null}
      </section>
    </div>
  );
}
