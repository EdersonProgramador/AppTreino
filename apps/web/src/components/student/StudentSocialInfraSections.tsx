import { FormEvent, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Camera,
  Heart,
  Loader2,
  MessageCircle,
  Mic,
  MicOff,
  Pencil,
  Radio,
  RefreshCw,
  Send,
  Sparkles,
  SwitchCamera,
  Trash2,
  UserRound,
  Video,
  X
} from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut, apiUpload } from "../../api";
import { mediaUrl } from "../../lib/urls";
import { getSocialSocket } from "../../lib/social-socket";
import type { SocialAuthor, UploadResponse } from "../../types";
import { CAMERA_FILTERS, cameraFilterCss, applyCameraZoom, clampCameraZoom, readCameraZoomCaps, zoomFromPinch, StudentCameraCapture, type CameraFilterId, type CameraZoomCaps } from "./StudentCameraCapture";

type ReelRow = {
  id: string;
  videoUrl: string;
  caption: string;
  mood?: string | null;
  author: SocialAuthor;
  likesCount: number;
  likedByMe: boolean;
  isMine?: boolean;
};

type LiveRow = {
  id: string;
  title: string;
  mood?: string | null;
  host: SocialAuthor;
  isMine: boolean;
  viewerPeak?: number;
  status?: string;
  savedByMe?: boolean;
  startedAt?: string;
  endedAt?: string | null;
  videoUrl?: string | null;
  coverUrl?: string | null;
};

type ConversationRow = {
  id: string;
  user: SocialAuthor;
  lastMessage?: { content: string; createdAt: string } | null;
  updatedAt: string;
};

type DmMessage = {
  id: string;
  content: string;
  createdAt: string;
  senderId: string;
  isMine?: boolean;
  author?: SocialAuthor;
};

type FollowRequestRow = { id: string; user: SocialAuthor; createdAt: string };

function SocialErrorBanner({ message, onDismiss }: { message: string | null; onDismiss?: () => void }) {
  if (!message) return null;
  return (
    <div className="student-social-error" role="alert">
      <span>{message}</span>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} aria-label="Fechar aviso">
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}

function readErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" }
];

function pickRecorderMime() {
  const types = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  return types.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) || "";
}

function frameFromVideo(video: HTMLVideoElement, mirror = false): Promise<Blob | null> {
  if (!video.videoWidth || !video.videoHeight) return Promise.resolve(null);
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  if (mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.9));
}

export function StudentReelsSection({
  token,
  onOpenDm,
  onOpenPeerProfile
}: {
  token: string;
  onOpenDm?: (userId: string) => void;
  onOpenPeerProfile?: (userId: string) => void;
}) {
  const [reels, setReels] = useState<ReelRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [composer, setComposer] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [caption, setCaption] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCaption, setEditCaption] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const data = await apiGet<{ reels: ReelRow[] }>("/student/social/reels", token);
      setReels(data.reels);
      setError(null);
    } catch (err) {
      setError(readErrorMessage(err, "Não foi possível carregar os clipes."));
    }
  }

  useEffect(() => {
    void load();
  }, [token]);

  async function uploadVideo(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const uploaded = await apiUpload<UploadResponse>("/student/social/uploads", form, token);
      setVideoUrl(uploaded.file.url);
      setComposer(true);
      setCameraOpen(false);
    } catch (err) {
      setError(readErrorMessage(err, "Falha ao enviar o vídeo. Tente novamente."));
    } finally {
      setUploading(false);
    }
  }

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (!videoUrl) {
      setError("Grave ou escolha um vídeo antes de publicar.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiPost("/student/social/reels", { videoUrl, caption }, token);
      setComposer(false);
      setCaption("");
      setVideoUrl(null);
      await load();
    } catch (err) {
      setError(readErrorMessage(err, "Não foi possível publicar o clipe."));
    } finally {
      setBusy(false);
    }
  }

  async function like(id: string) {
    try {
      const result = await apiPost<{ liked: boolean }>(`/student/social/reels/${id}/like`, {}, token);
      setReels((current) =>
        current.map((row) =>
          row.id === id
            ? { ...row, likedByMe: result.liked, likesCount: Math.max(0, row.likesCount + (result.liked ? 1 : -1)) }
            : row
        )
      );
    } catch (err) {
      setError(readErrorMessage(err, "Não foi possível curtir o clipe."));
    }
  }

  async function saveEdit() {
    if (!editingId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiPut<{ reel: ReelRow }>(`/student/social/reels/${editingId}`, { caption: editCaption }, token);
      setReels((current) => current.map((row) => (row.id === editingId ? { ...row, caption: result.reel.caption } : row)));
      setEditingId(null);
      setEditCaption("");
    } catch (err) {
      setError(readErrorMessage(err, "Não foi possível editar o clipe."));
    } finally {
      setBusy(false);
    }
  }

  async function removeReel(id: string) {
    if (!window.confirm("Remover este clipe do seu perfil e do feed?")) return;
    setBusy(true);
    setError(null);
    try {
      await apiDelete(`/student/social/reels/${id}`, token);
      setReels((current) => current.filter((row) => row.id !== id));
      if (editingId === id) {
        setEditingId(null);
        setEditCaption("");
      }
    } catch (err) {
      setError(readErrorMessage(err, "Não foi possível remover o clipe."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="student-social-pane student-reels">
      <header className="student-social-pane-head">
        <div>
          <strong>Clipes</strong>
          <small>Só os seus · também aparecem no feed e no perfil.</small>
        </div>
        <button
          type="button"
          className="student-green-button"
          onClick={() => {
            setError(null);
            setCameraOpen(true);
          }}
        >
          <Camera size={16} /> Novo clipe
        </button>
      </header>

      <SocialErrorBanner message={error} onDismiss={() => setError(null)} />
      {uploading ? <p className="student-activity-hint">Enviando vídeo…</p> : null}

      <div className="student-reels-scroller">
        {reels.map((reel) => (
          <article key={reel.id} className="student-reel-card">
            <video
              src={mediaUrl(reel.videoUrl)}
              playsInline
              loop
              muted
              preload="metadata"
              onClick={(event) => {
                const video = event.currentTarget;
                if (video.paused) void video.play().catch(() => undefined);
                else video.pause();
              }}
            />
            <div className="student-reel-side-actions">
              <button type="button" className={reel.likedByMe ? "is-on" : ""} onClick={() => void like(reel.id)}>
                <Heart size={20} />
                <span>{reel.likesCount}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingId(reel.id);
                  setEditCaption(reel.caption ?? "");
                }}
              >
                <Pencil size={20} />
                <span>Editar</span>
              </button>
              <button type="button" onClick={() => void removeReel(reel.id)} disabled={busy}>
                <Trash2 size={20} />
                <span>Excluir</span>
              </button>
            </div>
            <div className="student-reel-meta">
              <strong>{reel.author.name}</strong>
              {reel.caption ? <p>{reel.caption}</p> : null}
            </div>
          </article>
        ))}
        {reels.length === 0 && !error && <p className="student-activity-hint">Nenhum clipe ainda. Grave o primeiro.</p>}
      </div>

      {composer && (
        <div className="student-activity-sheet" role="dialog" aria-label="Publicar clipe">
          <header>
            <strong>Publicar clipe</strong>
            <button
              type="button"
              onClick={() => {
                setComposer(false);
                setVideoUrl(null);
                setCaption("");
              }}
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
          </header>
          <SocialErrorBanner message={error} onDismiss={() => setError(null)} />
          {videoUrl ? <video className="student-feed-media student-reel-preview" src={mediaUrl(videoUrl)} controls playsInline /> : null}
          <input value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Legenda" maxLength={220} />
          <div className="student-reel-composer-actions">
            <button type="button" className="student-ghost-chip" onClick={() => setCameraOpen(true)}>
              <Camera size={16} /> Gravar de novo
            </button>
            <button type="button" className="student-ghost-chip" onClick={() => fileRef.current?.click()}>
              <Video size={16} /> Galeria
            </button>
          </div>
          <button type="button" className="student-green-button" disabled={busy || !videoUrl} onClick={(event) => void publish(event as unknown as FormEvent)}>
            {busy ? "Publicando…" : "Publicar clipe"}
          </button>
        </div>
      )}

      {editingId && (
        <div className="student-activity-sheet" role="dialog" aria-label="Editar clipe">
          <header>
            <strong>Editar clipe</strong>
            <button type="button" onClick={() => setEditingId(null)} aria-label="Fechar">
              <X size={18} />
            </button>
          </header>
          <input value={editCaption} onChange={(event) => setEditCaption(event.target.value)} placeholder="Legenda" maxLength={300} />
          <button type="button" className="student-green-button" disabled={busy} onClick={() => void saveEdit()}>
            {busy ? "Salvando…" : "Salvar alterações"}
          </button>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void uploadVideo(file);
        }}
      />

      <StudentCameraCapture
        open={cameraOpen}
        mode="video"
        title="Novo clipe"
        maxVideoSeconds={60}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => void uploadVideo(file)}
      />
    </section>
  );
}

export function StudentLiveSection({
  token,
  initialLiveId,
  onLiveConsumed
}: {
  token: string;
  initialLiveId?: string | null;
  onLiveConsumed?: () => void;
}) {
  const [lives, setLives] = useState<LiveRow[]>([]);
  const [savedLives, setSavedLives] = useState<LiveRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [title, setTitle] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<{ id: string; content: string; name: string }>>([]);
  const [chat, setChat] = useState("");
  const [isMine, setIsMine] = useState(false);
  const [savedByMe, setSavedByMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "countdown" | "live" | "joining">("idle");
  const [countdown, setCountdown] = useState(3);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [micOn, setMicOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [filterId, setFilterId] = useState<CameraFilterId>("none");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomCaps, setZoomCaps] = useState<CameraZoomCaps>({ min: 1, max: 5, step: 0.01, hardware: false });
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);
  const [viewportH, setViewportH] = useState(() =>
    typeof window !== "undefined" ? Math.round(window.visualViewport?.height ?? window.innerHeight) : 0
  );
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const liveIdRef = useRef<string | null>(null);
  const studioRef = useRef<HTMLElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const [saveSheet, setSaveSheet] = useState<{
    liveId: string;
    title: string;
    videoBlob: Blob | null;
    videoUrl: string | null;
    coverPreview: string | null;
    mirror: boolean;
    afterEnd: boolean;
  } | null>(null);
  const [saveCoverAt, setSaveCoverAt] = useState(0);
  const [saveDurationSec, setSaveDurationSec] = useState(1);
  const savePreviewRef = useRef<HTMLVideoElement>(null);
  const [savingLive, setSavingLive] = useState(false);
  const [replayLive, setReplayLive] = useState<LiveRow | null>(null);

  function stopRecorder() {
    const recorder = recorderRef.current;
    if (!recorder) return Promise.resolve(null as Blob | null);
    return new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        const chunks = recordedChunksRef.current.slice();
        recordedChunksRef.current = [];
        recorderRef.current = null;
        if (!chunks.length) {
          resolve(null);
          return;
        }
        resolve(new Blob(chunks, { type: chunks[0]?.type || "video/webm" }));
      };
      try {
        if (recorder.state === "recording") {
          try {
            recorder.requestData();
          } catch {
            // ignore
          }
        }
        if (recorder.state !== "inactive") recorder.stop();
        else resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  function startRecorder(stream: MediaStream) {
    if (typeof MediaRecorder === "undefined") return;
    try {
      recordedChunksRef.current = [];
      const mimeType = pickRecorderMime();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };
      recorder.start(1000);
      recorderRef.current = recorder;
    } catch {
      recorderRef.current = null;
    }
  }

  function stopMedia() {
    void stopRecorder();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
  }

  async function uploadLiveFile(file: File) {
    const form = new FormData();
    form.append("file", file);
    const uploaded = await apiUpload<UploadResponse>("/student/social/uploads", form, token);
    return uploaded.file.url;
  }

  async function load() {
    setLoadingList(true);
    setError(null);
    const [liveResult, savedResult] = await Promise.allSettled([
      apiGet<{ lives: LiveRow[] }>("/student/social/live", token),
      apiGet<{ lives: LiveRow[] }>("/student/social/live/saved", token)
    ]);
    if (liveResult.status === "fulfilled") {
      setLives(liveResult.value.lives);
    } else {
      setLives([]);
      setError(readErrorMessage(liveResult.reason, "Não foi possível listar lives no ar."));
    }
    if (savedResult.status === "fulfilled") {
      setSavedLives(savedResult.value.lives);
    } else {
      setSavedLives([]);
      if (liveResult.status === "fulfilled") {
        setError(readErrorMessage(savedResult.reason, "Não foi possível carregar lives salvas."));
      }
    }
    setLoadingList(false);
  }

  useEffect(() => {
    void load();
    return () => {
      stopMedia();
      const socket = getSocialSocket(token);
      socket.off("live:peer-joined");
      socket.off("live:signal");
      socket.off("live:chat");
      socket.off("live:ended");
    };
  }, [token]);

  useEffect(() => {
    if (!initialLiveId) return;
    void joinLive(initialLiveId).finally(() => onLiveConsumed?.());
  }, [initialLiveId]);

  useEffect(() => {
    if (status !== "countdown" && status !== "live") return;
    const sync = () => {
      const h = Math.round(window.visualViewport?.height ?? window.innerHeight);
      setViewportH(h);
      if (studioRef.current) {
        studioRef.current.style.height = `${h}px`;
        studioRef.current.style.top = `${Math.round(window.visualViewport?.offsetTop ?? 0)}px`;
      }
    };
    sync();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.visualViewport?.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.visualViewport?.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [status]);

  useEffect(() => {
    if (status !== "countdown" && !(status === "live" && isMine)) return;
    const video = localVideoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    if (video.srcObject !== stream) {
      video.srcObject = stream;
      void video.play().catch(() => undefined);
    }
  }, [status, isMine, activeId]);

  async function bindPreview(nextFacing: "user" | "environment") {
    stopMedia();
    let stream: MediaStream;
    const videoConstraints: MediaTrackConstraints = {
      facingMode: { ideal: nextFacing },
      width: { ideal: nextFacing === "user" ? 1280 : 1920 },
      height: { ideal: nextFacing === "user" ? 720 : 1080 }
    };
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: videoConstraints
      });
    } catch {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: { ideal: nextFacing } }
      });
    }
    streamRef.current = stream;
    const videoTrack = stream.getVideoTracks()[0];
    const nextCaps = readCameraZoomCaps(videoTrack);
    setZoomCaps(nextCaps);
    setZoom(nextCaps.min);
    void applyCameraZoom(videoTrack, nextCaps.min, nextCaps.hardware);
    if (localVideoRef.current) {
      localVideoRef.current.setAttribute("playsinline", "true");
      localVideoRef.current.setAttribute("webkit-playsinline", "true");
      localVideoRef.current.srcObject = stream;
      await localVideoRef.current.play().catch(() => undefined);
    }
    stream.getAudioTracks().forEach((track) => {
      track.enabled = micOn;
    });
  }

  function setLiveZoom(next: number) {
    const clamped = clampCameraZoom(next, zoomCaps);
    setZoom(clamped);
    void applyCameraZoom(streamRef.current?.getVideoTracks()[0], clamped, zoomCaps.hardware);
  }

  function onLivePinchStart(event: TouchEvent) {
    if (event.touches.length !== 2) return;
    const [a, b] = [event.touches[0], event.touches[1]];
    pinchRef.current = {
      startDist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
      startZoom: zoom
    };
  }

  function onLivePinchMove(event: TouchEvent) {
    if (event.touches.length !== 2 || !pinchRef.current) return;
    event.preventDefault();
    const [a, b] = [event.touches[0], event.touches[1]];
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const ratio = dist / Math.max(1, pinchRef.current.startDist);
    setLiveZoom(zoomFromPinch(pinchRef.current.startZoom, ratio, zoomCaps));
  }

  function onLivePinchEnd() {
    pinchRef.current = null;
  }

  function onLiveDoubleClick() {
    setLiveZoom(zoomCaps.min);
  }

  async function flipCamera() {
    const next = facing === "user" ? "environment" : "user";
    setFacing(next);
    try {
      const wasRecording = Boolean(recorderRef.current);
      if (wasRecording) await stopRecorder();
      await bindPreview(next);
      if (wasRecording && streamRef.current && status === "live") startRecorder(streamRef.current);
    } catch (err) {
      setError(readErrorMessage(err, "Não foi possível virar a câmera."));
    }
  }

  function toggleMic() {
    const next = !micOn;
    setMicOn(next);
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
  }

  async function beginGoLive(event: FormEvent) {
    event.preventDefault();
    if (title.trim().length < 2) {
      setError("Digite um título com pelo menos 2 caracteres.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Este aparelho não permite câmera no navegador.");
      }
      await bindPreview(facing);
      setIsMine(true);
      setStatus("countdown");
      setCountdown(3);
      for (let n = 3; n >= 1; n -= 1) {
        setCountdown(n);
        await new Promise((resolve) => setTimeout(resolve, 900));
      }
      const stream = streamRef.current;
      if (!stream) throw new Error("Câmera indisponível.");
      const created = await apiPost<{ live: { id: string } }>("/student/social/live", { title: title.trim() }, token);
      const liveId = created.live.id;
      liveIdRef.current = liveId;
      setActiveId(liveId);
      setIsMine(true);
      setSavedByMe(true);
      setStatus("live");
      setMessages([]);
      startRecorder(stream);
      const socket = getSocialSocket(token);
      socket.emit("live:join", liveId);
      socket.off("live:peer-joined");
      socket.on("live:peer-joined", async ({ socketId, isHost }: { socketId: string; isHost?: boolean }) => {
        if (isHost) return;
        try {
          const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
          pcRef.current = pc;
          stream.getTracks().forEach((track) => pc.addTrack(track, stream));
          pc.onicecandidate = (ev) => {
            if (ev.candidate) {
              socket.emit("live:signal", { liveId, to: socketId, data: { candidate: ev.candidate } });
            }
          };
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("live:signal", { liveId, to: socketId, data: { sdp: offer } });
        } catch {
          setError("Falha ao conectar um espectador.");
        }
      });
      socket.off("live:chat");
      socket.on("live:chat", (msg: { id: string; content: string; name: string }) => {
        setMessages((current) => [...current, msg]);
      });
      await load();
    } catch (err) {
      stopMedia();
      setStatus("idle");
      setActiveId(null);
      setError(readErrorMessage(err, "Não foi possível iniciar a live. Permita câmera e microfone."));
    } finally {
      setBusy(false);
    }
  }

  async function joinLive(id: string) {
    setError(null);
    setBusy(true);
    setStatus("joining");
    try {
      const detail = await apiGet<{
        live: {
          isMine: boolean;
          title?: string;
          savedByMe?: boolean;
          messages: Array<{ id: string; content: string; name: string }>;
        };
      }>(`/student/social/live/${id}`, token);
      setActiveId(id);
      liveIdRef.current = id;
      setIsMine(detail.live.isMine);
      setSavedByMe(Boolean(detail.live.savedByMe));
      if (detail.live.title) setTitle(detail.live.title);
      setMessages(detail.live.messages);
      setStatus("live");
      const socket = getSocialSocket(token);
      socket.emit("live:join", id, async (result: { ok: boolean; hostId?: string }) => {
        if (!result.ok) {
          setError("Live indisponível ou encerrada.");
          setActiveId(null);
          setStatus("idle");
          return;
        }
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pcRef.current = pc;
        pc.ontrack = (event) => {
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = event.streams[0];
            void remoteVideoRef.current.play().catch(() => undefined);
          }
        };
        pc.onicecandidate = (ev) => {
          if (ev.candidate) {
            socket.emit("live:signal", { liveId: id, to: result.hostId, data: { candidate: ev.candidate } });
          }
        };
        socket.off("live:signal");
        socket.on("live:signal", async (payload: { from: string; data: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }) => {
          try {
            if (payload.data.sdp?.type === "offer") {
              await pc.setRemoteDescription(payload.data.sdp);
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              socket.emit("live:signal", { liveId: id, to: payload.from, data: { sdp: answer } });
            } else if (payload.data.sdp?.type === "answer") {
              await pc.setRemoteDescription(payload.data.sdp);
            } else if (payload.data.candidate) {
              await pc.addIceCandidate(payload.data.candidate).catch(() => undefined);
            }
          } catch {
            setError("Sinal de vídeo interrompido. Tente entrar de novo.");
          }
        });
      });
      socket.off("live:chat");
      socket.on("live:chat", (msg: { id: string; content: string; name: string }) => {
        setMessages((current) => [...current, msg]);
      });
      socket.off("live:ended");
      socket.on("live:ended", () => {
        stopMedia();
        setActiveId(null);
        setStatus("idle");
        setError("A live foi encerrada.");
        void load();
      });
    } catch (err) {
      setActiveId(null);
      setStatus("idle");
      setError(readErrorMessage(err, "Não foi possível entrar na live."));
    } finally {
      setBusy(false);
    }
  }

  async function openSaveConfirm(liveId: string, afterEnd: boolean) {
    const videoEl = isMine ? localVideoRef.current : remoteVideoRef.current;
    const mirror = isMine && facing === "user";
    let videoBlob: Blob | null = null;
    if (isMine) {
      videoBlob = await stopRecorder();
      if (streamRef.current && !afterEnd && status === "live") {
        startRecorder(streamRef.current);
      }
    }
    let coverPreview: string | null = null;
    if (videoEl) {
      const frame = await frameFromVideo(videoEl, mirror);
      if (frame) coverPreview = URL.createObjectURL(frame);
    }
    const known = [...lives, ...savedLives].find((row) => row.id === liveId);
    const blobUrl = videoBlob ? URL.createObjectURL(videoBlob) : null;
    setSaveCoverAt(0);
    setSaveDurationSec(1);
    setSaveSheet({
      liveId,
      title: title.trim() || known?.title || "Live",
      videoBlob,
      videoUrl: blobUrl || (known?.videoUrl ? mediaUrl(known.videoUrl) : null),
      coverPreview: coverPreview || (known?.coverUrl ? mediaUrl(known.coverUrl) : null),
      mirror,
      afterEnd
    });
  }

  async function captureCoverFromPreview() {
    const video = savePreviewRef.current;
    if (!video || !saveSheet) return;
    const frame = await frameFromVideo(video, Boolean(saveSheet.videoBlob && saveSheet.mirror));
    if (!frame) return;
    if (saveSheet.coverPreview?.startsWith("blob:")) URL.revokeObjectURL(saveSheet.coverPreview);
    setSaveSheet({ ...saveSheet, coverPreview: URL.createObjectURL(frame) });
  }

  async function confirmSaveLive() {
    if (!saveSheet) return;
    setSavingLive(true);
    setError(null);
    try {
      let videoUrl: string | undefined;
      let coverUrl: string | undefined;
      if (saveSheet.videoBlob && isMine) {
        const ext = saveSheet.videoBlob.type.includes("mp4") ? "mp4" : "webm";
        videoUrl = await uploadLiveFile(new File([saveSheet.videoBlob], `live-${saveSheet.liveId}.${ext}`, { type: saveSheet.videoBlob.type || "video/webm" }));
      }
      if (saveSheet.coverPreview) {
        const coverBlob = await fetch(saveSheet.coverPreview).then((res) => res.blob());
        coverUrl = await uploadLiveFile(new File([coverBlob], `live-cover-${saveSheet.liveId}.jpg`, { type: "image/jpeg" }));
      }
      if (isMine && (videoUrl || coverUrl)) {
        await apiPut(`/student/social/live/${saveSheet.liveId}/media`, { videoUrl, coverUrl }, token);
      }
      if (saveSheet.afterEnd && isMine) {
        await apiPost(`/student/social/live/${saveSheet.liveId}/end`, { videoUrl, coverUrl }, token);
        getSocialSocket(token).emit("live:end", saveSheet.liveId);
      } else {
        await apiPost(`/student/social/live/${saveSheet.liveId}/save`, { coverUrl }, token);
      }
      setSavedByMe(true);
      if (saveSheet.coverPreview?.startsWith("blob:")) URL.revokeObjectURL(saveSheet.coverPreview);
      if (saveSheet.videoUrl?.startsWith("blob:")) URL.revokeObjectURL(saveSheet.videoUrl);
      setSaveSheet(null);
      if (saveSheet.afterEnd) {
        stopMedia();
        setActiveId(null);
        setStatus("idle");
      }
      await load();
    } catch (err) {
      setError(readErrorMessage(err, "Não foi possível salvar a live com vídeo/capa."));
    } finally {
      setSavingLive(false);
    }
  }

  function cancelSaveSheet() {
    if (!saveSheet) return;
    if (saveSheet.coverPreview?.startsWith("blob:")) URL.revokeObjectURL(saveSheet.coverPreview);
    if (saveSheet.videoUrl?.startsWith("blob:")) URL.revokeObjectURL(saveSheet.videoUrl);
    const afterEnd = saveSheet.afterEnd;
    const liveId = saveSheet.liveId;
    setSaveSheet(null);
    if (afterEnd) {
      void (async () => {
        try {
          await apiPost(`/student/social/live/${liveId}/end`, {}, token);
          getSocialSocket(token).emit("live:end", liveId);
        } catch {
          // still leave studio
        } finally {
          stopMedia();
          setActiveId(null);
          setStatus("idle");
          await load();
        }
      })();
    }
  }

  async function deleteSavedLive(liveId: string) {
    setError(null);
    try {
      await apiDelete(`/student/social/live/${liveId}/save`, token);
      setSavedByMe((current) => (activeId === liveId ? false : current));
      setLives((current) => current.map((row) => (row.id === liveId ? { ...row, savedByMe: false } : row)));
      setSavedLives((current) => current.filter((row) => row.id !== liveId));
    } catch (err) {
      setError(readErrorMessage(err, "Não foi possível excluir a live salva."));
    }
  }

  async function toggleSaveLive(liveId: string, currentlySaved: boolean) {
    setError(null);
    if (currentlySaved) {
      await deleteSavedLive(liveId);
      return;
    }
    await openSaveConfirm(liveId, false);
  }

  async function endLive() {
    if (!activeId) return;
    await openSaveConfirm(activeId, true);
  }

  async function saveTitleEdit() {
    if (!activeId || titleDraft.trim().length < 2) {
      setError("Título precisa ter pelo menos 2 caracteres.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await apiPut<{ live: { title: string } }>(`/student/social/live/${activeId}`, { title: titleDraft.trim() }, token);
      setTitle(result.live.title);
      setEditingTitle(false);
      setLives((current) => current.map((row) => (row.id === activeId ? { ...row, title: result.live.title } : row)));
      setSavedLives((current) => current.map((row) => (row.id === activeId ? { ...row, title: result.live.title } : row)));
    } catch (err) {
      setError(readErrorMessage(err, "Não foi possível editar o título."));
    } finally {
      setBusy(false);
    }
  }

  function leaveLive() {
    stopMedia();
    setActiveId(null);
    setStatus("idle");
    setMessages([]);
    void load();
  }

  function sendChat() {
    if (!activeId || !chat.trim()) return;
    try {
      getSocialSocket(token).emit("live:chat", { liveId: activeId, content: chat.trim() });
      setChat("");
    } catch {
      setError("Não foi possível enviar a mensagem ao vivo.");
    }
  }

  if (status === "countdown" || (status === "live" && activeId)) {
    const digitalZoom = !zoomCaps.hardware;
    const studio = (
      <section
        ref={studioRef as never}
        className="student-live-studio is-fullscreen"
        aria-label="Estúdio ao vivo"
        style={viewportH ? { height: viewportH } : undefined}
        onTouchStart={isMine ? onLivePinchStart : undefined}
        onTouchMove={isMine ? onLivePinchMove : undefined}
        onTouchEnd={isMine ? onLivePinchEnd : undefined}
        onTouchCancel={isMine ? onLivePinchEnd : undefined}
        onDoubleClick={isMine ? onLiveDoubleClick : undefined}
      >
        <video
          ref={isMine ? localVideoRef : remoteVideoRef}
          className="student-live-studio-video"
          playsInline
          muted={isMine}
          autoPlay
          style={{
            filter: cameraFilterCss(filterId),
            transform: [
              isMine && facing === "user" ? "scaleX(-1)" : null,
              isMine && digitalZoom && zoom !== 1 ? `scale(${zoom})` : null
            ]
              .filter(Boolean)
              .join(" ") || undefined
          }}
        />
        {isMine ? (
          <aside className={`student-camera-filter-rail${filtersOpen ? " is-open" : ""}`}>
            <button
              type="button"
              className={`student-camera-filter-toggle${filtersOpen || filterId !== "none" ? " is-on" : ""}`}
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
              aria-label="Filtros"
            >
              <Sparkles size={18} />
              <span>Filtros</span>
            </button>
            {filtersOpen ? (
              <div className="student-camera-filters is-side" role="listbox" aria-label="Efeitos CapCut">
                {CAMERA_FILTERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={filterId === item.id}
                    className={filterId === item.id ? "is-on" : ""}
                    onClick={() => setFilterId(item.id)}
                  >
                    <span className="student-camera-filter-swatch" style={{ filter: item.css === "none" ? undefined : item.css }} />
                    <small>{item.label}</small>
                  </button>
                ))}
              </div>
            ) : null}
          </aside>
        ) : null}
        <div className="student-live-studio-chrome">
          <header>
            <span className="student-live-badge">{status === "countdown" ? "PREPARANDO" : "AO VIVO"}</span>
            {editingTitle && isMine ? (
              <div className="student-live-title-edit">
                <input
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  maxLength={80}
                  aria-label="Título da live"
                />
                <button type="button" className="student-green-button" disabled={busy} onClick={() => void saveTitleEdit()}>
                  OK
                </button>
                <button type="button" className="student-ghost-chip" onClick={() => setEditingTitle(false)}>
                  Cancelar
                </button>
              </div>
            ) : (
              <strong>{title.trim() || "Live"}</strong>
            )}
            <div className="student-live-header-actions">
              {status === "live" && activeId ? (
                <button
                  type="button"
                  className="student-live-icon-btn"
                  onClick={() => void toggleSaveLive(activeId, savedByMe)}
                  aria-label={savedByMe ? "Remover live salva" : "Salvar live"}
                >
                  {savedByMe ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
                </button>
              ) : null}
              {isMine && status === "live" && !editingTitle ? (
                <button
                  type="button"
                  className="student-live-icon-btn"
                  onClick={() => {
                    setTitleDraft(title);
                    setEditingTitle(true);
                  }}
                  aria-label="Editar título"
                >
                  <Pencil size={18} />
                </button>
              ) : null}
              {isMine && status === "live" ? (
                <button type="button" className="student-live-end" onClick={() => void endLive()}>
                  Encerrar
                </button>
              ) : (
                <button type="button" className="student-ghost-chip" onClick={leaveLive}>
                  Sair
                </button>
              )}
            </div>
          </header>

          <SocialErrorBanner message={error} onDismiss={() => setError(null)} />

          {status === "countdown" ? (
            <div className="student-live-countdown" aria-live="polite">
              <span>{countdown}</span>
              <p>Entrando no ar…</p>
            </div>
          ) : (
            <>
              <div className="student-live-studio-chat">
                {messages.map((msg) => (
                  <p key={msg.id}>
                    <strong>{msg.name.split(" ")[0]}</strong> {msg.content}
                  </p>
                ))}
              </div>
              <footer>
                {isMine ? (
                  <div className="student-live-host-tools">
                      <button type="button" onClick={() => void flipCamera()} aria-label="Virar câmera">
                        <SwitchCamera size={18} />
                      </button>
                      <button type="button" onClick={toggleMic} aria-label={micOn ? "Silenciar" : "Ativar microfone"}>
                        {micOn ? <Mic size={18} /> : <MicOff size={18} />}
                      </button>
                    </div>
                ) : null}
                <div className="student-feed-comment-box student-live-composer">
                  <input
                    value={chat}
                    onChange={(event) => setChat(event.target.value)}
                    placeholder="Comentar ao vivo"
                    onKeyDown={(event) => event.key === "Enter" && sendChat()}
                  />
                  <button type="button" onClick={sendChat} aria-label="Enviar">
                    <Send size={16} />
                  </button>
                </div>
              </footer>
            </>
          )}
        </div>
      </section>
    );
    return typeof document !== "undefined" ? createPortal(studio, document.body) : studio;
  }

  return (
    <section className="student-social-pane">
      <header className="student-social-pane-head">
        <div>
          <strong>Ao vivo</strong>
          <small>Transmita em tela cheia ou assista quem está no ar.</small>
        </div>
        <button
          type="button"
          className="student-live-refresh"
          disabled={loadingList || busy}
          onClick={() => void load()}
          aria-label="Atualizar lives"
        >
          <RefreshCw size={16} className={loadingList ? "is-spinning" : undefined} />
        </button>
      </header>
      <SocialErrorBanner message={error} onDismiss={() => setError(null)} />

      {status === "joining" ? (
        <div className="student-live-joining" role="status" aria-live="polite">
          <Loader2 size={28} className="is-spinning" />
          <strong>Entrando na live…</strong>
          <small>Conectando vídeo e chat</small>
        </div>
      ) : (
        <form className="student-feed-composer student-live-start" onSubmit={(event) => void beginGoLive(event)}>
          <label className="student-live-start-label" htmlFor="student-live-title">
            Começar transmissão
          </label>
          <input
            id="student-live-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ex.: Treino de hoje"
            maxLength={80}
            disabled={busy}
            autoComplete="off"
          />
          <button type="submit" className="student-green-button" disabled={busy || title.trim().length < 2}>
            <Radio size={16} /> {busy ? "Abrindo câmera…" : "Entrar no ar"}
          </button>
          <p className="student-live-start-hint">Vamos pedir câmera e microfone. Você tem 3 segundos de contagem antes de ir ao ar.</p>
        </form>
      )}

      <div className="student-live-section-head">
        <h3>No ar agora</h3>
        {!loadingList ? <span>{lives.length}</span> : null}
      </div>
      <div className="student-live-list">
        {loadingList ? (
          <p className="student-activity-hint student-live-loading">
            <Loader2 size={14} className="is-spinning" /> Carregando lives…
          </p>
        ) : lives.length === 0 ? (
          <div className="student-live-empty">
            <Radio size={22} />
            <strong>Ninguém no ar</strong>
            <p>Quando alguém entrar ao vivo, aparece aqui. Você também pode começar a sua.</p>
          </div>
        ) : (
          lives.map((live) => (
            <div key={live.id} className="student-live-row-wrap">
              <button type="button" className="student-live-row" disabled={busy} onClick={() => void joinLive(live.id)}>
                <div>
                  <strong>{live.title}</strong>
                  <small>
                    {live.host.name}
                    {live.isMine ? " · você" : ""}
                  </small>
                </div>
                <span className="student-live-badge is-compact">LIVE</span>
              </button>
              <button
                type="button"
                className={`student-live-save-btn${live.savedByMe ? " is-on" : ""}`}
                aria-label={live.savedByMe ? "Remover live salva" : "Salvar live"}
                onClick={() => void toggleSaveLive(live.id, Boolean(live.savedByMe))}
              >
                {live.savedByMe ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
              </button>
            </div>
          ))
        )}
      </div>

      <div className="student-live-section-head">
        <h3>Lives salvas</h3>
        {!loadingList ? <span>{savedLives.length}</span> : null}
      </div>
      <div className="student-live-saved-grid">
        {loadingList ? (
          <p className="student-activity-hint student-live-loading">
            <Loader2 size={14} className="is-spinning" /> Carregando salvas…
          </p>
        ) : savedLives.length === 0 ? (
          <div className="student-live-empty is-compact">
            <Bookmark size={18} />
            <p>Salve lives para achar depois. Toque no marcador ao lado de uma transmissão.</p>
          </div>
        ) : (
          savedLives.map((live) => (
            <article key={`saved-${live.id}`} className={`student-live-saved-tile${live.status === "live" ? " is-live" : ""}`}>
              <button
                type="button"
                className="student-live-saved-main"
                disabled={busy || (live.status !== "live" && !live.videoUrl)}
                onClick={() => {
                  if (live.status === "live") void joinLive(live.id);
                  else if (live.videoUrl) setReplayLive(live);
                }}
              >
                <span className="student-live-saved-cover" aria-hidden>
                  {live.coverUrl || live.host.avatarUrl ? (
                    <img src={mediaUrl(live.coverUrl || live.host.avatarUrl || "")} alt="" />
                  ) : (
                    <span>{live.host.name.slice(0, 1)}</span>
                  )}
                  {live.videoUrl ? <em className="student-live-saved-play">▶</em> : null}
                </span>
                {live.status === "live" ? (
                  <span className="student-live-badge is-compact">LIVE</span>
                ) : (
                  <span className="student-live-ended-chip">Salva</span>
                )}
                <strong>{live.title}</strong>
                <small>{live.host.name}</small>
              </button>
              <button
                type="button"
                className="student-live-saved-delete"
                aria-label={`Excluir live salva ${live.title}`}
                onClick={() => void deleteSavedLive(live.id)}
              >
                <Trash2 size={14} />
              </button>
            </article>
          ))
        )}
      </div>

      {saveSheet
        ? createPortal(
            <div className="student-live-save-sheet" role="dialog" aria-label="Confirmar salvar live">
              <div className="student-live-save-card">
                <header>
                  <strong>{saveSheet.afterEnd ? "Encerrar e salvar" : "Salvar live"}</strong>
                  <button type="button" onClick={cancelSaveSheet} aria-label="Fechar" disabled={savingLive}>
                    <X size={18} />
                  </button>
                </header>
                <p className="student-activity-hint">
                  Confirme para guardar em Lives salvas e publicar no feed. Arraste o vídeo para escolher a capa.
                </p>
                <div className="student-live-save-preview">
                  {saveSheet.videoUrl ? (
                    <video
                      ref={savePreviewRef}
                      src={saveSheet.videoUrl}
                      playsInline
                      controls
                      onLoadedMetadata={(event) => {
                        const duration = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 1;
                        setSaveDurationSec(Math.max(duration, 0.1));
                        event.currentTarget.currentTime = Math.min(0.1, duration);
                      }}
                      onSeeked={() => void captureCoverFromPreview()}
                    />
                  ) : saveSheet.coverPreview ? (
                    <img src={saveSheet.coverPreview} alt="" />
                  ) : (
                    <div className="student-live-save-fallback">Prévia indisponível nesta live</div>
                  )}
                  {saveSheet.coverPreview ? <img className="student-live-save-cover-thumb" src={saveSheet.coverPreview} alt="Capa" /> : null}
                </div>
                {saveSheet.videoUrl ? (
                  <label className="student-live-save-scrub">
                    <span>Frame da capa</span>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(1, Math.floor(saveDurationSec * 10))}
                      value={saveCoverAt}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        setSaveCoverAt(next);
                        const video = savePreviewRef.current;
                        if (video && Number.isFinite(video.duration)) {
                          video.currentTime = (next / 10);
                        }
                      }}
                    />
                  </label>
                ) : null}
                <div className="student-live-save-actions">
                  <button type="button" className="student-ghost-chip" onClick={cancelSaveSheet} disabled={savingLive}>
                    {saveSheet.afterEnd ? "Encerrar sem salvar" : "Cancelar"}
                  </button>
                  <button type="button" className="student-green-button" onClick={() => void confirmSaveLive()} disabled={savingLive}>
                    {savingLive ? "Salvando…" : saveSheet.afterEnd ? "Salvar e publicar" : "Confirmar e publicar"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {replayLive
        ? createPortal(
            <div className="student-live-save-sheet" role="dialog" aria-label="Replay da live">
              <div className="student-live-save-card">
                <header>
                  <strong>{replayLive.title}</strong>
                  <button type="button" onClick={() => setReplayLive(null)} aria-label="Fechar">
                    <X size={18} />
                  </button>
                </header>
                <div className="student-live-save-preview is-replay">
                  {replayLive.videoUrl ? (
                    <video src={mediaUrl(replayLive.videoUrl)} controls playsInline autoPlay poster={replayLive.coverUrl ? mediaUrl(replayLive.coverUrl) : undefined} />
                  ) : replayLive.coverUrl ? (
                    <img src={mediaUrl(replayLive.coverUrl)} alt="" />
                  ) : null}
                </div>
                <small className="student-activity-hint">{replayLive.host.name}</small>
              </div>
            </div>,
            document.body
          )
        : null}
    </section>
  );
}

export function StudentMessagesSection({
  token,
  initialPeerId,
  onPeerConsumed,
  onOpenPeerProfile
}: {
  token: string;
  initialPeerId?: string | null;
  onPeerConsumed?: () => void;
  onOpenPeerProfile?: (userId: string) => void;
}) {
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [people, setPeople] = useState<SocialAuthor[]>([]);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [thread, setThread] = useState<DmMessage[]>([]);
  const [peer, setPeer] = useState<SocialAuthor | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  async function loadConversations() {
    const data = await apiGet<{ conversations: ConversationRow[] }>("/student/social/conversations", token);
    setConversations(data.conversations as ConversationRow[]);
  }

  async function openThread(userId: string) {
    setBusy(true);
    setError(null);
    try {
      const data = await apiGet<{ user: SocialAuthor; messages: DmMessage[] }>(`/student/social/messages/${userId}`, token);
      setActiveUserId(userId);
      setPeer(data.user);
      setThread(data.messages);
    } catch (err) {
      setError(readErrorMessage(err, "Não foi possível abrir a conversa."));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void Promise.all([
      loadConversations().catch((err) => {
        setError(readErrorMessage(err, "Não foi possível carregar conversas."));
      }),
      apiGet<{ people: SocialAuthor[] }>("/student/social/people", token)
        .then((data) => setPeople(data.people))
        .catch(() => setError("Não foi possível carregar perfis para mensagem."))
    ]);
    const socket = getSocialSocket(token);
    socket.on("dm:message", (payload: DmMessage & { conversationId: string }) => {
      if (activeUserId && payload.senderId === activeUserId) {
        setThread((current) => [...current, { ...payload, isMine: false }]);
      }
      void loadConversations().catch(() => undefined);
    });
    return () => {
      socket.off("dm:message");
    };
  }, [token, activeUserId]);

  useEffect(() => {
    if (!initialPeerId) return;
    void openThread(initialPeerId).finally(() => onPeerConsumed?.());
  }, [initialPeerId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.length]);

  async function send() {
    if (!activeUserId || !draft.trim()) return;
    const content = draft.trim();
    setDraft("");
    setError(null);
    try {
      const result = await apiPost<{ message: DmMessage }>(`/student/social/messages/${activeUserId}`, { content }, token);
      setThread((current) => [...current, result.message]);
      await loadConversations();
    } catch (err) {
      setDraft(content);
      setError(readErrorMessage(err, "Não foi possível enviar a mensagem."));
    }
  }

  const filteredPeople = useMemo(() => {
    const q = peopleQuery.trim().toLowerCase();
    const base = people.filter((person) => person.id !== activeUserId);
    if (!q) return base.slice(0, 24);
    return base.filter((person) => person.name.toLowerCase().includes(q)).slice(0, 24);
  }, [people, peopleQuery, activeUserId]);

  if (activeUserId && peer) {
    return (
      <section className="student-social-pane student-dm-pane">
        <header className="student-social-pane-head">
          <button
            type="button"
            className="student-ghost-chip"
            onClick={() => {
              setActiveUserId(null);
              setPeer(null);
              setThread([]);
            }}
          >
            <ArrowLeft size={16} /> Voltar
          </button>
          <div className="student-dm-peer">
            <button
              type="button"
              className="student-dm-peer-open"
              onClick={() => onOpenPeerProfile?.(peer.id)}
              aria-label={`Ver perfil de ${peer.name}`}
            >
              {peer.avatarUrl ? <img src={mediaUrl(peer.avatarUrl)} alt="" /> : <span>{peer.name.slice(0, 1)}</span>}
              <strong>{peer.name}</strong>
            </button>
          </div>
        </header>
        <SocialErrorBanner message={error} onDismiss={() => setError(null)} />
        <div className="student-dm-thread">
          {thread.map((msg) => (
            <p key={msg.id} className={msg.isMine ? "is-mine" : ""}>
              {msg.content}
            </p>
          ))}
          {thread.length === 0 && <p className="student-activity-hint">Digite a primeira mensagem para este perfil.</p>}
          <div ref={endRef} />
        </div>
        <div className="student-feed-comment-box">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`Mensagem para ${peer.name.split(" ")[0]}`}
            onKeyDown={(event) => event.key === "Enter" && void send()}
          />
          <button type="button" onClick={() => void send()} aria-label="Enviar">
            <Send size={16} />
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="student-social-pane student-dm-pane">
      <header className="student-social-pane-head">
        <div>
          <strong>Mensagens</strong>
          <small>Só entre perfis — um atleta inicia a conversa com outro.</small>
        </div>
      </header>
      <SocialErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="student-dm-list">
        {conversations.map((row) => (
          <button key={row.id} type="button" disabled={busy} onClick={() => void openThread(row.user.id)}>
            <div className="student-dm-row-main">
              {row.user.avatarUrl ? <img src={mediaUrl(row.user.avatarUrl)} alt="" /> : <span>{row.user.name.slice(0, 1)}</span>}
              <div>
                <strong>{row.user.name}</strong>
                <span>{row.lastMessage?.content || "Toque para conversar"}</span>
              </div>
            </div>
            <MessageCircle size={16} />
          </button>
        ))}
        {conversations.length === 0 && <p className="student-activity-hint">Nenhuma conversa ainda. Escolha um perfil abaixo.</p>}
      </div>

      <h3>Iniciar com um perfil</h3>
      <input
        className="student-dm-people-search"
        value={peopleQuery}
        onChange={(event) => setPeopleQuery(event.target.value)}
        placeholder="Buscar perfil"
      />
      <div className="student-feed-people student-dm-people">
        {filteredPeople.map((person) => (
          <button key={person.id} type="button" disabled={busy} onClick={() => void openThread(person.id)}>
            {person.avatarUrl ? <img src={mediaUrl(person.avatarUrl)} alt="" /> : <span>{person.name.slice(0, 1)}</span>}
            <strong>{person.name.split(" ")[0]}</strong>
          </button>
        ))}
        {filteredPeople.length === 0 && <p className="student-activity-hint">Nenhum perfil encontrado.</p>}
      </div>
    </section>
  );
}

/** Mantido por compatibilidade de rotas; produto agora usa só DM entre perfis. */
export function StudentChatSection({
  token,
  onGoMessages
}: {
  token: string;
  onGoMessages?: () => void;
}) {
  useEffect(() => {
    onGoMessages?.();
  }, [onGoMessages, token]);

  return (
    <section className="student-social-pane">
      <header className="student-social-pane-head">
        <div>
          <strong>Mensagens entre perfis</strong>
          <small>O chat aberto foi substituído por conversas 1:1.</small>
        </div>
      </header>
      <button type="button" className="student-green-button" onClick={() => onGoMessages?.()}>
        <MessageCircle size={16} /> Abrir mensagens
      </button>
    </section>
  );
}

export function StudentRequestsSection({ token }: { token: string }) {
  const [requests, setRequests] = useState<FollowRequestRow[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [req, privacy] = await Promise.all([
        apiGet<{ requests: FollowRequestRow[] }>("/student/social/follow-requests", token),
        apiGet<{ isPrivate: boolean }>("/student/social/privacy", token)
      ]);
      setRequests(req.requests);
      setIsPrivate(privacy.isPrivate);
      setError(null);
    } catch (err) {
      setError(readErrorMessage(err, "Não foi possível carregar pedidos."));
    }
  }

  useEffect(() => {
    void load();
  }, [token]);

  async function decide(id: string, accept: boolean) {
    try {
      await apiPost(`/student/social/follow-requests/${id}/${accept ? "accept" : "reject"}`, {}, token);
      setRequests((current) => current.filter((row) => row.id !== id));
    } catch (err) {
      setError(readErrorMessage(err, "Não foi possível atualizar o pedido."));
    }
  }

  return (
    <section className="student-social-pane">
      <header className="student-social-pane-head">
        <div>
          <strong>Pedidos</strong>
          <small>Contas privadas recebem pedidos antes do follow.</small>
        </div>
      </header>
      <SocialErrorBanner message={error} onDismiss={() => setError(null)} />
      <label className="student-activity-layer">
        <span>Perfil privado</span>
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(event) => {
            const next = event.target.checked;
            setIsPrivate(next);
            void apiPost("/student/social/privacy", { isPrivate: next }, token).catch((err) => {
              setIsPrivate(!next);
              setError(readErrorMessage(err, "Não foi possível alterar a privacidade."));
            });
          }}
        />
      </label>
      <div className="student-request-list">
        {requests.map((row) => (
          <div key={row.id} className="student-request-row">
            <strong>{row.user.name}</strong>
            <div>
              <button type="button" className="student-green-button" onClick={() => void decide(row.id, true)}>
                Aceitar
              </button>
              <button type="button" className="student-ghost-chip" onClick={() => void decide(row.id, false)}>
                Recusar
              </button>
            </div>
          </div>
        ))}
        {requests.length === 0 && <p className="student-activity-hint">Nenhum pedido pendente.</p>}
      </div>
    </section>
  );
}

export function StudentSocialHubLinks({ onOpen }: { onOpen: (section: "reels" | "live" | "messages" | "requests") => void }) {
  const links = useMemo(
    () =>
      [
        { id: "reels" as const, label: "Clipes" },
        { id: "live" as const, label: "Ao vivo" },
        { id: "messages" as const, label: "Mensagens" },
        { id: "requests" as const, label: "Pedidos" }
      ],
    []
  );
  return (
    <div className="student-social-hub">
      {links.map((link) => (
        <button key={link.id} type="button" onClick={() => onOpen(link.id)}>
          {link.label}
        </button>
      ))}
    </div>
  );
}
