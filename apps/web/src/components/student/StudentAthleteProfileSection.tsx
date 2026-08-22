import { ChevronLeft, ChevronRight, Heart, MessageCircle, Pencil, Send, Settings, ThumbsDown, UserRound, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiGet, apiPost, apiPut, apiUpload } from "../../api";
import { brand } from "../../lib/brand";
import { mediaUrl } from "../../lib/urls";
import { uiSounds } from "../../lib/ui-sounds";
import type { SocialPostRow, StudentProfile, UploadResponse } from "../../types";

const COVER_COLORS = [
  "#c4783a",
  "#e06a3c",
  "#f0b45a",
  "#8b5a2b",
  "#2d4a3e",
  "#1a1c1f",
  "#3d2a1f",
  "#5c3d2e"
];

const DEFAULT_COVER = "#c4783a";

type MediaItem = { url: string; type: "IMAGE" | "VIDEO" };

type AthleteSocial = {
  followersCount: number;
  followingCount: number;
  postsCount: number;
  isPrivate: boolean;
};

type Props = {
  token: string;
  profile: StudentProfile | null;
  athleteSocial: AthleteSocial | null;
  onOpenSettings: () => void;
  onProfileUpdated: (profile: StudentProfile) => void;
};

function handleFromName(name: string) {
  return name.replace(/\s+/g, "") || "atleta";
}

function formatMemberSince(iso?: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function mediaOf(post: SocialPostRow): MediaItem[] {
  if (post.mediaItems?.length) {
    return post.mediaItems.map((item) => ({
      url: item.url,
      type: item.type === "VIDEO" ? "VIDEO" : "IMAGE"
    }));
  }
  if (post.mediaUrl) {
    return [{ url: post.mediaUrl, type: post.mediaType === "VIDEO" ? "VIDEO" : "IMAGE" }];
  }
  return [];
}

function ViewerCarousel({ items }: { items: MediaItem[] }) {
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);
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
          <video className="student-feed-media" src={mediaUrl(current.url)} controls playsInline autoPlay key={current.url} />
        ) : (
          <img className="student-feed-media" src={mediaUrl(current.url)} alt="" key={current.url} />
        )}
        {items.length > 1 && (
          <>
            <button type="button" className="student-feed-carousel-arrow is-prev" disabled={safeIndex <= 0} onClick={() => go(safeIndex - 1)}>
              ‹
            </button>
            <button
              type="button"
              className="student-feed-carousel-arrow is-next"
              disabled={safeIndex >= items.length - 1}
              onClick={() => go(safeIndex + 1)}
            >
              ›
            </button>
            <div className="student-feed-carousel-dots">
              {items.map((item, dot) => (
                <button key={`${item.url}-${dot}`} type="button" className={dot === safeIndex ? "is-on" : ""} onClick={() => go(dot)} />
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

export function StudentAthleteProfileSection({
  token,
  profile,
  athleteSocial,
  onOpenSettings,
  onProfileUpdated
}: Props) {
  const [posts, setPosts] = useState<SocialPostRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [coverColor, setCoverColor] = useState(profile?.coverColor || DEFAULT_COVER);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const coverColorValue = profile?.coverColor || DEFAULT_COVER;
  /** Enquanto o modal está aberto, mostra o rascunho; ao fechar, só o que está salvo. */
  const coverImageUrl = editOpen
    ? coverPreview
      ? coverPreview
      : !removeCover && profile?.coverUrl
        ? mediaUrl(profile.coverUrl)
        : null
    : profile?.coverUrl
      ? mediaUrl(profile.coverUrl)
      : null;
  const displayCoverColor = editOpen ? coverColor : coverColorValue;
  const handle = handleFromName(profile?.name ?? brand.athlete);
  const memberSince = formatMemberSince(profile?.createdAt);
  const metaLine = [profile?.objective, profile?.level, profile?.city && profile?.state ? `${profile.city}/${profile.state}` : profile?.city]
    .filter(Boolean)
    .join(" · ");
  const viewerPost = viewerIndex != null ? posts[viewerIndex] ?? null : null;

  const followersLabel = useMemo(() => {
    const n = athleteSocial?.followersCount ?? 0;
    return n === 1 ? "Seguidor" : "Seguidores";
  }, [athleteSocial?.followersCount]);

  useEffect(() => {
    setBio(profile?.bio ?? "");
    setCoverColor(profile?.coverColor || DEFAULT_COVER);
    setCoverFile(null);
    setCoverPreview(null);
    setRemoveCover(false);
    setAvatarFile(null);
    setAvatarPreview(null);
  }, [profile?.bio, profile?.coverColor, profile?.coverUrl, profile?.avatarUrl]);

  function discardSocialEdit() {
    setBio(profile?.bio ?? "");
    setCoverColor(profile?.coverColor || DEFAULT_COVER);
    setCoverFile(null);
    setCoverPreview(null);
    setRemoveCover(false);
    setAvatarFile(null);
    setAvatarPreview(null);
    setError(null);
    setEditOpen(false);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const me = await apiGet<{ id: string }>("/student/social/me", token);
        const data = await apiGet<{ posts: SocialPostRow[] }>(
          `/student/social/posts?authorId=${encodeURIComponent(me.id)}&mode=for-you`,
          token
        );
        if (!cancelled) setPosts(data.posts);
      } catch {
        if (!cancelled) setPosts([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, athleteSocial?.postsCount]);

  useEffect(() => {
    if (viewerIndex == null) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        uiSounds.popupClose();
        setViewerIndex(null);
      }
      if (event.key === "ArrowLeft") {
        setViewerIndex((current) => (current == null ? current : Math.max(0, current - 1)));
      }
      if (event.key === "ArrowRight") {
        setViewerIndex((current) =>
          current == null ? current : Math.min(posts.length - 1, current + 1)
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerIndex, posts.length]);

  function patchPost(postId: string, patch: Partial<SocialPostRow>) {
    setPosts((current) => current.map((post) => (post.id === postId ? { ...post, ...patch } : post)));
  }

  async function toggleLike(postId: string) {
    try {
      const data = await apiPost<{
        likesCount: number;
        likedByMe: boolean;
        dislikesCount?: number;
        dislikedByMe?: boolean;
      }>(`/student/social/posts/${postId}/like`, {}, token);
      patchPost(postId, {
        likesCount: data.likesCount,
        likedByMe: data.likedByMe,
        dislikesCount: data.dislikesCount,
        dislikedByMe: data.dislikedByMe
      });
      uiSounds.itemSelect();
    } catch {
      uiSounds.error();
    }
  }

  async function toggleDislike(postId: string) {
    try {
      const data = await apiPost<{
        likesCount: number;
        likedByMe: boolean;
        dislikesCount?: number;
        dislikedByMe?: boolean;
      }>(`/student/social/posts/${postId}/dislike`, {}, token);
      patchPost(postId, {
        likesCount: data.likesCount,
        likedByMe: data.likedByMe,
        dislikesCount: data.dislikesCount,
        dislikedByMe: data.dislikedByMe
      });
      uiSounds.itemSelect();
    } catch {
      uiSounds.error();
    }
  }

  async function sendComment(postId: string) {
    const body = commentDraft.trim();
    if (!body) return;
    try {
      const data = await apiPost<{ comment: SocialPostRow["comments"][number]; commentsCount: number }>(
        `/student/social/posts/${postId}/comments`,
        { body },
        token
      );
      setPosts((current) =>
        current.map((post) =>
          post.id === postId
            ? {
                ...post,
                comments: [...post.comments, data.comment],
                commentsCount: data.commentsCount ?? post.comments.length + 1
              }
            : post
        )
      );
      setCommentDraft("");
      uiSounds.success();
    } catch {
      uiSounds.error();
    }
  }

  async function saveSocial(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let avatarUrl: string | undefined;
      if (avatarFile) {
        const uploadData = new FormData();
        uploadData.append("file", avatarFile);
        const uploaded = await apiUpload<UploadResponse>(`/user/uploads?group=images`, uploadData, token);
        uiSounds.screenshot();
        avatarUrl = uploaded.file.url;
      }
      let coverUrl: string | null | undefined;
      if (coverFile) {
        const uploadData = new FormData();
        uploadData.append("file", coverFile);
        const uploaded = await apiUpload<UploadResponse>(`/user/uploads?group=images`, uploadData, token);
        uiSounds.screenshot();
        coverUrl = uploaded.file.url;
      } else if (removeCover) {
        coverUrl = "";
      }
      const response = await apiPut<{ profile: StudentProfile }>(
        "/user/profile",
        {
          bio: bio.trim(),
          coverColor,
          ...(avatarUrl ? { avatarUrl } : {}),
          ...(coverUrl !== undefined ? { coverUrl } : {})
        },
        token
      );
      onProfileUpdated(response.profile);
      setAvatarFile(null);
      setAvatarPreview(null);
      setCoverFile(null);
      setCoverPreview(null);
      setRemoveCover(false);
      setEditOpen(false);
      uiSounds.success();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Não foi possível salvar o perfil social.");
      uiSounds.error();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="student-sheet student-athlete-profile">
      <header className="student-athlete-hero">
        <div
          className="student-athlete-cover"
          style={
            coverImageUrl
              ? {
                  backgroundColor: displayCoverColor,
                  backgroundImage: `url(${coverImageUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center"
                }
              : { background: displayCoverColor }
          }
        >
          <button
            type="button"
            className="student-athlete-edit-fab"
            aria-label="Editar capa do perfil"
            title="Editar capa"
            onClick={() => {
              uiSounds.popupOpen();
              setEditOpen(true);
            }}
          >
            <Pencil size={16} />
          </button>
          <span className="student-athlete-handle">{handle}</span>
        </div>

        <div className="student-athlete-hero-body">
          <div className="student-athlete-hero-main">
            <div className="student-athlete-avatar-wrap">
              {profile?.avatarUrl ? (
                <img src={mediaUrl(profile.avatarUrl)} alt="" className="student-athlete-avatar" />
              ) : (
                <span className="student-athlete-avatar student-athlete-avatar-fallback">
                  <UserRound size={40} />
                </span>
              )}
            </div>

            <div className="student-athlete-identity">
              <h1>{profile?.name ?? brand.athlete}</h1>
              {metaLine ? <p className="student-athlete-meta">{metaLine}</p> : null}
              <div className="student-athlete-follow-row">
                <span>
                  <strong>{athleteSocial?.followingCount ?? 0}</strong> Seguindo
                </span>
                <span>
                  <strong>{athleteSocial?.followersCount ?? 0}</strong> {followersLabel}
                </span>
              </div>
              <p className="student-athlete-bio">{profile?.bio?.trim() || "Sem biografia"}</p>
              {memberSince ? <p className="student-athlete-since">Atleta desde {memberSince}</p> : null}
              {athleteSocial?.isPrivate ? <p className="student-athlete-private">Conta privada</p> : null}
            </div>
          </div>

          <div className="student-athlete-hero-actions">
            <button type="button" className="student-outline-button" onClick={onOpenSettings}>
              <Settings size={16} />
              Configurações do perfil
            </button>
          </div>
        </div>
      </header>

      <div className="student-athlete-posts">
        <h2>Minhas publicações ({athleteSocial?.postsCount ?? posts.length})</h2>
        {posts.length === 0 ? (
          <article className="student-athlete-posts-empty">Nenhuma publicação ainda :(</article>
        ) : (
          <div className="student-athlete-posts-grid">
            {posts.map((post, index) => {
              const thumb = post.mediaItems?.[0]?.url || post.mediaUrl || null;
              return (
                <button
                  key={post.id}
                  type="button"
                  className="student-athlete-post-card"
                  onClick={() => {
                    uiSounds.popupOpen();
                    setCommentDraft("");
                    setViewerIndex(index);
                  }}
                >
                  {thumb ? (
                    post.mediaType === "VIDEO" || post.mediaItems?.[0]?.type === "VIDEO" ? (
                      <video src={mediaUrl(thumb)} muted playsInline />
                    ) : (
                      <img src={mediaUrl(thumb)} alt="" />
                    )
                  ) : (
                    <p>{post.body || "Publicação"}</p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {viewerPost && viewerIndex != null && (
        <div
          className="student-athlete-post-viewer"
          role="dialog"
          aria-modal="true"
          aria-label="Publicação"
          onClick={() => {
            uiSounds.popupClose();
            setViewerIndex(null);
          }}
        >
          <button
            type="button"
            className="student-athlete-post-viewer-nav is-prev"
            disabled={viewerIndex <= 0}
            aria-label="Publicação anterior"
            onClick={(event) => {
              event.stopPropagation();
              setViewerIndex((current) => (current == null ? current : Math.max(0, current - 1)));
            }}
          >
            <ChevronLeft size={28} />
          </button>
          <button
            type="button"
            className="student-athlete-post-viewer-nav is-next"
            disabled={viewerIndex >= posts.length - 1}
            aria-label="Próxima publicação"
            onClick={(event) => {
              event.stopPropagation();
              setViewerIndex((current) =>
                current == null ? current : Math.min(posts.length - 1, current + 1)
              );
            }}
          >
            <ChevronRight size={28} />
          </button>

          <article
            className="student-feed-card student-athlete-post-viewer-card"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              {viewerPost.author.avatarUrl ? (
                <img src={mediaUrl(viewerPost.author.avatarUrl)} alt="" />
              ) : (
                <span>{viewerPost.author.name.slice(0, 1)}</span>
              )}
              <div>
                <strong>{viewerPost.author.name}</strong>
                <small>
                  {new Date(viewerPost.createdAt).toLocaleString("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short"
                  })}
                </small>
              </div>
              <button
                type="button"
                className="student-athlete-post-viewer-close"
                aria-label="Fechar"
                onClick={() => {
                  uiSounds.popupClose();
                  setViewerIndex(null);
                }}
              >
                <X size={18} />
              </button>
            </header>
            {viewerPost.body ? <p>{viewerPost.body}</p> : null}
            <ViewerCarousel key={viewerPost.id} items={mediaOf(viewerPost)} />
            <footer>
              <button
                type="button"
                className={viewerPost.likedByMe ? "is-on" : ""}
                onClick={() => void toggleLike(viewerPost.id)}
              >
                <Heart size={18} /> {viewerPost.likesCount}
              </button>
              <button
                type="button"
                className={viewerPost.dislikedByMe ? "is-on" : ""}
                onClick={() => void toggleDislike(viewerPost.id)}
              >
                <ThumbsDown size={18} /> {viewerPost.dislikesCount ?? 0}
              </button>
              <span>
                <MessageCircle size={18} /> {viewerPost.commentsCount ?? viewerPost.comments.length}
              </span>
            </footer>
            <div className="student-athlete-post-viewer-comments">
              {viewerPost.comments.map((comment) => (
                <p className="student-feed-comment" key={comment.id}>
                  <strong>{comment.author.name.split(" ")[0]}</strong> {comment.body}
                </p>
              ))}
            </div>
            <div className="student-feed-comment-box">
              <input
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                placeholder="Comentar"
                onKeyDown={(event) => {
                  if (event.key === "Enter") void sendComment(viewerPost.id);
                }}
              />
              <button type="button" onClick={() => void sendComment(viewerPost.id)} aria-label="Enviar comentário">
                <Send size={16} />
              </button>
            </div>
          </article>
        </div>
      )}

      {editOpen && (
        <div
          className="student-athlete-edit-backdrop"
          role="presentation"
          onClick={() => {
            uiSounds.popupClose();
            discardSocialEdit();
          }}
        >
          <form
            className="student-athlete-edit-modal"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => void saveSocial(event)}
          >
            <header>
              <strong>Editar perfil social</strong>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => {
                  uiSounds.popupClose();
                  discardSocialEdit();
                }}
              >
                ×
              </button>
            </header>

            <label className="student-athlete-edit-avatar">
              <span className="student-athlete-avatar-wrap is-edit">
                {avatarPreview || profile?.avatarUrl ? (
                  <img
                    src={avatarPreview ?? mediaUrl(profile?.avatarUrl ?? "")}
                    alt=""
                    className="student-athlete-avatar"
                  />
                ) : (
                  <span className="student-athlete-avatar student-athlete-avatar-fallback">
                    <UserRound size={32} />
                  </span>
                )}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setAvatarFile(file);
                  const reader = new FileReader();
                  reader.onload = () => setAvatarPreview(String(reader.result));
                  reader.readAsDataURL(file);
                }}
              />
              <small>Trocar foto</small>
            </label>

            <label>
              Biografia
              <textarea
                value={bio}
                maxLength={280}
                rows={3}
                placeholder="Conte um pouco sobre seu treino e corrida…"
                onChange={(event) => setBio(event.target.value)}
              />
            </label>

            <fieldset className="student-athlete-cover-editor">
              <legend>Capa do perfil</legend>
              <div
                className="student-athlete-cover-preview"
                style={
                  coverPreview || (!removeCover && profile?.coverUrl)
                    ? {
                        backgroundColor: coverColor,
                        backgroundImage: `url(${coverPreview ?? mediaUrl(profile?.coverUrl ?? "")})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center"
                      }
                    : { background: coverColor }
                }
              />
              <div className="student-athlete-cover-actions">
                <label className="student-outline-button student-athlete-cover-upload">
                  Escolher foto
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      setCoverFile(file);
                      setRemoveCover(false);
                      const reader = new FileReader();
                      reader.onload = () => setCoverPreview(String(reader.result));
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
                {(coverPreview || profile?.coverUrl) && !removeCover ? (
                  <button
                    type="button"
                    className="student-outline-button"
                    onClick={() => {
                      setCoverFile(null);
                      setCoverPreview(null);
                      setRemoveCover(true);
                    }}
                  >
                    Remover foto
                  </button>
                ) : null}
              </div>
              <p className="student-athlete-cover-hint">Ou escolha uma cor de fundo</p>
              <div className="student-athlete-cover-swatches">
                {COVER_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={coverColor === color ? "is-active" : ""}
                    style={{ background: color }}
                    aria-label={`Capa ${color}`}
                    onClick={() => setCoverColor(color)}
                  />
                ))}
              </div>
            </fieldset>

            {error ? <p className="error-box">{error}</p> : null}

            <div className="student-athlete-edit-actions">
              <button className="student-green-button" type="submit" disabled={busy}>
                {busy ? "Salvando…" : "Salvar"}
              </button>
              <button
                className="student-outline-button"
                type="button"
                onClick={() => {
                  onOpenSettings();
                  setEditOpen(false);
                }}
              >
                Dados cadastrais
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
