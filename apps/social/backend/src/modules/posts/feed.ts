import { prisma } from "../../config";
import { excludedAuthorIds, parsePostDate, withUserImage } from "../../shared";

export type FeedMode = "for-you" | "following";

const PAGE_SIZE = 5;
const CANDIDATE_LIMIT = 80;

type RankedPost = {
  id: number;
  fk_user_id: string;
  content: string;
  images: string | null;
  created_on: string | null;
  username: string;
  image_url: string;
};

async function getFollowingIds(userId: string) {
  const rows = await prisma.follower.findMany({
    where: { fk_user_id: userId },
    select: { fk_follower_id: true }
  });

  return rows.map(row => row.fk_follower_id);
}

async function getInteractedAuthorIds(userId: string) {
  const [liked, commented] = await Promise.all([
    prisma.likes.findMany({
      where: { user_id: userId },
      orderBy: { id: "desc" },
      take: 200,
      select: { post: { select: { fk_user_id: true } } }
    }),
    prisma.comment.findMany({
      where: { fk_user_id: userId },
      orderBy: { id: "desc" },
      take: 200,
      select: { post: { select: { fk_user_id: true } } }
    })
  ]);

  return [...liked, ...commented]
    .map(row => row.post.fk_user_id)
    .filter(id => id !== userId);
}

function recencyScore(createdOn: string | null, postId: number, minId: number, maxId: number) {
  const date = parsePostDate(createdOn);
  if (date) {
    const hours = Math.max(0, (Date.now() - date.getTime()) / 36e5);
    return 1 / (1 + Math.pow(hours, 1.2));
  }

  const span = Math.max(1, maxId - minId);
  return (postId - minId) / span;
}

function affinityScore(authorId: string, userId: string, following: Set<string>, interacted: Set<string>) {
  if (authorId === userId) {
    return 2.2;
  }

  const isFollowing = following.has(authorId);
  const hasInteracted = interacted.has(authorId);

  if (isFollowing && hasInteracted) {
    return 3;
  }
  if (isFollowing) {
    return 2;
  }
  if (hasInteracted) {
    return 1;
  }
  return 0;
}

function diversify(posts: RankedPost[]) {
  const out: RankedPost[] = [];
  const rest = [...posts];

  while (rest.length) {
    const index = rest.findIndex(post => {
      const lastTwo = out.slice(-2);
      const consecutive = lastTwo.length === 2 && lastTwo.every(item => item.fk_user_id === post.fk_user_id);
      const inWindow = out.slice(-5).filter(item => item.fk_user_id === post.fk_user_id).length >= 2;
      return !consecutive && !inWindow;
    });

    const takeAt = index === -1 ? 0 : index;
    out.push(rest.splice(takeAt, 1)[0]);
  }

  return out;
}

function toFeedPost(post: {
  id: number;
  fk_user_id: string;
  content: string;
  images: string | null;
  created_on: string | null;
  user: { username: string; image_url: string | null };
}): RankedPost {
  return {
    id: post.id,
    fk_user_id: post.fk_user_id,
    content: post.content,
    images: post.images,
    created_on: post.created_on,
    username: post.user.username,
    image_url: withUserImage(post.user.image_url)
  };
}

export async function buildUserFeed(userId: string, mode: FeedMode, page: number) {
  const [followingIds, excluded] = await Promise.all([
    getFollowingIds(userId),
    excludedAuthorIds(userId)
  ]);
  const following = new Set(followingIds.filter(id => !excluded.has(id)));
  const interactedIds = mode === "for-you" ? await getInteractedAuthorIds(userId) : [];
  const interacted = new Set(interactedIds.filter(id => !excluded.has(id)));

  const eligible = new Set<string>([
    userId,
    ...following,
    ...(mode === "for-you" ? interacted : [])
  ]);

  const privateLocked = await prisma.user.findMany({
    where: {
      is_private: true,
      id: { notIn: [userId, ...following] }
    },
    select: { id: true }
  });
  for (const row of privateLocked) {
    eligible.delete(row.id);
  }

  const candidates = await prisma.post.findMany({
    where: { fk_user_id: { in: [...eligible] }, hidden: false },
    orderBy: { id: "desc" },
    take: CANDIDATE_LIMIT,
    include: {
      user: {
        select: { username: true, image_url: true }
      },
      _count: {
        select: { likes: true, Comment: true }
      }
    }
  });

  let ranked: RankedPost[];

  if (mode === "following") {
    ranked = candidates.map(toFeedPost);
  } else {
    const ids = candidates.map(post => post.id);
    const minId = ids.length ? Math.min(...ids) : 0;
    const maxId = ids.length ? Math.max(...ids) : 1;
    const maxEngagement = Math.max(
      1,
      ...candidates.map(post => post._count.likes + post._count.Comment)
    );

    ranked = candidates
      .map(post => {
        const recency = recencyScore(post.created_on, post.id, minId, maxId);
        const affinity = affinityScore(post.fk_user_id, userId, following, interacted);
        const engagement = Math.log1p(post._count.likes + post._count.Comment) / Math.log1p(maxEngagement);

        return {
          post: toFeedPost(post),
          score: recency + affinity * 2 + engagement * 0.5
        };
      })
      .sort((a, b) => b.score - a.score || b.post.id - a.post.id)
      .map(item => item.post);

    ranked = diversify(ranked);
  }

  const skip = Math.max(0, page) * PAGE_SIZE;
  const posts = ranked.slice(skip, skip + PAGE_SIZE);

  return {
    posts,
    pageSize: PAGE_SIZE,
    followingCount: following.size
  };
}
