import { formatClock, formatKm } from "./activity-geo";
import type { SocialPostRow } from "../types";

export function isLikelyMediaPath(path?: string | null): boolean {
  if (!path?.trim()) return false;
  const raw = path.trim();
  if (/^(data:|blob:)/i.test(raw)) return true;
  if (/^https?:\/\//i.test(raw)) return true;
  const cleaned = raw.replace(/^\//, "");
  return /[./]/.test(cleaned);
}

/** Legacy posts stored a live cuid where an image URL should be. */
export function liveIdFromPost(post: { mediaType?: string | null; mediaUrl?: string | null; body?: string | null }) {
  const tagged = post.body?.match(/\[\[LIVE:([^\]]+)\]\]/);
  if (tagged?.[1]) return tagged[1];
  if (post.mediaType === "LIVE" && post.mediaUrl) return post.mediaUrl;
  if (post.mediaUrl && !/[./]/.test(post.mediaUrl.replace(/^\//, "")) && post.mediaType !== "VIDEO") {
    return post.mediaUrl.replace(/^\//, "");
  }
  return null;
}

export function isLiveMediaPost(post: SocialPostRow) {
  const liveId = liveIdFromPost(post);
  return Boolean(liveId) && (post.mediaType === "LIVE" || (liveId && post.mediaUrl?.replace(/^\//, "") === liveId));
}

export type FeedMediaItem = { url: string; type: "IMAGE" | "VIDEO"; coverUrl?: string | null };

export function feedMediaItemsFromPost(post: SocialPostRow): FeedMediaItem[] {
  if (isLiveMediaPost(post)) return [];
  if (post.mediaItems?.length) {
    return post.mediaItems
      .map((item) => ({
        url: item.url,
        type: item.type === "VIDEO" ? ("VIDEO" as const) : ("IMAGE" as const),
        coverUrl: item.coverUrl ?? null
      }))
      .filter((item) => isLikelyMediaPath(item.url) || (item.coverUrl && isLikelyMediaPath(item.coverUrl)));
  }
  if (post.mediaUrl && isLikelyMediaPath(post.mediaUrl)) {
    return [{ url: post.mediaUrl, type: post.mediaType === "VIDEO" ? "VIDEO" : "IMAGE", coverUrl: null }];
  }
  return [];
}

export function postTextLabel(post: SocialPostRow): string {
  const body = post.body?.replace(/\n?\[\[LIVE:[^\]]+\]\]/g, "").trim();
  if (body) return body;
  if (post.activity) {
    const parts = [post.activity.sportLabel, `${formatKm(post.activity.distanceMeters)} km`];
    if (post.activity.elapsedSeconds > 0) parts.push(formatClock(post.activity.elapsedSeconds));
    return parts.join(" · ");
  }
  if (post.workout) return `${post.workout.blockTitle} · ${formatClock(post.workout.durationSeconds)}`;
  return "Publicação";
}
