import { Router } from "express";
import { verifyToken } from "../../middleware";
import { cloudinary, isCloudinaryConfigured, prisma } from "../../config";
import {
  excludedAuthorIds,
  fail,
  getCurrentUser,
  mediaUpload,
  storyMetaSchema,
  writeRateLimit
} from "../../shared";

const stories = Router();
const upload = mediaUpload({ folder: ["images", "stories"], kinds: "any", maxFiles: 1, maxMb: 15 }).single("media");

stories.use(verifyToken);

async function visibleAuthorFilter(me: string) {
  const [excluded, following] = await Promise.all([
    excludedAuthorIds(me),
    prisma.follower.findMany({
      where: { fk_user_id: me },
      select: { fk_follower_id: true }
    })
  ]);
  const followingIds = following.map(item => item.fk_follower_id);
  return {
    where: {
      ...(excluded.size ? { user_id: { notIn: [...excluded] } } : {}),
      OR: [
        { user_id: me },
        { user: { is_private: false } },
        { user_id: { in: followingIds } }
      ]
    }
  };
}

stories.get("/", async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const { where } = await visibleAuthorFilter(me);
    const rows = await prisma.story.findMany({
      where: {
        expires_on: { gt: new Date() },
        ...where
      },
      orderBy: { created_on: "asc" },
      include: {
        user: { select: { id: true, username: true, image_url: true, cover_color: true } },
        views: { where: { user_id: me }, select: { id: true } }
      }
    });

    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const current = groups.get(row.user_id) || [];
      current.push(row);
      groups.set(row.user_id, current);
    }

    const rails = [...groups.entries()].map(([userId, items]) => {
      const user = items[0].user;
      return {
        userId,
        username: user.username,
        image_url: user.image_url || process.env.SERVER_URL + "/images/user/profile-user.png",
        cover_color: user.cover_color || "#2F5BAC",
        isMine: userId === me,
        unseen: items.some(item => item.views.length === 0 && userId !== me),
        items: items.map(item => ({
          id: item.id,
          media_url: item.media_url,
          media_type: item.media_type,
          caption: item.caption,
          mood: item.mood,
          created_on: item.created_on,
          seen: item.views.length > 0 || userId === me
        }))
      };
    });

    rails.sort((a, b) => Number(b.isMine) - Number(a.isMine) || Number(b.unseen) - Number(a.unseen));

    return response.json({ success: true, rails });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao carregar momentos.");
  }
});

stories.post("/", writeRateLimit, upload, async (request, response) => {
  try {
    const parsed = storyMetaSchema.safeParse(JSON.parse(request.body.body || "{}"));
    if (!parsed.success) {
      return fail(response, 400, parsed.error.issues[0]?.message || "Dados inválidos.");
    }

    const file = request.file;
    if (!file) {
      return fail(response, 400, "Envie uma foto ou um vídeo curto.");
    }

    const isVideo = file.mimetype.startsWith("video/");
    const uploaded = isCloudinaryConfigured
      ? await cloudinary.uploader.upload(file.path, { resource_type: isVideo ? "video" : "image" })
      : { secure_url: `${process.env.SERVER_URL}/images/stories/${file.filename}` };

    const story = await prisma.story.create({
      data: {
        media_url: uploaded.secure_url,
        media_type: isVideo ? "video" : "image",
        caption: parsed.data.caption || null,
        mood: parsed.data.mood,
        expires_on: new Date(Date.now() + 24 * 60 * 60 * 1000),
        user_id: getCurrentUser(request).id
      }
    });

    return response.json({ success: true, storyId: story.id });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao publicar momento.");
  }
});

stories.post("/:id/view", async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const storyId = Number(request.params.id);
    const story = await prisma.story.findUnique({
      where: { id: storyId },
      select: { user_id: true, expires_on: true }
    });

    if (!story || story.expires_on < new Date()) {
      return fail(response, 404, "Momento indisponível.");
    }

    if (story.user_id !== me) {
      await prisma.storyView.upsert({
        where: { story_id_user_id: { story_id: storyId, user_id: me } },
        update: {},
        create: { story_id: storyId, user_id: me }
      });
    }

    return response.json({ success: true });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao registrar visualização.");
  }
});

stories.delete("/:id", async (request, response) => {
  try {
    const deleted = await prisma.story.deleteMany({
      where: { id: Number(request.params.id), user_id: getCurrentUser(request).id }
    });
    if (!deleted.count) {
      return fail(response, 404, "Momento não encontrado.");
    }
    return response.json({ success: true });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao apagar momento.");
  }
});

export { stories };
