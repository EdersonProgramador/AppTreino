import { Router } from "express";
import { verifyToken, validate } from "../../middleware";
import { prisma } from "../../config";
import {
  excludedAuthorIds,
  fail,
  getCurrentUser,
  liveChatSchema,
  liveStartSchema,
  withUserImage,
  writeRateLimit
} from "../../shared";

const live = Router();
live.use(verifyToken);

async function canSeeHost(me: string, hostId: string) {
  if (me === hostId) {
    return true;
  }
  const excluded = await excludedAuthorIds(me);
  if (excluded.has(hostId)) {
    return false;
  }
  const host = await prisma.user.findUnique({
    where: { id: hostId },
    select: { is_private: true }
  });
  if (!host) {
    return false;
  }
  if (!host.is_private) {
    return true;
  }
  return Boolean(await prisma.follower.findFirst({
    where: { fk_user_id: me, fk_follower_id: hostId },
    select: { id: true }
  }));
}

live.get("/", async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const excluded = await excludedAuthorIds(me);
    const rows = await prisma.liveSession.findMany({
      where: {
        status: "live",
        ...(excluded.size ? { user_id: { notIn: [...excluded] } } : {})
      },
      orderBy: { started_on: "desc" },
      include: {
        user: { select: { id: true, username: true, image_url: true, cover_color: true, is_private: true } }
      }
    });

    const following = await prisma.follower.findMany({
      where: { fk_user_id: me },
      select: { fk_follower_id: true }
    });
    const followingSet = new Set(following.map(item => item.fk_follower_id));

    return response.json({
      success: true,
      lives: rows
        .filter(row => row.user_id === me || !row.user.is_private || followingSet.has(row.user_id))
        .map(row => ({
          id: row.id,
          title: row.title,
          mood: row.mood,
          started_on: row.started_on,
          viewer_peak: row.viewer_peak,
          user_id: row.user_id,
          username: row.user.username,
          image_url: withUserImage(row.user.image_url),
          cover_color: row.user.cover_color || "#2F5BAC",
          isMine: row.user_id === me
        }))
    });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao listar lives.");
  }
});

live.post("/", writeRateLimit, validate(liveStartSchema), async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    await prisma.liveSession.updateMany({
      where: { user_id: me, status: "live" },
      data: { status: "ended", ended_on: new Date() }
    });

    const created = await prisma.liveSession.create({
      data: {
        title: request.body.title,
        mood: request.body.mood,
        user_id: me
      }
    });

    return response.json({ success: true, live: { id: created.id, title: created.title, mood: created.mood } });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao iniciar ao vivo.");
  }
});

live.get("/:id", async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const row = await prisma.liveSession.findUnique({
      where: { id: request.params.id },
      include: {
        user: { select: { id: true, username: true, image_url: true, cover_color: true } },
        messages: {
          orderBy: { id: "desc" },
          take: 40,
          include: { user: { select: { id: true, username: true } } }
        }
      }
    });

    if (!row || !(await canSeeHost(me, row.user_id))) {
      return fail(response, 404, "Live indisponível.");
    }

    return response.json({
      success: true,
      live: {
        id: row.id,
        title: row.title,
        mood: row.mood,
        status: row.status,
        started_on: row.started_on,
        user_id: row.user_id,
        username: row.user.username,
        image_url: withUserImage(row.user.image_url),
        cover_color: row.user.cover_color || "#2F5BAC",
        isMine: row.user_id === me,
        messages: row.messages.reverse().map(item => ({
          id: item.id,
          content: item.content,
          user_id: item.user_id,
          username: item.user.username
        }))
      }
    });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao abrir live.");
  }
});

live.post("/:id/chat", writeRateLimit, validate(liveChatSchema), async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const liveId = request.params.id;
    const row = await prisma.liveSession.findUnique({
      where: { id: liveId },
      select: { status: true, user_id: true }
    });
    if (!row || row.status !== "live" || !(await canSeeHost(me, row.user_id))) {
      return fail(response, 404, "Live encerrada.");
    }

    const created = await prisma.liveMessage.create({
      data: {
        live_id: liveId,
        user_id: me,
        content: request.body.content
      },
      include: { user: { select: { username: true } } }
    });

    return response.json({
      success: true,
      message: {
        id: created.id,
        content: created.content,
        user_id: me,
        username: created.user.username
      }
    });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao enviar no chat.");
  }
});

live.post("/:id/end", async (request, response) => {
  try {
    const updated = await prisma.liveSession.updateMany({
      where: { id: request.params.id, user_id: getCurrentUser(request).id, status: "live" },
      data: { status: "ended", ended_on: new Date() }
    });
    if (!updated.count) {
      return fail(response, 404, "Live não encontrada.");
    }
    return response.json({ success: true });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao encerrar live.");
  }
});

export { live };
