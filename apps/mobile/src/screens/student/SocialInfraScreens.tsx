import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ViewToken
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import { apiDelete, apiGet, apiPost } from "../../auth/api";
import { AppVideo } from "../../components/AppVideo";
import { NativeCameraModal, type NativeCameraCapture } from "../../components/NativeCameraModal";
import { mediaUrl } from "../../lib/media";
import { MediaImage } from "../../lib/MediaImage";
import { getSocket } from "../../lib/socket";
import { ensureLibraryAccess, uploadCameraCapture } from "../../lib/nativeMediaPick";
import { uploadPickerAsset } from "../../lib/uploadMedia";
import { EmptyState, GreenButton, StudentPage } from "../../student/layout";
import { useStudent } from "../../student/StudentContext";
import { useSt, type StudentTokens } from "../../student/theme";
import { uiSounds } from "../../student/uiSounds";
import type { SocialAuthor } from "../../types";
import type { FeedStackParamList } from "../../navigation/types";

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
  onDelete,
  onOpenAuthor
}: {
  reel: ReelRow;
  active: boolean;
  height: number;
  onLike: () => void;
  onDelete?: () => void;
  onOpenAuthor: () => void;
}) {
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const uri = mediaUrl(reel.videoUrl);

  useEffect(() => {
    if (!active) {
      setPaused(false);
      setMuted(true);
    }
  }, [active]);

  return (
    <View style={[reelStyles.slide, { height }]}>
      {uri ? (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setPaused((value) => !value)}>
          <AppVideo
            uri={uri}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            playing={active && !paused}
            loop
            muted={muted}
            poster={mediaUrl(reel.coverUrl)}
          />
        </Pressable>
      ) : (
        <View style={[StyleSheet.absoluteFill, reelStyles.fallback]} />
      )}
      <View style={reelStyles.overlay}>
        <Pressable onPress={onOpenAuthor}>
          <Text style={reelStyles.author}>{reel.author.name}</Text>
        </Pressable>
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
  const [pageHeight, setPageHeight] = useState(Math.max(320, windowHeight - 180));
  const [reels, setReels] = useState<ReelRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const slideHeight = pageHeight;

  const load = useCallback(async () => {
    const data = await apiGet<{ reels: ReelRow[] }>("/student/social/reels", session.token);
    setReels(data.reels);
    setActiveId((current) => current ?? data.reels[0]?.id ?? null);
  }, [session.token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function publishReelFromAsset(asset: {
    uri: string;
    fileName?: string | null;
    mimeType?: string | null;
    type?: string | null;
    duration?: number | null;
  }) {
    setBusy(true);
    try {
      const { uploaded } = await uploadPickerAsset<{ file: { url: string } }>(
        "/student/social/uploads",
        asset,
        session.token,
        "reel"
      );
      await apiPost("/student/social/reels", { videoUrl: uploaded.file.url, caption: "" }, session.token);
      await load();
    } catch (err) {
      console.warn("reel upload failed", err);
    } finally {
      setBusy(false);
    }
  }

  async function pickReelFromGallery() {
    setComposeOpen(false);
    try {
      const ok = await ensureLibraryAccess();
      if (!ok) return;
      const pick = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        quality: 0.8,
        videoMaxDuration: 60,
        videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium
      });
      if (pick.canceled || !pick.assets[0]) return;
      await publishReelFromAsset(pick.assets[0]);
    } catch (err) {
      console.warn("reel gallery failed", err);
    }
  }

  async function onReelCameraCaptured(capture: NativeCameraCapture) {
    setCameraOpen(false);
    const item = await uploadCameraCapture({
      token: session.token,
      capture,
      fallbackBase: "reel-cam"
    });
    if (!item) return;
    setBusy(true);
    try {
      await apiPost("/student/social/reels", { videoUrl: item.url, caption: "" }, session.token);
      await load();
    } catch (err) {
      console.warn("reel camera publish failed", err);
    } finally {
      setBusy(false);
    }
  }

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find((row) => row.isViewable);
    if (first?.item && typeof first.item === "object" && "id" in first.item) {
      setActiveId(String((first.item as ReelRow).id));
    }
  }).current;

  return (
    <StudentPage scroll={false}>
      <View style={styles.reelsHead}>
        <Pressable onPress={() => navigation.navigate("Feed")} hitSlop={10} style={styles.reelsBack}>
          <Ionicons name="chevron-back" size={22} color={st.text} />
          <Text style={styles.reelsBackText}>Feed</Text>
        </Pressable>
        <Text style={styles.reelsHeadTitle}>Clipes</Text>
        <Pressable disabled={busy} onPress={() => setComposeOpen(true)} hitSlop={10}>
          <Ionicons name="add-circle-outline" size={24} color={st.text} />
        </Pressable>
      </View>

      <Modal visible={composeOpen} transparent animationType="fade" onRequestClose={() => setComposeOpen(false)}>
        <Pressable style={styles.composeBackdrop} onPress={() => setComposeOpen(false)} />
        <View style={styles.composeSheet}>
          <Text style={styles.composeTitle}>Novo clipe</Text>
          <Pressable
            style={styles.composeRow}
            onPress={() => {
              setComposeOpen(false);
              setCameraOpen(true);
            }}
          >
            <Ionicons name="videocam-outline" size={20} color={st.text} />
            <Text style={styles.composeRowText}>Gravar com a câmera</Text>
          </Pressable>
          <Pressable style={styles.composeRow} onPress={() => void pickReelFromGallery()}>
            <Ionicons name="images-outline" size={20} color={st.text} />
            <Text style={styles.composeRowText}>Escolher da galeria</Text>
          </Pressable>
        </View>
      </Modal>

      <NativeCameraModal
        visible={cameraOpen}
        mode="video"
        allowModeSwitch={false}
        maxVideoSeconds={60}
        onClose={() => setCameraOpen(false)}
        onCaptured={(capture) => void onReelCameraCaptured(capture)}
      />

      <View
        style={{ flex: 1, backgroundColor: "#000" }}
        onLayout={(event) => setPageHeight(event.nativeEvent.layout.height)}
      >
        {reels.length === 0 ? (
          <View style={styles.reelsEmpty}>
            <EmptyState
              icon="film-outline"
              title="Sem clipes"
              text="Publique um vídeo vertical. Ele também aparece no Feed."
            />
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
                onOpenAuthor={() => navigation.navigate("PeerProfile", { userId: item.author.id })}
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
    </StudentPage>
  );
}

export function LiveScreen() {
  const { session } = useStudent();
  const { st } = useSt();
  const styles = useMemo(() => createLiveStyles(st), [st]);
  const navigation = useNavigation<Nav>();
  const isFocused = useIsFocused();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const replayWidth = Math.min(Math.max(windowWidth - 32, 0), 440);
  const replayVideoHeight = Math.max(180, Math.min((replayWidth * 16) / 9, windowHeight - 144));
  const [lives, setLives] = useState<
    Array<{ id: string; title: string; host: SocialAuthor; isMine: boolean; savedByMe?: boolean }>
  >([]);
  const [saved, setSaved] = useState<
    Array<{
      id: string;
      title: string;
      status?: string;
      videoUrl?: string | null;
      coverUrl?: string | null;
      host: SocialAuthor;
    }>
  >([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replay, setReplay] = useState<{ title: string; uri: string } | null>(null);

  const loadLives = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [liveRes, savedRes] = await Promise.all([
        apiGet<{ lives: typeof lives }>("/student/social/live", session.token),
        apiGet<{ lives: typeof saved }>("/student/social/live/saved", session.token).catch(() => ({
          lives: [] as typeof saved
        }))
      ]);
      setLives(liveRes.lives);
      setSaved(savedRes.lives);
    } catch (err) {
      setLives([]);
      setError(err instanceof Error ? err.message : "Não foi possível listar lives.");
    } finally {
      setLoading(false);
    }
  }, [session.token]);

  useEffect(() => {
    if (!isFocused) return;
    void loadLives();
  }, [isFocused, loadLives]);

  async function toggleSave(liveId: string, currentlySaved: boolean) {
    try {
      setBusy(true);
      if (currentlySaved) {
        await apiDelete(`/student/social/live/${liveId}/save`, session.token);
      } else {
        await apiPost(`/student/social/live/${liveId}/save`, {}, session.token);
      }
      uiSounds.success();
      await loadLives();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a live.");
      uiSounds.error();
    } finally {
      setBusy(false);
    }
  }

  function startLive() {
    if (title.trim().length < 2) {
      setError("Digite um título com pelo menos 2 caracteres.");
      return;
    }
    setError(null);
    uiSounds.itemSelect();
    navigation.navigate("LiveRoom", { mode: "host", title: title.trim() });
  }

  return (
    <StudentPage
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={() => void loadLives()} tintColor={st.gold} />
      }
    >
      <View style={styles.liveHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.liveTitle}>Ao vivo</Text>
          <Text style={styles.liveSub}>Transmita em tela cheia ou assista quem está no ar.</Text>
        </View>
        <Pressable
          style={styles.refreshBtn}
          onPress={() => void loadLives()}
          disabled={loading || busy}
          accessibilityLabel="Atualizar lives"
        >
          <Ionicons name="refresh" size={18} color={st.text} />
        </Pressable>
      </View>

      {error ? (
        <Pressable style={styles.errorBox} onPress={() => setError(null)}>
          <Text style={styles.errorText}>{error}</Text>
        </Pressable>
      ) : null}

      <View style={styles.startCard}>
        <Text style={styles.startLabel}>Começar transmissão</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Ex.: Treino de hoje"
          placeholderTextColor={st.faint}
          style={styles.input}
          maxLength={80}
          editable={!busy}
        />
        <GreenButton
          label="Entrar no ar"
          icon="radio-outline"
          onPress={startLive}
          disabled={busy || title.trim().length < 2}
        />
        <Text style={styles.startHint}>
          Pedimos câmera e microfone. Há 3 segundos de contagem antes de ir ao ar.
        </Text>
      </View>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>No ar agora</Text>
        {!loading ? <Text style={styles.sectionCount}>{lives.length}</Text> : null}
      </View>

      {loading ? (
        <Text style={styles.meta}>Carregando lives…</Text>
      ) : lives.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="radio-outline" size={28} color={st.muted} />
          <Text style={styles.emptyTitle}>Ninguém no ar</Text>
          <Text style={styles.meta}>Quando alguém entrar ao vivo, aparece aqui. Você também pode começar a sua.</Text>
        </View>
      ) : (
        lives.map((live) => (
          <View key={live.id} style={styles.liveRow}>
            <Pressable
              style={styles.liveRowMain}
              disabled={busy}
              onPress={() => {
                uiSounds.itemSelect();
                navigation.navigate("LiveRoom", {
                  mode: live.isMine ? "host" : "viewer",
                  liveId: live.id,
                  title: live.title
                });
              }}
            >
              <MediaImage
                uri={live.host.avatarUrl}
                style={styles.liveAvatar}
                fallback={<Text style={styles.liveAvatarLetter}>{live.host.name.slice(0, 1)}</Text>}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {live.title}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {live.host.name}
                  {live.isMine ? " · você" : ""}
                </Text>
              </View>
              <View style={styles.liveBadge}>
                <Text style={styles.liveBadgeText}>LIVE</Text>
              </View>
            </Pressable>
            <Pressable
              style={[styles.saveBtn, live.savedByMe && styles.saveBtnOn]}
              disabled={busy}
              onPress={() => void toggleSave(live.id, Boolean(live.savedByMe))}
              accessibilityLabel={live.savedByMe ? "Remover live salva" : "Salvar live"}
            >
              <Ionicons
                name={live.savedByMe ? "bookmark" : "bookmark-outline"}
                size={18}
                color={live.savedByMe ? st.coral : st.text}
              />
            </Pressable>
          </View>
        ))
      )}

      <View style={[styles.sectionHead, { marginTop: 18 }]}>
        <Text style={styles.sectionTitle}>Lives salvas</Text>
        {!loading ? <Text style={styles.sectionCount}>{saved.length}</Text> : null}
      </View>

      {loading ? (
        <Text style={styles.meta}>Carregando salvas…</Text>
      ) : saved.length === 0 ? (
        <View style={[styles.emptyBox, styles.emptyCompact]}>
          <Ionicons name="bookmark-outline" size={22} color={st.muted} />
          <Text style={styles.meta}>Salve lives para achar depois. Toque no marcador ao lado de uma transmissão.</Text>
        </View>
      ) : (
        <View style={styles.savedGrid}>
          {saved.map((live) => {
            const stillLive = live.status === "live" || lives.some((row) => row.id === live.id);
            const video = live.videoUrl ? mediaUrl(live.videoUrl) : undefined;
            const cover = mediaUrl(live.coverUrl || live.host.avatarUrl);
            return (
              <View key={`saved-${live.id}`} style={styles.savedTile}>
                <Pressable
                  style={styles.savedMain}
                  disabled={busy || (!stillLive && !video)}
                  onPress={() => {
                    if (stillLive) {
                      uiSounds.itemSelect();
                      navigation.navigate("LiveRoom", {
                        mode: "viewer",
                        liveId: live.id,
                        title: live.title
                      });
                      return;
                    }
                    if (video) setReplay({ title: live.title, uri: video });
                  }}
                >
                  <View style={styles.savedCover}>
                    <MediaImage
                      uri={cover}
                      style={StyleSheet.absoluteFillObject}
                      fallback={<Text style={styles.liveAvatarLetter}>{live.host.name.slice(0, 1)}</Text>}
                    />
                    {video && !stillLive ? (
                      <View style={styles.playChip}>
                        <Ionicons name="play" size={12} color="#fff" />
                      </View>
                    ) : null}
                  </View>
                  {stillLive ? (
                    <View style={[styles.liveBadge, styles.liveBadgeSm]}>
                      <Text style={styles.liveBadgeText}>LIVE</Text>
                    </View>
                  ) : (
                    <Text style={styles.savedChip}>Salva</Text>
                  )}
                  <Text style={styles.savedTitle} numberOfLines={2}>
                    {live.title}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {live.host.name}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.savedRemove}
                  onPress={() => void toggleSave(live.id, true)}
                  accessibilityLabel="Remover das salvas"
                >
                  <Ionicons name="trash-outline" size={16} color={st.muted} />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      <Modal
        visible={Boolean(replay)}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setReplay(null)}
      >
        <View style={styles.replayModal}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setReplay(null)} accessibilityLabel="Fechar replay" />
          <View style={[styles.replayCard, { maxHeight: Math.max(280, windowHeight - 32) }]}>
            <View style={styles.replayHead}>
              <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>
                {replay?.title || "Replay"}
              </Text>
              <Pressable onPress={() => setReplay(null)} hitSlop={8}>
                <Ionicons name="close" size={22} color={st.muted} />
              </Pressable>
            </View>
            {replay ? (
              <AppVideo
                uri={replay.uri}
                style={[styles.replayVideo, { height: replayVideoHeight }]}
                contentFit="contain"
                nativeControls
                playing
              />
            ) : null}
          </View>
        </View>
      </Modal>
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
          onLongPress={() => navigation.navigate("PeerProfile", { userId: row.user.id })}
        >
          <Pressable onPress={() => navigation.navigate("PeerProfile", { userId: row.user.id })}>
            <Text style={styles.name}>{row.user.name}</Text>
          </Pressable>
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
      <Pressable onPress={() => navigation.navigate("PeerProfile", { userId: route.params.userId })}>
        <Text style={styles.title}>{route.params.name}</Text>
      </Pressable>
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

function createLiveStyles(st: StudentTokens) {
  return StyleSheet.create({
    liveHead: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      paddingHorizontal: 16,
      marginBottom: 14
    },
    liveTitle: { color: st.text, fontWeight: "800", fontSize: 22 },
    liveSub: { color: st.muted, fontSize: 13, marginTop: 4, lineHeight: 18 },
    refreshBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: st.line,
      backgroundColor: st.card
    },
    errorBox: {
      marginHorizontal: 16,
      marginBottom: 12,
      padding: 12,
      borderRadius: 12,
      backgroundColor: "rgba(192,57,43,0.12)"
    },
    errorText: { color: "#c0392b", fontWeight: "700", fontSize: 13 },
    startCard: {
      marginHorizontal: 16,
      marginBottom: 18,
      padding: 14,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: st.line,
      backgroundColor: st.card,
      gap: 10
    },
    startLabel: { color: st.text, fontWeight: "800", fontSize: 14 },
    startHint: { color: st.muted, fontSize: 12, lineHeight: 17 },
    input: {
      borderWidth: 1,
      borderColor: st.line,
      borderRadius: 12,
      padding: 10,
      color: st.text,
      backgroundColor: st.inputBg
    },
    sectionHead: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      marginBottom: 10
    },
    sectionTitle: { color: st.text, fontWeight: "800", fontSize: 16 },
    sectionCount: { color: st.muted, fontWeight: "700", fontSize: 13 },
    meta: { color: st.muted, fontSize: 13, lineHeight: 18, paddingHorizontal: 16 },
    emptyBox: {
      marginHorizontal: 16,
      marginBottom: 12,
      padding: 18,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: st.line,
      backgroundColor: st.card,
      alignItems: "center",
      gap: 8
    },
    emptyCompact: { paddingVertical: 14 },
    emptyTitle: { color: st.text, fontWeight: "800", fontSize: 15 },
    liveRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 10
    },
    liveRowMain: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: st.line,
      backgroundColor: st.card,
      minWidth: 0
    },
    liveAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: st.fill },
    liveAvatarFallback: { alignItems: "center", justifyContent: "center" },
    liveAvatarLetter: { color: st.gold, fontWeight: "800", fontSize: 16 },
    name: { color: st.text, fontWeight: "800" },
    liveBadge: {
      backgroundColor: "#df663c",
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4
    },
    liveBadgeSm: { alignSelf: "flex-start", marginTop: 6, marginBottom: 4 },
    liveBadgeText: { color: "#fff", fontWeight: "900", fontSize: 10, letterSpacing: 0.4 },
    saveBtn: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: st.line,
      backgroundColor: st.card
    },
    saveBtnOn: { borderColor: "rgba(223,102,60,0.45)", backgroundColor: "rgba(223,102,60,0.12)" },
    savedGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      paddingHorizontal: 16,
      paddingBottom: 24
    },
    savedTile: {
      width: "47.5%",
      borderRadius: 16,
      borderWidth: 1,
      borderColor: st.line,
      backgroundColor: st.card,
      overflow: "hidden"
    },
    savedMain: { padding: 10, gap: 4 },
    savedCover: {
      width: "100%",
      aspectRatio: 1,
      borderRadius: 12,
      backgroundColor: st.fill,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden"
    },
    playChip: {
      position: "absolute",
      right: 8,
      bottom: 8,
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: "rgba(0,0,0,0.55)",
      alignItems: "center",
      justifyContent: "center"
    },
    savedChip: { color: st.goldUi, fontWeight: "800", fontSize: 11, marginTop: 4 },
    savedTitle: { color: st.text, fontWeight: "800", fontSize: 13 },
    savedRemove: { alignSelf: "flex-end", padding: 8 },
    replayModal: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.72)",
      justifyContent: "center",
      alignItems: "center",
      padding: 16
    },
    replayCard: {
      width: "100%",
      maxWidth: 440,
      borderRadius: 18,
      overflow: "hidden",
      backgroundColor: st.card,
      borderWidth: 1,
      borderColor: st.line
    },
    replayHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 10,
      flexShrink: 0
    },
    replayVideo: { width: "100%", backgroundColor: "#000" }
  });
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
    reelsHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: st.line,
      backgroundColor: st.bg
    },
    reelsBack: { flexDirection: "row", alignItems: "center", gap: 2, minWidth: 72 },
    reelsBackText: { color: st.text, fontWeight: "700" },
    reelsHeadTitle: { color: st.text, fontWeight: "800", fontSize: 17 },
    reelsEmpty: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: st.bg },
    composeBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
    composeSheet: {
      position: "absolute",
      left: 16,
      right: 16,
      bottom: 40,
      borderRadius: 16,
      backgroundColor: st.card,
      borderWidth: 1,
      borderColor: st.line,
      padding: 16,
      gap: 8
    },
    composeTitle: { color: st.text, fontWeight: "800", fontSize: 16, marginBottom: 4 },
    composeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 8
    },
    composeRowText: { color: st.text, fontWeight: "600", fontSize: 15 },
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
