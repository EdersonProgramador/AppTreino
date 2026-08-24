import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  Heart,
  MessageCircle,
  Mic,
  MicOff,
  Radio,
  Send,
  SwitchCamera,
  Video,
  X
} from "lucide-react";
import { apiGet, apiPost, apiUpload } from "../../api";
import { mediaUrl } from "../../lib/urls";
import { getSocialSocket } from "../../lib/social-socket";
import type { SocialAuthor, UploadResponse } from "../../types";
import { StudentCameraCapture } from "./StudentCameraCapture";

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

export function StudentReelsSection({
  token,
  onOpenDm
}: {
  token: string;
  onOpenDm?: (userId: string) => void;
}) {
  const [reels, setReels] = useState<ReelRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [composer, setComposer] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [caption, setCaption] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
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

  return (
    <section className="student-social-pane student-reels">
      <header className="student-social-pane-head">
        <div>
          <strong>Clipes</strong>
          <small>Grave em vertical 9:16, como no celular.</small>
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
            <video src={mediaUrl(reel.videoUrl)} controls playsInline loop preload="metadata" />
            <div className="student-reel-meta">
              <strong>{reel.author.name}</strong>
              <p>{reel.caption}</p>
              <div className="student-reel-actions">
                <button type="button" className={reel.likedByMe ? "is-on" : ""} onClick={() => void like(reel.id)}>
                  <Heart size={18} /> {reel.likesCount}
                </button>
                {!reel.isMine && onOpenDm ? (
                  <button type="button" onClick={() => onOpenDm(reel.author.id)} aria-label="Mensagem">
                    <MessageCircle size={18} />
                  </button>
                ) : null}
              </div>
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
        layout="vertical"
        maxVideoSeconds={60}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => void uploadVideo(file)}
      />
    </section>
  );
}

export function StudentLiveSection({ token }: { token: string }) {
  const [lives, setLives] = useState<LiveRow[]>([]);
  const [title, setTitle] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<{ id: string; content: string; name: string }>>([]);
  const [chat, setChat] = useState("");
  const [isMine, setIsMine] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "countdown" | "live" | "joining">("idle");
  const [countdown, setCountdown] = useState(3);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [micOn, setMicOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const liveIdRef = useRef<string | null>(null);

  function stopMedia() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
  }

  async function load() {
    try {
      const data = await apiGet<{ lives: LiveRow[] }>("/student/social/live", token);
      setLives(data.lives);
    } catch (err) {
      setError(readErrorMessage(err, "Não foi possível listar lives."));
    }
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
    if (status !== "countdown" && !(status === "live" && isMine)) return;
    const video = localVideoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
      void video.play().catch(() => undefined);
    }
  }, [status, isMine, activeId]);

  async function bindPreview(nextFacing: "user" | "environment") {
    stopMedia();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: {
        facingMode: { ideal: nextFacing },
        width: { ideal: 1080 },
        height: { ideal: 1920 },
        aspectRatio: { ideal: 9 / 16 }
      }
    });
    streamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      await localVideoRef.current.play().catch(() => undefined);
    }
    stream.getAudioTracks().forEach((track) => {
      track.enabled = micOn;
    });
  }

  async function flipCamera() {
    const next = facing === "user" ? "environment" : "user";
    setFacing(next);
    try {
      await bindPreview(next);
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
      setStatus("live");
      setMessages([]);
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
      const detail = await apiGet<{ live: { isMine: boolean; messages: Array<{ id: string; content: string; name: string }> } }>(
        `/student/social/live/${id}`,
        token
      );
      setActiveId(id);
      liveIdRef.current = id;
      setIsMine(detail.live.isMine);
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

  async function endLive() {
    if (!activeId) return;
    try {
      await apiPost(`/student/social/live/${activeId}/end`, {}, token);
      getSocialSocket(token).emit("live:end", activeId);
    } catch (err) {
      setError(readErrorMessage(err, "Não foi possível encerrar a live."));
    } finally {
      stopMedia();
      setActiveId(null);
      setStatus("idle");
      await load();
    }
  }

  function leaveLive() {
    stopMedia();
    setActiveId(null);
    setStatus("idle");
    setMessages([]);
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
    return (
      <section className="student-live-studio" aria-label="Estúdio ao vivo">
        <video
          ref={isMine ? localVideoRef : remoteVideoRef}
          className={`student-live-studio-video${isMine && facing === "user" ? " is-mirror" : ""}`}
          playsInline
          muted={isMine}
          autoPlay
        />
        <div className="student-live-studio-chrome">
          <header>
            <span className="student-live-badge">{status === "countdown" ? "PREPARANDO" : "AO VIVO"}</span>
            <strong>{title.trim() || "Live"}</strong>
            {isMine && status === "live" ? (
              <button type="button" className="student-live-end" onClick={() => void endLive()}>
                Encerrar
              </button>
            ) : (
              <button type="button" className="student-ghost-chip" onClick={leaveLive}>
                Sair
              </button>
            )}
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
  }

  return (
    <section className="student-social-pane">
      <header className="student-social-pane-head">
        <div>
          <strong>Ao vivo</strong>
          <small>Estúdio vertical com chat em tempo real.</small>
        </div>
      </header>
      <SocialErrorBanner message={error} onDismiss={() => setError(null)} />
      <form className="student-feed-composer student-live-start" onSubmit={(event) => void beginGoLive(event)}>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Título da live" maxLength={80} />
        <button type="submit" className="student-green-button" disabled={busy}>
          <Radio size={16} /> {busy ? "Abrindo câmera…" : "Entrar no ar"}
        </button>
      </form>
      <div className="student-live-list">
        {lives.map((live) => (
          <button key={live.id} type="button" className="student-live-row" disabled={busy} onClick={() => void joinLive(live.id)}>
            <div>
              <strong>{live.title}</strong>
              <small>{live.host.name}</small>
            </div>
            <span className="student-live-badge is-compact">LIVE</span>
          </button>
        ))}
        {lives.length === 0 && <p className="student-activity-hint">Nenhuma live no ar agora.</p>}
      </div>
    </section>
  );
}

export function StudentMessagesSection({
  token,
  initialPeerId,
  onPeerConsumed
}: {
  token: string;
  initialPeerId?: string | null;
  onPeerConsumed?: () => void;
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
            {peer.avatarUrl ? <img src={mediaUrl(peer.avatarUrl)} alt="" /> : <span>{peer.name.slice(0, 1)}</span>}
            <strong>{peer.name}</strong>
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
