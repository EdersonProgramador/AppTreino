import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { MediaStream, RTCPeerConnection } from "react-native-webrtc";
import { apiGet, apiPost } from "../auth/api";
import { getSocket } from "../lib/socket";
import { getWebrtcRuntime, type WebrtcRuntime } from "./webrtcRuntime";

const ICE_CONFIG = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }]
};

/** Formatos de sinalização trocados via socket — espelham o protocolo do backend. */
type SdpInit = { sdp: string; type: string | null };
type CandidateInit = { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null };
type SignalPayload = { from?: string; data?: { sdp?: SdpInit; candidate?: CandidateInit } };

/**
 * Os handlers `on*` do react-native-webrtc são tipados com um evento genérico,
 * sem o payload concreto. Os casts ficam isolados nestes três helpers.
 */
function onIceCandidate(pc: RTCPeerConnection, handler: (candidate: CandidateInit) => void) {
  pc.onicecandidate = ((event: { candidate?: CandidateInit | null }) => {
    if (event?.candidate) handler(event.candidate);
  }) as unknown as RTCPeerConnection["onicecandidate"];
}

function onRemoteTrack(pc: RTCPeerConnection, handler: (stream: MediaStream) => void) {
  pc.ontrack = ((event: { streams?: MediaStream[] }) => {
    const stream = event?.streams?.[0];
    if (stream) handler(stream);
  }) as unknown as RTCPeerConnection["ontrack"];
}

function onConnectionState(pc: RTCPeerConnection, handler: (state: string) => void) {
  pc.onconnectionstatechange = (() => {
    handler(pc.connectionState);
  }) as unknown as RTCPeerConnection["onconnectionstatechange"];
}

export type LiveChatMessage = { id?: string; name?: string; content?: string };

export type LiveStatus = "preparing" | "live" | "ended" | "error";

type Options = {
  mode: "host" | "viewer";
  liveId?: string;
  title: string;
  token: string;
};

/**
 * Live P2P nativa (react-native-webrtc) sobre a sinalização socket.io já existente.
 *
 * O host mantém uma conexão por espectador. A versão anterior em WebView guardava
 * um `pc` único, então o segundo espectador derrubava o primeiro.
 */
export function useLiveRoom({ mode, liveId: initialLiveId, title, token }: Options) {
  const [status, setStatus] = useState<LiveStatus>("preparing");
  const [error, setError] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [liveId, setLiveId] = useState<string | null>(initialLiveId ?? null);
  const [roomTitle, setRoomTitle] = useState(title);
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const pendingIceRef = useRef(new Map<string, CandidateInit[]>());
  const liveIdRef = useRef<string | null>(initialLiveId ?? null);
  const socketRef = useRef<Socket | null>(null);
  const hostIdRef = useRef<string | null>(null);
  const closedRef = useRef(false);

  const dropPeer = useCallback((peerId: string) => {
    const pc = peersRef.current.get(peerId);
    if (!pc) return;
    try {
      pc.close();
    } catch {
      // ignore
    }
    peersRef.current.delete(peerId);
    pendingIceRef.current.delete(peerId);
    setViewerCount(peersRef.current.size);
  }, []);

  const queueIce = useCallback(async (peerId: string, pc: RTCPeerConnection, candidate: CandidateInit) => {
    // Candidatos podem chegar antes da descrição remota; guardamos até dar para aplicar.
    if (!pc.remoteDescription) {
      const queued = pendingIceRef.current.get(peerId) ?? [];
      queued.push(candidate);
      pendingIceRef.current.set(peerId, queued);
      return;
    }
    const rtc = getWebrtcRuntime();
    if (!rtc) return;
    try {
      await pc.addIceCandidate(new rtc.RTCIceCandidate(candidate));
    } catch {
      // ignore
    }
  }, []);

  const flushIce = useCallback(async (peerId: string, pc: RTCPeerConnection) => {
    const queued = pendingIceRef.current.get(peerId);
    if (!queued?.length) return;
    pendingIceRef.current.delete(peerId);
    const rtc = getWebrtcRuntime();
    if (!rtc) return;
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new rtc.RTCIceCandidate(candidate));
      } catch {
        // ignore
      }
    }
  }, []);

  const teardown = useCallback(() => {
    closedRef.current = true;
    peersRef.current.forEach((pc) => {
      try {
        pc.close();
      } catch {
        // ignore
      }
    });
    peersRef.current.clear();
    pendingIceRef.current.clear();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
  }, []);

  useEffect(() => {
    closedRef.current = false;
    let socket: Socket | null = null;

    const rtc = getWebrtcRuntime();
    if (!rtc) {
      setError("A live precisa de um build de desenvolvimento — o Expo Go não inclui o módulo de vídeo.");
      setStatus("error");
      return;
    }

    const onChat = (row: LiveChatMessage) => {
      setMessages((current) => [...current, row]);
    };
    const onEnded = () => {
      teardown();
      setStatus("ended");
    };

    const onHostSignal = async (payload: SignalPayload) => {
      const from = payload?.from;
      if (!from || !payload.data) return;
      const pc = peersRef.current.get(from);
      if (!pc) return;
      try {
        if (payload.data.sdp?.type === "answer") {
          await pc.setRemoteDescription(new rtc.RTCSessionDescription(payload.data.sdp));
          await flushIce(from, pc);
        } else if (payload.data.candidate) {
          await queueIce(from, pc, payload.data.candidate);
        }
      } catch {
        // ignore
      }
    };

    const onPeerJoined = async ({ socketId, isHost }: { socketId?: string; isHost?: boolean }) => {
      const stream = localStreamRef.current;
      if (isHost || !socketId || !stream || !socket) return;
      dropPeer(socketId);
      const pc = new rtc.RTCPeerConnection(ICE_CONFIG);
      peersRef.current.set(socketId, pc);
      setViewerCount(peersRef.current.size);

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      onIceCandidate(pc, (candidate) => {
        socket?.emit("live:signal", { liveId: liveIdRef.current, to: socketId, data: { candidate } });
      });
      onConnectionState(pc, (state) => {
        if (["failed", "closed", "disconnected"].includes(state)) dropPeer(socketId);
      });

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("live:signal", { liveId: liveIdRef.current, to: socketId, data: { sdp: offer } });
      } catch {
        dropPeer(socketId);
      }
    };

    const onViewerSignal = async (payload: SignalPayload) => {
      const from = payload?.from;
      if (!from || !payload.data || !socket) return;
      const pc = peersRef.current.get("host");
      if (!pc) return;
      try {
        if (payload.data.sdp?.type === "offer") {
          hostIdRef.current = from;
          await pc.setRemoteDescription(new rtc.RTCSessionDescription(payload.data.sdp));
          await flushIce("host", pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("live:signal", { liveId: liveIdRef.current, to: from, data: { sdp: answer } });
        } else if (payload.data.candidate) {
          await queueIce("host", pc, payload.data.candidate);
        }
      } catch {
        setError("Sinal de vídeo interrompido.");
      }
    };

    async function startHost(rtc: WebrtcRuntime) {
      const stream = await rtc.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 } }
      });
      if (closedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      localStreamRef.current = stream;
      setLocalStream(stream);

      let id = liveIdRef.current;
      if (!id) {
        const created = await apiPost<{ live: { id: string } }>("/student/social/live", { title }, token);
        id = created.live.id;
      }
      if (closedRef.current) return;
      liveIdRef.current = id;
      setLiveId(id);

      socket = getSocket(token);
      socketRef.current = socket;
      socket.emit("live:join", id);
      socket.on("live:peer-joined", onPeerJoined);
      socket.on("live:signal", onHostSignal);
      socket.on("live:chat", onChat);
      socket.on("live:ended", onEnded);
      setStatus("live");
    }

    async function startViewer(rtc: WebrtcRuntime) {
      const id = liveIdRef.current;
      if (!id) throw new Error("Live inválida.");

      const detail = await apiGet<{ live: { title?: string; messages?: LiveChatMessage[] } }>(
        `/student/social/live/${encodeURIComponent(id)}`,
        token
      );
      if (closedRef.current) return;
      if (detail.live.title) setRoomTitle(detail.live.title);
      setMessages(detail.live.messages ?? []);

      socket = getSocket(token);
      socketRef.current = socket;

      const pc = new rtc.RTCPeerConnection(ICE_CONFIG);
      peersRef.current.set("host", pc);
      onRemoteTrack(pc, setRemoteStream);
      onIceCandidate(pc, (candidate) => {
        if (hostIdRef.current) {
          socket?.emit("live:signal", { liveId: id, to: hostIdRef.current, data: { candidate } });
        }
      });

      socket.on("live:signal", onViewerSignal);
      socket.on("live:chat", onChat);
      socket.on("live:ended", onEnded);

      await new Promise<void>((resolve, reject) => {
        socket?.emit("live:join", id, (result: { ok?: boolean } | undefined) => {
          if (result?.ok) resolve();
          else reject(new Error("Live indisponível ou encerrada."));
        });
      });
      if (closedRef.current) return;
      setStatus("live");
    }

    void (async () => {
      try {
        if (mode === "host") await startHost(rtc);
        else await startViewer(rtc);
      } catch (err) {
        if (closedRef.current) return;
        teardown();
        setError(err instanceof Error ? err.message : "Falha ao abrir a live.");
        setStatus("error");
      }
    })();

    return () => {
      // O socket é compartilhado com feed/mensagens: removemos só os nossos listeners.
      socket?.off("live:peer-joined", onPeerJoined);
      socket?.off("live:signal", onHostSignal);
      socket?.off("live:signal", onViewerSignal);
      socket?.off("live:chat", onChat);
      socket?.off("live:ended", onEnded);
      teardown();
    };
  }, [dropPeer, flushIce, mode, queueIce, teardown, title, token]);

  const sendChat = useCallback((content: string) => {
    const text = content.trim();
    const id = liveIdRef.current;
    if (!text || !id) return;
    socketRef.current?.emit("live:chat", { liveId: id, content: text });
  }, []);

  const end = useCallback(async () => {
    const id = liveIdRef.current;
    if (mode === "host" && id) {
      socketRef.current?.emit("live:end", id);
      try {
        await apiPost(`/student/social/live/${encodeURIComponent(id)}/end`, {}, token);
      } catch {
        // ignore — sair da tela não deve travar por falha de rede
      }
    }
    teardown();
  }, [mode, teardown, token]);

  const switchCamera = useCallback(() => {
    localStreamRef.current?.getVideoTracks().forEach((track) => track._switchCamera());
  }, []);

  const toggleMic = useCallback(() => {
    const tracks = localStreamRef.current?.getAudioTracks() ?? [];
    const next = !tracks.every((track) => track.enabled);
    tracks.forEach((track) => {
      track.enabled = next;
    });
    setMicOn(next);
  }, []);

  const toggleCam = useCallback(() => {
    const tracks = localStreamRef.current?.getVideoTracks() ?? [];
    const next = !tracks.every((track) => track.enabled);
    tracks.forEach((track) => {
      track.enabled = next;
    });
    setCamOn(next);
  }, []);

  return {
    status,
    error,
    localStream,
    remoteStream,
    liveId,
    title: roomTitle,
    messages,
    viewerCount,
    micOn,
    camOn,
    sendChat,
    end,
    switchCamera,
    toggleMic,
    toggleCam
  };
}
