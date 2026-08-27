import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewToken
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useIsFocused } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { apiDelete, apiGet, apiPost } from "../../auth/api";
import { AppVideo } from "../../components/AppVideo";
import { NativeCameraModal, type NativeCameraCapture } from "../../components/NativeCameraModal";
import { mediaUrl } from "../../lib/media";
import { MediaImage } from "../../lib/MediaImage";
import { pickFeedMedia, uploadCameraCapture } from "../../lib/nativeMediaPick";
import { shareSocialPost } from "../../lib/shareSocialPost";
import { EmptyState, GreenButton, StudentPage } from "../../student/layout";
import { bindFeedChrome, setFeedCreateMenuOpen, setFeedSearchOpen } from "../../student/feedChrome";
import { brand } from "../../student/brand";
import { formatClock, formatKm, formatPace } from "../../student/activity-geo";
import { ActivityRouteMap } from "../../student/ActivityRouteMap";
import { useStudent } from "../../student/StudentContext";
import { useSt, type StudentTokens } from "../../student/theme";
import type { FeedStackParamList } from "../../navigation/types";
import type { SocialAuthor, SocialPostRow, SocialStoryGalleryItem, SocialStoryRail } from "../../types";
import { FeedCommentsSheet } from "./FeedCommentsSheet";
import { galleryItemsToRail, StoryViewerModal } from "./StoryViewerModal";

type FeedMode = "for-you" | "following";
type MediaItem = { url: string; type: "IMAGE" | "VIDEO"; coverUrl?: string | null; localUri?: string };
type CreatePanel = "post" | "story" | "note" | null;
type FeedNav = NativeStackNavigationProp<FeedStackParamList>;
type ActiveLiveRail = {
  id: string;
  title: string;
  host: { id: string; name: string; avatarUrl?: string | null };
  isMine: boolean;
};

const MAX_MEDIA = 10;
const CAROUSEL_WIDTH = Dimensions.get("window").width - 32 - 28;

function liveIdFromPost(post: { mediaType?: string | null; mediaUrl?: string | null; body?: string | null }) {
  const tagged = post.body?.match(/\[\[LIVE:([^\]]+)\]\]/);
  if (tagged?.[1]) return tagged[1];
  if (post.mediaType === "LIVE" && post.mediaUrl) return post.mediaUrl;
  if (post.mediaUrl && !/[./]/.test(post.mediaUrl.replace(/^\//, "")) && post.mediaType !== "VIDEO") {
    return post.mediaUrl.replace(/^\//, "");
  }
  return null;
}

function isLiveCardPost(post: SocialPostRow, liveId: string | null) {
  return Boolean(liveId) && (post.mediaType === "LIVE" || post.mediaUrl?.replace(/^\//, "") === liveId);
}

function liveTitleFromPost(post: SocialPostRow) {
  return (
    post.body
      ?.replace(/^Ao vivo agora:\s*/i, "")
      .replace(/^Ao vivo:\s*/i, "")
      .replace(/\n?\[\[LIVE:[^\]]+\]\]/g, "")
      .trim() || ""
  );
}

function mediaItemsOf(post: SocialPostRow): MediaItem[] {
  const isLiveCard = isLiveCardPost(post, liveIdFromPost(post));
  return (
    post.mediaItems?.length
      ? post.mediaItems
      : post.mediaUrl && !isLiveCard
        ? [{ url: post.mediaUrl, type: post.mediaType === "VIDEO" ? "VIDEO" : "IMAGE", coverUrl: null }]
        : []
  ).map((item) => ({
    url: item.url,
    type: (item.type === "VIDEO" ? "VIDEO" : "IMAGE") as "IMAGE" | "VIDEO",
    coverUrl: "coverUrl" in item ? item.coverUrl : null
  }));
}

function postHasVideo(post: SocialPostRow) {
  return mediaItemsOf(post).some((item) => item.type === "VIDEO");
}

function PostMediaSlide({
  item,
  styles,
  active
}: {
  item: MediaItem;
  styles: ReturnType<typeof createStyles>;
  active: boolean;
}) {
  const uri = item.localUri || mediaUrl(item.url);
  const [paused, setPaused] = useState(false);
  const [ended, setEnded] = useState(false);
  const [muted, setMuted] = useState(true);
  const [restartKey, setRestartKey] = useState(0);

  useEffect(() => {
    // Sair da tela devolve o card ao estado inicial: sem áudio e pronto para tocar.
    if (!active) {
      setPaused(false);
      setEnded(false);
      setMuted(true);
    }
  }, [active]);

  useEffect(() => {
    setEnded(false);
  }, [uri]);

  if (item.type === "VIDEO") {
    if (!uri) {
      return (
        <View style={[styles.media, styles.mediaVideo]}>
          <Ionicons name="play-circle" size={42} color="#fff" />
          <Text style={styles.mediaVideoLabel}>Vídeo indisponível</Text>
        </View>
      );
    }
    const showOverlay = !active || paused || ended;
    return (
      <Pressable
        style={styles.media}
        onPress={() => {
          if (ended) {
            setEnded(false);
            setPaused(false);
            setRestartKey((value) => value + 1);
            return;
          }
          setPaused((value) => !value);
        }}
      >
        <AppVideo
          key={uri}
          uri={uri}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          playing={active && !paused && !ended}
          muted={muted}
          loop={false}
          poster={mediaUrl(item.coverUrl)}
          restartKey={restartKey}
          onEnd={() => setEnded(true)}
        />
        {showOverlay ? (
          <View style={styles.mediaVideoOverlay} pointerEvents="none">
            <Ionicons
              name={ended ? "refresh-circle" : "play-circle"}
              size={52}
              color="rgba(255,255,255,0.92)"
            />
          </View>
        ) : null}
        <Pressable style={styles.mediaMuteBtn} onPress={() => setMuted((value) => !value)} hitSlop={10}>
          <Ionicons name={muted ? "volume-mute" : "volume-high"} size={16} color="#fff" />
        </Pressable>
      </Pressable>
    );
  }

  return <MediaImage uri={item.localUri ?? item.url} style={styles.media} resizeMode="cover" />;
}

function PostMediaCarousel({
  items,
  styles,
  active
}: {
  items: MediaItem[];
  styles: ReturnType<typeof createStyles>;
  active: boolean;
}) {
  const [index, setIndex] = useState(0);
  if (!items.length) return null;
  if (items.length === 1) {
    return <PostMediaSlide item={items[0]} styles={styles} active={active} />;
  }

  return (
    <View style={styles.carouselWrap}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          const next = Math.round(event.nativeEvent.contentOffset.x / CAROUSEL_WIDTH);
          setIndex(Math.max(0, Math.min(items.length - 1, next)));
        }}
      >
        {items.map((item, itemIndex) => (
          <View key={`${item.url}-${itemIndex}`} style={{ width: CAROUSEL_WIDTH }}>
            <PostMediaSlide item={item} styles={styles} active={active && itemIndex === index} />
          </View>
        ))}
      </ScrollView>
      <View style={styles.carouselDots}>
        {items.map((item, dot) => (
          <View key={`${item.url}-dot-${dot}`} style={[styles.carouselDot, dot === index && styles.carouselDotOn]} />
        ))}
      </View>
      <Text style={styles.carouselCount}>
        {index + 1}/{items.length}
      </Text>
    </View>
  );
}

type FeedPostCardProps = {
  post: SocialPostRow;
  styles: ReturnType<typeof createStyles>;
  st: StudentTokens;
  menuOpen: boolean;
  mediaActive: boolean;
  onToggleMenu: (postId: string) => void;
  onOpenProfile: (userId: string, isMine: boolean) => void;
  onOpenDm: (userId: string, name: string) => void;
  onDelete: (postId: string) => void;
  onReport: (postId: string) => void;
  onOpenLive: (liveId: string, title: string, isMine: boolean) => void;
  onToggleLike: (postId: string) => void;
  onOpenComments: (postId: string) => void;
  onShare: (post: SocialPostRow) => void;
};

/**
 * Memoizado: sem isto, curtir um post rerenderizaria todos os players de vídeo
 * montados na lista.
 */
const FeedPostCard = memo(function FeedPostCard({
  post,
  styles,
  st,
  menuOpen,
  mediaActive,
  onToggleMenu,
  onOpenProfile,
  onOpenDm,
  onDelete,
  onReport,
  onOpenLive,
  onToggleLike,
  onOpenComments,
  onShare
}: FeedPostCardProps) {
  const liveId = liveIdFromPost(post);
  const isLiveCard = isLiveCardPost(post, liveId);
  const mediaItemsForPost = useMemo(() => mediaItemsOf(post), [post]);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Pressable style={styles.headAuthor} onPress={() => onOpenProfile(post.author.id, Boolean(post.isMine))}>
          <MediaImage uri={post.author.avatarUrl} style={styles.avatar} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{post.author.name}</Text>
            <Text style={styles.meta}>{new Date(post.createdAt).toLocaleString("pt-BR")}</Text>
          </View>
        </Pressable>
        {post.activity ? <Text style={styles.badge}>{post.activity.sportLabel}</Text> : null}
        <View style={styles.postMenuWrap}>
          <Pressable onPress={() => onToggleMenu(post.id)} hitSlop={8} accessibilityLabel="Opções">
            <Ionicons name="ellipsis-horizontal" size={18} color={st.muted} />
          </Pressable>
          {menuOpen ? (
            <View style={styles.postMenuPop}>
              {post.isMine ? (
                <Pressable style={styles.postMenuItem} onPress={() => onDelete(post.id)}>
                  <Ionicons name="trash-outline" size={14} color={st.text} />
                  <Text style={styles.postMenuText}>Apagar</Text>
                </Pressable>
              ) : (
                <>
                  <Pressable style={styles.postMenuItem} onPress={() => onOpenProfile(post.author.id, false)}>
                    <Ionicons name="person-outline" size={14} color={st.text} />
                    <Text style={styles.postMenuText}>Ver perfil</Text>
                  </Pressable>
                  <Pressable style={styles.postMenuItem} onPress={() => onOpenDm(post.author.id, post.author.name)}>
                    <Ionicons name="chatbubble-outline" size={14} color={st.text} />
                    <Text style={styles.postMenuText}>Mensagem</Text>
                  </Pressable>
                  <Pressable style={styles.postMenuItem} onPress={() => onReport(post.id)}>
                    <Ionicons name="flag-outline" size={14} color={st.text} />
                    <Text style={styles.postMenuText}>Denunciar</Text>
                  </Pressable>
                </>
              )}
            </View>
          ) : null}
        </View>
      </View>
      {post.body && !isLiveCard ? <Text style={styles.body}>{post.body}</Text> : null}
      {post.activity ? (
        <View style={styles.activityBlock}>
          {post.activity.polyline?.length ? (
            <ActivityRouteMap
              points={post.activity.polyline}
              height={168}
              mapType={
                post.activity.mapType === "satellite" || post.activity.mapType === "hybrid"
                  ? post.activity.mapType
                  : "standard"
              }
              is3d={Boolean(post.activity.is3d)}
            />
          ) : null}
          <View style={styles.stats}>
            <Text style={styles.stat} numberOfLines={1}>{formatKm(post.activity.distanceMeters)} km</Text>
            <Text style={styles.stat} numberOfLines={1}>{formatClock(post.activity.elapsedSeconds)}</Text>
            <Text style={styles.stat} numberOfLines={1}>
              {post.activity.sport === "RIDE" && post.activity.avgSpeedMps
                ? `${(post.activity.avgSpeedMps * 3.6).toFixed(1)} km/h`
                : `${formatPace(post.activity.avgPaceSecPerKm)} /km`}
            </Text>
          </View>
          <View style={styles.statsMuted}>
            <Text style={styles.statMuted} numberOfLines={1}>{post.activity.calories ?? 0} kcal</Text>
            <Text style={styles.statMuted} numberOfLines={1}>
              ↑ {Math.round(post.activity.elevationGainMeters ?? 0)} m
            </Text>
            {post.activity.sport === "RIDE" && post.activity.estimatedPowerWatts != null ? (
              <Text style={styles.statMuted}>{Math.round(post.activity.estimatedPowerWatts)} W</Text>
            ) : post.activity.stepsCount ? (
              <Text style={styles.statMuted}>{post.activity.stepsCount} passos</Text>
            ) : post.activity.avgCadenceSpm != null ? (
              <Text style={styles.statMuted}>{Math.round(post.activity.avgCadenceSpm)} spm</Text>
            ) : (
              <Text style={styles.statMuted}>
                {formatPace(post.activity.avgPaceSecPerKm)} /km
              </Text>
            )}
          </View>
        </View>
      ) : null}
      {isLiveCard && liveId ? (
        <Pressable
          style={styles.liveCard}
          onPress={() => onOpenLive(liveId, liveTitleFromPost(post) || "Ao vivo", Boolean(post.isMine))}
        >
          <Ionicons name="radio" size={22} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={styles.liveCardTitle}>AO VIVO</Text>
            <Text style={styles.liveCardBody} numberOfLines={2}>
              {liveTitleFromPost(post) || "Entrar na transmissão"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </Pressable>
      ) : (
        <PostMediaCarousel items={mediaItemsForPost} styles={styles} active={mediaActive} />
      )}
      <View style={styles.actionsRow}>
        <Pressable onPress={() => onToggleLike(post.id)} style={styles.actionBtn} accessibilityLabel="Curtir">
          <Ionicons
            name={post.likedByMe ? "thumbs-up" : "thumbs-up-outline"}
            size={18}
            color={post.likedByMe ? "#df663c" : st.muted}
          />
          <Text style={[styles.actionText, post.likedByMe && styles.actionTextOn]}>{post.likesCount}</Text>
        </Pressable>
        <Pressable onPress={() => onOpenComments(post.id)} style={styles.actionBtn} accessibilityLabel="Comentar">
          <Ionicons name="chatbubble-outline" size={18} color={st.muted} />
          <Text style={styles.actionText}>{post.commentsCount ?? post.comments.length}</Text>
        </Pressable>
        <Pressable onPress={() => onShare(post)} style={styles.actionBtn} accessibilityLabel="Compartilhar">
          <Ionicons name="share-social-outline" size={18} color={st.muted} />
        </Pressable>
      </View>
    </View>
  );
});

export function FeedScreen() {
  const { session } = useStudent();
  const navigation = useNavigation<FeedNav>();
  const isFocused = useIsFocused();
  const { st } = useSt();
  const styles = useMemo(() => createStyles(st), [st]);
  const [posts, setPosts] = useState<SocialPostRow[]>([]);
  const [people, setPeople] = useState<SocialAuthor[]>([]);
  const [rails, setRails] = useState<SocialStoryRail[]>([]);
  const [body, setBody] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [mode, setMode] = useState<FeedMode>("for-you");
  const [followingCount, setFollowingCount] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [createPanel, setCreatePanel] = useState<CreatePanel>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [storyCaption, setStoryCaption] = useState("");
  const [storyMedia, setStoryMedia] = useState<MediaItem | null>(null);
  const [viewer, setViewer] = useState<{ rail: number; item: number } | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryItems, setGalleryItems] = useState<SocialStoryGalleryItem[]>([]);
  const [galleryViewerIndex, setGalleryViewerIndex] = useState<number | null>(null);
  const [reportPostId, setReportPostId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [menuPostId, setMenuPostId] = useState<string | null>(null);
  const [activeLives, setActiveLives] = useState<ActiveLiveRail[]>([]);
  const [cameraSession, setCameraSession] = useState<{ kind: "photo" | "video"; forStory: boolean } | null>(null);
  const [activeVideoPostId, setActiveVideoPostId] = useState<string | null>(null);
  /** `query` fora das deps de `load`: digitar não pode disparar recarga do feed. */
  const queryRef = useRef("");
  /** Só a resposta da requisição mais recente pode escrever no estado. */
  const loadSeqRef = useRef(0);

  /**
   * FlatList exige referência estável em ambos — trocar em runtime dispara
   * "Changing onViewableItemsChanged on the fly is not supported".
   */
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60, minimumViewTime: 80 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const withVideo = viewableItems.find((entry) => entry.isViewable && postHasVideo(entry.item as SocialPostRow));
    setActiveVideoPostId((withVideo?.item as SocialPostRow | undefined)?.id ?? null);
  }).current;

  const openPeerProfile = useCallback(
    (userId: string, isMine = false) => {
      setMenuPostId(null);
      if (isMine) {
        navigation.getParent()?.navigate("MenuTab", { screen: "Profile" });
        return;
      }
      navigation.navigate("PeerProfile", { userId });
    },
    [navigation]
  );

  const openDm = useCallback(
    (userId: string, name: string) => {
      setMenuPostId(null);
      navigation.navigate("DirectMessage", { userId, name });
    },
    [navigation]
  );

  const loadStories = useCallback(async () => {
    const data = await apiGet<{ rails: SocialStoryRail[] }>("/student/social/stories", session.token);
    setRails(data.rails);
  }, [session.token]);

  const loadActiveLives = useCallback(async () => {
    try {
      const data = await apiGet<{ lives: ActiveLiveRail[] }>("/student/social/live", session.token);
      setActiveLives(data.lives);
    } catch {
      setActiveLives([]);
    }
  }, [session.token]);

  const loadGallery = useCallback(async () => {
    const data = await apiGet<{ items: SocialStoryGalleryItem[] }>("/student/social/stories/gallery", session.token);
    setGalleryItems(data.items);
  }, [session.token]);

  async function openGallery() {
    setGalleryOpen(true);
    try {
      await loadGallery();
    } catch {
      setGalleryItems([]);
    }
  }

  const galleryRail = useMemo(
    () => (galleryViewerIndex == null ? null : galleryItemsToRail(galleryItems, galleryViewerIndex)),
    [galleryItems, galleryViewerIndex]
  );

  const load = useCallback(
    async (nextMode = mode, nextPage = 0, append = false, search = queryRef.current) => {
      const requestId = ++loadSeqRef.current;
      setLoading(true);
      try {
        const [feed, peopleRes] = await Promise.all([
          apiGet<{ posts: SocialPostRow[]; hasMore: boolean; followingCount: number }>(
            `/student/social/posts?mode=${nextMode}&page=${nextPage}${search.trim() ? `&q=${encodeURIComponent(search.trim())}` : ""}`,
            session.token
          ),
          apiGet<{ people: SocialAuthor[] }>("/student/social/people", session.token)
        ]);
        if (requestId !== loadSeqRef.current) return;
        setPosts((current) => {
          if (!append) return feed.posts;
          const seen = new Set(current.map((post) => post.id));
          return [...current, ...feed.posts.filter((post) => !seen.has(post.id))];
        });
        if (!append) setActiveVideoPostId(null);
        setHasMore(Boolean(feed.hasMore));
        setFollowingCount(feed.followingCount ?? 0);
        setPage(nextPage);
        setPeople(peopleRes.people);
        setError(null);
      } catch (err) {
        if (requestId !== loadSeqRef.current) return;
        setError(err instanceof Error ? err.message : "Falha ao carregar o Feed.");
      } finally {
        if (requestId === loadSeqRef.current) setLoading(false);
      }
    },
    [mode, session.token]
  );

  useEffect(() => {
    void Promise.all([load(), loadStories(), loadActiveLives()]);
  }, [load, loadStories, loadActiveLives]);

  useEffect(() => {
    bindFeedChrome({
      openSearch: () => {
        setFeedCreateMenuOpen(false);
        setSearchOpen(true);
        setFeedSearchOpen(true);
      },
      closeSearch: () => {
        setSearchOpen(false);
        setFeedSearchOpen(false);
      },
      toggleSearch: () => {
        setFeedCreateMenuOpen(false);
        setSearchOpen((open) => {
          const next = !open;
          setFeedSearchOpen(next);
          return next;
        });
      },
      openPanel: (panel) => {
        setSearchOpen(false);
        setFeedSearchOpen(false);
        setCreatePanel(panel);
      },
      goReels: () => navigation.navigate("Reels"),
      goLive: () => navigation.navigate("Live")
    });
    return () => bindFeedChrome(null);
  }, [navigation]);

  useEffect(() => {
    if (isFocused) return;
    setSearchOpen(false);
    setFeedSearchOpen(false);
    setFeedCreateMenuOpen(false);
  }, [isFocused]);

  const liveHostIds = useMemo(() => new Set(activeLives.map((live) => live.host.id)), [activeLives]);
  const storyRailsVisible = useMemo(
    () => rails.filter((rail) => !liveHostIds.has(rail.userId) || rail.isMine),
    [liveHostIds, rails]
  );

  async function pickMedia(forStory = false) {
    try {
      setError(null);
      const remaining = forStory ? 1 : MAX_MEDIA - mediaItems.length;
      if (!forStory && remaining <= 0) {
        setError(`Limite de ${MAX_MEDIA} arquivos no carrossel.`);
        return;
      }
      const uploaded = await pickFeedMedia({
        token: session.token,
        forStory,
        remainingSlots: remaining
      });
      if (!uploaded.length) return;
      if (forStory) setStoryMedia(uploaded[0] ?? null);
      else setMediaItems((current) => [...current, ...uploaded].slice(0, MAX_MEDIA));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao abrir a galeria.");
    }
  }

  function openCamera(kind: "photo" | "video", forStory = false) {
    setError(null);
    if (!forStory && mediaItems.length >= MAX_MEDIA) {
      setError(`Limite de ${MAX_MEDIA} arquivos no carrossel.`);
      return;
    }
    setCameraSession({ kind, forStory });
  }

  async function onCameraCaptured(capture: NativeCameraCapture) {
    const forStory = Boolean(cameraSession?.forStory);
    setCameraSession(null);
    try {
      const item = await uploadCameraCapture({
        token: session.token,
        capture,
        forStory,
        fallbackBase: forStory ? "story-cam" : "camera"
      });
      if (!item) return;
      if (forStory) setStoryMedia(item);
      else setMediaItems((current) => [...current, item].slice(0, MAX_MEDIA));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar a captura.");
    }
  }

  async function publish() {
    if (!body.trim() && !mediaItems.length) return;
    const created = await apiPost<{ post: SocialPostRow }>(
      "/student/social/posts",
      {
        body: body.trim(),
        mediaItems: mediaItems.map((item) => ({ url: item.url, type: item.type })),
        mediaUrl: mediaItems[0]?.url,
        mediaType: mediaItems[0]?.type
      },
      session.token
    );
    setPosts((current) => [created.post, ...current]);
    setBody("");
    setMediaItems([]);
    setCreatePanel(null);
  }

  async function publishNote() {
    if (!noteBody.trim()) return;
    const created = await apiPost<{ post: SocialPostRow }>("/student/social/posts", { body: noteBody.trim() }, session.token);
    setPosts((current) => [created.post, ...current]);
    setNoteBody("");
    setCreatePanel(null);
  }

  const toggleLike = useCallback(
    async (id: string) => {
      try {
        const result = await apiPost<{ liked: boolean }>(`/student/social/posts/${id}/like`, {}, session.token);
        setPosts((current) =>
          current.map((post) => {
            if (post.id !== id) return post;
            const wasLiked = post.likedByMe;
            const wasDisliked = Boolean(post.dislikedByMe);
            return {
              ...post,
              likedByMe: result.liked,
              dislikedByMe: false,
              likesCount: Math.max(0, post.likesCount + (result.liked ? 1 : wasLiked ? -1 : 0)),
              dislikesCount: Math.max(0, (post.dislikesCount ?? 0) - (wasDisliked ? 1 : 0))
            };
          })
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível curtir agora.");
      }
    },
    [session.token]
  );

  const sharePost = useCallback(async (post: SocialPostRow) => {
    try {
      await shareSocialPost(post);
    } catch {
      // usuário cancelou
    }
  }, []);

  const openCommentsSheet = useCallback((postId: string) => {
    setMenuPostId(null);
    setCommentsPostId(postId);
  }, []);

  function bumpCommentsCount(postId: string, delta: number) {
    setPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? { ...post, commentsCount: Math.max(0, (post.commentsCount ?? post.comments.length) + delta) }
          : post
      )
    );
  }

  async function toggleFollow(id: string) {
    const result = await apiPost<{ following: boolean }>(`/student/social/users/${id}/follow`, {}, session.token);
    setPeople((current) => current.map((person) => (person.id === id ? { ...person, following: result.following } : person)));
    setFollowingCount((count) => Math.max(0, count + (result.following ? 1 : -1)));
  }

  const deletePost = useCallback(
    async (id: string) => {
      setMenuPostId(null);
      try {
        await apiDelete(`/student/social/posts/${id}`, session.token);
        setPosts((current) => current.filter((post) => post.id !== id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível apagar a publicação.");
      }
    },
    [session.token]
  );

  const togglePostMenu = useCallback((postId: string) => {
    setMenuPostId((current) => (current === postId ? null : postId));
  }, []);

  const startReport = useCallback((postId: string) => {
    setMenuPostId(null);
    setReportPostId(postId);
  }, []);

  const openLiveRoom = useCallback(
    (liveId: string, title: string, isMine: boolean) => {
      navigation.navigate("LiveRoom", { mode: isMine ? "host" : "viewer", liveId, title });
    },
    [navigation]
  );

  async function reportPost() {
    if (!reportPostId || reportReason.trim().length < 3) return;
    await apiPost(`/student/social/posts/${reportPostId}/report`, { reason: reportReason.trim() }, session.token);
    setReportPostId(null);
    setReportReason("");
  }

  async function publishStory() {
    if (!storyMedia) return;
    await apiPost(
      "/student/social/stories",
      {
        mediaUrl: storyMedia.url,
        mediaType: storyMedia.type,
        caption: storyCaption.trim() || undefined
      },
      session.token
    );
    setCreatePanel(null);
    setStoryCaption("");
    setStoryMedia(null);
    await loadStories();
  }

  const suggestions = people.filter((person) => !person.following).slice(0, 8);
  /** Nenhum vídeo do feed toca com um overlay aberto por cima. */
  const mediaEnabled = isFocused && !commentsPostId && !viewer && createPanel == null;

  const renderPost = useCallback(
    ({ item }: { item: SocialPostRow }) => (
      <FeedPostCard
        post={item}
        styles={styles}
        st={st}
        menuOpen={menuPostId === item.id}
        mediaActive={mediaEnabled && activeVideoPostId === item.id}
        onToggleMenu={togglePostMenu}
        onOpenProfile={openPeerProfile}
        onOpenDm={openDm}
        onDelete={deletePost}
        onReport={startReport}
        onOpenLive={openLiveRoom}
        onToggleLike={toggleLike}
        onOpenComments={openCommentsSheet}
        onShare={sharePost}
      />
    ),
    [
      activeVideoPostId,
      deletePost,
      mediaEnabled,
      menuPostId,
      openCommentsSheet,
      openDm,
      openLiveRoom,
      openPeerProfile,
      sharePost,
      st,
      startReport,
      styles,
      toggleLike,
      togglePostMenu
    ]
  );

  const listHeader = (
    <>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {searchOpen ? (
        <View style={styles.searchRow}>
          <TextInput
            value={query}
            onChangeText={(text) => {
              queryRef.current = text;
              setQuery(text);
            }}
            onSubmitEditing={() => void load(mode, 0, false, query)}
            placeholder="Buscar publicações ou pessoas"
            placeholderTextColor={st.faint}
            style={[styles.input, styles.searchInput]}
            autoFocus
          />
          <Pressable
            onPress={() => {
              setSearchOpen(false);
              setFeedSearchOpen(false);
              queryRef.current = "";
              setQuery("");
              void load(mode, 0, false, "");
            }}
            style={styles.searchClose}
            accessibilityLabel="Fechar pesquisa"
            hitSlop={8}
          >
            <Ionicons name="close" size={20} color={st.muted} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.stories}>
        <View style={styles.storiesHead}>
          <View>
            <Text style={styles.sectionTitle}>Momentos</Text>
            <Text style={styles.meta}>Somem em 24h</Text>
          </View>
          <Pressable onPress={() => void openGallery()} hitSlop={8}>
            <Text style={styles.galleryLink}>Galeria</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          <Pressable
            style={styles.storyAdd}
            onPress={() => {
              setStoryCaption("");
              setStoryMedia(null);
              setCreatePanel("story");
            }}
          >
            <View style={[styles.storyCircle, styles.storyAddCircle]}>
              <Ionicons name="add" size={28} color={st.coral} />
            </View>
            <Text style={styles.storyName} numberOfLines={2}>
              Seu momento
            </Text>
          </Pressable>
          {activeLives.map((live) => (
            <Pressable
              key={`live-${live.id}`}
              style={styles.storyAdd}
              onPress={() =>
                navigation.navigate("LiveRoom", {
                  mode: live.isMine ? "host" : "viewer",
                  liveId: live.id,
                  title: live.title
                })
              }
            >
              <MediaImage
                uri={live.host.avatarUrl}
                style={[styles.storyCircle, styles.storyLive]}
                fallback={<Ionicons name="radio" size={22} color="#fff" />}
              />
              <Text style={styles.storyName} numberOfLines={1}>
                {live.isMine ? "Você · live" : live.host.name.split(" ")[0]}
              </Text>
            </Pressable>
          ))}
          {storyRailsVisible.map((rail) => {
            const index = rails.findIndex((row) => row.userId === rail.userId);
            return (
              <Pressable key={rail.userId} style={styles.storyAdd} onPress={() => setViewer({ rail: Math.max(0, index), item: 0 })}>
                <MediaImage
                  uri={rail.image_url}
                  style={[styles.storyCircle, (rail.unseen || rail.isMine) && styles.storyHot]}
                />
                <Text style={styles.storyName} numberOfLines={1}>
                  {rail.isMine ? "Você" : rail.username.split(" ")[0]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {createPanel === "post" ? (
        <View style={styles.composer}>
          <View style={styles.composerHead}>
            <Text style={styles.sectionTitle}>Publicar</Text>
            <Pressable onPress={() => setCreatePanel(null)}>
              <Ionicons name="close" size={20} color={st.muted} />
            </Pressable>
          </View>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Escreva algo ou publique fotos e vídeos..."
            placeholderTextColor={st.faint}
            style={styles.input}
            multiline
          />
          {mediaItems.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {mediaItems.map((item) => (
                <View key={item.url} style={styles.thumbWrap}>
                  <MediaImage uri={item.localUri ?? item.url} style={styles.thumb} />
                  {item.type === "VIDEO" ? (
                    <View style={styles.thumbBadge}>
                      <Ionicons name="videocam" size={12} color="#fff" />
                    </View>
                  ) : null}
                  <Pressable
                    style={styles.thumbRemove}
                    onPress={() => setMediaItems((current) => current.filter((row) => row.url !== item.url))}
                  >
                    <Ionicons name="close" size={12} color="#fff" />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}
          {mediaItems.length > 1 ? <Text style={styles.meta}>Carrossel · {mediaItems.length} itens</Text> : null}
          <View style={styles.row}>
            <Pressable style={styles.chip} onPress={() => void pickMedia(false)} disabled={mediaItems.length >= MAX_MEDIA}>
              <Ionicons name="images-outline" size={16} color={st.text} />
              <Text style={styles.chipText}>Mídia</Text>
            </Pressable>
            <Pressable style={styles.chip} onPress={() => openCamera("photo")} disabled={mediaItems.length >= MAX_MEDIA}>
              <Ionicons name="camera-outline" size={16} color={st.text} />
              <Text style={styles.chipText}>Câmera</Text>
            </Pressable>
            <Pressable style={styles.chip} onPress={() => openCamera("video")} disabled={mediaItems.length >= MAX_MEDIA}>
              <Ionicons name="videocam-outline" size={16} color={st.text} />
              <Text style={styles.chipText}>Vídeo</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            <GreenButton
              label={mediaItems.length > 1 ? `Publicar · ${mediaItems.length}` : "Publicar"}
              onPress={() => void publish()}
            />
          </View>
        </View>
      ) : null}

      <View style={[styles.row, { paddingHorizontal: 16 }]}>
        <Pressable style={[styles.chip, mode === "for-you" && styles.chipOn]} onPress={() => { setMode("for-you"); void load("for-you", 0, false); }}>
          <Text style={styles.chipText}>Para você</Text>
        </Pressable>
        <Pressable style={[styles.chip, mode === "following" && styles.chipOn]} onPress={() => { setMode("following"); void load("following", 0, false); }}>
          <Text style={styles.chipText}>Seguindo ({followingCount})</Text>
        </Pressable>
      </View>

      {suggestions.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.people}>
          {suggestions.map((person) => (
            <Pressable key={person.id} style={styles.person} onPress={() => openPeerProfile(person.id)}>
              <MediaImage uri={person.avatarUrl} style={styles.avatar} />
              <Text style={styles.personName} numberOfLines={1}>
                {person.name.split(" ")[0]}
              </Text>
              <Pressable
                onPress={(event) => {
                  event.stopPropagation?.();
                  void toggleFollow(person.id);
                }}
              >
                <Text style={styles.follow}>{brand.followAthletes}</Text>
              </Pressable>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

    </>
  );

  return (
    <StudentPage chrome={isFocused} scroll={false}>
      <FlatList
        data={posts}
        keyExtractor={(post) => post.id}
        renderItem={renderPost}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <EmptyState icon="newspaper-outline" title={brand.feedEmptyTitle} text={brand.feedEmptyText} />
        }
        ListFooterComponent={
          hasMore ? (
            <Pressable
              style={[styles.chip, { alignSelf: "center", marginBottom: 20 }, loading && { opacity: 0.5 }]}
              disabled={loading}
              onPress={() => void load(mode, page + 1, true)}
            >
              <Text style={styles.chipText}>{loading ? "Carregando..." : "Carregar mais"}</Text>
            </Pressable>
          ) : null
        }
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void Promise.all([load(), loadStories(), loadActiveLives()])}
            tintColor={st.gold}
          />
        }
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        extraData={renderPost}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={7}
        // O menu "..." é absoluto e transborda o card: clipar cortaria o popup.
        removeClippedSubviews={false}
      />

      <Modal visible={createPanel === "story"} transparent animationType="slide" onRequestClose={() => setCreatePanel(null)}>
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              setCreatePanel(null);
              setStoryMedia(null);
              setStoryCaption("");
            }}
          />
          <View style={[styles.modalInner, storyMedia ? styles.modalInnerFilled : styles.modalInnerSheet]}>
            <View style={styles.composerHead}>
              <Text style={styles.sectionTitle}>Novo momento</Text>
              <Pressable
                onPress={() => {
                  setCreatePanel(null);
                  setStoryMedia(null);
                  setStoryCaption("");
                }}
                hitSlop={8}
              >
                <Ionicons name="close" size={22} color={st.muted} />
              </Pressable>
            </View>
            <View style={styles.modalBody}>
              {!storyMedia ? <Text style={styles.meta}>Foto ou vídeo curto. Some em 24 horas.</Text> : null}
              {storyMedia ? (
                storyMedia.type === "VIDEO" ? (
                  <AppVideo
                    uri={storyMedia.localUri ?? mediaUrl(storyMedia.url) ?? storyMedia.url}
                    style={styles.storyPreview}
                    contentFit="contain"
                    playing={createPanel === "story"}
                    loop
                    muted
                  />
                ) : (
                  <MediaImage
                    uri={storyMedia.localUri ?? storyMedia.url}
                    style={styles.storyPreview}
                    resizeMode="contain"
                  />
                )
              ) : null}
            </View>
            <View style={styles.storyActions}>
              <Pressable style={styles.storyActionChip} onPress={() => void pickMedia(true)}>
                <Ionicons name="images-outline" size={16} color={st.text} />
                <Text style={styles.chipText}>Galeria</Text>
              </Pressable>
              <Pressable style={styles.storyActionChip} onPress={() => openCamera("photo", true)}>
                <Ionicons name="camera-outline" size={16} color={st.text} />
                <Text style={styles.chipText}>Câmera</Text>
              </Pressable>
              <Pressable style={styles.storyActionChip} onPress={() => openCamera("video", true)}>
                <Ionicons name="videocam-outline" size={16} color={st.text} />
                <Text style={styles.chipText}>Vídeo</Text>
              </Pressable>
            </View>
            <TextInput
              value={storyCaption}
              onChangeText={setStoryCaption}
              placeholder="Legenda (opcional)"
              placeholderTextColor={st.faint}
              style={styles.input}
              maxLength={120}
            />
            <GreenButton label="Publicar momento" onPress={() => void publishStory()} />
          </View>
        </View>
      </Modal>
      <Modal visible={createPanel === "note"} transparent animationType="slide" onRequestClose={() => setCreatePanel(null)}>
        <Pressable style={styles.backdrop} onPress={() => setCreatePanel(null)} />
        <View style={styles.sheet}>
          <Text style={styles.sectionTitle}>Nota</Text>
          <TextInput
            value={noteBody}
            onChangeText={setNoteBody}
            placeholder="Escreva uma nota rápida..."
            placeholderTextColor={st.faint}
            style={styles.input}
            multiline
            autoFocus
          />
          <GreenButton label="Publicar nota" onPress={() => void publishNote()} />
        </View>
      </Modal>

      <Modal visible={Boolean(reportPostId)} transparent animationType="slide" onRequestClose={() => setReportPostId(null)}>
        <Pressable style={styles.backdrop} onPress={() => setReportPostId(null)} />
        <View style={styles.sheet}>
          <Text style={styles.sectionTitle}>Denunciar</Text>
          <TextInput value={reportReason} onChangeText={setReportReason} placeholder="Motivo" style={styles.input} multiline />
          <GreenButton label="Enviar denúncia" onPress={() => void reportPost()} />
        </View>
      </Modal>

      <Modal visible={galleryOpen} transparent animationType="slide" onRequestClose={() => setGalleryOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setGalleryOpen(false)} />
        <View style={[styles.sheet, styles.gallerySheet]}>
          <View style={styles.composerHead}>
            <Text style={styles.sectionTitle}>Galeria</Text>
            <Pressable onPress={() => setGalleryOpen(false)}>
              <Ionicons name="close" size={20} color={st.muted} />
            </Pressable>
          </View>
          <Text style={styles.meta}>Momentos salvos não expiram. Os ativos somem em 24h.</Text>
          {galleryItems.length === 0 ? (
            <EmptyState icon="images-outline" title="Galeria vazia" text="Salve um momento seu para guardar aqui." />
          ) : (
            <ScrollView contentContainerStyle={styles.galleryGrid}>
              {galleryItems.map((entry, index) => {
                const thumb = entry.coverUrl || (String(entry.mediaType).toUpperCase() === "IMAGE" ? entry.mediaUrl : entry.coverUrl) || entry.mediaUrl;
                return (
                  <Pressable key={entry.id} style={styles.galleryTile} onPress={() => setGalleryViewerIndex(index)}>
                    {String(entry.mediaType).toUpperCase() === "VIDEO" && !entry.coverUrl ? (
                      <View style={[styles.galleryThumb, styles.mediaVideo]}>
                        <Ionicons name="play-circle" size={28} color="#fff" />
                      </View>
                    ) : (
                      <MediaImage uri={thumb} style={styles.galleryThumb} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      </Modal>

      <FeedCommentsSheet
        visible={Boolean(commentsPostId)}
        postId={commentsPostId}
        token={session.token}
        fallbackComments={posts.find((post) => post.id === commentsPostId)?.comments ?? []}
        onClose={() => setCommentsPostId(null)}
        onCountChange={bumpCommentsCount}
      />

      <StoryViewerModal
        visible={Boolean(viewer)}
        rails={rails}
        startRail={viewer?.rail ?? 0}
        startItem={viewer?.item ?? 0}
        token={session.token}
        onClose={() => {
          setViewer(null);
          void loadStories();
        }}
        onSaved={() => void loadGallery()}
      />

      <StoryViewerModal
        visible={Boolean(galleryRail)}
        rails={galleryRail ? [galleryRail] : []}
        startRail={0}
        startItem={galleryViewerIndex ?? 0}
        token={session.token}
        archiveMode
        onClose={() => setGalleryViewerIndex(null)}
      />

      <NativeCameraModal
        visible={Boolean(cameraSession)}
        mode={cameraSession?.kind ?? "photo"}
        allowModeSwitch
        onClose={() => setCameraSession(null)}
        onCaptured={(capture) => void onCameraCaptured(capture)}
      />
    </StudentPage>
  );
}

function createStyles(st: StudentTokens) {
  return StyleSheet.create({
    /** Espelha o contentContainerStyle que o StudentPage aplica no modo scroll. */
    list: { paddingBottom: 28, gap: 12 },
    toolbar: { paddingHorizontal: 12, paddingTop: 0, alignItems: "flex-end", zIndex: 5, minHeight: 0 },
    toolbarActions: { flexDirection: "row", alignItems: "center", gap: 2 },
    iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
    composer: { margin: 16, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: st.line, backgroundColor: st.card, gap: 10 },
    composerHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 4
    },
    searchInput: { flex: 1, marginHorizontal: 0 },
    searchClose: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: st.fill
    },
    input: { color: st.text, borderWidth: 1, borderColor: st.line, borderRadius: 12, padding: 10, backgroundColor: st.inputBg },
    row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
    actionsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 16,
      marginTop: 2
    },
    actionBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 2
    },
    actionText: { color: st.muted, fontWeight: "700", fontSize: 13 },
    actionTextOn: { color: "#df663c" },
    chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: st.line, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: st.fill },
    chipOn: { backgroundColor: "#f2b461", borderColor: "transparent" },
    chipText: { color: st.text, fontWeight: "800", fontSize: 12 },
    thumbWrap: { width: 84, height: 84, borderRadius: 12, overflow: "hidden" },
    thumb: { width: "100%", height: "100%" },
    thumbBadge: {
      position: "absolute",
      left: 6,
      bottom: 6,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: "rgba(0,0,0,0.55)",
      alignItems: "center",
      justifyContent: "center"
    },
    thumbRemove: { position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center" },
    people: { flexDirection: "row", gap: 8, paddingHorizontal: 16 },
    person: { width: 84, alignItems: "center", gap: 4, padding: 8, borderRadius: 14, borderWidth: 1, borderColor: st.line, backgroundColor: st.card },
    personName: { color: st.text, fontWeight: "800", fontSize: 12 },
    follow: { color: st.goldUi, fontSize: 11, fontWeight: "800" },
    card: { marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: st.line, backgroundColor: st.card, gap: 8 },
    head: { flexDirection: "row", alignItems: "center", gap: 10 },
    headAuthor: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
    avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: st.avatarBg },
    name: { color: st.text, fontWeight: "800" },
    meta: { color: st.muted, fontSize: 12 },
    badge: { color: st.coral, fontWeight: "800", fontSize: 12 },
    postMenuWrap: { position: "relative", zIndex: 4 },
    postMenuPop: {
      position: "absolute",
      top: 28,
      right: 0,
      minWidth: 160,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: st.line,
      backgroundColor: st.card,
      paddingVertical: 6,
      shadowColor: "#000",
      shadowOpacity: 0.14,
      shadowRadius: 12,
      elevation: 6
    },
    postMenuItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10
    },
    postMenuText: { color: st.text, fontWeight: "700", fontSize: 13 },
    body: { color: st.text, lineHeight: 20 },
    activityBlock: { gap: 8 },
    stats: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
    statsMuted: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    stat: { flex: 1, minWidth: 0, color: st.text, fontWeight: "800" },
    statMuted: { color: st.muted, fontWeight: "700", fontSize: 12 },
    media: {
      width: "100%",
      aspectRatio: 4 / 5,
      borderRadius: 12,
      backgroundColor: "#111",
      overflow: "hidden"
    },
    mediaVideo: { alignItems: "center", justifyContent: "center", gap: 6 },
    mediaVideoLabel: { color: "#fff", fontWeight: "800" },
    mediaVideoOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.22)"
    },
    mediaMuteBtn: {
      position: "absolute",
      right: 10,
      bottom: 10,
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.5)"
    },
    carouselWrap: { position: "relative" },
    carouselDots: { flexDirection: "row", justifyContent: "center", gap: 5, marginTop: 8 },
    carouselDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(21,26,34,0.25)" },
    carouselDotOn: { width: 16, backgroundColor: st.coral },
    carouselCount: {
      position: "absolute",
      top: 10,
      right: 10,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      overflow: "hidden",
      backgroundColor: "rgba(0,0,0,0.55)",
      color: "#fff",
      fontSize: 11,
      fontWeight: "700"
    },
    comment: { color: st.text, fontSize: 13 },
    error: { color: st.danger, marginHorizontal: 16, fontWeight: "700" },
    stories: { marginHorizontal: 16, marginTop: 8, marginBottom: 4, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: st.line, backgroundColor: st.card, gap: 8 },
    storiesHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    galleryLink: { color: st.coral, fontWeight: "800", fontSize: 13 },
    gallerySheet: { maxHeight: "78%" },
    galleryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 8, paddingBottom: 24 },
    galleryTile: { width: "31%", aspectRatio: 1, borderRadius: 12, overflow: "hidden", backgroundColor: "#111" },
    galleryThumb: { width: "100%", height: "100%" },
    sectionTitle: { color: st.text, fontWeight: "800", fontSize: 15 },
    storyAdd: { width: 76, alignItems: "center", gap: 6 },
    storyCircle: { width: 58, height: 58, borderRadius: 29, backgroundColor: st.fill, alignItems: "center", justifyContent: "center" },
    storyAddCircle: {
      borderWidth: 2,
      borderColor: "#df663c",
      backgroundColor: st.fill
    },
    storyHot: { borderWidth: 2, borderColor: "#df663c" },
    storyLive: { borderWidth: 2, borderColor: "#df663c", backgroundColor: "#5a1d12" },
    liveCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 14,
      borderRadius: 14,
      backgroundColor: "#df663c"
    },
    liveCardTitle: { color: "#fff", fontWeight: "900", fontSize: 12, letterSpacing: 0.6 },
    liveCardBody: { color: "#fff", fontWeight: "700", marginTop: 2 },
    storyName: { color: st.text, fontSize: 11, fontWeight: "700", maxWidth: 76, textAlign: "center", lineHeight: 14 },
    plus: { fontSize: 24, color: st.coral, fontWeight: "800" },
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
    sheet: { backgroundColor: st.card, padding: 16, gap: 10, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(8, 10, 14, 0.58)"
    },
    modalRoot: {
      flex: 1,
      justifyContent: "flex-end"
    },
    modalCard: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: "center",
      alignItems: "center",
      padding: 16
    },
    modalInner: {
      width: "100%",
      backgroundColor: st.card,
      borderWidth: 1,
      borderColor: st.line,
      padding: 16,
      gap: 10
    },
    modalInnerSheet: {
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingBottom: 20,
      maxHeight: "92%"
    },
    modalInnerFilled: {
      flex: 1,
      borderRadius: 0,
      borderWidth: 0,
      maxHeight: "100%",
      paddingTop: 48
    },
    modalBody: {
      flexGrow: 1,
      flexShrink: 1,
      minHeight: 0,
      gap: 8
    },
    storyActions: {
      flexDirection: "row",
      gap: 8
    },
    storyActionChip: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      borderWidth: 1,
      borderColor: st.line,
      backgroundColor: st.fill,
      borderRadius: 999,
      paddingVertical: 8,
      paddingHorizontal: 6
    },
    storyPreview: {
      width: "100%",
      flexGrow: 1,
      flexShrink: 1,
      minHeight: 180,
      borderRadius: 16,
      backgroundColor: "#0b0d12"
    },
    viewer: { flex: 1, backgroundColor: "#000", justifyContent: "center", padding: 16 },
    viewerClose: { position: "absolute", top: 48, right: 20, zIndex: 2 },
    viewerTitle: { color: "#fff", fontWeight: "800", marginBottom: 12 },
    viewerMedia: { width: "100%", height: "70%", borderRadius: 12 },
    viewerCaption: { color: "#fff", marginTop: 12 }
  });
}
