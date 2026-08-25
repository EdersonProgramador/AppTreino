import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { apiGet } from "../../api";
import { brand } from "../../lib/brand";
import { assetUrl, mediaUrl } from "../../lib/urls";
import { useAuth } from "../../auth/AuthContext";
import { homePathForRole, paths } from "../../auth/paths";
import { TransitionScreen } from "../../auth/RouteGuards";

type PublicSharePost = {
  id: string;
  body: string;
  kind: string;
  createdAt: string;
  likesCount: number;
  commentsCount: number;
  coverUrl?: string | null;
  mediaItems: Array<{ url: string; type: "IMAGE" | "VIDEO" }>;
  author: { id: string; name: string; avatarUrl?: string | null };
};

export function SharedPostPage() {
  const { postId = "" } = useParams();
  const { user, token, isTransitioning, transitionMessage, phase } = useAuth();
  const [post, setPost] = useState<PublicSharePost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSignup, setShowSignup] = useState(false);

  useEffect(() => {
    if (!postId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setShowSignup(false);
    void (async () => {
      try {
        const data = await apiGet<{ post: PublicSharePost }>(`/public/posts/${encodeURIComponent(postId)}`);
        if (cancelled) return;
        setPost(data.post);
        window.setTimeout(() => {
          if (!cancelled) setShowSignup(true);
        }, 900);
      } catch {
        if (!cancelled) setError("Publicação não encontrada ou indisponível.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [postId]);

  useEffect(() => {
    if (!post) return;
    const title = `${post.author.name} · ${brand.name}`;
    const previous = document.title;
    document.title = title;
    const ensureMeta = (property: string, content: string, attr: "property" | "name" = "property") => {
      let node = document.head.querySelector(`meta[${attr}="${property}"]`) as HTMLMetaElement | null;
      if (!node) {
        node = document.createElement("meta");
        node.setAttribute(attr, property);
        document.head.appendChild(node);
      }
      node.content = content;
    };
    const description = post.body?.slice(0, 160) || `Veja a publicação de ${post.author.name} no ${brand.name}.`;
    const firstMedia = post.mediaItems[0];
    const image =
      mediaUrl(post.coverUrl) ||
      (firstMedia?.type === "IMAGE" ? mediaUrl(firstMedia.url) : "") ||
      assetUrl("assets/app-treino-logo.svg");
    ensureMeta("og:title", title);
    ensureMeta("og:description", description);
    ensureMeta("og:image", image);
    ensureMeta("description", description, "name");
    ensureMeta("twitter:card", "summary_large_image", "name");
    ensureMeta("twitter:image", image, "name");
    return () => {
      document.title = previous;
    };
  }, [post]);

  if (isTransitioning || phase === "restoring") {
    return <TransitionScreen message={transitionMessage} />;
  }

  if (user && token) {
    return <Navigate to={`${homePathForRole(user.role)}?section=feed`} replace />;
  }

  const media = post?.mediaItems[0];
  const registerTo = `${paths.login}?mode=register&post=${encodeURIComponent(postId)}`;
  const loginTo = `${paths.login}?post=${encodeURIComponent(postId)}`;

  return (
    <div className="shared-post-page">
      <header className="shared-post-chrome">
        <Link to={paths.home} aria-label="Ir para início">
          <img src={assetUrl("assets/app-treino-logo.svg")} alt={brand.name} />
        </Link>
      </header>

      <main className="shared-post-main">
        {loading ? (
          <p className="shared-post-status">Carregando publicação…</p>
        ) : error || !post ? (
          <div className="shared-post-card shared-post-empty">
            <strong>Publicação indisponível</strong>
            <p>{error ?? "Não foi possível abrir este link."}</p>
            <Link className="shared-post-cta" to={`${paths.login}?mode=register`}>
              Criar conta
            </Link>
          </div>
        ) : (
          <article className="shared-post-card">
            <header className="shared-post-author">
              {post.author.avatarUrl ? (
                <img src={mediaUrl(post.author.avatarUrl)} alt="" />
              ) : (
                <span>{post.author.name.slice(0, 1)}</span>
              )}
              <div>
                <strong>{post.author.name}</strong>
                <small>{brand.name}</small>
              </div>
            </header>

            <div className="shared-post-media">
              {media?.type === "VIDEO" ? (
                <video src={mediaUrl(media.url)} controls playsInline poster={post.coverUrl ? mediaUrl(post.coverUrl) : undefined} />
              ) : media?.url || post.coverUrl ? (
                <img src={mediaUrl(media?.url || post.coverUrl || "")} alt="" />
              ) : (
                <div className="shared-post-media-fallback">
                  <img src={assetUrl("assets/app-treino-mark.svg")} alt="" />
                </div>
              )}
            </div>

            {post.body ? <p className="shared-post-body">{post.body}</p> : null}

            <div className={`shared-post-signup${showSignup ? " is-visible" : ""}`}>
              <strong>Gostou? Entre no {brand.name}</strong>
              <p>Crie sua conta para curtir, comentar e publicar no feed.</p>
              <Link className="shared-post-cta" to={registerTo}>
                Criar conta
              </Link>
              <Link className="shared-post-login" to={loginTo}>
                Já tenho conta
              </Link>
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
