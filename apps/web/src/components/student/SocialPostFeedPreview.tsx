import { useEffect, useRef, useState } from "react";
import { feedMediaItemsFromPost, isLiveMediaPost, liveIdFromPost } from "../../lib/social-post-media";
import { mediaUrl, retryVideoAsCompatible } from "../../lib/urls";
import type { SocialPostRow } from "../../types";
import {
  ActivityShareCard,
  activitySharePhotoUrl,
  activityShareStatsFromRow,
  activityShareTitle
} from "./ActivityShareCard";
import { FeedWorkoutShareCard } from "./WorkoutSharePreview";

type MediaItem = { url: string; type: "IMAGE" | "VIDEO"; coverUrl?: string | null };

function liveCardLabel(post: SocialPostRow) {
  return (
    post.body
      ?.replace(/^Ao vivo agora:\s*/i, "")
      .replace(/^Ao vivo:\s*/i, "")
      .replace(/^Live salva · [^:]+:\s*/i, "")
      .replace(/\n?\[\[LIVE:[^\]]+\]\]/g, "")
      .trim() || "Entrar na live"
  );
}

function FeedActivityCard({ post }: { post: SocialPostRow }) {
  const activity = post.activity;
  if (!activity) return null;
  return (
    <div className="student-activity-share-card student-feed-activity-card">
      <small>App Treino Social</small>
      <ActivityShareCard
        stats={activityShareStatsFromRow(activity)}
        photoUrl={activitySharePhotoUrl(post)}
        title={activityShareTitle(activity)}
      />
    </div>
  );
}

function PostMediaCarousel({ items }: { items: MediaItem[] }) {
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
            onClick={(event) => event.stopPropagation()}
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
              onClick={(event) => {
                event.stopPropagation();
                go(safeIndex - 1);
              }}
              aria-label="Anterior"
            >
              ‹
            </button>
            <button
              type="button"
              className="student-feed-carousel-arrow is-next"
              disabled={safeIndex >= items.length - 1}
              onClick={(event) => {
                event.stopPropagation();
                go(safeIndex + 1);
              }}
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
                  onClick={(event) => {
                    event.stopPropagation();
                    go(dot);
                  }}
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

/** Same content block used in the feed before/after publishing. */
export function SocialPostFeedPreview({ post }: { post: SocialPostRow }) {
  const liveId = liveIdFromPost(post);
  const isLiveCard = isLiveMediaPost(post);
  const items = feedMediaItemsFromPost(post) as MediaItem[];
  const showActivity = (post.kind === "ACTIVITY" || post.activity) && post.activity;
  const showWorkout = (post.kind === "WORKOUT" || post.workout) && post.workout;

  return (
    <>
      {post.body && !isLiveCard ? <p>{post.body}</p> : null}
      {showActivity ? <FeedActivityCard post={post} /> : null}
      {showWorkout ? <FeedWorkoutShareCard post={post} /> : null}
      {isLiveCard && liveId ? (
        <div className="student-feed-live-card is-static">
          <span className="student-live-badge">AO VIVO</span>
          <strong>{liveCardLabel(post)}</strong>
          <small>Live salva no perfil</small>
        </div>
      ) : showActivity || showWorkout ? null : (
        <PostMediaCarousel items={items} />
      )}
    </>
  );
}
