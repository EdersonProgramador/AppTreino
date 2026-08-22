import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Heart, Radio, Send, Video, X } from "lucide-react";
import { apiDelete, apiGet, apiPost, apiUpload } from "../../api";
import { mediaUrl } from "../../lib/urls";
import { getSocialSocket } from "../../lib/social-socket";
import type { SocialAuthor, UploadResponse } from "../../types";

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

type ChatMessage = {
  id: string;
  content: string;
  createdAt: string;
  userId: string;
  name: string;
  avatarUrl?: string | null;
  isMine?: boolean;
};

type FollowRequestRow = { id: string; user: SocialAuthor; createdAt: string };

export function StudentReelsSection({ token }: { token: string }) {
  const [reels, setReels] = useState<ReelRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [composer, setComposer] = useState(false);
  const [caption, setCaption] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const data = await apiGet<{ reels: ReelRow[] }>("/student/social/reels", token);
    setReels(data.reels);
  }

  useEffect(() => {
    void load().catch(() => undefined);
  }, [token]);

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (!videoUrl) return;
    setBusy(true);
    try {
      await apiPost("/student/social/reels", { videoUrl, caption }, token);
      setComposer(false);
      setCaption("");
      setVideoUrl(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function like(id: string) {
    const result = await apiPost<{ liked: boolean }>(`/student/social/reels/${id}/like`, {}, token);
    setReels((current) =>
      current.map((row) =>
        row.id === id
          ? { ...row, likedByMe: result.liked, likesCount: Math.max(0, row.likesCount + (result.liked ? 1 : -1)) }
          : row
      )
    );
  }

  return (
    <section className="student-social-pane student-reels">
      <header className="student-social-pane-head">
        <div>
          <strong>Clipes</strong>
          <small>Vídeo vertical, um clima por vez.</small>
        </div>
        <button type="button" className="student-green-button" onClick={() => setComposer(true)}>
          Novo clipe
        </button>
      </header>
      <div className="student-reels-scroller">
        {reels.map((reel) => (
          <article key={reel.id} className="student-reel-card">
            <video src={mediaUrl(reel.videoUrl)} controls playsInline loop />
            <div className="student-reel-meta">
              <strong>{reel.author.name}</strong>
              <p>{reel.caption}</p>
              <button type="button" className={reel.likedByMe ? "is-on" : ""} onClick={() => void like(reel.id)}>
                <Heart size={18} /> {reel.likesCount}
              </button>
            </div>
          </article>
        ))}
        {reels.length === 0 && <p className="student-activity-hint">Nenhum clipe ainda. Publique o primeiro.</p>}
      </div>
      {composer && (
        <div className="student-activity-sheet" role="dialog">
          <header>
            <strong>Novo clipe</strong>
            <button type="button" onClick={() => setComposer(false)} aria-label="Fechar">
              <X size={18} />
            </button>
          </header>
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            hidden
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const form = new FormData();
              form.append("file", file);
              const uploaded = await apiUpload<UploadResponse>("/student/social/uploads", form, token);
              setVideoUrl(uploaded.file.url);
            }}
          />
          <button type="button" className="student-ghost-chip" onClick={() => fileRef.current?.click()}>
            <Video size={16} /> Escolher vídeo
          </button>
          {videoUrl && <video className="student-feed-media" src={mediaUrl(videoUrl)} controls />}
          <input value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Legenda" />
          <button type="button" className="student-green-button" disabled={busy || !videoUrl} onClick={(event) => void publish(event as unknown as FormEvent)}>
            Publicar clipe
          </button>
        </div>
      )}
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
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  async function load() {
    const data = await apiGet<{ lives: LiveRow[] }>("/student/social/live", token);
    setLives(data.lives);
  }

  useEffect(() => {
    void load().catch(() => undefined);
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      pcRef.current?.close();
    };
  }, [token]);

  async function startLive(event: FormEvent) {
    event.preventDefault();
    if (title.trim().length < 2) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    streamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      await localVideoRef.current.play().catch(() => undefined);
    }
    const created = await apiPost<{ live: { id: string } }>("/student/social/live", { title: title.trim() }, token);
    setActiveId(created.live.id);
    setIsMine(true);
    const socket = getSocialSocket(token);
    socket.emit("live:join", created.live.id);
    socket.on("live:peer-joined", async ({ socketId, isHost }: { socketId: string; isHost?: boolean }) => {
      if (isHost) return;
      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("live:signal", { liveId: created.live.id, to: socketId, data: { candidate: event.candidate } });
        }
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("live:signal", { liveId: created.live.id, to: socketId, data: { sdp: offer } });
    });
    socket.on("live:chat", (msg: { id: string; content: string; name: string }) => {
      setMessages((current) => [...current, msg]);
    });
    await load();
  }

  async function joinLive(id: string) {
    const detail = await apiGet<{ live: { isMine: boolean; messages: Array<{ id: string; content: string; name: string }> } }>(
      `/student/social/live/${id}`,
      token
    );
    setActiveId(id);
    setIsMine(detail.live.isMine);
    setMessages(detail.live.messages);
    const socket = getSocialSocket(token);
    socket.emit("live:join", id, async (result: { ok: boolean; hostId?: string }) => {
      if (!result.ok) return;
      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      pcRef.current = pc;
      pc.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
          void remoteVideoRef.current.play().catch(() => undefined);
        }
      };
      socket.on("live:signal", async (payload: { from: string; data: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }) => {
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
      });
    });
    socket.on("live:chat", (msg: { id: string; content: string; name: string }) => {
      setMessages((current) => [...current, msg]);
    });
    socket.on("live:ended", () => {
      setActiveId(null);
      void load();
    });
  }

  async function endLive() {
    if (!activeId) return;
    await apiPost(`/student/social/live/${activeId}/end`, {}, token);
    getSocialSocket(token).emit("live:end", activeId);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setActiveId(null);
    await load();
  }

  function sendChat() {
    if (!activeId || !chat.trim()) return;
    getSocialSocket(token).emit("live:chat", { liveId: activeId, content: chat.trim() });
    setChat("");
  }

  return (
    <section className="student-social-pane">
      <header className="student-social-pane-head">
        <div>
          <strong>Ao vivo</strong>
          <small>Entre no ar com câmera e chat em tempo real.</small>
        </div>
      </header>
      {!activeId ? (
        <>
          <form className="student-feed-composer" onSubmit={startLive}>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Título da live" />
            <button type="submit" className="student-green-button">
              <Radio size={16} /> Iniciar ao vivo
            </button>
          </form>
          <div className="student-live-list">
            {lives.map((live) => (
              <button key={live.id} type="button" className="student-live-row" onClick={() => void joinLive(live.id)}>
                <strong>{live.title}</strong>
                <span>{live.host.name}</span>
              </button>
            ))}
            {lives.length === 0 && <p className="student-activity-hint">Nenhuma live no ar agora.</p>}
          </div>
        </>
      ) : (
        <div className="student-live-room">
          <video ref={isMine ? localVideoRef : remoteVideoRef} className="student-live-video" playsInline muted={isMine} autoPlay />
          <div className="student-live-chat">
            {messages.map((msg) => (
              <p key={msg.id}>
                <strong>{msg.name}</strong> {msg.content}
              </p>
            ))}
            <div className="student-feed-comment-box">
              <input value={chat} onChange={(event) => setChat(event.target.value)} placeholder="Mensagem ao vivo" />
              <button type="button" onClick={sendChat}>
                <Send size={16} />
              </button>
            </div>
          </div>
          {isMine ? (
            <button type="button" className="student-green-button" onClick={() => void endLive()}>
              Encerrar live
            </button>
          ) : (
            <button type="button" className="student-ghost-chip" onClick={() => setActiveId(null)}>
              Sair
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export function StudentMessagesSection({ token }: { token: string }) {
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [people, setPeople] = useState<SocialAuthor[]>([]);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [thread, setThread] = useState<DmMessage[]>([]);
  const [peer, setPeer] = useState<SocialAuthor | null>(null);
  const [draft, setDraft] = useState("");

  async function loadConversations() {
    const data = await apiGet<{ conversations: ConversationRow[] }>("/student/social/conversations", token);
    setConversations(data.conversations as ConversationRow[]);
  }

  useEffect(() => {
    void Promise.all([
      loadConversations(),
      apiGet<{ people: SocialAuthor[] }>("/student/social/people", token).then((data) => setPeople(data.people))
    ]).catch(() => undefined);
    const socket = getSocialSocket(token);
    socket.on("dm:message", (payload: DmMessage & { conversationId: string }) => {
      if (activeUserId && payload.senderId === activeUserId) {
        setThread((current) => [...current, { ...payload, isMine: false }]);
      }
      void loadConversations();
    });
    return () => {
      socket.off("dm:message");
    };
  }, [token, activeUserId]);

  async function openThread(userId: string) {
    const data = await apiGet<{ user: SocialAuthor; messages: DmMessage[] }>(`/student/social/messages/${userId}`, token);
    setActiveUserId(userId);
    setPeer(data.user);
    setThread(data.messages);
  }

  async function send() {
    if (!activeUserId || !draft.trim()) return;
    const result = await apiPost<{ message: DmMessage }>(`/student/social/messages/${activeUserId}`, { content: draft.trim() }, token);
    setThread((current) => [...current, result.message]);
    setDraft("");
    await loadConversations();
  }

  if (activeUserId && peer) {
    return (
      <section className="student-social-pane">
        <header className="student-social-pane-head">
          <button type="button" className="student-ghost-chip" onClick={() => setActiveUserId(null)}>
            <ArrowLeft size={16} /> Voltar
          </button>
          <strong>{peer.name}</strong>
        </header>
        <div className="student-dm-thread">
          {thread.map((msg) => (
            <p key={msg.id} className={msg.isMine ? "is-mine" : ""}>
              {msg.content}
            </p>
          ))}
        </div>
        <div className="student-feed-comment-box">
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Mensagem" />
          <button type="button" onClick={() => void send()}>
            <Send size={16} />
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="student-social-pane">
      <header className="student-social-pane-head">
        <div>
          <strong>Mensagens</strong>
          <small>Conversas diretas com outros atletas.</small>
        </div>
      </header>
      <div className="student-dm-list">
        {conversations.map((row) => (
          <button key={row.id} type="button" onClick={() => void openThread(row.user.id)}>
            <strong>{row.user.name}</strong>
            <span>{row.lastMessage?.content || "Nova conversa"}</span>
          </button>
        ))}
      </div>
      <h3>Iniciar conversa</h3>
      <div className="student-feed-people">
        {people.slice(0, 12).map((person) => (
          <button key={person.id} type="button" onClick={() => void openThread(person.id)}>
            <strong>{person.name.split(" ")[0]}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

export function StudentChatSection({ token }: { token: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [online, setOnline] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void apiGet<{ messages: ChatMessage[] }>("/student/social/chat/global", token).then((data) => setMessages(data.messages));
    const socket = getSocialSocket(token);
    socket.emit("presence:hello", (payload: { online: Record<string, string> }) => {
      setOnline([...new Set(Object.values(payload.online || {}))]);
    });
    socket.on("chat:global", (msg: ChatMessage) => {
      setMessages((current) => [...current, msg]);
    });
    socket.on("presence:join", () => {
      socket.emit("presence:hello", (payload: { online: Record<string, string> }) => {
        setOnline([...new Set(Object.values(payload.online || {}))]);
      });
    });
    return () => {
      socket.off("chat:global");
      socket.off("presence:join");
    };
  }, [token]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function send() {
    if (!draft.trim()) return;
    getSocialSocket(token).emit("chat:global", draft.trim(), (ok: boolean) => {
      if (ok) setDraft("");
    });
  }

  return (
    <section className="student-social-pane">
      <header className="student-social-pane-head">
        <div>
          <strong>Chat global</strong>
          <small>{online.length} online agora</small>
        </div>
      </header>
      <div className="student-global-chat">
        {messages.map((msg) => (
          <p key={msg.id} className={msg.isMine ? "is-mine" : ""}>
            <strong>{msg.name.split(" ")[0]}</strong> {msg.content}
          </p>
        ))}
        <div ref={endRef} />
      </div>
      <div className="student-feed-comment-box">
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Mensagem global" onKeyDown={(event) => event.key === "Enter" && send()} />
        <button type="button" onClick={send}>
          <Send size={16} />
        </button>
      </div>
    </section>
  );
}

export function StudentRequestsSection({ token }: { token: string }) {
  const [requests, setRequests] = useState<FollowRequestRow[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);

  async function load() {
    const [req, privacy] = await Promise.all([
      apiGet<{ requests: FollowRequestRow[] }>("/student/social/follow-requests", token),
      apiGet<{ isPrivate: boolean }>("/student/social/privacy", token)
    ]);
    setRequests(req.requests);
    setIsPrivate(privacy.isPrivate);
  }

  useEffect(() => {
    void load().catch(() => undefined);
  }, [token]);

  async function decide(id: string, accept: boolean) {
    await apiPost(`/student/social/follow-requests/${id}/${accept ? "accept" : "reject"}`, {}, token);
    setRequests((current) => current.filter((row) => row.id !== id));
  }

  return (
    <section className="student-social-pane">
      <header className="student-social-pane-head">
        <div>
          <strong>Pedidos</strong>
          <small>Contas privadas recebem pedidos antes do follow.</small>
        </div>
      </header>
      <label className="student-activity-layer">
        <span>Perfil privado</span>
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(event) => {
            const next = event.target.checked;
            setIsPrivate(next);
            void apiPost("/student/social/privacy", { isPrivate: next }, token);
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

export function StudentSocialHubLinks({ onOpen }: { onOpen: (section: "reels" | "live" | "messages" | "chat" | "requests") => void }) {
  const links = useMemo(
    () =>
      [
        { id: "reels" as const, label: "Clipes" },
        { id: "live" as const, label: "Ao vivo" },
        { id: "messages" as const, label: "Mensagens" },
        { id: "chat" as const, label: "Chat global" },
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
