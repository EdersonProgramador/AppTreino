import { Trophy } from "lucide-react";
import { type Ref } from "react";
import { formatClock } from "../../lib/activity-geo";
import { mediaUrl } from "../../lib/urls";
import type { SocialPostRow } from "../../types";

export function workoutShareMediaFromPost(post: SocialPostRow): { photoUrl: string | null; videoUrl: string | null } {
  const items = post.mediaItems?.length
    ? post.mediaItems
    : post.mediaUrl
      ? [{ url: post.mediaUrl, type: post.mediaType === "VIDEO" ? "VIDEO" : "IMAGE" }]
      : [];
  const image = items.find((item) => item.type === "IMAGE");
  const video = items.find((item) => item.type === "VIDEO");
  return {
    photoUrl: image?.url ?? null,
    videoUrl: video?.url ?? null
  };
}

export function WorkoutSharePreview({
  programTitle,
  blockTitle,
  exerciseCount,
  durationLabel,
  photoUrl,
  videoUrl,
  cardRef
}: {
  programTitle: string;
  blockTitle: string;
  exerciseCount: number;
  durationLabel: string;
  photoUrl?: string | null;
  videoUrl?: string | null;
  cardRef?: Ref<HTMLDivElement>;
}) {
  const imageSrc = photoUrl ? mediaUrl(photoUrl) || photoUrl : null;
  const videoSrc = !imageSrc && videoUrl ? mediaUrl(videoUrl) || videoUrl : null;
  return (
    <div className="runner-share-card" data-testid="workout-share-card" ref={cardRef}>
      <span className="runner-share-card-badge">App Treino Social</span>
      <h3>O TREINO DE HOJE ESTÁ PAGO!</h3>
      {imageSrc ? (
        <div className="runner-share-card-photo">
          <img src={imageSrc} alt="" />
        </div>
      ) : videoSrc ? (
        <div className="runner-share-card-photo">
          <video src={videoSrc} playsInline muted controls />
        </div>
      ) : (
        <div className="runner-share-card-mark" aria-hidden="true">
          <Trophy size={42} />
        </div>
      )}
      <dl className="runner-share-card-stats">
        <div>
          <dt>Programa</dt>
          <dd>{programTitle}</dd>
        </div>
        <div>
          <dt>Treino</dt>
          <dd>{blockTitle}</dd>
        </div>
        <div>
          <dt>Exercícios</dt>
          <dd>{exerciseCount}</dd>
        </div>
        <div>
          <dt>Tempo</dt>
          <dd>{durationLabel}</dd>
        </div>
      </dl>
    </div>
  );
}

export function FeedWorkoutShareCard({ post }: { post: SocialPostRow }) {
  const workout = post.workout;
  if (!workout) return null;
  const media = workoutShareMediaFromPost(post);
  return (
    <WorkoutSharePreview
      programTitle={workout.programTitle}
      blockTitle={workout.blockTitle}
      exerciseCount={workout.exerciseCount}
      durationLabel={formatClock(workout.durationSeconds)}
      photoUrl={media.photoUrl}
      videoUrl={media.videoUrl}
    />
  );
}
