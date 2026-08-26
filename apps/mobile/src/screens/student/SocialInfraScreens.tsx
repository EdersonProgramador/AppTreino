import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ViewToken
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { io, type Socket } from "socket.io-client";
import * as ImagePicker from "expo-image-picker";
import { ResizeMode, Video } from "expo-av";
import { apiDelete, apiGet, apiPost, apiUploadFile } from "../../auth/api";
import { API_URL } from "../../config";
import { mediaUrl } from "../../lib/media";
import { EmptyState, GreenButton, StudentPage } from "../../student/layout";
import { useHideTabBar } from "../../student/useHideTabBar";
import { useStudent } from "../../student/StudentContext";
import { useSt, type StudentTokens } from "../../student/theme";
import type { SocialAuthor } from "../../types";
import type { FeedStackParamList } from "../../navigation/types";

let socket: Socket | null = null;

function getSocket(token: string) {
  if (socket?.connected) return socket;
  socket?.disconnect();
  socket = io(API_URL, { path: "/socket.io", auth: { token }, transports: ["websocket"] });
  return socket;
}

type Nav = NativeStackNavigationProp<FeedStackParamList>;
type ReelRow = {
  id: string;
  videoUrl: string;
  coverUrl?: string | null;
  caption: string;
  author: SocialAuthor;
  likesCount: number;
  likedByMe: boolean;
  isMine?: boolean;
};

function ReelSlide({
  reel,
  active,
  height,
  onLike,
  onDelete
}: {
  reel: ReelRow;
  active: boolean;
  height: number;
  onLike: () => void;
  onDelete?: () => void;
}) {
  const videoRef = useRef<Video>(null);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const uri = mediaUrl(reel.videoUrl);
  const poster = reel.coverUrl ? mediaUrl(reel.coverUrl) : undefined;

  useEffect(() => {
    if (!videoRef.current) return;
    if (active && !paused) void videoRef.current.playAsync().catch(() => undefined);
    else void videoRef.current.pauseAsync().catch(() => undefined);
  }, [active, paused]);

  useEffect(() => {
    if (!active) {
      setPaused(false);
      setMuted(true);
    }
  }, [active]);

  return (
    <View style={[reelStyles.slide, { height }]}>
      {uri ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setPaused((value) => !value)}
        >
          <Video
            ref={videoRef}
            source={{ uri }}
            posterSource={poster ? { uri: poster } : undefined}
            style={StyleSheet.absoluteFill}
            resizeMode={ResizeMode.COVER}
            shouldPlay={active && !paused}
            isLooping
            isMuted={muted}
          />
        </Pressable>
      ) : (
        <View style={[StyleSheet.absoluteFill, reelStyles.fallback]} />
      )}
      <View style={reelStyles.overlay}>
        <Text style={reelStyles.author}>{reel.author.name}</Text>
        {reel.caption ? <Text style={reelStyles.caption}>{reel.caption}</Text> : null}
        <Text style={reelStyles.hint}>{paused ? "Tocar para continuar" : "Tocar para pausar"}</Text>
      </View>
      <View style={reelStyles.actions}>
        <Pressable style={reelStyles.actionBtn} onPress={onLike}>
          <Ionicons name={reel.likedByMe ? "heart" : "heart-outline"} size={30} color={reel.likedByMe ? "#df663c" : "#fff"} />
          <Text style={reelStyles.likeCount}>{reel.likesCount}</Text>
        </Pressable>
        <Pressable style={reelStyles.actionBtn} onPress={() => setMuted((value) => !value)}>
          <Ionicons name={muted ? "volume-mute" : "volume-high"} size={26} color="#fff" />
        </Pressable>
        {onDelete ? (
          <Pressable style={reelStyles.actionBtn} onPress={onDelete}>
            <Ionicons name="trash-outline" size={24} color="#fff" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const reelStyles = StyleSheet.create({
  slide: { width: "100%", backgroundColor: "#000" },
  fallback: { backgroundColor: "#111" },
  overlay: {
    position: "absolute",
    left: 16,
    right: 88,
    bottom: 48,
    gap: 6
  },
  author: { color: "#fff", fontWeight: "800", fontSize: 16 },
  caption: { color: "rgba(255,255,255,0.9)", fontSize: 14, lineHeight: 20 },
  hint: { color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: "600" },
  actions: { position: "absolute", right: 12, bottom: 100, alignItems: "center", gap: 18 },
  actionBtn: { alignItems: "center", gap: 4 },
  likeCount: { color: "#fff", fontWeight: "800" }
});

export function ReelsScreen() {
  const { session } = useStudent();
  const { st } = useSt();
  const styles = useMemo(() => createStyles(st), [st]);
  const navigation = useNavigation<Nav>();
  const { height: windowHeight } = useWindowDimensions();
  const [pageHeight, setPageHeight] = useState(windowHeight);
  const [reels, setReels] = useState<ReelRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useHideTabBar(true);
  const slideHeight = pageHeight || windowHeight;

  const load = useCallback(async () => {
    const data = await apiGet<{ reels: ReelRow[] }>("/student/social/reels", session.token);
    setReels(data.reels);
    setActiveId((current) => current ?? data.reels[0]?.id ?? null);
  }, [session.token]);

  useEffect(() => {
    void load();
  }, [load]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find((row) => row.isViewable);
    if (first?.item && typeof first.item === "object" && "id" in first.item) {
      setActiveId(String((first.item as ReelRow).id));
    }
  }).current;

  return (
    <View
      style={{ flex: 1, backgroundColor: "#000" }}
      onLayout={(event) => setPageHeight(event.nativeEvent.layout.height)}
    >
      <View style={styles.reelsTop}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.reelsTitle}>Clipes</Text>
        <Pressable
          disabled={busy}
          onPress={async () => {
            const pick = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["videos"],
              quality: 0.8,
              videoMaxDuration: 60
            });
            if (pick.canceled || !pick.assets[0]) return;
            setBusy(true);
            try {
              const uploaded = await apiUploadFile<{ file: { url: string } }>(
                "/student/social/uploads",
                pick.assets[0].uri,
                session.token,
                "reel.mp4"
              );
              await apiPost(
                "/student/social/reels",
                { videoUrl: uploaded.file.url, caption: "" },
                session.token
              );
              await load();
            } finally {
              setBusy(false);
            }
          }}
        >
          <Ionicons name="add-circle-outline" size={26} color="#fff" />
        </Pressable>
      </View>

      {reels.length === 0 ? (
        <View style={styles.reelsEmpty}>
          <EmptyState icon="film-outline" title="Sem clipes" text="Publique um vídeo vertical. Ele também aparece no Feed." />
        </View>
      ) : (
        <FlatList
          data={reels}
          keyExtractor={(item) => item.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={slideHeight}
          snapToAlignment="start"
          disableIntervalMomentum
          getItemLayout={(_, index) => ({ length: slideHeight, offset: slideHeight * index, index })}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 70 }}
          renderItem={({ item }) => (
            <ReelSlide
              reel={item}
              active={item.id === activeId}
              height={slideHeight}
              onLike={() => {
                void (async () => {
                  const result = await apiPost<{ liked: boolean }>(
                    `/student/social/reels/${item.id}/like`,
                    {},
                    session.token
                  );
                  setReels((current) =>
                    current.map((row) =>
                      row.id === item.id
                        ? {
                            ...row,
                            likedByMe: result.liked,
                            likesCount: Math.max(0, row.likesCount + (result.liked ? 1 : -1))
                          }
                        : row
                    )
                  );
                })();
              }}
              onDelete={
                item.isMine !== false
                  ? () => {
                      void (async () => {
                        await apiDelete(`/student/social/reels/${item.id}`, session.token);
                        setReels((current) => current.filter((row) => row.id !== item.id));
                      })();
                    }
                  : undefined
              }
            />
          )}
        />
      )}
    </View>
  );
}

export function LiveScreen() {
  const { session } = useStudent();
  const { st } = useSt();
  const styles = useMemo(() => createStyles(st), [st]);
  const navigation = useNavigation<Nav>();
  const [lives, setLives] = useState<Array<{ id: string; title: string; host: SocialAuthor; isMine: boolean }>>([]);
  const [saved, setSaved] = useState<
    Array<{ id: string; title: string; videoUrl?: string | null; coverUrl?: string | null; host: SocialAuthor }>
  >([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replayUrl, setReplayUrl] = useState<string | null>(null);

  async function loadLives() {
    setLoading(true);
    setError(null);
    try {
      const [liveRes, savedRes] = await Promise.all([
        apiGet<{ lives: typeof lives }>("/student/social/live", session.token),
        apiGet<{ lives: typeof saved }>("/student/social/live/saved", session.token).catch(() => ({ lives: [] as typeof saved }))
      ]);
      setLives(liveRes.lives);
      setSaved(savedRes.lives);
    } catch (err) {
      setLives([]);
      setError(err instanceof Error ? err.message : "Não foi possível listar lives.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLives();
  }, [session.token]);

  return (
    <StudentPage>
      <Pressable onPress={() => navigation.goBack()}>
        <Text style={styles.back}>← Feed</Text>
      </Pressable>
      <Text style={styles.title}>Ao vivo</Text>
      {error ? <Text style={styles.meta}>{error}</Text> : null}
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Ex.: Treino de hoje"
        style={styles.input}
        placeholderTextColor={st.faint}
      />
      <GreenButton
        label="Entrar no ar"
        onPress={() => {
          if (title.trim().length < 2) {
            setError("Digite um título com pelo menos 2 caracteres.");
            return;
          }
          setError(null);
          navigation.navigate("LiveRoom", { mode: "host", title: title.trim() });
        }}
      />
      <Pressable style={[styles.chip, { marginBottom: 12 }]} onPress={() => void loadLives()}>
        <Ionicons name="refresh" size={14} color={st.text} />
        <Text style={styles.chipText}>Atualizar</Text>
      </Pressable>
      {loading ? (
        <Text style={styles.meta}>Carregando lives…</Text>
      ) : lives.length === 0 ? (
        <Text style={styles.meta}>Ninguém no ar agora. Comece a sua transmissão acima.</Text>
      ) : (
        lives.map((live) => (
          <Pressable
            key={live.id}
            style={styles.card}
            onPress={() =>
              navigation.navigate("LiveRoom", {
                mode: live.isMine ? "host" : "viewer",
                liveId: live.id,
                title: live.title
              })
            }
          >
            <Text style={styles.name}>{live.title}</Text>
            <Text style={styles.meta}>
              {live.host.name}
              {live.isMine ? " · você" : ""} · tocar para {live.isMine ? "voltar" : "assistir"}
            </Text>
          </Pressable>
        ))
      )}

      <Text style={[styles.title, { marginTop: 18, fontSize: 18 }]}>Lives salvas</Text>
      {saved.length === 0 ? (
        <Text style={styles.meta}>Nenhuma live salva ainda.</Text>
      ) : (
        saved.map((live) => {
          const stillLive = lives.some((row) => row.id === live.id);
          const video = live.videoUrl ? mediaUrl(live.videoUrl) : undefined;
          return (
            <Pressable
              key={`saved-${live.id}`}
              style={styles.card}
              onPress={() => {
                if (stillLive) {
                  navigation.navigate("LiveRoom", {
                    mode: "viewer",
                    liveId: live.id,
                    title: live.title
                  });
                  return;
                }
                if (video) setReplayUrl(video);
              }}
            >
              <Text style={styles.name}>{live.title}</Text>
              <Text style={styles.meta}>
                {live.host.name} · {stillLive ? "ainda no ar" : video ? "replay" : "sem vídeo"}
              </Text>
            </Pressable>
          );
        })
      )}

      {replayUrl ? (
        <View style={styles.replayBox}>
          <View style={styles.replayHead}>
            <Text style={styles.name}>Replay</Text>
            <Pressable onPress={() => setReplayUrl(null)} hitSlop={8}>
              <Ionicons name="close" size={20} color={st.muted} />
            </Pressable>
          </View>
          <Video
            source={{ uri: replayUrl }}
            style={styles.replayVideo}
            resizeMode={ResizeMode.CONTAIN}
            useNativeControls
            shouldPlay
          />
        </View>
      ) : null}
    </StudentPage>
  );
}

export function MessagesScreen() {
  const { session } = useStudent();
  const { st } = useSt();
  const styles = useMemo(() => createStyles(st), [st]);
  const navigation = useNavigation<Nav>();
  const [conversations, setConversations] = useState<
    Array<{ id: string; user: SocialAuthor; lastMessage?: { content: string } | null }>
  >([]);

  useEffect(() => {
    void apiGet<{ conversations: typeof conversations }>("/student/social/conversations", session.token).then((data) =>
      setConversations(data.conversations as typeof conversations)
    );
  }, [session.token]);

  return (
    <StudentPage>
      <Pressable onPress={() => navigation.goBack()}>
        <Text style={styles.back}>← Feed</Text>
      </Pressable>
      <Text style={styles.title}>Mensagens</Text>
      {conversations.map((row) => (
        <Pressable
          key={row.id}
          style={styles.card}
          onPress={() => navigation.navigate("DirectMessage", { userId: row.user.id, name: row.user.name })}
        >
          <Text style={styles.name}>{row.user.name}</Text>
          <Text style={styles.meta}>{row.lastMessage?.content || "Nova conversa"}</Text>
        </Pressable>
      ))}
    </StudentPage>
  );
}

export function DirectMessageScreen() {
  const { session } = useStudent();
  const { st } = useSt();
  const styles = useMemo(() => createStyles(st), [st]);
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<FeedStackParamList, "DirectMessage">>();
  const [messages, setMessages] = useState<Array<{ id: string; content: string; isMine?: boolean }>>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    void apiGet<{ messages: typeof messages }>(`/student/social/messages/${route.params.userId}`, session.token).then((data) =>
      setMessages(data.messages)
    );
  }, [route.params.userId, session.token]);

  return (
    <StudentPage>
      <Pressable onPress={() => navigation.goBack()}>
        <Text style={styles.back}>← Mensagens</Text>
      </Pressable>
      <Text style={styles.title}>{route.params.name}</Text>
      {messages.map((msg) => (
        <Text key={msg.id} style={[styles.meta, msg.isMine && { color: st.coral }]}>
          {msg.content}
        </Text>
      ))}
      <TextInput value={draft} onChangeText={setDraft} placeholder="Mensagem" style={styles.input} placeholderTextColor={st.faint} />
      <GreenButton
        label="Enviar"
        onPress={async () => {
          if (!draft.trim()) return;
          const result = await apiPost<{ message: { id: string; content: string; isMine?: boolean } }>(
            `/student/social/messages/${route.params.userId}`,
            { content: draft.trim() },
            session.token
          );
          setMessages((current) => [...current, result.message]);
          setDraft("");
        }}
      />
    </StudentPage>
  );
}

export function ChatScreen() {
  const { session } = useStudent();
  const { st } = useSt();
  const styles = useMemo(() => createStyles(st), [st]);
  const navigation = useNavigation<Nav>();
  const [messages, setMessages] = useState<Array<{ id: string; content: string; name: string; isMine?: boolean }>>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    void apiGet<{ messages: typeof messages }>("/student/social/chat/global", session.token).then((data) => setMessages(data.messages));
    const sock = getSocket(session.token);
    sock.emit("presence:hello");
    sock.on("chat:global", (msg: (typeof messages)[number]) => setMessages((current) => [...current, msg]));
    return () => {
      sock.off("chat:global");
    };
  }, [session.token]);

  return (
    <StudentPage>
      <Pressable onPress={() => navigation.goBack()}>
        <Text style={styles.back}>← Feed</Text>
      </Pressable>
      <Text style={styles.title}>Chat global</Text>
      {messages.map((msg) => (
        <Text key={msg.id} style={styles.meta}>
          <Text style={styles.name}>{msg.name.split(" ")[0]} </Text>
          {msg.content}
        </Text>
      ))}
      <TextInput value={draft} onChangeText={setDraft} placeholder="Mensagem" style={styles.input} placeholderTextColor={st.faint} />
      <GreenButton
        label="Enviar"
        onPress={() => {
          if (!draft.trim()) return;
          getSocket(session.token).emit("chat:global", draft.trim(), (ok: boolean) => {
            if (ok) setDraft("");
          });
        }}
      />
    </StudentPage>
  );
}

export function RequestsScreen() {
  const { session } = useStudent();
  const { st } = useSt();
  const styles = useMemo(() => createStyles(st), [st]);
  const navigation = useNavigation<Nav>();
  const [requests, setRequests] = useState<Array<{ id: string; user: SocialAuthor }>>([]);
  const [isPrivate, setIsPrivate] = useState(false);

  useEffect(() => {
    void Promise.all([
      apiGet<{ requests: typeof requests }>("/student/social/follow-requests", session.token),
      apiGet<{ isPrivate: boolean }>("/student/social/privacy", session.token)
    ]).then(([req, privacy]) => {
      setRequests(req.requests);
      setIsPrivate(privacy.isPrivate);
    });
  }, [session.token]);

  return (
    <StudentPage>
      <Pressable onPress={() => navigation.goBack()}>
        <Text style={styles.back}>← Feed</Text>
      </Pressable>
      <Text style={styles.title}>Pedidos</Text>
      <Pressable
        style={styles.chip}
        onPress={async () => {
          const next = !isPrivate;
          setIsPrivate(next);
          await apiPost("/student/social/privacy", { isPrivate: next }, session.token);
        }}
      >
        <Text style={styles.chipText}>Perfil privado · {isPrivate ? "on" : "off"}</Text>
      </Pressable>
      {requests.map((row) => (
        <View key={row.id} style={styles.card}>
          <Text style={styles.name}>{row.user.name}</Text>
          <View style={styles.row}>
            <GreenButton
              label="Aceitar"
              onPress={async () => {
                await apiPost(`/student/social/follow-requests/${row.id}/accept`, {}, session.token);
                setRequests((current) => current.filter((item) => item.id !== row.id));
              }}
            />
            <Pressable
              style={styles.chip}
              onPress={async () => {
                await apiPost(`/student/social/follow-requests/${row.id}/reject`, {}, session.token);
                setRequests((current) => current.filter((item) => item.id !== row.id));
              }}
            >
              <Text style={styles.chipText}>Recusar</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </StudentPage>
  );
}

function createStyles(st: StudentTokens) {
  return StyleSheet.create({
    back: { color: st.goldUi, fontWeight: "800", marginBottom: 8 },
    title: { color: st.text, fontWeight: "800", fontSize: 22, marginBottom: 12 },
    card: { borderWidth: 1, borderColor: st.line, backgroundColor: st.card, borderRadius: 16, padding: 14, gap: 8, marginBottom: 10 },
    name: { color: st.text, fontWeight: "800" },
    meta: { color: st.muted, fontSize: 13 },
    input: { borderWidth: 1, borderColor: st.line, borderRadius: 12, padding: 10, color: st.text, backgroundColor: st.inputBg, marginBottom: 10 },
    chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: st.line, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8, alignSelf: "flex-start" },
    chipText: { color: st.text, fontWeight: "800", fontSize: 12 },
    row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
    reelsTop: {
      position: "absolute",
      top: 48,
      left: 12,
      right: 12,
      zIndex: 4,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between"
    },
    reelsTitle: { color: "#fff", fontWeight: "800", fontSize: 18 },
    reelsEmpty: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: st.bg },
    replayBox: {
      marginTop: 12,
      marginBottom: 20,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: st.line,
      backgroundColor: "#000",
      overflow: "hidden"
    },
    replayHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: st.card
    },
    replayVideo: { width: "100%", aspectRatio: 9 / 16, maxHeight: 420, backgroundColor: "#000" }
  });
}
