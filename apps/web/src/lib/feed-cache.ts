import type { SocialAuthor, SocialPostRow, SocialStoryRail } from "../types";

const FEED_CACHE_KEY = "apptreino.student.feed.v1";
const MAX_CACHED_POSTS = 12;

export type FeedCache = {
  posts: SocialPostRow[];
  rails: SocialStoryRail[];
  people: SocialAuthor[];
  followingCount: number;
  hasMore: boolean;
  savedAt: number;
};

function slimPost(post: SocialPostRow): SocialPostRow {
  const activity = post.activity
    ? {
        ...post.activity,
        polyline: Array.isArray(post.activity.polyline) ? post.activity.polyline.slice(0, 80) : post.activity.polyline,
        summary: null
      }
    : null;
  return {
    ...post,
    activity,
    comments: post.comments?.slice(0, 3) ?? []
  };
}

export function readFeedCache(): FeedCache | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(FEED_CACHE_KEY) ?? "null") as FeedCache | null;
    if (!parsed || !Array.isArray(parsed.posts) || parsed.posts.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeFeedCache(cache: Omit<FeedCache, "savedAt">) {
  if (typeof localStorage === "undefined") return;
  try {
    const payload: FeedCache = {
      posts: cache.posts.slice(0, MAX_CACHED_POSTS).map(slimPost),
      rails: cache.rails.slice(0, 16),
      people: cache.people.slice(0, 8),
      followingCount: cache.followingCount,
      hasMore: cache.hasMore,
      savedAt: Date.now()
    };
    localStorage.setItem(FEED_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // quota / private mode
  }
}
