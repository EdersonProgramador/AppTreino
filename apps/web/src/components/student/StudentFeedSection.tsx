import {
  Camera,
  Clapperboard,
  Flag,
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
import { apiDelete, apiGet, apiPost, apiUpload } from "../../api";
import { mediaUrl } from "../../lib/urls";
import { formatClock, formatKm, formatPace } from "../../lib/activity-geo";
import { readFeedCache, writeFeedCache } from "../../lib/feed-cache";
import { useFeedChromeStore } from "../../stores/feedChromeStore";
import { brand } from "../../lib/brand";
import { shareSocialPost } from "../../lib/share-social-post";
import type {
  SocialAuthor,
  SocialPostRow,
  SocialStoryRail,
  UploadResponse
} from "../../types";
import { StudentCameraCapture } from "./StudentCameraCapture";

type FeedMode = "for-you" | "following";
type MediaItem = { url: string; type: "IMAGE" | "VIDEO" };
type SocialNav = "reels" | "live" | "messages" | "chat" | "requests" | "profile";
type CreatePanel = "post" | "story" | "note" | null;
type CameraMode = "photo" | "video" | null;

const MAX_MEDIA = 10;

function renderPostBody(content: string) {
  const parts = content.split(/(#[\p{L}0-9_]{2,40}|@[A-Za-z0-9._-]{2,40})/gu);
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

function ActivityMiniMap({ post }: { post: SocialPostRow }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const activity = post.activity;
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !activity) return;
    const send = () => {
      iframe.contentWindow?.postMessage({ type: "setTrack", points: activity.polyline }, "*");
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
        <iframe ref={iframeRef} title="Percurso" src="/activity-map.html" />
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
  const itemsKey = items.map((item) => item.url).join("|");
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
          <video className="student-feed-media" src={mediaUrl(current.url)} controls playsInline key={current.url} />
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
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [menuPostId, setMenuPostId] = useState<string | null>(null);
  const [reportPostId, setReportPostId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createPanel, setCreatePanel] = useState<CreatePanel>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>(null);
  const [storyCaption, setStoryCaption] = useState("");
  const [storyMedia, setStoryMedia] = useState<MediaItem | null>(null);
  const [viewer, setViewer] = useState<{ rail: number; item: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const storyFileRef = useRef<HTMLInputElement>(null);
  const createMenuRef = useRef<HTMLDivElement>(null);

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
    return {
      url: uploaded.file.url,
      type: (file.type.startsWith("video/") ? "VIDEO" : "IMAGE") as "IMAGE" | "VIDEO"
    };
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
      const created = await apiPost<{ post: SocialPostRow }>(
        "/student/social/posts",
        {
          body: body.trim(),
          mediaItems,
          mediaUrl: mediaItems[0]?.url,
          mediaType: mediaItems[0]?.type
        },
        token
      );
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

  async function sendComment(postId: string) {
    const text = commentDraft[postId]?.trim();
    if (!text) return;
    const result = await apiPost<{ comment: SocialPostRow["comments"][number] }>(
      `/student/social/posts/${postId}/comments`,
      { body: text },
      token
    );
    setCommentDraft((current) => ({ ...current, [postId]: "" }));
    setPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? {
              ...post,
              comments: [...post.comments, result.comment],
              commentsCount: (post.commentsCount ?? post.comments.length) + 1
            }
          : post
      )
    );
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
      await apiPost(
        "/student/social/stories",
        {
          mediaUrl: storyMedia.url,
          mediaType: storyMedia.type,
          caption: storyCaption.trim() || undefined,
          mood: "vibe"
        },
        token
      );
      setCreatePanel(null);
      setStoryCaption("");
      setStoryMedia(null);
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
    const first = rails[railIndex]?.items[0];
    if (first && !first.seen) {
      await apiPost(`/student/social/stories/${first.id}/view`, {}, token).catch(() => undefined);
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
    if (!createMenuOpen) return;
    function onDocClick(event: MouseEvent) {
      if (createMenuRef.current && !createMenuRef.current.contains(event.target as Node)) {
        setCreateMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [createMenuOpen]);

  function openCreate(panel: CreatePanel) {
    setCreateMenuOpen(false);
    setSearchOpen(false);
    if (panel === "story") {
      setStoryCaption("");
      setStoryMedia(null);
    }
    setCreatePanel(panel);
  }

  const viewerRail = viewer ? rails[viewer.rail] : null;
  const viewerItem = viewer && viewerRail ? viewerRail.items[viewer.item] : null;

  return (
    <section className="student-feed">
      <div className={`student-feed-chrome${createMenuOpen || searchOpen ? " is-open" : ""}`} ref={createMenuRef}>
        {createMenuOpen && (
          <div className="student-feed-create-menu is-header-anchored" role="menu">
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
          </div>
        )}

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

      <div className="student-feed-stories">
        <header>
          <div>
            <strong>Momentos</strong>
            <small>24 horas, no clima do treino</small>
          </div>
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
            return (
              <button
                key={rail.userId}
                type="button"
                className={rail.unseen || rail.isMine ? "is-hot" : ""}
                onClick={() => void openStory(storyIndex >= 0 ? storyIndex : 0)}
              >
                {rail.image_url ? <img src={mediaUrl(rail.image_url)} alt="" /> : <span>{rail.username.slice(0, 1)}</span>}
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
                  {item.type === "VIDEO" ? <video src={mediaUrl(item.url)} muted /> : <img src={mediaUrl(item.url)} alt="" />}
                  <button
                    type="button"
                    onClick={() => setMediaItems((current) => current.filter((row) => row.url !== item.url))}
                    aria-label="Remover"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              {mediaItems.length > 1 && <em>Carrossel · {mediaItems.length} itens</em>}
            </div>
          )}
          <div className="student-feed-composer-bar">
            <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={(event) => void onPickFiles(event.target.files)} />
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
          const items = (post.mediaItems?.length
            ? post.mediaItems
            : post.mediaUrl
              ? [{ url: post.mediaUrl, type: post.mediaType === "VIDEO" ? "VIDEO" : "IMAGE" }]
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
              {post.body && <p>{renderPostBody(post.body)}</p>}
              {post.kind === "ACTIVITY" && <ActivityMiniMap post={post} />}
              <MediaCarousel items={items} />
              <footer>
                <button type="button" className={post.likedByMe ? "is-on" : ""} onClick={() => void toggleLike(post.id)} aria-label="Curtir">
                  <ThumbsUp size={18} fill={post.likedByMe ? "currentColor" : "none"} /> {post.likesCount}
                </button>
                <button
                  type="button"
                  onClick={() => setOpenComments((current) => ({ ...current, [post.id]: !current[post.id] }))}
                  aria-label="Comentar"
                >
                  <MessageCircle size={18} /> {post.commentsCount ?? post.comments.length}
                </button>
                <button type="button" onClick={() => void sharePost(post)} aria-label="Compartilhar">
                  <Share2 size={18} />
                </button>
              </footer>
              {(openComments[post.id] ? post.comments : post.comments.slice(-3)).map((comment) => (
                <p className="student-feed-comment" key={comment.id}>
                  <strong>{comment.author.name.split(" ")[0]}</strong> {comment.body}
                </p>
              ))}
              <div className="student-feed-comment-box">
                <input
                  value={commentDraft[post.id] ?? ""}
                  onChange={(event) => setCommentDraft((current) => ({ ...current, [post.id]: event.target.value }))}
                  placeholder="Comentar"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void sendComment(post.id);
                  }}
                />
                <button type="button" onClick={() => void sendComment(post.id)} aria-label="Enviar comentário">
                  <Send size={16} />
                </button>
              </div>
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

      {createPanel === "story" && (
        <div
          className="student-feed-modal"
          role="presentation"
          onClick={() => {
            setCreatePanel(null);
            setStoryMedia(null);
            setStoryCaption("");
          }}
        >
          <div
            className="student-feed-modal-card"
            role="dialog"
            aria-label="Novo momento"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <strong>Novo momento</strong>
              <button
                type="button"
                onClick={() => {
                  setCreatePanel(null);
                  setStoryMedia(null);
                  setStoryCaption("");
                }}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </header>
            <p className="student-activity-hint">Foto ou vídeo curto. Some em 24 horas.</p>
            <input
              ref={storyFileRef}
              type="file"
              accept="image/*,video/*"
              hidden
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setBusy(true);
                try {
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
            {storyMedia && (
              <div className="student-feed-preview">
                {storyMedia.type === "VIDEO" ? (
                  <video src={mediaUrl(storyMedia.url)} controls />
                ) : (
                  <img src={mediaUrl(storyMedia.url)} alt="" />
                )}
              </div>
            )}
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
              Publicar momento
            </button>
          </div>
        </div>
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

      {viewer && viewerRail && viewerItem && (
        <div
          className="student-feed-story-viewer"
          onClick={() => setViewer(null)}
          role="dialog"
          aria-label="Momento"
        >
          <div className="student-feed-story-viewer-card" onClick={(event) => event.stopPropagation()}>
            <header>
              <strong>{viewerRail.isMine ? "Você" : viewerRail.username}</strong>
              <button type="button" onClick={() => setViewer(null)} aria-label="Fechar">
                <X size={18} />
              </button>
            </header>
            {viewerItem.mediaType === "VIDEO" ? (
              <video src={mediaUrl(viewerItem.mediaUrl)} controls autoPlay playsInline />
            ) : (
              <img src={mediaUrl(viewerItem.mediaUrl)} alt="" />
            )}
            {viewerItem.caption && <p>{viewerItem.caption}</p>}
            <div className="student-feed-carousel-nav">
              <button
                type="button"
                disabled={viewer.item <= 0}
                onClick={() => setViewer((current) => (current ? { ...current, item: current.item - 1 } : current))}
              >
                ‹
              </button>
              <span>
                {viewer.item + 1}/{viewerRail.items.length}
              </span>
              <button
                type="button"
                disabled={viewer.item >= viewerRail.items.length - 1}
                onClick={() => {
                  const next = viewer.item + 1;
                  const nextItem = viewerRail.items[next];
                  if (nextItem && !nextItem.seen) {
                    void apiPost(`/student/social/stories/${nextItem.id}/view`, {}, token);
                  }
                  setViewer((current) => (current ? { ...current, item: next } : current));
                }}
              >
                ›
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
