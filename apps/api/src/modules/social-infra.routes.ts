import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { env } from "../env.js";
import { prisma } from "../prisma.js";
import { emitToUser } from "./social-socket.js";

function httpError(statusCode: number, message: string) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

function requireDatabase() {
  if (!env.DATABASE_URL) {
    const error = new Error("Banco de dados não configurado para esta operação.") as Error & {
      statusCode: number;
    };
    error.statusCode = 503;
    throw error;
  }
}

function authorCard(user: { id: string; name: string; profile?: { avatarUrl?: string | null } | null }) {
  return {
    id: user.id,
    name: user.name,
    avatarUrl: user.profile?.avatarUrl ?? null
  };
}

function conversationPair(a: string, b: string) {
  return a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a };
}

function otherUserId(row: { userAId: string; userBId: string }, me: string) {
  return row.userAId === me ? row.userBId : row.userAId;
}

async function blockedIds(userId: string) {
  const rows = await prisma.socialBlock.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true }
  });
  const set = new Set<string>();
  for (const row of rows) {
    if (row.blockerId !== userId) set.add(row.blockerId);
    if (row.blockedId !== userId) set.add(row.blockedId);
  }
  return set;
}

/** Publica (ou reutiliza) um card de live no feed do autor. */
async function publishLiveFeedPost(params: {
  authorId: string;
  liveId: string;
  title: string;
  hostName: string;
  isHost: boolean;
}) {
  const existing = await prisma.socialPost.findFirst({
    where: {
      authorId: params.authorId,
      mediaType: "LIVE",
      mediaUrl: params.liveId,
      hidden: false
    },
    select: { id: true }
  });
  if (existing) return existing;

  const body = params.isHost
    ? `Ao vivo agora: ${params.title}`
    : `Live salva · ${params.hostName}: ${params.title}`;

  return prisma.socialPost.create({
    data: {
      authorId: params.authorId,
      kind: "TEXT",
      body,
      mediaUrl: params.liveId,
      mediaType: "LIVE"
    }
  });
}

async function hideLiveFeedPostsForUser(userId: string, liveId: string) {
  await prisma.socialPost.updateMany({
    where: {
      authorId: userId,
      mediaType: "LIVE",
      mediaUrl: liveId,
      hidden: false
    },
    data: { hidden: true }
  });
}

export async function registerSocialInfraRoutes(app: FastifyInstance) {
  app.get("/student/social/reels", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const query = z.object({ page: z.coerce.number().int().min(0).max(200).optional().default(0) }).parse(request.query);

    // Clipes = biblioteca do próprio aluno (editar / apagar). O feed recebe cópia via SocialPost.
    const rows = await prisma.socialReel.findMany({
      where: {
        hidden: false,
        authorId: user.id
      },
      orderBy: { createdAt: "desc" },
      skip: query.page * 24,
      take: 24,
      include: {
        author: { select: { id: true, name: true, profile: { select: { avatarUrl: true } } } },
        likes: { where: { userId: user.id }, select: { userId: true } },
        _count: { select: { likes: true } }
      }
    });

    return {
      reels: rows.map((row) => ({
        id: row.id,
        videoUrl: row.videoUrl,
        caption: row.caption,
        mood: row.mood,
        createdAt: row.createdAt.toISOString(),
        author: authorCard(row.author),
        likesCount: row._count.likes,
        likedByMe: row.likes.length > 0,
        isMine: true
      }))
    };
  });

  app.post("/student/social/reels", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const body = z
      .object({
        videoUrl: z.string().url().or(z.string().startsWith("/")),
        caption: z.string().max(300).optional().default(""),
        mood: z.string().max(40).optional()
      })
      .parse(request.body);
    const caption = body.caption.trim();
    const mediaItems = [{ url: body.videoUrl, type: "VIDEO" as const }];

    const [reel] = await prisma.$transaction([
      prisma.socialReel.create({
        data: {
          authorId: user.id,
          videoUrl: body.videoUrl,
          caption,
          mood: body.mood ?? null
        },
        include: {
          author: { select: { id: true, name: true, profile: { select: { avatarUrl: true } } } },
          likes: { where: { userId: user.id }, select: { userId: true } },
          _count: { select: { likes: true } }
        }
      }),
      prisma.socialPost.create({
        data: {
          authorId: user.id,
          kind: "VIDEO",
          body: caption || null,
          mediaUrl: body.videoUrl,
          mediaType: "VIDEO",
          mediaItems
        }
      })
    ]);

    return {
      reel: {
        id: reel.id,
        videoUrl: reel.videoUrl,
        caption: reel.caption,
        mood: reel.mood,
        createdAt: reel.createdAt.toISOString(),
        author: authorCard(reel.author),
        likesCount: 0,
        likedByMe: false,
        isMine: true
      }
    };
  });

  app.post("/student/social/reels/:id/like", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const reel = await prisma.socialReel.findUnique({ where: { id } });
    if (!reel || reel.hidden) throw httpError(404, "Clipe não encontrado.");
    if (reel.authorId !== user.id) throw httpError(403, "Clipes são só do autor nesta área.");
    const existing = await prisma.socialReelLike.findUnique({
      where: { reelId_userId: { reelId: id, userId: user.id } }
    });
    if (existing) {
      await prisma.socialReelLike.delete({ where: { id: existing.id } });
      return { liked: false };
    }
    await prisma.socialReelLike.create({ data: { reelId: id, userId: user.id } });
    return { liked: true };
  });

  app.delete("/student/social/reels/:id", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const reel = await prisma.socialReel.findUnique({ where: { id } });
    if (!reel) throw httpError(404, "Clipe não encontrado.");
    if (reel.authorId !== user.id) throw httpError(403, "Só o autor pode apagar.");
    await prisma.$transaction([
      prisma.socialReel.update({ where: { id }, data: { hidden: true } }),
      prisma.socialPost.updateMany({
        where: {
          authorId: user.id,
          mediaUrl: reel.videoUrl,
          kind: "VIDEO",
          hidden: false
        },
        data: { hidden: true }
      })
    ]);
    return { ok: true };
  });

  app.put("/student/social/reels/:id", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        caption: z.string().max(300).optional(),
        mood: z.string().max(40).nullable().optional()
      })
      .parse(request.body);
    const reel = await prisma.socialReel.findUnique({ where: { id } });
    if (!reel || reel.hidden) throw httpError(404, "Clipe não encontrado.");
    if (reel.authorId !== user.id) throw httpError(403, "Só o autor pode editar.");
    const caption = body.caption != null ? body.caption.trim() : undefined;
    const updated = await prisma.socialReel.update({
      where: { id },
      data: {
        ...(caption != null ? { caption } : {}),
        ...(body.mood !== undefined ? { mood: body.mood } : {})
      },
      include: {
        author: { select: { id: true, name: true, profile: { select: { avatarUrl: true } } } },
        likes: { where: { userId: user.id }, select: { userId: true } },
        _count: { select: { likes: true } }
      }
    });
    if (caption != null) {
      await prisma.socialPost.updateMany({
        where: {
          authorId: user.id,
          mediaUrl: reel.videoUrl,
          kind: "VIDEO",
          hidden: false
        },
        data: { body: caption || null }
      });
    }
    return {
      reel: {
        id: updated.id,
        videoUrl: updated.videoUrl,
        caption: updated.caption,
        mood: updated.mood,
        createdAt: updated.createdAt.toISOString(),
        author: authorCard(updated.author),
        likesCount: updated._count.likes,
        likedByMe: updated.likes.length > 0,
        isMine: true
      }
    };
  });

  app.get("/student/social/live", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const blocked = await blockedIds(user.id);
    const following = await prisma.socialFollow.findMany({
      where: { followerId: user.id },
      select: { followingId: true }
    });
    const followingSet = new Set(following.map((row) => row.followingId));
    const hostInclude = {
      host: { select: { id: true, name: true, profile: { select: { avatarUrl: true, isPrivate: true } } } }
    } as const;
    let rows: Array<{
      id: string;
      title: string;
      mood: string | null;
      startedAt: Date;
      viewerPeak: number;
      hostId: string;
      host: { id: string; name: string; profile: { avatarUrl: string | null; isPrivate: boolean } | null };
      saves?: Array<{ id: string }>;
    }> = [];
    try {
      rows = (await prisma.socialLiveSession.findMany({
        where: {
          status: "live",
          ...(blocked.size ? { hostId: { notIn: [...blocked] } } : {})
        },
        orderBy: { startedAt: "desc" },
        include: {
          ...hostInclude,
          saves: { where: { userId: user.id }, select: { id: true } }
        }
      })) as typeof rows;
    } catch {
      // Fallback if social_live_saves is missing on an outdated DB.
      rows = (await prisma.socialLiveSession.findMany({
        where: {
          status: "live",
          ...(blocked.size ? { hostId: { notIn: [...blocked] } } : {})
        },
        orderBy: { startedAt: "desc" },
        include: hostInclude
      })) as typeof rows;
    }
    return {
      lives: rows
        .filter(
          (row) =>
            row.hostId === user.id ||
            !row.host.profile?.isPrivate ||
            followingSet.has(row.hostId)
        )
        .map((row) => ({
          id: row.id,
          title: row.title,
          mood: row.mood,
          startedAt: row.startedAt.toISOString(),
          viewerPeak: row.viewerPeak,
          host: authorCard(row.host),
          isMine: row.hostId === user.id,
          savedByMe: (row.saves?.length ?? 0) > 0
        }))
    };
  });

  app.get("/student/social/live/saved", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const blocked = await blockedIds(user.id);
    try {
      const rows = await prisma.socialLiveSave.findMany({
        where: {
          userId: user.id,
          ...(blocked.size ? { live: { hostId: { notIn: [...blocked] } } } : {})
        },
        orderBy: { createdAt: "desc" },
        take: 40,
        include: {
          live: {
            include: {
              host: { select: { id: true, name: true, profile: { select: { avatarUrl: true } } } }
            }
          }
        }
      });
      return {
        lives: rows.map((row) => ({
          id: row.live.id,
          title: row.live.title,
          mood: row.live.mood,
          status: row.live.status,
          startedAt: row.live.startedAt.toISOString(),
          endedAt: row.live.endedAt?.toISOString() ?? null,
          viewerPeak: row.live.viewerPeak,
          host: authorCard(row.live.host),
          isMine: row.live.hostId === user.id,
          savedByMe: true,
          savedAt: row.createdAt.toISOString()
        }))
      };
    } catch {
      return { lives: [] };
    }
  });

  app.post("/student/social/live", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const body = z
      .object({
        title: z.string().min(2).max(80),
        mood: z.string().max(40).optional()
      })
      .parse(request.body);
    await prisma.socialLiveSession.updateMany({
      where: { hostId: user.id, status: "live" },
      data: { status: "ended", endedAt: new Date() }
    });
    const live = await prisma.socialLiveSession.create({
      data: { hostId: user.id, title: body.title.trim(), mood: body.mood ?? null }
    });

    try {
      await prisma.socialLiveSave.upsert({
        where: { liveId_userId: { liveId: live.id, userId: user.id } },
        create: { liveId: live.id, userId: user.id },
        update: {}
      });
      await publishLiveFeedPost({
        authorId: user.id,
        liveId: live.id,
        title: live.title,
        hostName: user.name,
        isHost: true
      });
    } catch {
      // Save/feed publish must not block going on air.
    }

    try {
      const followers = await prisma.socialFollow.findMany({
        where: { followingId: user.id },
        select: { followerId: true }
      });
      if (followers.length) {
        await prisma.studentNotification.createMany({
          data: followers.map((row) => ({
            userId: row.followerId,
            type: "SOCIAL_LIVE",
            title: "Ao vivo agora",
            message: `${user.name} entrou ao vivo: ${live.title}`,
            targetSection: "live",
            sourceType: "SOCIAL_LIVE",
            sourceId: live.id
          }))
        });
      }
    } catch {
      // Live already created — notifications must not block going on air.
    }

    return {
      live: {
        id: live.id,
        title: live.title,
        mood: live.mood,
        status: live.status,
        startedAt: live.startedAt.toISOString(),
        isMine: true
      }
    };
  });

  app.get("/student/social/live/:id", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const baseInclude = {
      host: { select: { id: true, name: true, profile: { select: { avatarUrl: true } } } },
      messages: {
        orderBy: { createdAt: "desc" as const },
        take: 40,
        include: { user: { select: { id: true, name: true } } }
      }
    };
    let row: Awaited<ReturnType<typeof prisma.socialLiveSession.findUnique>> & {
      host: { id: string; name: string; profile: { avatarUrl: string | null } | null };
      messages: Array<{ id: string; content: string; userId: string; createdAt: Date; user: { id: string; name: string } }>;
      saves?: Array<{ id: string }>;
    } | null;
    try {
      row = (await prisma.socialLiveSession.findUnique({
        where: { id },
        include: {
          ...baseInclude,
          saves: { where: { userId: user.id }, select: { id: true } }
        }
      })) as typeof row;
    } catch {
      row = (await prisma.socialLiveSession.findUnique({
        where: { id },
        include: baseInclude
      })) as typeof row;
    }
    if (!row) throw httpError(404, "Live indisponível.");
    return {
      live: {
        id: row.id,
        title: row.title,
        mood: row.mood,
        status: row.status,
        startedAt: row.startedAt.toISOString(),
        host: authorCard(row.host),
        isMine: row.hostId === user.id,
        savedByMe: (row.saves?.length ?? 0) > 0,
        messages: row.messages.reverse().map((item) => ({
          id: item.id,
          content: item.content,
          userId: item.userId,
          name: item.user.name,
          createdAt: item.createdAt.toISOString()
        }))
      }
    };
  });

  app.put("/student/social/live/:id", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        title: z.string().trim().min(2).max(80)
      })
      .parse(request.body);
    const live = await prisma.socialLiveSession.findUnique({ where: { id } });
    if (!live) throw httpError(404, "Live não encontrada.");
    if (live.hostId !== user.id) throw httpError(403, "Só o anfitrião pode editar o título.");
    const updated = await prisma.socialLiveSession.update({
      where: { id },
      data: { title: body.title }
    });
    return {
      live: {
        id: updated.id,
        title: updated.title,
        mood: updated.mood,
        status: updated.status,
        startedAt: updated.startedAt.toISOString(),
        isMine: true
      }
    };
  });

  app.post("/student/social/live/:id/save", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const live = await prisma.socialLiveSession.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        hostId: true,
        host: { select: { name: true } }
      }
    });
    if (!live) throw httpError(404, "Live não encontrada.");
    try {
      await prisma.socialLiveSave.upsert({
        where: { liveId_userId: { liveId: id, userId: user.id } },
        create: { liveId: id, userId: user.id },
        update: {}
      });
      await publishLiveFeedPost({
        authorId: user.id,
        liveId: live.id,
        title: live.title,
        hostName: live.host.name,
        isHost: live.hostId === user.id
      });
    } catch {
      throw httpError(503, "Salvar live indisponível no momento. Tente de novo em instantes.");
    }
    return { saved: true, published: true };
  });

  app.delete("/student/social/live/:id/save", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    await prisma.socialLiveSave.deleteMany({ where: { liveId: id, userId: user.id } });
    try {
      await hideLiveFeedPostsForUser(user.id, id);
    } catch {
      // Removing the save is enough if feed cleanup fails.
    }
    return { saved: false };
  });

  app.post("/student/social/live/:id/end", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const live = await prisma.socialLiveSession.findFirst({
      where: { id, hostId: user.id, status: "live" },
      select: { id: true, title: true, host: { select: { name: true } } }
    });
    if (!live) throw httpError(404, "Live não encontrada.");
    await prisma.socialLiveSession.updateMany({
      where: { id, hostId: user.id, status: "live" },
      data: { status: "ended", endedAt: new Date() }
    });
    try {
      await prisma.socialLiveSave.upsert({
        where: { liveId_userId: { liveId: id, userId: user.id } },
        create: { liveId: id, userId: user.id },
        update: {}
      });
      await publishLiveFeedPost({
        authorId: user.id,
        liveId: live.id,
        title: live.title,
        hostName: live.host.name,
        isHost: true
      });
    } catch {
      // Ending must succeed even if save/publish fails.
    }
    return { ok: true };
  });

  app.get("/student/social/conversations", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const blocked = await blockedIds(user.id);
    const rows = await prisma.socialConversation.findMany({
      where: { OR: [{ userAId: user.id }, { userBId: user.id }] },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 1 }
      }
    });
    const otherIds = rows.map((row) => otherUserId(row, user.id)).filter((id) => !blocked.has(id));
    const users = await prisma.user.findMany({
      where: { id: { in: otherIds } },
      select: { id: true, name: true, profile: { select: { avatarUrl: true } } }
    });
    const byId = new Map(users.map((item) => [item.id, item]));
    return {
      conversations: rows
        .map((row) => {
          const other = byId.get(otherUserId(row, user.id));
          if (!other) return null;
          const last = row.messages[0];
          return {
            id: row.id,
            user: authorCard(other),
            lastMessage: last
              ? {
                  id: last.id,
                  content: last.content,
                  createdAt: last.createdAt.toISOString(),
                  senderId: last.senderId
                }
              : null,
            updatedAt: row.updatedAt.toISOString()
          };
        })
        .filter(Boolean)
    };
  });

  app.get("/student/social/messages/:userId", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { userId } = z.object({ userId: z.string().min(1) }).parse(request.params);
    if (userId === user.id) throw httpError(400, "Conversa inválida.");
    const blocked = await blockedIds(user.id);
    if (blocked.has(userId)) throw httpError(403, "Não é possível conversar com este usuário.");
    const other = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, profile: { select: { avatarUrl: true } } }
    });
    if (!other) throw httpError(404, "Aluno não encontrado.");
    const pair = conversationPair(user.id, userId);
    const conversation = await prisma.socialConversation.findUnique({
      where: { userAId_userBId: pair }
    });
    const messages = conversation
      ? await prisma.socialDirectMessage.findMany({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: "asc" },
          take: 100,
          include: { sender: { select: { id: true, name: true, profile: { select: { avatarUrl: true } } } } }
        })
      : [];
    return {
      user: authorCard(other),
      conversationId: conversation?.id ?? null,
      messages: messages.map((row) => ({
        id: row.id,
        content: row.content,
        createdAt: row.createdAt.toISOString(),
        senderId: row.senderId,
        author: authorCard(row.sender),
        isMine: row.senderId === user.id
      }))
    };
  });

  app.post("/student/social/messages/:userId", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { userId } = z.object({ userId: z.string().min(1) }).parse(request.params);
    const body = z.object({ content: z.string().min(1).max(2000) }).parse(request.body);
    if (userId === user.id) throw httpError(400, "Conversa inválida.");
    const blocked = await blockedIds(user.id);
    if (blocked.has(userId)) throw httpError(403, "Não é possível conversar com este usuário.");
    const pair = conversationPair(user.id, userId);
    const conversation = await prisma.socialConversation.upsert({
      where: { userAId_userBId: pair },
      update: { updatedAt: new Date() },
      create: pair
    });
    const message = await prisma.socialDirectMessage.create({
      data: {
        conversationId: conversation.id,
        senderId: user.id,
        content: body.content.trim()
      },
      include: { sender: { select: { id: true, name: true, profile: { select: { avatarUrl: true } } } } }
    });
    await prisma.socialConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() }
    });
    const payload = {
      id: message.id,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      senderId: message.senderId,
      author: authorCard(message.sender),
      conversationId: conversation.id
    };
    emitToUser(userId, "dm:message", payload);
    await prisma.studentNotification.create({
      data: {
        userId,
        type: "SOCIAL_DM",
        title: "Nova mensagem",
        message: `${user.name} enviou uma mensagem.`,
        targetSection: "messages",
        sourceType: "SOCIAL",
        sourceId: conversation.id
      }
    });
    return { message: { ...payload, isMine: true } };
  });

  app.get("/student/social/chat/global", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const query = z.object({ page: z.coerce.number().int().min(0).max(100).optional().default(0) }).parse(request.query);
    const rows = await prisma.socialGlobalMessage.findMany({
      orderBy: { createdAt: "desc" },
      skip: query.page * 40,
      take: 40,
      include: { user: { select: { id: true, name: true, profile: { select: { avatarUrl: true } } } } }
    });
    return {
      messages: rows.reverse().map((row) => ({
        id: row.id,
        content: row.content,
        createdAt: row.createdAt.toISOString(),
        userId: row.userId,
        name: row.user.name,
        avatarUrl: row.user.profile?.avatarUrl ?? null,
        isMine: row.userId === user.id
      }))
    };
  });

  app.get("/student/social/follow-requests", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const rows = await prisma.socialFollowRequest.findMany({
      where: { toId: user.id },
      orderBy: { createdAt: "desc" },
      include: { from: { select: { id: true, name: true, profile: { select: { avatarUrl: true } } } } }
    });
    return {
      requests: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        user: authorCard(row.from)
      }))
    };
  });

  app.post("/student/social/follow-requests/:id/accept", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const row = await prisma.socialFollowRequest.findUnique({ where: { id } });
    if (!row || row.toId !== user.id) throw httpError(404, "Pedido não encontrado.");
    await prisma.$transaction([
      prisma.socialFollow.upsert({
        where: { followerId_followingId: { followerId: row.fromId, followingId: row.toId } },
        create: { followerId: row.fromId, followingId: row.toId },
        update: {}
      }),
      prisma.socialFollowRequest.delete({ where: { id } })
    ]);
    return { ok: true };
  });

  app.post("/student/social/follow-requests/:id/reject", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const row = await prisma.socialFollowRequest.findUnique({ where: { id } });
    if (!row || row.toId !== user.id) throw httpError(404, "Pedido não encontrado.");
    await prisma.socialFollowRequest.delete({ where: { id } });
    return { ok: true };
  });

  app.get("/student/social/privacy", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const profile = await prisma.profile.findUnique({ where: { userId: user.id }, select: { isPrivate: true } });
    return { isPrivate: Boolean(profile?.isPrivate) };
  });

  app.post("/student/social/privacy", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const body = z.object({ isPrivate: z.boolean() }).parse(request.body);
    await prisma.profile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, isPrivate: body.isPrivate },
      update: { isPrivate: body.isPrivate }
    });
    return { isPrivate: body.isPrivate };
  });

  app.post("/student/social/users/:id/block", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    if (id === user.id) throw httpError(400, "Operação inválida.");
    const existing = await prisma.socialBlock.findUnique({
      where: { blockerId_blockedId: { blockerId: user.id, blockedId: id } }
    });
    if (existing) {
      await prisma.socialBlock.delete({ where: { id: existing.id } });
      return { blocked: false };
    }
    await prisma.socialBlock.create({ data: { blockerId: user.id, blockedId: id } });
    await prisma.socialFollow.deleteMany({
      where: {
        OR: [
          { followerId: user.id, followingId: id },
          { followerId: id, followingId: user.id }
        ]
      }
    });
    return { blocked: true };
  });
}
