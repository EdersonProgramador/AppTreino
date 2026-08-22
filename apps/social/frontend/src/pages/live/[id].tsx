import { FormEvent, useEffect, useRef, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Router from "next/router";
import { toast } from "react-toastify";
import { MdOutlineCameraswitch, MdOutlinePhotoCamera } from "react-icons/md";
import { api } from "@/lib";
import { useAuth, useSocket } from "@/hooks";
import { moodLabel } from "@/lib/moods";

interface LiveInfo {
  id: string;
  title: string;
  mood: string | null;
  status: string;
  user_id: string;
  username: string;
  image_url: string;
  cover_color: string;
  isMine: boolean;
  messages: { id: number; content: string; user_id: string; username: string }[];
}

const iceServers = [{ urls: "stun:stun.l.google.com:19302" }];

export default function LiveRoom() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  const { user } = useAuth();
  const { getSocket } = useSocket();
  const [live, setLive] = useState<LiveInfo | null>(null);
  const [chat, setChat] = useState("");
  const [messages, setMessages] = useState<LiveInfo["messages"]>([]);
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peers = useRef<Record<string, RTCPeerConnection>>({});
  const facingRef = useRef<"user" | "environment">("user");
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [cameraError, setCameraError] = useState(false);

  function signal(to: string, data: unknown) {
    getSocket()?.emit("live:signal", { liveId: id, to, data });
  }

  async function openMedia(nextFacing: "user" | "environment") {
    return navigator.mediaDevices.getUserMedia({
      audio: true,
      video: {
        facingMode: { ideal: nextFacing },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });
  }

  async function ensureLocalStream() {
    if (!streamRef.current) {
      streamRef.current = await openMedia(facingRef.current);
      if (localRef.current) {
        localRef.current.srcObject = streamRef.current;
      }
      setCameraError(false);
    }
    return streamRef.current;
  }

  async function retryCamera() {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    try {
      await ensureLocalStream();
    } catch {
      setCameraError(true);
      toast.warning("Não foi possível abrir a câmera.");
    }
  }

  async function flipCamera() {
    const next = facingRef.current === "user" ? "environment" : "user";
    try {
      const nextStream = await openMedia(next);
      const videoTrack = nextStream.getVideoTracks()[0] || null;
      const audioTrack = nextStream.getAudioTracks()[0] || null;
      await Promise.all(Object.values(peers.current).flatMap(pc =>
        pc.getSenders().map(sender => {
          if (sender.track?.kind === "video" && videoTrack) {
            return sender.replaceTrack(videoTrack);
          }
          if (sender.track?.kind === "audio" && audioTrack) {
            return sender.replaceTrack(audioTrack);
          }
          return Promise.resolve();
        })
      ));
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = nextStream;
      if (localRef.current) {
        localRef.current.srcObject = nextStream;
      }
      facingRef.current = next;
      setFacing(next);
      setCameraError(false);
    } catch {
      toast.warning("Não foi possível virar a câmera.");
    }
  }

  function bindRemote(pc: RTCPeerConnection) {
    pc.ontrack = event => {
      if (remoteRef.current) {
        remoteRef.current.srcObject = event.streams[0];
      }
    };
  }

  async function callViewer(socketId: string) {
    const stream = await ensureLocalStream();
    const pc = new RTCPeerConnection({ iceServers });
    peers.current[socketId] = pc;
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
    pc.onicecandidate = event => {
      if (event.candidate) {
        signal(socketId, { type: "ice", candidate: event.candidate });
      }
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    signal(socketId, { type: "offer", sdp: offer });
  }

  async function handleSignal(from: string, data: { type: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) {
    if (data.type === "offer") {
      const pc = new RTCPeerConnection({ iceServers });
      peers.current[from] = pc;
      bindRemote(pc);
      pc.onicecandidate = event => {
        if (event.candidate) {
          signal(from, { type: "ice", candidate: event.candidate });
        }
      };
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp as RTCSessionDescriptionInit));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      signal(from, { type: "answer", sdp: answer });
      return;
    }

    const pc = peers.current[from];
    if (!pc) {
      return;
    }
    if (data.type === "answer" && data.sdp) {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    }
    if (data.type === "ice" && data.candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  }

  useEffect(() => {
    if (!id) {
      return;
    }

    let cancelled = false;
    const socket = getSocket();

    (async () => {
      try {
        const { data } = await api().get(`/live/${id}`);
        if (!data?.success || cancelled) {
          return;
        }
        setLive(data.live);
        setMessages(data.live.messages || []);

        if (data.live.isMine) {
          try {
            await ensureLocalStream();
          } catch {
            setCameraError(true);
          }
        }

        socket?.emit("live:join", id, async (joined: { ok?: boolean }) => {
          if (!joined?.ok) {
            toast.warning("Live indisponível.");
          }
        });
      } catch {
        toast.warning("Não foi possível abrir a live.");
        Router.push("/live");
      }
    })();

    function onSignal(payload: { from: string; data: { type: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }) {
      handleSignal(payload.from, payload.data);
    }

    function onChat(payload: LiveInfo["messages"][number]) {
      setMessages(current => [...current, payload]);
    }

    function onEnded() {
      toast.info("A live encerrou.");
      Router.push("/live");
    }

    function onLeft(payload: { socketId: string }) {
      peers.current[payload.socketId]?.close();
      delete peers.current[payload.socketId];
    }

    socket?.on("live:signal", onSignal);
    socket?.on("live:chat", onChat);
    socket?.on("live:ended", onEnded);
    socket?.on("live:peer-left", onLeft);

    return () => {
      cancelled = true;
      socket?.off("live:signal", onSignal);
      socket?.off("live:chat", onChat);
      socket?.off("live:ended", onEnded);
      socket?.off("live:peer-left", onLeft);
      Object.values(peers.current).forEach(pc => pc.close());
      peers.current = {};
      streamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, [id, user?.id]);

  // Host answers new peers after live info is known
  useEffect(() => {
    const socket = getSocket();
    if (!live?.isMine || !socket) {
      return;
    }
    function onPeerJoined(payload: { socketId: string }) {
      callViewer(payload.socketId);
    }
    socket.on("live:peer-joined", onPeerJoined);
    return () => {
      socket.off("live:peer-joined", onPeerJoined);
    };
  }, [live?.isMine, id]);

  async function sendChat(event: FormEvent) {
    event.preventDefault();
    if (!chat.trim()) {
      return;
    }
    getSocket()?.emit("live:chat", { liveId: id, content: chat.trim() });
    setChat("");
  }

  async function endLive() {
    await api().post(`/live/${id}/end`);
    getSocket()?.emit("live:end", id);
    Router.push("/live");
  }

  if (!live) {
    return <main className="p-8 text-sm text-slate-500">Abrindo o palco...</main>;
  }

  const mood = moodLabel(live.mood);

  return (
    <main className="mx-auto w-full max-w-5xl overflow-hidden rounded-3xl bg-ink text-white shadow-soft lg:w-[70%]">
      <Head><title>{live.title} · Ao vivo</title></Head>
      <div className="grid gap-0 lg:grid-cols-[1fr_18rem]">
        <section className="relative min-h-[70vh] bg-black">
          <video
            ref={live.isMine ? localRef : remoteRef}
            className="h-full w-full object-cover"
            style={live.isMine && facing === "user" ? { transform: "scaleX(-1)" } : undefined}
            autoPlay
            playsInline
            muted={live.isMine}
          />
          {live.isMine ? <video ref={remoteRef} className="hidden" /> : <video ref={localRef} className="hidden" />}
          {live.isMine && cameraError ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/80 text-center">
              <MdOutlinePhotoCamera className="text-4xl" />
              <p className="text-sm text-white/80">A câmera não abriu. Libere a permissão e tente de novo.</p>
              <button type="button" className="rounded-full border-0 bg-white px-4 py-2 text-sm font-medium text-ink" onClick={retryCamera}>
                Abrir câmera
              </button>
            </div>
          ) : null}
          <div className="absolute left-4 top-4 rounded-full px-3 py-1 text-xs font-medium" style={{ background: live.cover_color }}>
            AO VIVO {mood ? `· ${mood.emoji} ${mood.label}` : ""}
          </div>
          {live.isMine && live.status === "live" && !cameraError ? (
            <button
              type="button"
              className="absolute right-4 top-4 rounded-full border-0 bg-black/50 p-2 text-xl text-white"
              onClick={flipCamera}
              aria-label="Virar câmera"
              title={facing === "user" ? "Usar câmera traseira" : "Usar câmera frontal"}
            >
              <MdOutlineCameraswitch />
            </button>
          ) : null}
          <div className="absolute bottom-4 left-4 right-4">
            <div className="text-lg font-medium">{live.title}</div>
            <div className="text-sm text-white/80">{live.username}</div>
          </div>
        </section>
        <aside className="flex h-[70vh] flex-col bg-slate-950 p-4">
          <div className="flex-1 space-y-2 overflow-y-auto text-sm">
            {messages.map(item => (
              <div key={item.id}><strong>{item.username}:</strong> {item.content}</div>
            ))}
          </div>
          {live.status === "live" ? (
            <form onSubmit={sendChat} className="mt-3 flex gap-2">
              <input className="form-input mt-0 bg-white/10 text-white" value={chat} onChange={({ target }) => setChat(target.value)} placeholder="Manda no clima" />
              <button type="submit" className="rounded-xl border-0 bg-brand px-3 text-sm">Ok</button>
            </form>
          ) : <p className="text-xs text-white/60">Encerrada.</p>}
          {live.isMine && live.status === "live" ? (
            <button type="button" className="mt-3 rounded-xl border-0 bg-red-600 px-3 py-2 text-sm" onClick={endLive}>Encerrar</button>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
