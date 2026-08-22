import { Router } from "express";
import { verifyToken } from "../../middleware";
import { cloudinary, isCloudinaryConfigured, prisma } from "../../config";
import {
  excludedAuthorIds,
  fail,
  getCurrentUser,
  mediaUpload,
  reelMetaSchema,
  withUserImage,
  writeRateLimit
} from "../../shared";

const reels = Router();
const upload = mediaUpload({ folder: ["videos", "reels"], kinds: "video", maxFiles: 1, maxMb: 40 }).single("video");

reels.use(verifyToken);

async function authorWhere(me: string) {
  const [excluded, following] = await Promise.all([
    excludedAuthorIds(me),
    prisma.follower.findMany({
      where: { fk_user_id: me },
      select: { fk_follower_id: true }
    })
  ]);
  const followingIds = following.map(item => item.fk_follower_id);
  return {
    hidden: false,
    ...(excluded.size ? { user_id: { notIn: [...excluded] } } : {}),
    OR: [
      { user_id: me },
      { user: { is_private: false } },
      { user_id: { in: followingIds } }
    ]
  };
}

function serialize(reel: {
  id: number;
  video_url: string;
  caption: string;
  mood: string | null;
  created_on: Date;
  user_id: string;
  user: { username: string; image_url: string | null; cover_color: string | null };
  likes: { user_id: string }[];
  _count: { likes: number };
}, me: string) {
  return {
    id: reel.id,
    video_url: reel.video_url,
    caption: reel.caption,
    mood: reel.mood,
    created_on: reel.created_on,
    user_id: reel.user_id,
    username: reel.user.username,
    image_url: withUserImage(reel.user.image_url),
    cover_color: reel.user.cover_color || "#2F5BAC",
    likes: reel._count.likes,
    liked: reel.likes.some(item => item.user_id === me)
  };
}

reels.get("/", async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const page = Math.max(0, Number(request.query.page) || 0);
    const where = await authorWhere(me);
    const rows = await prisma.reel.findMany({
      where,
      orderBy: { id: "desc" },
      skip: page * 8,
      take: 8,
      include: {
        user: { select: { username: true, image_url: true, cover_color: true } },
        likes: { where: { user_id: me }, select: { user_id: true } },
        _count: { select: { likes: true } }
      }
    });

    return response.json({
      success: true,
      reels: rows.map(row => serialize(row, me))
    });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao carregar clipes.");
  }
});

reels.post("/", writeRateLimit, upload, async (request, response) => {
  try {
    const parsed = reelMetaSchema.safeParse(JSON.parse(request.body.body || "{}"));
    if (!parsed.success) {
      return fail(response, 400, parsed.error.issues[0]?.message || "Dados inválidos.");
    }
    const file = request.file;
    if (!file) {
      return fail(response, 400, "Envie um vídeo vertical.");
    }

    const uploaded = isCloudinaryConfigured
      ? await cloudinary.uploader.upload(file.path, { resource_type: "video" })
      : { secure_url: `${process.env.SERVER_URL}/videos/reels/${file.filename}` };

    const reel = await prisma.reel.create({
      data: {
        video_url: uploaded.secure_url,
        caption: parsed.data.caption || "",
        mood: parsed.data.mood,
        user_id: getCurrentUser(request).id
      }
    });

    return response.json({ success: true, reelId: reel.id });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao publicar clipe.");
  }
});

reels.post("/:id/like", writeRateLimit, async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const reelId = Number(request.params.id);
    const existing = await prisma.reelLike.findUnique({
      where: { reel_id_user_id: { reel_id: reelId, user_id: me } }
    });

    if (existing) {
      await prisma.reelLike.delete({ where: { id: existing.id } });
      return response.json({ success: true, liked: false });
    }

    await prisma.reelLike.create({ data: { reel_id: reelId, user_id: me } });
    return response.json({ success: true, liked: true });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao curtir clipe.");
  }
});

reels.delete("/:id", async (request, response) => {
  try {
    const deleted = await prisma.reel.deleteMany({
      where: { id: Number(request.params.id), user_id: getCurrentUser(request).id }
    });
    if (!deleted.count) {
      return fail(response, 404, "Clipe não encontrado.");
    }
    return response.json({ success: true });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao apagar clipe.");
  }
});

export { reels };
