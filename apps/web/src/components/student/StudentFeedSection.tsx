import {
  Camera,
  Clapperboard,
  Flag,
  Heart,
  ImagePlus,
  MessageCircle,
  MoreHorizontal,
  PenSquare,
  Plus,
  Radio,
  Search,
  Send,
  Share2,
  StickyNote,
  ThumbsUp,
  Trash2,
  UserPlus,
  Video,
  X
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiDelete, apiGet, apiPost, apiUpload } from "../../api";
import { mediaUrl, retryVideoAsCompatible } from "../../lib/urls";
import { formatClock, formatKm, formatPace } from "../../lib/activity-geo";
import { readFeedCache, writeFeedCache } from "../../lib/feed-cache";
import { useFeedChromeStore } from "../../stores/feedChromeStore";
import { brand } from "../../lib/brand";
import { shareSocialPost } from "../../lib/share-social-post";
import { isVideoFile, MEDIA_FILE_ACCEPT } from "../../lib/video-formats";
import type {
  SocialAuthor,
  SocialComment,
  SocialPostRow,
  SocialStoryGalleryItem,
  SocialStoryRail,
  UploadResponse
} from "../../types";
import { StudentCameraCapture } from "./StudentCameraCapture";
import { VideoCoverPicker } from "./VideoCoverPicker";
import { StoryViewer } from "./StoryViewer";
import { assertStoryVideoWithinLimit } from "../../lib/video-cover";

type FeedMode = "for-you" | "following";
type MediaItem = { url: string; type: "IMAGE" | "VIDEO"; coverUrl?: string | null; localSrc?: string | null };

function revokeMediaItem(item: MediaItem) {
  if (item.localSrc?.startsWith("blob:")) URL.revokeObjectURL(item.localSrc);
  if (item.coverUrl?.startsWith("blob:")) URL.revokeObjectURL(item.coverUrl);
}
type SocialNav = "reels" | "live" | "messages" | "chat" | "requests" | "profile";
type CreatePanel = "post" | "story" | "note" | null;
type CameraMode = "photo" | "video" | null;
type ReplyTarget = { id: string; name: string } | null;

const MAX_MEDIA = 10;
const COMMENT_EMOJIS = ["😂", "😮", "😍", "😢", "👏", "🔥", "🎉", "❤️"];

function formatCompactRelative(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return `${Math.max(1, sec)}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}sem`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
}

function renderPostBody(content: string) {
  const cleaned = content.replace(/\n?\[\[LIVE:[^\]]+\]\]/g, "").trim();
  const parts = cleaned.split(/(#[\p{L}0-9_]{2,40}|@[A-Za-z0-9._-]{2,40})/gu);
  return parts.map((part, index) => {
    if (part.startsWith("#") || part.startsWith("@")) {
      return (
        <button key={index} type="button" className="student-feed-tag" onClick={() => undefined}>
          {part}
        </button>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

function liveIdFromPost(post: { mediaType?: string | null; mediaUrl?: string | null; body?: string | null }) {
  const tagged = post.body?.match(/\[\[LIVE:([^\]]+)\]\]/);
  if (tagged?.[1]) return tagged[1];
  if (post.mediaType === "LIVE" && post.mediaUrl) return post.mediaUrl;
  // Legacy broken posts stored the live cuid as an image URL.
  if (post.mediaUrl && !/[./]/.test(post.mediaUrl.replace(/^\//, "")) && post.mediaType !== "VIDEO") {
    return post.mediaUrl.replace(/^\//, "");
  }
  return null;
}

function activityMapSrc() {
  const qs = new URLSearchParams();
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID;
  if (key) qs.set("key", String(key));
  if (mapId) qs.set("mapId", String(mapId));
  const query = qs.toString();
  return query ? `/activity-map.html?${query}` : "/activity-map.html";
}

function ActivityMiniMap({ post }: { post: SocialPostRow }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const activity = post.activity;
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !activity) return;
    const send = () => {
      iframe.contentWindow?.postMessage({ type: "setTrack", points: activity.polyline, fit: true }, "*");
      iframe.contentWindow?.postMessage({ type: "set3d", on: activity.is3d }, "*");
      iframe.contentWindow?.postMessage({ type: "showControls", on: false }, "*");
      if (activity.mapType) {
        iframe.contentWindow?.postMessage({ type: "setMapType", mapType: activity.mapType }, "*");
      }
    };
    iframe.addEventListener("load", send);
    const onMsg = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) return;
      if (event.data?.type === "ready") send();
    };
    window.addEventListener("message", onMsg);
    return () => {
      iframe.removeEventListener("load", send);
      window.removeEventListener("message", onMsg);
    };
  }, [activity]);
  if (!activity) return null;
  return (
    <div className="student-feed-map">
      <div className="student-feed-map-frame">
        <iframe ref={iframeRef} title="Percurso" src={activityMapSrc()} />
      </div>
      <div className="student-feed-activity-stats">
        <span>
          <strong>{formatKm(activity.distanceMeters)}</strong>
          km
        </span>
        <span>
          <strong>{formatClock(activity.elapsedSeconds)}</strong>
          tempo
        </span>
        <span>
          <strong>{formatPace(activity.avgPaceSecPerKm)}</strong>
          /km
        </span>
        <span>
          <strong>{activity.calories}</strong>
          kcal
        </span>
      </div>
    </div>
  );
}

function MediaCarousel({ items }: { items: MediaItem[] }) {
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);
  const itemsKey = items.map((item) => `${item.url}:${item.coverUrl ?? ""}`).join("|");
  useEffect(() => {
    setIndex(0);
  }, [itemsKey]);
  if (!items.length) return null;
  const safeIndex = Math.min(index, items.length - 1);
  const current = items[safeIndex];

  function go(next: number) {
    setIndex(Math.max(0, Math.min(items.length - 1, next)));
  }

  return (
    <div
      className="student-feed-carousel"
      onTouchStart={(event) => {
        touchX.current = event.changedTouches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        if (touchX.current == null || items.length < 2) return;
        const delta = (event.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
        touchX.current = null;
        if (Math.abs(delta) < 40) return;
        go(safeIndex + (delta < 0 ? 1 : -1));
      }}
    >
      <div className="student-feed-carousel-frame" data-ratio="4:5">
        {current.type === "VIDEO" ? (
          <video
            className="student-feed-media"
            src={mediaUrl(current.url)}
            poster={current.coverUrl ? mediaUrl(current.coverUrl) : undefined}
            controls
            playsInline
            key={current.url}
            onError={(event) => retryVideoAsCompatible(event.currentTarget, current.url)}
          />
        ) : (
          <img className="student-feed-media" src={mediaUrl(current.url)} alt="" key={current.url} />
        )}
        {items.length > 1 && (
          <>
            <button
              type="button"
              className="student-feed-carousel-arrow is-prev"
              disabled={safeIndex <= 0}
              onClick={() => go(safeIndex - 1)}
              aria-label="Anterior"
            >
              ‹
            </button>
            <button
              type="button"
              className="student-feed-carousel-arrow is-next"
              disabled={safeIndex >= items.length - 1}
              onClick={() => go(safeIndex + 1)}
              aria-label="Próximo"
            >
              ›
            </button>
            <div className="student-feed-carousel-dots" aria-label={`Item ${safeIndex + 1} de ${items.length}`}>
              {items.map((item, dot) => (
                <button
                  key={`${item.url}-${dot}`}
                  type="button"
                  className={dot === safeIndex ? "is-on" : ""}
                  onClick={() => go(dot)}
                  aria-label={`Ir para ${dot + 1}`}
                />
              ))}
            </div>
            <span className="student-feed-carousel-count">
              {safeIndex + 1}/{items.length}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

type ActiveLiveRail = {
  id: string;
  title: string;
  host: { id: string; name: string; avatarUrl?: string | null };
  isMine: boolean;
};

export function StudentFeedSection({
  token,
  onNavigate,
  onOpenDm,
  onOpenPeerProfile,
  onOpenLive
}: {
  token: string;
  onNavigate?: (section: SocialNav) => void;
  onOpenDm?: (userId: string) => void;
  onOpenPeerProfile?: (userId: string) => void;
  onOpenLive?: (liveId: string) => void;
}) {
  const cached = useMemo(() => readFeedCache(), []);
  const [posts, setPosts] = useState<SocialPostRow[]>(() => cached?.posts ?? []);
  const [people, setPeople] = useState<SocialAuthor[]>(() => cached?.people ?? []);
  const [rails, setRails] = useState<SocialStoryRail[]>(() => cached?.rails ?? []);
  const [activeLives, setActiveLives] = useState<ActiveLiveRail[]>([]);
  const [body, setBody] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<FeedMode>("for-you");
  const [followingCount, setFollowingCount] = useState(() => cached?.followingCount ?? 0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(() => cached?.hasMore ?? false);
  const [busy, setBusy] = useState(false);
  const [loadingFeed, setLoadingFeed] = useState(() => !cached?.posts.length);
  const [error, setError] = useState<string | null>(null);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [sheetComments, setSheetComments] = useState<SocialComment[]>([]);
  const [sheetDraft, setSheetDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ReplyTarget>(null);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetBusy, setSheetBusy] = useState(false);
  const [sheetViewport, setSheetViewport] = useState({ height: 0, offsetTop: 0, keyboard: 0 });
  const [menuPostId, setMenuPostId] = useState<string | null>(null);
  const [reportPostId, setReportPostId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createMenuPos, setCreateMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [createPanel, setCreatePanel] = useState<CreatePanel>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>(null);
  const [storyCaption, setStoryCaption] = useState("");
  const [storyMedia, setStoryMedia] = useState<MediaItem | null>(null);
  const [storyCoverPreview, setStoryCoverPreview] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ rail: number; item: number } | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryItems, setGalleryItems] = useState<SocialStoryGalleryItem[]>([]);
  const [galleryViewerIndex, setGalleryViewerIndex] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const storyFileRef = useRef<HTMLInputElement>(null);
  const createMenuRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const replyToRef = useRef<ReplyTarget>(null);

  async function loadStories() {
    const data = await apiGet<{ rails: SocialStoryRail[] }>("/student/social/stories", token);
    setRails(data.rails);
  }

  async function loadActiveLives() {
    try {
      const data = await apiGet<{ lives: ActiveLiveRail[] }>("/student/social/live", token);
      setActiveLives(data.lives);
    } catch {
      setActiveLives([]);
    }
  }

  async function loadPeople(search = query) {
    const peopleRes = await apiGet<{ people: SocialAuthor[] }>(
      `/student/social/people${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ""}`,
      token
    );
    setPeople(peopleRes.people);
  }

  async function load(search = query, nextMode = mode, nextPage = 0, append = false) {
    const feed = await apiGet<{ posts: SocialPostRow[]; hasMore: boolean; followingCount: number }>(
      `/student/social/posts?mode=${nextMode}&page=${nextPage}${search.trim() ? `&q=${encodeURIComponent(search.trim())}` : ""}`,
      token
    );
    setPosts((current) => (append ? [...current, ...feed.posts] : feed.posts));
    setHasMore(Boolean(feed.hasMore));
    setFollowingCount(feed.followingCount ?? 0);
    setPage(nextPage);
  }

  useEffect(() => {
    let cancelled = false;
    const hasCache = posts.length > 0;
    if (!hasCache) setLoadingFeed(true);
    setError(null);
    void (async () => {
      try {
        await load();
        if (cancelled) return;
        setLoadingFeed(false);
        void loadStories().catch(() => undefined);
        void loadActiveLives().catch(() => undefined);
        void loadPeople().catch(() => undefined);
      } catch (err) {
        if (cancelled) return;
        setLoadingFeed(false);
        if (!hasCache) setError(err instanceof Error ? err.message : "Falha ao carregar o Feed.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!posts.length) return;
    writeFeedCache({ posts, rails, people, followingCount, hasMore });
  }, [posts, rails, people, followingCount, hasMore]);

  const suggestions = useMemo(() => people.filter((person) => !person.following).slice(0, 8), [people]);
  const liveByHostId = useMemo(() => new Map(activeLives.map((live) => [live.host.id, live])), [activeLives]);
  const storyRailsWithoutLiveHosts = useMemo(
    () => rails.filter((rail) => rail.isMine || !liveByHostId.has(rail.userId)),
    [rails, liveByHostId]
  );

  async function uploadFile(file: File) {
    const form = new FormData();
    form.append("file", file);
    const uploaded = await apiUpload<UploadResponse>("/student/social/uploads", form, token);
    const isVideo = isVideoFile(file);
    return {
      url: uploaded.file.url,
      type: (isVideo ? "VIDEO" : "IMAGE") as "IMAGE" | "VIDEO",
      coverUrl: isVideo ? null : uploaded.file.url,
      localSrc: isVideo ? URL.createObjectURL(file) : null
    };
  }

  async function uploadCoverFromPreview(previewUrl: string) {
    const blob = await fetch(previewUrl).then((res) => res.blob());
    const form = new FormData();
    form.append("file", new File([blob], `cover-${Date.now()}.jpg`, { type: "image/jpeg" }));
    const uploaded = await apiUpload<UploadResponse>("/student/social/uploads", form, token);
    return uploaded.file.url;
  }

  async function resolveMediaCovers(items: MediaItem[]) {
    const next: MediaItem[] = [];
    for (const item of items) {
      if (item.type !== "VIDEO") {
        next.push({ ...item, coverUrl: item.coverUrl || item.url });
        continue;
      }
      if (item.coverUrl && !item.coverUrl.startsWith("blob:")) {
        next.push(item);
        continue;
      }
      if (item.coverUrl?.startsWith("blob:")) {
        next.push({ ...item, coverUrl: await uploadCoverFromPreview(item.coverUrl) });
        continue;
      }
      next.push(item);
    }
    return next;
  }

  async function onPickFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const remaining = MAX_MEDIA - mediaItems.length;
      const batch = Array.from(files).slice(0, remaining);
      const uploaded = await Promise.all(batch.map((file) => uploadFile(file)));
      setMediaItems((current) => [...current, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no envio da mídia.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onCameraCapture(file: File) {
    const forStory = createPanel === "story";
    setCameraMode(null);
    setBusy(true);
    setError(null);
    try {
      if (forStory) await assertStoryVideoWithinLimit(file);
      const uploaded = await uploadFile(file);
      if (forStory) {
        setStoryMedia(uploaded);
        return;
      }
      if (mediaItems.length >= MAX_MEDIA) {
        setError(`Limite de ${MAX_MEDIA} arquivos no carrossel.`);
        return;
      }
      setMediaItems((current) => [...current, uploaded].slice(0, MAX_MEDIA));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no envio da captura.");
    } finally {
      setBusy(false);
    }
  }

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (!body.trim() && !mediaItems.length) return;
    setBusy(true);
    setError(null);
    try {
      const prepared = await resolveMediaCovers(mediaItems);
      const created = await apiPost<{ post: SocialPostRow }>(
        "/student/social/posts",
        {
          body: body.trim(),
          mediaItems: prepared,
          mediaUrl: prepared[0]?.url,
          mediaType: prepared[0]?.type
        },
        token
      );
      for (const item of mediaItems) {
        revokeMediaItem(item);
      }
      setPosts((current) => [created.post, ...current]);
      setBody("");
      setMediaItems([]);
      setCreatePanel(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível publicar.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleLike(postId: string) {
    const result = await apiPost<{ liked: boolean; disliked: boolean }>(`/student/social/posts/${postId}/like`, {}, token);
    setPosts((current) =>
      current.map((post) => {
        if (post.id !== postId) return post;
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

  async function sharePost(post: SocialPostRow) {
    try {
      await shareSocialPost(post);
    } catch {
      // usuário cancelou o compartilhar ou a mídia falhou
    }
  }

  function closeCommentsSheet() {
    setCommentsPostId(null);
    setSheetComments([]);
    setSheetDraft("");
    setReplyTo(null);
    replyToRef.current = null;
    setSheetLoading(false);
    setSheetBusy(false);
  }

  function startReply(target: { rootId: string; name: string }) {
    const next = { id: target.rootId, name: target.name };
    replyToRef.current = next;
    setReplyTo(next);
    setSheetDraft((current) => {
      const mention = `@${target.name} `;
      if (current.trim().startsWith(`@${target.name}`)) return current;
      return current.trim() ? `${mention}${current}` : mention;
    });
    requestAnimationFrame(() => commentInputRef.current?.focus());
  }

  function clearReply() {
    replyToRef.current = null;
    setReplyTo(null);
  }

  async function openCommentsSheet(postId: string) {
    setCreateMenuOpen(false);
    setSearchOpen(false);
    setCommentsPostId(postId);
    setSheetDraft("");
    clearReply();
    setSheetLoading(true);
    try {
      const data = await apiGet<{ comments: SocialComment[] }>(`/student/social/posts/${postId}/comments`, token);
      setSheetComments(data.comments);
    } catch {
      const fallback = posts.find((post) => post.id === postId)?.comments ?? [];
      setSheetComments(fallback);
    } finally {
      setSheetLoading(false);
    }
  }

  async function sendSheetComment() {
    if (!commentsPostId) return;
    const text = sheetDraft.trim();
    if (!text || sheetBusy) return;
    const parentId = replyToRef.current?.id ?? replyTo?.id ?? null;
    setSheetBusy(true);
    try {
      const result = await apiPost<{ comment: SocialComment }>(
        `/student/social/posts/${commentsPostId}/comments`,
        { body: text, parentId },
        token
      );
      const comment = result.comment;
      setSheetDraft("");
      clearReply();
      setSheetComments((current) => {
        const replyParentId = comment.parentId ?? parentId;
        if (replyParentId) {
          let nested = false;
          const next = current.map((row) => {
            if (row.id !== replyParentId) return row;
            nested = true;
            return {
              ...row,
              replies: [...(row.replies ?? []).filter((item) => item.id !== comment.id), { ...comment, replies: [] }],
              repliesCount: (row.repliesCount ?? row.replies?.length ?? 0) + 1
            };
          });
          if (nested) return next;
        }
        return [...current.filter((row) => row.id !== comment.id), { ...comment, replies: comment.replies ?? [] }];
      });
      setPosts((current) =>
        current.map((post) =>
          post.id === commentsPostId
            ? {
                ...post,
                commentsCount: (post.commentsCount ?? post.comments.length) + 1
              }
            : post
        )
      );
    } finally {
      setSheetBusy(false);
    }
  }

  async function toggleCommentLike(commentId: string) {
    const result = await apiPost<{ liked: boolean }>(`/student/social/comments/${commentId}/like`, {}, token);
    function patch(list: SocialComment[]): SocialComment[] {
      return list.map((comment) => {
        if (comment.id === commentId) {
          const likesCount = Math.max(0, (comment.likesCount ?? 0) + (result.liked ? 1 : -1));
          return { ...comment, likedByMe: result.liked, likesCount };
        }
        if (comment.replies?.length) {
          return { ...comment, replies: patch(comment.replies) };
        }
        return comment;
      });
    }
    setSheetComments((current) => patch(current));
  }

  async function toggleFollow(userId: string) {
    const result = await apiPost<{ following: boolean }>(`/student/social/users/${userId}/follow`, {}, token);
    setPeople((current) => current.map((person) => (person.id === userId ? { ...person, following: result.following } : person)));
    setFollowingCount((count) => Math.max(0, count + (result.following ? 1 : -1)));
  }

  async function deletePost(postId: string) {
    await apiDelete(`/student/social/posts/${postId}`, token);
    setPosts((current) => current.filter((post) => post.id !== postId));
    setMenuPostId(null);
  }

  async function reportPost() {
    if (!reportPostId || reportReason.trim().length < 3) return;
    await apiPost(`/student/social/posts/${reportPostId}/report`, { reason: reportReason.trim() }, token);
    setReportPostId(null);
    setReportReason("");
    setMenuPostId(null);
  }

  async function publishStory(event: FormEvent) {
    event.preventDefault();
    if (!storyMedia) return;
    setBusy(true);
    try {
      let coverUrl = storyMedia.type === "IMAGE" ? storyMedia.url : null;
      if (storyMedia.type === "VIDEO" && storyCoverPreview) {
        coverUrl = storyCoverPreview.startsWith("blob:")
          ? await uploadCoverFromPreview(storyCoverPreview)
          : storyCoverPreview;
      }
      await apiPost(
        "/student/social/stories",
        {
          mediaUrl: storyMedia.url,
          mediaType: storyMedia.type,
          coverUrl,
          caption: storyCaption.trim() || undefined,
          mood: "vibe"
        },
        token
      );
      if (storyCoverPreview?.startsWith("blob:")) URL.revokeObjectURL(storyCoverPreview);
      if (storyMedia) revokeMediaItem(storyMedia);
      setCreatePanel(null);
      setStoryCaption("");
      setStoryMedia(null);
      setStoryCoverPreview(null);
      await loadStories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível publicar o momento.");
    } finally {
      setBusy(false);
    }
  }

  async function publishNote(event: FormEvent) {
    event.preventDefault();
    if (!noteBody.trim()) return;
    setBusy(true);
    try {
      const created = await apiPost<{ post: SocialPostRow }>(
        "/student/social/posts",
        { body: noteBody.trim() },
        token
      );
      setPosts((current) => [created.post, ...current]);
      setNoteBody("");
      setCreatePanel(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível publicar a nota.");
    } finally {
      setBusy(false);
    }
  }

  async function openStory(railIndex: number) {
    setViewer({ rail: railIndex, item: 0 });
  }

  async function loadGallery() {
    const data = await apiGet<{ items: SocialStoryGalleryItem[] }>("/student/social/stories/gallery", token);
    setGalleryItems(data.items);
  }

  async function openGallery() {
    setGalleryOpen(true);
    try {
      await loadGallery();
    } catch {
      setGalleryItems([]);
    }
  }

  async function changeMode(next: FeedMode) {
    if (next === mode) return;
    setMode(next);
    setBusy(true);
    try {
      await load(query, next, 0, false);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    useFeedChromeStore.getState().bind({
      toggleCreate: () => {
        setSearchOpen(false);
        setCreateMenuOpen((open) => !open);
      },
      toggleSearch: () => {
        setCreateMenuOpen(false);
        setSearchOpen((open) => !open);
      }
    });
    return () => useFeedChromeStore.getState().unbind();
  }, []);

  useEffect(() => {
    if (!createMenuOpen) {
      setCreateMenuPos(null);
      return;
    }
    function placeMenu() {
      const btn = document.querySelector<HTMLElement>('.student-app-header button[aria-label="Criar"]');
      if (!btn) {
        setCreateMenuPos({ top: 72, right: 12 });
        return;
      }
      const rect = btn.getBoundingClientRect();
      const vv = window.visualViewport;
      const viewportWidth = vv?.width ?? window.innerWidth;
      const top = Math.round(rect.bottom + 8);
      const right = Math.round(Math.max(8, viewportWidth - rect.right + (vv?.offsetLeft ?? 0)));
      const maxTop = Math.round((vv?.height ?? window.innerHeight) - 12);
      setCreateMenuPos({
        top: Math.min(top, Math.max(8, maxTop - 48)),
        right
      });
    }
    placeMenu();
    window.addEventListener("resize", placeMenu);
    window.visualViewport?.addEventListener("resize", placeMenu);
    window.visualViewport?.addEventListener("scroll", placeMenu);
    return () => {
      window.removeEventListener("resize", placeMenu);
      window.visualViewport?.removeEventListener("resize", placeMenu);
      window.visualViewport?.removeEventListener("scroll", placeMenu);
    };
  }, [createMenuOpen]);

  useEffect(() => {
    if (!createMenuOpen) return;
    function onDocPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (createMenuRef.current?.contains(target)) return;
      const createBtn = document.querySelector('.student-app-header button[aria-label="Criar"]');
      if (createBtn?.contains(target)) return;
      setCreateMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("touchstart", onDocPointerDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("touchstart", onDocPointerDown);
    };
  }, [createMenuOpen]);

  useEffect(() => {
    if (!commentsPostId) {
      setSheetViewport({ height: 0, offsetTop: 0, keyboard: 0 });
      return;
    }
    function syncViewport() {
      const vv = window.visualViewport;
      const height = Math.round(vv?.height ?? window.innerHeight);
      const offsetTop = Math.round(vv?.offsetTop ?? 0);
      const keyboard = Math.max(0, Math.round(window.innerHeight - height - offsetTop));
      setSheetViewport({ height, offsetTop, keyboard });
    }
    syncViewport();
    window.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("scroll", syncViewport);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("scroll", syncViewport);
      document.body.style.overflow = prevOverflow;
    };
  }, [commentsPostId]);

  function openCreate(panel: CreatePanel) {
    setCreateMenuOpen(false);
    setSearchOpen(false);
    if (panel === "story") {
      setStoryCaption("");
      if (storyMedia) revokeMediaItem(storyMedia);
      setStoryMedia(null);
      if (storyCoverPreview?.startsWith("blob:")) URL.revokeObjectURL(storyCoverPreview);
      setStoryCoverPreview(null);
    }
    setCreatePanel(panel);
  }

  const viewerRail = viewer ? rails[viewer.rail] : null;
  const galleryViewerRail = useMemo((): SocialStoryRail | null => {
    if (galleryViewerIndex == null) return null;
    const entry = galleryItems[galleryViewerIndex];
    if (!entry) return null;
    return {
      userId: "gallery",
      username: "Galeria",
      isMine: true,
      unseen: false,
      items: [
        {
          id: entry.id,
          mediaUrl: entry.mediaUrl,
          mediaType: entry.mediaType,
          coverUrl: entry.coverUrl,
          caption: entry.caption,
          mood: entry.mood,
          createdAt: entry.savedAt,
          seen: true
        }
      ]
    };
  }, [galleryItems, galleryViewerIndex]);

  return (
    <section className="student-feed">
      <div className={`student-feed-chrome${searchOpen ? " is-open" : ""}`}>
        {searchOpen && (
          <label className="student-feed-search is-header-anchored">
            <Search size={16} className="student-feed-search-icon" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void load(query, mode, 0, false);
                  void loadPeople(query).catch(() => undefined);
                }
              }}
              placeholder="Buscar publicações ou pessoas"
            />
          </label>
        )}
      </div>

      {createMenuOpen
        ? createPortal(
            <div
              ref={createMenuRef}
              className="student-feed-create-menu is-header-anchored is-overlay"
              role="menu"
              style={
                createMenuPos
                  ? { top: createMenuPos.top, right: createMenuPos.right }
                  : { top: 72, right: 12 }
              }
            >
              <button type="button" role="menuitem" onClick={() => openCreate("post")}>
                <PenSquare size={20} strokeWidth={1.6} /> Publicar
              </button>
              <button type="button" role="menuitem" onClick={() => openCreate("story")}>
                <Plus size={20} strokeWidth={1.6} className="student-feed-create-dashed" /> Momento
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setCreateMenuOpen(false);
                  onNavigate?.("reels");
                }}
              >
                <Clapperboard size={20} strokeWidth={1.6} /> Clipes
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setCreateMenuOpen(false);
                  onNavigate?.("live");
                }}
              >
                <Radio size={20} strokeWidth={1.6} /> Ao vivo
              </button>
              <button type="button" role="menuitem" onClick={() => openCreate("note")}>
                <StickyNote size={20} strokeWidth={1.6} /> Nota
              </button>
            </div>,
            document.body
          )
        : null}

      <div className="student-feed-stories">
        <header>
          <div>
            <strong>Momentos</strong>
            <small>Somem em 24h</small>
          </div>
          <button type="button" className="student-feed-story-gallery-link" onClick={() => void openGallery()}>
            Galeria
          </button>
        </header>
        <div className="student-feed-story-rail">
          <button type="button" className="student-feed-story-add" onClick={() => openCreate("story")}>
            <span>+</span>
            <small>Seu momento</small>
          </button>
          {activeLives.map((live) => (
            <button
              key={`live-${live.id}`}
              type="button"
              className="is-live"
              onClick={() => {
                if (onOpenLive) onOpenLive(live.id);
                else onNavigate?.("live");
              }}
            >
              {live.host.avatarUrl ? (
                <img src={mediaUrl(live.host.avatarUrl)} alt="" />
              ) : (
                <span>{live.host.name.slice(0, 1)}</span>
              )}
              <em className="student-live-rail-badge">AO VIVO</em>
              <small>{live.isMine ? "Você" : live.host.name.split(" ")[0]}</small>
            </button>
          ))}
          {storyRailsWithoutLiveHosts.map((rail) => {
            const storyIndex = rails.findIndex((row) => row.userId === rail.userId);
            const cover = rail.items[0];
            const coverUrl = cover?.coverUrl || (String(cover?.mediaType || "").toUpperCase() === "IMAGE" ? cover?.mediaUrl : null) || rail.image_url;
            const isVideoFallback = !cover?.coverUrl && String(cover?.mediaType || "").toUpperCase() === "VIDEO";
            return (
              <button
                key={rail.userId}
                type="button"
                className={rail.unseen || rail.isMine ? "is-hot" : ""}
                onClick={() => void openStory(storyIndex >= 0 ? storyIndex : 0)}
              >
                {coverUrl ? (
                  isVideoFallback ? (
                    <video src={mediaUrl(coverUrl)} muted playsInline preload="metadata" aria-hidden />
                  ) : (
                    <img src={mediaUrl(coverUrl)} alt="" />
                  )
                ) : (
                  <span>{rail.username.slice(0, 1)}</span>
                )}
                <small>{rail.isMine ? "Você" : rail.username.split(" ")[0]}</small>
              </button>
            );
          })}
        </div>
      </div>

      {createPanel === "post" && (
        <form className="student-feed-composer" onSubmit={publish}>
          <header className="student-feed-composer-head">
            <strong>Publicar</strong>
            <button type="button" onClick={() => setCreatePanel(null)} aria-label="Fechar">
              <X size={18} />
            </button>
          </header>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Escreva algo ou publique fotos e vídeos..."
            rows={3}
            autoFocus
          />
          {mediaItems.length > 0 && (
            <div className="student-feed-composer-media">
              {mediaItems.map((item) => (
                <div key={item.url} className="student-feed-composer-thumb">
                  {item.type === "VIDEO" ? (
                    item.coverUrl ? (
                      <img src={mediaUrl(item.coverUrl)} alt="" />
                    ) : (
                      <video src={mediaUrl(item.url)} muted preload="metadata" />
                    )
                  ) : (
                    <img src={mediaUrl(item.url)} alt="" />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      revokeMediaItem(item);
                      setMediaItems((current) => current.filter((row) => row.url !== item.url));
                    }}
                    aria-label="Remover"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              {mediaItems.length > 1 && <em>Carrossel · {mediaItems.length} itens</em>}
            </div>
          )}
          {mediaItems
            .filter((item) => item.type === "VIDEO")
            .map((item) => (
              <VideoCoverPicker
                key={`cover-${item.url}`}
                videoSrc={item.url}
                localSrc={item.localSrc}
                coverPreview={item.coverUrl}
                onCoverChange={(previewUrl) => {
                  setMediaItems((current) =>
                    current.map((row) => {
                      if (row.url !== item.url) return row;
                      if (row.coverUrl?.startsWith("blob:")) URL.revokeObjectURL(row.coverUrl);
                      return { ...row, coverUrl: previewUrl };
                    })
                  );
                }}
                label="Escolher capa do vídeo"
                compact
              />
            ))}
          <div className="student-feed-composer-bar">
            <input ref={fileRef} type="file" accept={MEDIA_FILE_ACCEPT} multiple hidden onChange={(event) => void onPickFiles(event.target.files)} />
            <button type="button" className="student-ghost-chip" onClick={() => fileRef.current?.click()} disabled={busy || mediaItems.length >= MAX_MEDIA}>
              <ImagePlus size={16} /> Mídia
            </button>
            <button
              type="button"
              className="student-ghost-chip"
              onClick={() => setCameraMode("photo")}
              disabled={busy || mediaItems.length >= MAX_MEDIA}
            >
              <Camera size={16} /> Câmera
            </button>
            <button
              type="button"
              className="student-ghost-chip"
              onClick={() => setCameraMode("video")}
              disabled={busy || mediaItems.length >= MAX_MEDIA}
            >
              <Video size={16} /> Vídeo
            </button>
            <button className="student-green-button" type="submit" disabled={busy || (!body.trim() && !mediaItems.length)}>
              Publicar{mediaItems.length > 1 ? ` · ${mediaItems.length}` : ""}
            </button>
          </div>
        </form>
      )}

      <StudentCameraCapture
        open={Boolean(cameraMode)}
        mode={cameraMode === "video" ? "video" : "photo"}
        allowModeSwitch
        maxVideoSeconds={createPanel === "story" ? 60 : 120}
        title={createPanel === "story" ? "Momento" : "Publicar"}
        onClose={() => setCameraMode(null)}
        onCapture={(file) => void onCameraCapture(file)}
      />

      <div className="student-feed-modes">
        <button type="button" className={mode === "for-you" ? "is-on" : ""} onClick={() => void changeMode("for-you")}>
          Para você
        </button>
        <button type="button" className={mode === "following" ? "is-on" : ""} onClick={() => void changeMode("following")}>
          Seguindo ({followingCount})
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="student-feed-people">
          {suggestions.map((person) => (
            <div key={person.id} className="student-feed-people-card">
              <button
                type="button"
                onClick={() => {
                  if (onOpenPeerProfile) onOpenPeerProfile(person.id);
                  else void toggleFollow(person.id);
                }}
              >
                <span className={liveByHostId.has(person.id) ? "student-feed-avatar-live" : undefined}>
                  {person.avatarUrl ? <img src={mediaUrl(person.avatarUrl)} alt="" /> : <span>{person.name.slice(0, 1)}</span>}
                </span>
                {liveByHostId.has(person.id) ? <em className="student-live-rail-badge">AO VIVO</em> : null}
                <strong>{person.name.split(" ")[0]}</strong>
                <small>
                  <UserPlus size={12} /> {brand.followAthletes}
                </small>
              </button>
              <div className="student-feed-people-actions">
                <button type="button" className="student-ghost-chip" onClick={() => void toggleFollow(person.id)}>
                  Seguir
                </button>
                {onOpenDm ? (
                  <button type="button" className="student-ghost-chip" onClick={() => onOpenDm(person.id)}>
                    <MessageCircle size={14} /> Mensagem
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <div className="error-box">{error}</div>}

      <div className="student-feed-list">
        {loadingFeed && posts.length === 0 && (
          <article className="student-empty-state">
            <strong>Carregando feed…</strong>
            <span>Buscando as publicações mais recentes.</span>
          </article>
        )}
        {!loadingFeed && posts.length === 0 && (
          <article className="student-empty-state">
            <strong>{brand.feedEmptyTitle}</strong>
            <span>{brand.feedEmptyText}</span>
          </article>
        )}
        {posts.map((post) => {
          const liveId = liveIdFromPost(post);
          const isLiveCard = Boolean(liveId) && (post.mediaType === "LIVE" || (liveId && post.mediaUrl?.replace(/^\//, "") === liveId));
          const items = (post.mediaItems?.length
            ? post.mediaItems
            : post.mediaUrl && !isLiveCard
              ? [{ url: post.mediaUrl, type: post.mediaType === "VIDEO" ? "VIDEO" : "IMAGE", coverUrl: null }]
              : []) as MediaItem[];
          return (
            <article className="student-feed-card" key={post.id}>
              <header>
                <button
                  type="button"
                  className={`student-feed-author${liveByHostId.has(post.author.id) ? " is-live" : ""}`}
                  onClick={() => {
                    const live = liveByHostId.get(post.author.id);
                    if (live && onOpenLive) {
                      onOpenLive(live.id);
                      return;
                    }
                    if (!post.isMine && onOpenPeerProfile) onOpenPeerProfile(post.author.id);
                    else if (post.isMine) onNavigate?.("profile");
                  }}
                >
                  {post.author.avatarUrl ? (
                    <img src={mediaUrl(post.author.avatarUrl)} alt="" />
                  ) : (
                    <span>{post.author.name.slice(0, 1)}</span>
                  )}
                  <div>
                    <strong>{post.author.name}</strong>
                    <small>
                      {liveByHostId.has(post.author.id)
                        ? "Ao vivo agora"
                        : new Date(post.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </small>
                  </div>
                  {liveByHostId.has(post.author.id) ? <em className="student-live-rail-badge">AO VIVO</em> : null}
                </button>
                {post.kind === "ACTIVITY" && post.activity && <em>{post.activity.sportLabel}</em>}
                <div className="student-feed-menu">
                  <button type="button" aria-label="Opções" onClick={() => setMenuPostId(menuPostId === post.id ? null : post.id)}>
                    <MoreHorizontal size={18} />
                  </button>
                  {menuPostId === post.id && (
                    <div className="student-feed-menu-pop">
                      {post.isMine ? (
                        <button type="button" onClick={() => void deletePost(post.id)}>
                          <Trash2 size={14} /> Apagar
                        </button>
                      ) : (
                        <>
                          {onOpenPeerProfile ? (
                            <button
                              type="button"
                              onClick={() => {
                                setMenuPostId(null);
                                onOpenPeerProfile(post.author.id);
                              }}
                            >
                              Ver perfil
                            </button>
                          ) : null}
                          {onOpenDm ? (
                            <button
                              type="button"
                              onClick={() => {
                                setMenuPostId(null);
                                onOpenDm(post.author.id);
                              }}
                            >
                              <MessageCircle size={14} /> Mensagem
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              setReportPostId(post.id);
                              setMenuPostId(null);
                            }}
                          >
                            <Flag size={14} /> Denunciar
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </header>
              {post.body && !isLiveCard && <p>{renderPostBody(post.body)}</p>}
              {post.kind === "ACTIVITY" && <ActivityMiniMap post={post} />}
              {isLiveCard && liveId ? (
                <button
                  type="button"
                  className="student-feed-live-card"
                  onClick={() => {
                    if (onOpenLive) onOpenLive(liveId);
                    else onNavigate?.("live");
                  }}
                >
                  <span className="student-live-badge">AO VIVO</span>
                  <strong>
                    {post.body?.replace(/^Ao vivo agora:\s*/i, "").replace(/^Ao vivo:\s*/i, "").replace(/^Live salva · [^:]+:\s*/i, "").replace(/\n?\[\[LIVE:[^\]]+\]\]/g, "").trim() ||
                      "Entrar na live"}
                  </strong>
                  <small>Toque para assistir · também fica em Lives salvas</small>
                </button>
              ) : (
                <MediaCarousel items={items} />
              )}
              <footer>
                <button type="button" className={post.likedByMe ? "is-on" : ""} onClick={() => void toggleLike(post.id)} aria-label="Curtir">
                  <ThumbsUp size={18} fill={post.likedByMe ? "currentColor" : "none"} /> {post.likesCount}
                </button>
                <button type="button" onClick={() => void openCommentsSheet(post.id)} aria-label="Comentar">
                  <MessageCircle size={18} /> {post.commentsCount ?? post.comments.length}
                </button>
                <button type="button" onClick={() => void sharePost(post)} aria-label="Compartilhar">
                  <Share2 size={18} />
                </button>
              </footer>
            </article>
          );
        })}
      </div>

      {hasMore && (
        <button
          type="button"
          className="student-ghost-chip student-feed-more"
          disabled={busy}
          onClick={() => void load(query, mode, page + 1, true)}
        >
          Carregar mais
        </button>
      )}

      {createPanel === "story" &&
        createPortal(
          <div
            className="student-feed-modal"
            role="presentation"
            onClick={() => {
              setCreatePanel(null);
              setStoryMedia(null);
              setStoryCoverPreview(null);
              setStoryCaption("");
            }}
          >
            <div
              className={`student-feed-modal-card${storyMedia ? " has-media" : ""}`}
              role="dialog"
              aria-label="Novo momento"
              onClick={(event) => event.stopPropagation()}
            >
              <header>
                <strong>Novo momento</strong>
                <button
                  type="button"
                  onClick={() => {
                    if (storyCoverPreview?.startsWith("blob:")) URL.revokeObjectURL(storyCoverPreview);
                    setCreatePanel(null);
                    setStoryMedia(null);
                    setStoryCoverPreview(null);
                    setStoryCaption("");
                  }}
                  aria-label="Fechar"
                >
                  <X size={18} />
                </button>
              </header>
              <div className="student-feed-modal-body">
                {!storyMedia ? (
                  <p className="student-activity-hint">Foto (6s) ou vídeo curto (até 1 min). Some em 24 horas.</p>
                ) : null}
                {storyMedia ? (
                  storyMedia.type === "VIDEO" ? (
                    <VideoCoverPicker
                      videoSrc={storyMedia.url}
                      localSrc={storyMedia.localSrc}
                      coverPreview={storyCoverPreview}
                      onCoverChange={(previewUrl) => {
                        if (storyCoverPreview?.startsWith("blob:")) URL.revokeObjectURL(storyCoverPreview);
                        setStoryCoverPreview(previewUrl);
                      }}
                      label="Escolher capa do momento"
                    />
                  ) : (
                    <div className="student-feed-preview student-feed-preview-story">
                      <img src={mediaUrl(storyMedia.url)} alt="" />
                    </div>
                  )
                ) : null}
              </div>
              <input
                ref={storyFileRef}
                type="file"
                accept={MEDIA_FILE_ACCEPT}
                hidden
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  setBusy(true);
                  try {
                    if (storyCoverPreview?.startsWith("blob:")) URL.revokeObjectURL(storyCoverPreview);
                    if (storyMedia) revokeMediaItem(storyMedia);
                    setStoryCoverPreview(null);
                    await assertStoryVideoWithinLimit(file);
                    setStoryMedia(await uploadFile(file));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Falha no envio da mídia.");
                  } finally {
                    setBusy(false);
                  }
                }}
              />
              <div className="student-feed-modal-actions">
                <button type="button" className="student-ghost-chip" onClick={() => storyFileRef.current?.click()} disabled={busy}>
                  <ImagePlus size={16} /> Galeria
                </button>
                <button type="button" className="student-ghost-chip" onClick={() => setCameraMode("photo")} disabled={busy}>
                  <Camera size={16} /> Câmera
                </button>
                <button type="button" className="student-ghost-chip" onClick={() => setCameraMode("video")} disabled={busy}>
                  <Video size={16} /> Vídeo
                </button>
              </div>
              <div className="student-feed-modal-footer">
                <input
                  value={storyCaption}
                  onChange={(event) => setStoryCaption(event.target.value)}
                  placeholder="Legenda (opcional)"
                  maxLength={120}
                />
                <button
                  type="button"
                  className="student-green-button"
                  disabled={busy || !storyMedia}
                  onClick={(event) => void publishStory(event as unknown as FormEvent)}
                >
                  {busy ? "Publicando…" : "Publicar momento"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {createPanel === "note" && (
        <div className="student-activity-sheet" role="dialog" aria-label="Nova nota">
          <header>
            <strong>Nota</strong>
            <button type="button" onClick={() => setCreatePanel(null)} aria-label="Fechar">
              <X size={18} />
            </button>
          </header>
          <textarea
            value={noteBody}
            onChange={(event) => setNoteBody(event.target.value)}
            rows={3}
            placeholder="Escreva uma nota rápida..."
            autoFocus
          />
          <button type="button" className="student-green-button" disabled={busy || !noteBody.trim()} onClick={(event) => void publishNote(event as unknown as FormEvent)}>
            Publicar nota
          </button>
        </div>
      )}

      {reportPostId && (
        <div className="student-activity-sheet" role="dialog" aria-label="Denunciar">
          <header>
            <strong>Denunciar publicação</strong>
            <button type="button" onClick={() => setReportPostId(null)} aria-label="Fechar">
              <X size={18} />
            </button>
          </header>
          <textarea value={reportReason} onChange={(event) => setReportReason(event.target.value)} rows={3} placeholder="Descreva o motivo (mín. 3 caracteres)" />
          <button type="button" className="student-green-button" onClick={() => void reportPost()}>
            Enviar denúncia
          </button>
        </div>
      )}

      {commentsPostId
        ? createPortal(
            <div
              className="student-comments-sheet"
              role="presentation"
              style={
                sheetViewport.height
                  ? ({
                      ["--comments-vv-top" as string]: `${sheetViewport.offsetTop}px`,
                      ["--comments-vv-height" as string]: `${sheetViewport.height}px`
                    } as React.CSSProperties)
                  : undefined
              }
              onClick={closeCommentsSheet}
            >
              <div
                className="student-comments-card"
                role="dialog"
                aria-label="Comentários"
                onClick={(event) => event.stopPropagation()}
              >
                <header className="student-comments-header">
                  <span className="student-comments-handle" aria-hidden />
                  <strong>Comentários</strong>
                  <button type="button" onClick={closeCommentsSheet} aria-label="Fechar">
                    <X size={18} />
                  </button>
                </header>

                <div className="student-comments-list">
                  {sheetLoading ? (
                    <p className="student-comments-empty">Carregando...</p>
                  ) : sheetComments.length === 0 ? (
                    <p className="student-comments-empty">Nenhum comentário ainda.</p>
                  ) : (
                    sheetComments.map((comment) => (
                      <div className="student-comments-thread" key={comment.id}>
                        <article className="student-comments-item">
                          <div className="student-comments-avatar" aria-hidden>
                            {comment.author.avatarUrl ? (
                              <img src={mediaUrl(comment.author.avatarUrl)} alt="" />
                            ) : (
                              <span>{comment.author.name.slice(0, 1)}</span>
                            )}
                          </div>
                          <div className="student-comments-body">
                            <p>
                              <strong>{comment.author.name.split(" ")[0]}</strong> {comment.body}
                            </p>
                            <div className="student-comments-meta">
                              <time dateTime={comment.createdAt}>{formatCompactRelative(comment.createdAt)}</time>
                              {(comment.likesCount ?? 0) > 0 ? (
                                <span>
                                  {comment.likesCount} curtida{(comment.likesCount ?? 0) === 1 ? "" : "s"}
                                </span>
                              ) : null}
                              <button
                                type="button"
                                onClick={() =>
                                  startReply({
                                    rootId: comment.id,
                                    name: comment.author.name.split(" ")[0]
                                  })
                                }
                              >
                                Responder
                              </button>
                            </div>
                          </div>
                          <button
                            type="button"
                            className={`student-comments-like${comment.likedByMe ? " is-on" : ""}`}
                            aria-label="Curtir comentário"
                            onClick={() => void toggleCommentLike(comment.id)}
                          >
                            <Heart size={14} fill={comment.likedByMe ? "currentColor" : "none"} />
                          </button>
                        </article>

                        {(comment.replies ?? []).length > 0 ? (
                          <div className="student-comments-replies">
                            {(comment.replies ?? []).map((reply) => (
                              <article className="student-comments-item is-reply" key={reply.id}>
                                <div className="student-comments-avatar" aria-hidden>
                                  {reply.author.avatarUrl ? (
                                    <img src={mediaUrl(reply.author.avatarUrl)} alt="" />
                                  ) : (
                                    <span>{reply.author.name.slice(0, 1)}</span>
                                  )}
                                </div>
                                <div className="student-comments-body">
                                  <p>
                                    <strong>{reply.author.name.split(" ")[0]}</strong> {reply.body}
                                  </p>
                                  <div className="student-comments-meta">
                                    <time dateTime={reply.createdAt}>{formatCompactRelative(reply.createdAt)}</time>
                                    {(reply.likesCount ?? 0) > 0 ? (
                                      <span>
                                        {reply.likesCount} curtida{(reply.likesCount ?? 0) === 1 ? "" : "s"}
                                      </span>
                                    ) : null}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        startReply({
                                          rootId: comment.id,
                                          name: reply.author.name.split(" ")[0]
                                        })
                                      }
                                    >
                                      Responder
                                    </button>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className={`student-comments-like${reply.likedByMe ? " is-on" : ""}`}
                                  aria-label="Curtir comentário"
                                  onClick={() => void toggleCommentLike(reply.id)}
                                >
                                  <Heart size={14} fill={reply.likedByMe ? "currentColor" : "none"} />
                                </button>
                              </article>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>

                <div className="student-comments-composer">
                  <div className="student-comments-emojis" role="list">
                    {COMMENT_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        role="listitem"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => setSheetDraft((current) => `${current}${emoji}`)}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  {replyTo ? (
                    <div className="student-comments-replying">
                      <span>Respondendo a {replyTo.name}</span>
                      <button type="button" onClick={clearReply} aria-label="Cancelar resposta">
                        <X size={14} />
                      </button>
                    </div>
                  ) : null}
                  <div className="student-comments-input-row">
                    <input
                      ref={commentInputRef}
                      value={sheetDraft}
                      onChange={(event) => setSheetDraft(event.target.value)}
                      placeholder={replyTo ? `Responder a ${replyTo.name}...` : "Adicione um comentário..."}
                      enterKeyHint="send"
                      maxLength={500}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void sendSheetComment();
                      }}
                    />
                    <button
                      type="button"
                      className="student-comments-send"
                      disabled={sheetBusy || !sheetDraft.trim()}
                      onClick={() => void sendSheetComment()}
                      aria-label="Enviar comentário"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {viewer && viewerRail
        ? createPortal(
            <StoryViewer
              rails={rails}
              startRail={viewer.rail}
              startItem={viewer.item}
              token={token}
              onClose={() => setViewer(null)}
              onSaved={() => void loadGallery().catch(() => undefined)}
            />,
            document.body
          )
        : null}

      {galleryOpen
        ? createPortal(
            <div className="student-feed-story-gallery-sheet" role="dialog" aria-label="Galeria de momentos">
              <header>
                <strong>Galeria</strong>
                <button type="button" onClick={() => setGalleryOpen(false)} aria-label="Fechar">
                  <X size={18} />
                </button>
              </header>
              <p className="student-activity-hint">Momentos salvos não expiram. Os ativos somem em 24h.</p>
              {galleryItems.length === 0 ? (
                <p className="student-feed-story-gallery-empty">Nenhum momento salvo ainda.</p>
              ) : (
                <div className="student-feed-story-gallery-grid">
                  {galleryItems.map((entry, index) => {
                    const thumb =
                      entry.coverUrl ||
                      (String(entry.mediaType).toUpperCase() === "IMAGE" ? entry.mediaUrl : entry.coverUrl) ||
                      entry.mediaUrl;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        className="student-feed-story-gallery-tile"
                        onClick={() => setGalleryViewerIndex(index)}
                      >
                        {String(entry.mediaType).toUpperCase() === "VIDEO" && !entry.coverUrl ? (
                          <video src={mediaUrl(entry.mediaUrl)} muted playsInline preload="metadata" aria-hidden />
                        ) : (
                          <img src={mediaUrl(thumb || entry.mediaUrl)} alt="" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>,
            document.body
          )
        : null}

      {galleryViewerRail && galleryViewerIndex != null
        ? createPortal(
            <StoryViewer
              rails={[galleryViewerRail]}
              startRail={0}
              startItem={0}
              token={token}
              archiveMode
              onClose={() => setGalleryViewerIndex(null)}
            />,
            document.body
          )
        : null}
    </section>
  );
}
