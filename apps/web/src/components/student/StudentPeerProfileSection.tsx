import { ArrowLeft, MessageCircle, Radio, UserPlus, UserRound, UserCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ApiError, apiGet, apiPost } from "../../api";
import { brand } from "../../lib/brand";
import { mediaUrl } from "../../lib/urls";
import { uiSounds } from "../../lib/ui-sounds";
import type { SocialPostRow } from "../../types";

const DEFAULT_COVER = "#c4783a";

export type PeerProfile = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  bio?: string | null;
  coverColor?: string | null;
  coverUrl?: string | null;
  objective?: string | null;
  level?: string | null;
  city?: string | null;
  state?: string | null;
  isPrivate: boolean;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  following: boolean;
  requested: boolean;
  isMe: boolean;
  canViewPosts: boolean;
  memberSince?: string | null;
  live?: { id: string; title: string; startedAt: string } | null;
};

type Props = {
  token: string;
  userId: string;
  onBack: () => void;
  onOpenDm: (userId: string) => void;
  onOpenLive: (liveId: string) => void;
  onOpenOwnProfile: () => void;
};

function handleFromName(name: string) {
  return name.replace(/\s+/g, "") || "atleta";
}

export function StudentPeerProfileSection({ token, userId, onBack, onOpenDm, onOpenLive, onOpenOwnProfile }: Props) {
  const [peer, setPeer] = useState<PeerProfile | null>(null);
  const [posts, setPosts] = useState<SocialPostRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const data = await apiGet<PeerProfile>(`/student/social/users/${userId}`, token);
      if (data.isMe) {
        onOpenOwnProfile();
        return;
      }
      setPeer(data);
      if (data.canViewPosts) {
        const feed = await apiGet<{ posts: SocialPostRow[] }>(
          `/student/social/posts?authorId=${encodeURIComponent(userId)}&mode=for-you`,
          token
        );
        setPosts(feed.posts);
      } else {
        setPosts([]);
      }
    } catch (caught) {
      setPeer(null);
      setError(caught instanceof ApiError ? caught.message : "Não foi possível abrir o perfil.");
    }
  }

  useEffect(() => {
    void load();
  }, [token, userId]);

  async function toggleFollow() {
    if (!peer || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiPost<{ following: boolean; requested: boolean }>(
        `/student/social/users/${peer.id}/follow`,
        {},
        token
      );
      setPeer((current) =>
        current
          ? {
              ...current,
              following: result.following,
              requested: result.requested,
              followersCount: Math.max(
                0,
                current.followersCount + (result.following && !current.following ? 1 : !result.following && current.following ? -1 : 0)
              ),
              canViewPosts: !current.isPrivate || result.following
            }
          : current
      );
      uiSounds.success();
      if (result.following || (!peer.isPrivate && !result.following)) {
        await load();
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Não foi possível atualizar o follow.");
      uiSounds.error();
    } finally {
      setBusy(false);
    }
  }

  const followersLabel = useMemo(() => {
    const n = peer?.followersCount ?? 0;
    return n === 1 ? "Seguidor" : "Seguidores";
  }, [peer?.followersCount]);

  const metaLine = peer
    ? [peer.objective, peer.level, peer.city && peer.state ? `${peer.city}/${peer.state}` : peer.city].filter(Boolean).join(" · ")
    : "";
  const coverImageUrl = peer?.coverUrl ? mediaUrl(peer.coverUrl) : null;
  const coverColor = peer?.coverColor || DEFAULT_COVER;

  return (
    <section className="student-sheet student-athlete-profile">
      <div className="student-athlete-social-actions" style={{ marginBottom: 12 }}>
        <button type="button" className="student-ghost-chip" onClick={onBack}>
          <ArrowLeft size={16} /> Voltar
        </button>
      </div>

      {error ? <div className="error-box">{error}</div> : null}

      {!peer && !error ? <p className="student-activity-hint">Carregando perfil…</p> : null}

      {peer ? (
        <>
          <header className="student-athlete-hero">
            <div
              className="student-athlete-cover"
              style={
                coverImageUrl
                  ? {
                      backgroundColor: coverColor,
                      backgroundImage: `url(${coverImageUrl})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center"
                    }
                  : { background: coverColor }
              }
            >
              <span className="student-athlete-handle">@{handleFromName(peer.name)}</span>
              {peer.live ? (
                <button type="button" className="student-peer-live-pill" onClick={() => onOpenLive(peer.live!.id)}>
                  <Radio size={14} /> AO VIVO · {peer.live.title}
                </button>
              ) : null}
            </div>

            <div className="student-athlete-hero-body">
              <div className="student-athlete-hero-main">
                <div className={`student-athlete-avatar-wrap${peer.live ? " is-live" : ""}`}>
                  {peer.avatarUrl ? (
                    <img src={mediaUrl(peer.avatarUrl)} alt="" className="student-athlete-avatar" />
                  ) : (
                    <span className="student-athlete-avatar student-athlete-avatar-fallback">
                      <UserRound size={40} />
                    </span>
                  )}
                  {peer.live ? <span className="student-live-avatar-badge">LIVE</span> : null}
                </div>

                <div className="student-athlete-identity">
                  <h1>{peer.name}</h1>
                  {metaLine ? <p className="student-athlete-meta">{metaLine}</p> : null}
                  <div className="student-athlete-follow-row">
                    <span>
                      <strong>{peer.followingCount}</strong> Seguindo
                    </span>
                    <span>
                      <strong>{peer.followersCount}</strong> {followersLabel}
                    </span>
                    <span>
                      <strong>{peer.postsCount}</strong> publicações
                    </span>
                  </div>
                  <p className="student-athlete-bio">{peer.canViewPosts ? peer.bio?.trim() || "Sem biografia" : "Conta privada"}</p>
                  {peer.isPrivate ? <p className="student-athlete-private">Conta privada</p> : null}
                </div>
              </div>

              <div className="student-athlete-hero-actions student-peer-actions">
                <button type="button" className="student-green-button" disabled={busy} onClick={() => void toggleFollow()}>
                  {peer.following ? <UserCheck size={16} /> : <UserPlus size={16} />}
                  {peer.following ? "Seguindo" : peer.requested ? "Solicitado" : "Seguir"}
                </button>
                <button type="button" className="student-outline-button" onClick={() => onOpenDm(peer.id)}>
                  <MessageCircle size={16} /> Mensagem
                </button>
                {peer.live ? (
                  <button type="button" className="student-outline-button" onClick={() => onOpenLive(peer.live!.id)}>
                    <Radio size={16} /> Assistir live
                  </button>
                ) : null}
              </div>
            </div>
          </header>

          <section className="student-athlete-grid-wrap">
            <header className="student-athlete-grid-head">
              <strong>Publicações</strong>
              <small>{peer.canViewPosts ? peer.postsCount : "Privado"}</small>
            </header>
            {!peer.canViewPosts ? (
              <p className="student-activity-hint">Siga esta conta para ver as publicações.</p>
            ) : posts.length === 0 ? (
              <p className="student-activity-hint">Nenhuma publicação ainda.</p>
            ) : (
              <div className="student-athlete-grid">
                {posts.map((post) => {
                  const media = post.mediaItems?.[0] ?? (post.mediaUrl ? { url: post.mediaUrl, type: post.mediaType, coverUrl: null } : null);
                  const isVideo = media?.type === "VIDEO";
                  const thumb = (isVideo ? media?.coverUrl : null) || media?.url || null;
                  return (
                    <article key={post.id} className="student-athlete-grid-item">
                      {thumb ? (
                        isVideo && !media?.coverUrl ? (
                          <video src={mediaUrl(thumb)} muted playsInline />
                        ) : (
                          <img src={mediaUrl(thumb)} alt="" />
                        )
                      ) : (
                        <p>{post.body?.slice(0, 80) || brand.athlete}</p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}
