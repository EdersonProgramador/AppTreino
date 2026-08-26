import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import { ResizeMode, Video } from "expo-av";
import { apiDelete, apiGet, apiPost, apiUploadFile } from "../../auth/api";
import { mediaUrl } from "../../lib/media";
import { EmptyState, GreenButton, StudentPage } from "../../student/layout";
import { bindFeedChrome } from "../../student/feedChrome";
import { brand } from "../../student/brand";
import { formatClock, formatKm, formatPace } from "../../student/activity-geo";
import { useStudent } from "../../student/StudentContext";
import { useSt, type StudentTokens } from "../../student/theme";
import type { FeedStackParamList } from "../../navigation/types";
import type { SocialAuthor, SocialPostRow, SocialStoryGalleryItem, SocialStoryRail } from "../../types";
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

function PostMediaSlide({
  item,
  styles,
  active
}: {
  item: MediaItem;
  styles: ReturnType<typeof createStyles>;
  active: boolean;
}) {
  const uri = mediaUrl(item.url);
  const poster = item.coverUrl ? mediaUrl(item.coverUrl) : undefined;

  if (item.type === "VIDEO") {
    if (!uri) {
      return (
        <View style={[styles.media, styles.mediaVideo]}>
          <Ionicons name="play-circle" size={42} color="#fff" />
          <Text style={styles.mediaVideoLabel}>Vídeo indisponível</Text>
        </View>
      );
    }
    return (
      <Video
        key={uri}
        source={{ uri }}
        posterSource={poster ? { uri: poster } : undefined}
        style={styles.media}
        resizeMode={ResizeMode.COVER}
        useNativeControls
        shouldPlay={false}
        isLooping={false}
        isMuted={!active}
      />
    );
  }

  return uri ? <Image source={{ uri }} style={styles.media} resizeMode="cover" /> : <View style={styles.media} />;
}

function PostMediaCarousel({
  items,
  styles
}: {
  items: MediaItem[];
  styles: ReturnType<typeof createStyles>;
}) {
  const [index, setIndex] = useState(0);
  if (!items.length) return null;
  if (items.length === 1) {
    return <PostMediaSlide item={items[0]} styles={styles} active />;
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
            <PostMediaSlide item={item} styles={styles} active={itemIndex === index} />
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

export function FeedScreen() {
  const { session } = useStudent();
  const navigation = useNavigation<FeedNav>();
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
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
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
  const [activeLives, setActiveLives] = useState<ActiveLiveRail[]>([]);

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
    async (nextMode = mode, nextPage = 0, append = false, search = query) => {
      setLoading(true);
      try {
        const [feed, peopleRes] = await Promise.all([
          apiGet<{ posts: SocialPostRow[]; hasMore: boolean; followingCount: number }>(
            `/student/social/posts?mode=${nextMode}&page=${nextPage}${search.trim() ? `&q=${encodeURIComponent(search.trim())}` : ""}`,
            session.token
          ),
          apiGet<{ people: SocialAuthor[] }>("/student/social/people", session.token)
        ]);
        setPosts((current) => (append ? [...current, ...feed.posts] : feed.posts));
        setHasMore(Boolean(feed.hasMore));
        setFollowingCount(feed.followingCount ?? 0);
        setPage(nextPage);
        setPeople(peopleRes.people);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao carregar o Feed.");
      } finally {
        setLoading(false);
      }
    },
    [mode, query, session.token]
  );

  useEffect(() => {
    void Promise.all([load(), loadStories(), loadActiveLives()]);
  }, [load, loadStories, loadActiveLives]);

  useEffect(() => {
    const openCreate = () => {
      setSearchOpen(false);
      setCreateMenuOpen(true);
    };
    const openSearch = () => {
      setCreateMenuOpen(false);
      setSearchOpen(true);
    };
    bindFeedChrome({
      toggleCreate: () => {
        setSearchOpen(false);
        setCreateMenuOpen((open) => !open);
      },
      openCreate,
      toggleSearch: () => {
        setCreateMenuOpen(false);
        setSearchOpen((open) => !open);
      },
      openSearch
    });
    return () => bindFeedChrome(null);
  }, []);

  const liveHostIds = useMemo(() => new Set(activeLives.map((live) => live.host.id)), [activeLives]);
  const storyRailsVisible = useMemo(
    () => rails.filter((rail) => !liveHostIds.has(rail.userId) || rail.isMine),
    [liveHostIds, rails]
  );

  async function pickMedia(forStory = false) {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.8,
      allowsMultipleSelection: !forStory,
      selectionLimit: forStory ? 1 : MAX_MEDIA - mediaItems.length
    });
    if (result.canceled || !result.assets.length) return;
    const uploaded: MediaItem[] = [];
    for (const asset of result.assets.slice(0, forStory ? 1 : MAX_MEDIA - mediaItems.length)) {
      const isVideo = asset.type === "video" || Boolean(asset.duration);
      const filename = isVideo ? "feed.mp4" : "feed.jpg";
      const file = await apiUploadFile<{ file: { url: string } }>(
        "/student/social/uploads",
        asset.uri,
        session.token,
        filename
      );
      uploaded.push({ url: file.file.url, type: isVideo ? "VIDEO" : "IMAGE", localUri: asset.uri });
    }
    if (forStory) setStoryMedia(uploaded[0] ?? null);
    else setMediaItems((current) => [...current, ...uploaded].slice(0, MAX_MEDIA));
  }

  async function captureMedia(kind: "photo" | "video", forStory = false) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Permita o acesso à câmera para capturar.");
      return;
    }
    if (!forStory && mediaItems.length >= MAX_MEDIA) {
      setError(`Limite de ${MAX_MEDIA} arquivos no carrossel.`);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: kind === "video" ? ["videos"] : ["images"],
      quality: 0.85,
      videoMaxDuration: 60
    });
    if (result.canceled || !result.assets.length) return;
    const asset = result.assets[0];
    const isVideo = kind === "video" || asset.type === "video";
    const file = await apiUploadFile<{ file: { url: string } }>(
      "/student/social/uploads",
      asset.uri,
      session.token,
      isVideo ? "camera.mp4" : "camera.jpg"
    );
    const item: MediaItem = { url: file.file.url, type: isVideo ? "VIDEO" : "IMAGE", localUri: asset.uri };
    if (forStory) setStoryMedia(item);
    else setMediaItems((current) => [...current, item].slice(0, MAX_MEDIA));
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

  async function toggleLike(id: string) {
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
  }

  async function toggleDislike(id: string) {
    const result = await apiPost<{ disliked: boolean }>(`/student/social/posts/${id}/dislike`, {}, session.token);
    setPosts((current) =>
      current.map((post) => {
        if (post.id !== id) return post;
        const wasLiked = post.likedByMe;
        const wasDisliked = Boolean(post.dislikedByMe);
        return {
          ...post,
          dislikedByMe: result.disliked,
          likedByMe: false,
          dislikesCount: Math.max(0, (post.dislikesCount ?? 0) + (result.disliked ? 1 : wasDisliked ? -1 : 0)),
          likesCount: Math.max(0, post.likesCount - (wasLiked ? 1 : 0))
        };
      })
    );
  }

  async function sendComment(id: string) {
    const text = commentDraft[id]?.trim();
    if (!text) return;
    const result = await apiPost<{ comment: SocialPostRow["comments"][number] }>(
      `/student/social/posts/${id}/comments`,
      { body: text },
      session.token
    );
    setCommentDraft((current) => ({ ...current, [id]: "" }));
    setPosts((current) =>
      current.map((post) =>
        post.id === id
          ? { ...post, comments: [...post.comments, result.comment], commentsCount: (post.commentsCount ?? post.comments.length) + 1 }
          : post
      )
    );
  }

  async function toggleFollow(id: string) {
    const result = await apiPost<{ following: boolean }>(`/student/social/users/${id}/follow`, {}, session.token);
    setPeople((current) => current.map((person) => (person.id === id ? { ...person, following: result.following } : person)));
    setFollowingCount((count) => Math.max(0, count + (result.following ? 1 : -1)));
  }

  async function deletePost(id: string) {
    await apiDelete(`/student/social/posts/${id}`, session.token);
    setPosts((current) => current.filter((post) => post.id !== id));
  }

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

  return (
    <StudentPage
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => void Promise.all([load(), loadStories(), loadActiveLives()])}
          tintColor={st.gold}
        />
      }
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal
        visible={createMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateMenuOpen(false)}
      >
        <Pressable style={styles.createMenuBackdrop} onPress={() => setCreateMenuOpen(false)}>
          <Pressable style={styles.createMenu} onPress={() => undefined}>
            <Pressable
              style={styles.createItem}
              onPress={() => {
                setCreateMenuOpen(false);
                setCreatePanel("post");
              }}
            >
              <Ionicons name="create-outline" size={20} color={st.text} />
              <Text style={styles.createLabel}>Publicar</Text>
            </Pressable>
            <Pressable
              style={styles.createItem}
              onPress={() => {
                setCreateMenuOpen(false);
                setCreatePanel("story");
              }}
            >
              <Ionicons name="add-circle-outline" size={20} color={st.text} />
              <Text style={styles.createLabel}>Momento</Text>
            </Pressable>
            <Pressable
              style={styles.createItem}
              onPress={() => {
                setCreateMenuOpen(false);
                navigation.navigate("Reels");
              }}
            >
              <Ionicons name="film-outline" size={20} color={st.text} />
              <Text style={styles.createLabel}>Clipes</Text>
            </Pressable>
            <Pressable
              style={styles.createItem}
              onPress={() => {
                setCreateMenuOpen(false);
                navigation.navigate("Live");
              }}
            >
              <Ionicons name="radio-outline" size={20} color={st.text} />
              <Text style={styles.createLabel}>Ao vivo</Text>
            </Pressable>
            <Pressable
              style={styles.createItem}
              onPress={() => {
                setCreateMenuOpen(false);
                setCreatePanel("note");
              }}
            >
              <Ionicons name="document-text-outline" size={20} color={st.text} />
              <Text style={styles.createLabel}>Nota</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {searchOpen ? (
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void load(mode, 0, false, query)}
          placeholder="Buscar publicações ou pessoas"
          placeholderTextColor={st.faint}
          style={[styles.input, { marginHorizontal: 16 }]}
          autoFocus
        />
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
              {live.host.avatarUrl ? (
                <Image source={{ uri: mediaUrl(live.host.avatarUrl) }} style={[styles.storyCircle, styles.storyLive]} />
              ) : (
                <View style={[styles.storyCircle, styles.storyLive, styles.storyAddCircle]}>
                  <Ionicons name="radio" size={22} color="#fff" />
                </View>
              )}
              <Text style={styles.storyName} numberOfLines={1}>
                {live.isMine ? "Você · live" : live.host.name.split(" ")[0]}
              </Text>
            </Pressable>
          ))}
          {storyRailsVisible.map((rail) => {
            const index = rails.findIndex((row) => row.userId === rail.userId);
            return (
              <Pressable key={rail.userId} style={styles.storyAdd} onPress={() => setViewer({ rail: Math.max(0, index), item: 0 })}>
                {rail.image_url ? (
                  <Image source={{ uri: mediaUrl(rail.image_url) }} style={[styles.storyCircle, (rail.unseen || rail.isMine) && styles.storyHot]} />
                ) : (
                  <View style={[styles.storyCircle, (rail.unseen || rail.isMine) && styles.storyHot]} />
                )}
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
                  <Image source={{ uri: item.localUri ?? mediaUrl(item.url) }} style={styles.thumb} />
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
            <Pressable style={styles.chip} onPress={() => void captureMedia("photo")} disabled={mediaItems.length >= MAX_MEDIA}>
              <Ionicons name="camera-outline" size={16} color={st.text} />
              <Text style={styles.chipText}>Câmera</Text>
            </Pressable>
            <Pressable style={styles.chip} onPress={() => void captureMedia("video")} disabled={mediaItems.length >= MAX_MEDIA}>
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
            <Pressable key={person.id} style={styles.person} onPress={() => void toggleFollow(person.id)}>
              {person.avatarUrl ? (
                <Image source={{ uri: mediaUrl(person.avatarUrl) }} style={styles.avatar} />
              ) : (
                <View style={styles.avatar} />
              )}
              <Text style={styles.personName} numberOfLines={1}>
                {person.name.split(" ")[0]}
              </Text>
              <Text style={styles.follow}>{brand.followAthletes}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {posts.length === 0 ? (
        <EmptyState icon="newspaper-outline" title={brand.feedEmptyTitle} text={brand.feedEmptyText} />
      ) : (
        posts.map((post) => {
          const liveId = liveIdFromPost(post);
          const isLiveCard =
            Boolean(liveId) &&
            (post.mediaType === "LIVE" || (liveId != null && post.mediaUrl?.replace(/^\//, "") === liveId));
          const mediaItemsForPost = (
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

          return (
            <View key={post.id} style={styles.card}>
              <View style={styles.head}>
                {post.author.avatarUrl ? (
                  <Image source={{ uri: mediaUrl(post.author.avatarUrl) }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatar} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{post.author.name}</Text>
                  <Text style={styles.meta}>{new Date(post.createdAt).toLocaleString("pt-BR")}</Text>
                </View>
                {post.activity ? <Text style={styles.badge}>{post.activity.sportLabel}</Text> : null}
                {post.isMine ? (
                  <Pressable onPress={() => void deletePost(post.id)}>
                    <Ionicons name="trash-outline" size={18} color={st.muted} />
                  </Pressable>
                ) : (
                  <Pressable onPress={() => setReportPostId(post.id)}>
                    <Ionicons name="flag-outline" size={18} color={st.muted} />
                  </Pressable>
                )}
              </View>
              {post.body && !isLiveCard ? <Text style={styles.body}>{post.body}</Text> : null}
              {post.activity ? (
                <View style={styles.stats}>
                  <Text style={styles.stat}>{formatKm(post.activity.distanceMeters)} km</Text>
                  <Text style={styles.stat}>{formatClock(post.activity.elapsedSeconds)}</Text>
                  <Text style={styles.stat}>{formatPace(post.activity.avgPaceSecPerKm)} /km</Text>
                </View>
              ) : null}
              {isLiveCard && liveId ? (
                <Pressable
                  style={styles.liveCard}
                  onPress={() =>
                    navigation.navigate("LiveRoom", {
                      mode: post.isMine ? "host" : "viewer",
                      liveId,
                      title:
                        post.body
                          ?.replace(/^Ao vivo agora:\s*/i, "")
                          .replace(/^Ao vivo:\s*/i, "")
                          .replace(/\n?\[\[LIVE:[^\]]+\]\]/g, "")
                          .trim() || "Ao vivo"
                    })
                  }
                >
                  <Ionicons name="radio" size={22} color="#fff" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.liveCardTitle}>AO VIVO</Text>
                    <Text style={styles.liveCardBody} numberOfLines={2}>
                      {post.body
                        ?.replace(/^Ao vivo agora:\s*/i, "")
                        .replace(/^Ao vivo:\s*/i, "")
                        .replace(/\n?\[\[LIVE:[^\]]+\]\]/g, "")
                        .trim() || "Entrar na transmissão"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#fff" />
                </Pressable>
              ) : (
                <PostMediaCarousel items={mediaItemsForPost} styles={styles} />
              )}
              <View style={styles.row}>
                <Pressable onPress={() => void toggleLike(post.id)} style={styles.chip}>
                  <Ionicons name={post.likedByMe ? "heart" : "heart-outline"} size={18} color={post.likedByMe ? st.coral : st.text} />
                  <Text style={styles.chipText}>
                    {post.kind === "ACTIVITY" ? "Kudos " : ""}
                    {post.likesCount}
                  </Text>
                </Pressable>
                {post.kind === "ACTIVITY" ? null : (
                  <Pressable onPress={() => void toggleDislike(post.id)} style={styles.chip}>
                    <Ionicons name="thumbs-down-outline" size={18} color={post.dislikedByMe ? st.coral : st.text} />
                    <Text style={styles.chipText}>{post.dislikesCount ?? 0}</Text>
                  </Pressable>
                )}
                <Ionicons name="chatbubble-outline" size={18} color={st.muted} />
                <Text style={styles.chipText}>{post.commentsCount ?? post.comments.length}</Text>
              </View>
              {post.comments.slice(-2).map((comment) => (
                <Text key={comment.id} style={styles.comment}>
                  <Text style={styles.name}>{comment.author.name.split(" ")[0]} </Text>
                  {comment.body}
                </Text>
              ))}
              <View style={styles.row}>
                <TextInput
                  value={commentDraft[post.id] ?? ""}
                  onChangeText={(value) => setCommentDraft((current) => ({ ...current, [post.id]: value }))}
                  placeholder="Comentar"
                  placeholderTextColor={st.faint}
                  style={[styles.input, { flex: 1 }]}
                />
                <Pressable onPress={() => void sendComment(post.id)}>
                  <Ionicons name="send" size={18} color={st.gold} />
                </Pressable>
              </View>
            </View>
          );
        })
      )}

      {hasMore ? (
        <Pressable style={[styles.chip, { alignSelf: "center", marginBottom: 20 }]} onPress={() => void load(mode, page + 1, true)}>
          <Text style={styles.chipText}>Carregar mais</Text>
        </Pressable>
      ) : null}

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
              {storyMedia?.localUri ? (
                storyMedia.type === "VIDEO" ? (
                  <Video
                    source={{ uri: storyMedia.localUri }}
                    style={styles.storyPreview}
                    resizeMode={ResizeMode.CONTAIN}
                    shouldPlay
                    isLooping
                    isMuted
                    useNativeControls
                  />
                ) : (
                  <Image source={{ uri: storyMedia.localUri }} style={styles.storyPreview} resizeMode="contain" />
                )
              ) : null}
            </View>
            <View style={styles.storyActions}>
              <Pressable style={styles.storyActionChip} onPress={() => void pickMedia(true)}>
                <Ionicons name="images-outline" size={16} color={st.text} />
                <Text style={styles.chipText}>Galeria</Text>
              </Pressable>
              <Pressable style={styles.storyActionChip} onPress={() => void captureMedia("photo", true)}>
                <Ionicons name="camera-outline" size={16} color={st.text} />
                <Text style={styles.chipText}>Câmera</Text>
              </Pressable>
              <Pressable style={styles.storyActionChip} onPress={() => void captureMedia("video", true)}>
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
                      <Image source={{ uri: mediaUrl(thumb) }} style={styles.galleryThumb} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      </Modal>

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
    </StudentPage>
  );
}

function createStyles(st: StudentTokens) {
  return StyleSheet.create({
    toolbar: { paddingHorizontal: 12, paddingTop: 0, alignItems: "flex-end", zIndex: 5, minHeight: 0 },
    toolbarActions: { flexDirection: "row", alignItems: "center", gap: 2 },
    iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
    createMenuBackdrop: {
      flex: 1,
      backgroundColor: "rgba(8,9,11,0.28)",
      alignItems: "flex-end",
      paddingTop: 56,
      paddingHorizontal: 12
    },
    createMenu: {
      minWidth: 196,
      padding: 8,
      borderRadius: 16,
      backgroundColor: st.card,
      borderWidth: 1,
      borderColor: st.line,
      gap: 2,
      shadowColor: "#000",
      shadowOpacity: 0.16,
      shadowRadius: 16,
      elevation: 8
    },
    createItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
    createLabel: { color: st.text, fontSize: 15, fontWeight: "600" },
    composer: { margin: 16, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: st.line, backgroundColor: st.card, gap: 10 },
    composerHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    input: { color: st.text, borderWidth: 1, borderColor: st.line, borderRadius: 12, padding: 10, backgroundColor: st.inputBg },
    row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
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
    avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: st.avatarBg },
    name: { color: st.text, fontWeight: "800" },
    meta: { color: st.muted, fontSize: 12 },
    badge: { color: st.coral, fontWeight: "800", fontSize: 12 },
    body: { color: st.text, lineHeight: 20 },
    stats: { flexDirection: "row", justifyContent: "space-between" },
    stat: { color: st.text, fontWeight: "800" },
    media: {
      width: "100%",
      aspectRatio: 4 / 5,
      borderRadius: 12,
      backgroundColor: "#111",
      overflow: "hidden"
    },
    mediaVideo: { alignItems: "center", justifyContent: "center", gap: 6 },
    mediaVideoLabel: { color: "#fff", fontWeight: "800" },
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
