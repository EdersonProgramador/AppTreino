import { prisma } from "../config";
import { emitToUser } from "../sockets/registry";
import { extractMentions } from "./text";
import { withUserImage } from "./userImage";

type NotifyType = "like" | "comment" | "follow" | "message" | "mention" | "follow_request";

export async function notify(params: {
  userId: string;
  actorId: string;
  type: NotifyType;
  postId?: number;
}) {
  if (params.userId === params.actorId) {
    return;
  }

  const row = await prisma.notification.create({
    data: {
      user_id: params.userId,
      actor_id: params.actorId,
      type: params.type,
      post_id: params.postId
    },
    include: {
      actor: {
        select: { id: true, username: true, image_url: true }
      }
    }
  });

  emitToUser(params.userId, "notification", {
    id: row.id,
    type: row.type,
    read: row.read,
    created_on: row.created_on,
    post_id: row.post_id,
    actor: {
      id: row.actor.id,
      username: row.actor.username,
      image_url: withUserImage(row.actor.image_url)
    }
  });
}

export async function excludedAuthorIds(userId: string) {
  const [blocked, mutes] = await Promise.all([
    blockedIds(userId),
    prisma.mute.findMany({
      where: { muter_id: userId },
      select: { muted_id: true }
    })
  ]);

  const ids = new Set(blocked);
  for (const row of mutes) {
    ids.add(row.muted_id);
  }
  return ids;
}

export async function blockedIds(userId: string) {
  const rows = await prisma.block.findMany({
    where: {
      OR: [{ blocker_id: userId }, { blocked_id: userId }]
    },
    select: { blocker_id: true, blocked_id: true }
  });

  const ids = new Set<string>();
  for (const row of rows) {
    ids.add(row.blocker_id === userId ? row.blocked_id : row.blocker_id);
  }
  return ids;
}

export async function notifyMentions(text: string, actorId: string, postId?: number) {
  const names = extractMentions(text);
  if (!names.length) {
    return;
  }

  const users = await prisma.user.findMany({
    where: {
      OR: names.map(username => ({
        username: { equals: username, mode: "insensitive" as const }
      }))
    },
    select: { id: true }
  });

  await Promise.all(users.map(user => notify({
    userId: user.id,
    actorId,
    type: "mention",
    postId
  })));
}
