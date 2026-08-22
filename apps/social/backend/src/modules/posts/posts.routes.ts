import { Router } from "express";
import fs from "fs";
import { verifyToken, validate } from "../../middleware";
import { cloudinary, isCloudinaryConfigured, prisma } from "../../config";
import {
  createPostSchema,
  fail,
  feedQuerySchema,
  getCurrentDate,
  getCurrentUser,
  mediaUpload,
  newCommentSchema,
  notify,
  notifyMentions,
  parsePostMedia,
  publicPath,
  withUserImage,
  writeRateLimit
} from "../../shared";
import { buildUserFeed } from "./feed";

const posts = Router();
const upload = mediaUpload({ folder: ["media", "posts"], kinds: "any", maxFiles: 10, maxMb: 40 }).array("picture", 10);

posts.use(verifyToken);

posts.get("/feed", async (request, response) => {
  try {
    const parsed = feedQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return fail(response, 400, parsed.error.issues[0]?.message || "Parâmetros inválidos.");
    }

    const { mode, page } = parsed.data;
    const feed = await buildUserFeed(getCurrentUser(request).id, mode, page);

    return response.json({
      success: true,
      mode,
      followingCount: feed.followingCount,
      posts: feed.posts
    });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao montar o feed.");
  }
});

posts.delete("/:postID/like", async (request, response) => {
  try {
    await prisma.likes.deleteMany({
      where: {
        user_id: getCurrentUser(request).id,
        post_id: Number(request.params.postID)
      }
    });

    return response.json({ success: true });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao deletar like.");
  }
});

posts.put("/:postID/like", writeRateLimit, async (request, response) => {
  try {
    const userId = getCurrentUser(request).id;
    const postId = Number(request.params.postID);

    await prisma.$transaction([
      prisma.dislikes.deleteMany({ where: { user_id: userId, post_id: postId } }),
      prisma.likes.deleteMany({ where: { user_id: userId, post_id: postId } }),
      prisma.likes.create({ data: { user_id: userId, post_id: postId } })
    ]);

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { fk_user_id: true }
    });

    if (post) {
      await notify({ userId: post.fk_user_id, actorId: userId, type: "like", postId });
    }

    return response.json({ success: true });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao criar like.");
  }
});

posts.delete("/:postID/dislike", async (request, response) => {
  try {
    await prisma.dislikes.deleteMany({
      where: {
        user_id: getCurrentUser(request).id,
        post_id: Number(request.params.postID)
      }
    });

    return response.json({ success: true });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro deletar dislike.");
  }
});

posts.put("/:postID/dislike", async (request, response) => {
  try {
    const userId = getCurrentUser(request).id;
    const postId = Number(request.params.postID);

    await prisma.$transaction([
      prisma.likes.deleteMany({ where: { user_id: userId, post_id: postId } }),
      prisma.dislikes.deleteMany({ where: { user_id: userId, post_id: postId } }),
      prisma.dislikes.create({ data: { user_id: userId, post_id: postId } })
    ]);

    return response.json({ success: true });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro criar dislike.");
  }
});

posts.post("/actions", async (request, response) => {
  try {
    const postID = Number(request.body.postID);

    const [likes, dislikes] = await Promise.all([
      prisma.likes.findMany({
        where: { post_id: postID },
        include: {
          user: {
            select: { username: true, image_url: true }
          }
        }
      }),
      prisma.dislikes.findMany({
        where: { post_id: postID },
        include: {
          user: {
            select: { username: true, image_url: true }
          }
        }
      })
    ]);

    return response.json({
      success: true,
      likes: likes.map(like => ({
        post_id: like.post_id,
        user_id: like.user_id,
        username: like.user.username,
        image_url: withUserImage(like.user.image_url)
      })),
      dislikes: dislikes.map(dislike => ({
        post_id: dislike.post_id,
        user_id: dislike.user_id,
        username: dislike.user.username,
        image_url: withUserImage(dislike.user.image_url)
      }))
    });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao buscar likes e dislikes.");
  }
});

posts.get("/recent/:index", async (request, response) => {
  try {
    const skip = Math.max(0, Number(request.params.index) || 0) * 5;

    const recentPosts = await prisma.post.findMany({
      skip,
      take: 5,
      where: { hidden: false },
      orderBy: { id: "desc" },
      include: {
        user: {
          select: { username: true, image_url: true }
        }
      }
    });

    return response.json({
      success: true,
      posts: recentPosts.map(post => ({
        id: post.id,
        fk_user_id: post.fk_user_id,
        content: post.content,
        images: post.images,
        created_on: post.created_on,
        username: post.user.username,
        image_url: withUserImage(post.user.image_url)
      }))
    });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao buscar postagens recentes.");
  }
});

posts.put("/create", writeRateLimit, upload, async (request, response) => {
  try {
    const parsedBody = createPostSchema.safeParse(JSON.parse(request.body.body || "{}"));
    if (!parsedBody.success) {
      return fail(response, 400, parsedBody.error.issues[0]?.message || "Dados inválidos.");
    }

    const { createdOn, postContent } = parsedBody.data;
    const files = (request.files as Express.Multer.File[]) || [];

    if (!postContent && files.length === 0) {
      return fail(response, 400, "Escreva algo ou envie fotos e vídeos.");
    }

    if (files.length > 10) {
      return fail(response, 400, "O carrossel aceita no máximo 10 itens.");
    }

    const mediaItems: { url: string; kind: "image" | "video" }[] = [];
    for (const file of files) {
      const isVideo = file.mimetype.startsWith("video/");
      const result = isCloudinaryConfigured
        ? await cloudinary.uploader.upload(file.path, { resource_type: isVideo ? "video" : "image" })
        : { secure_url: `${process.env.SERVER_URL}/media/posts/${file.filename}` };
      mediaItems.push({
        url: result.secure_url,
        kind: isVideo ? "video" : "image"
      });
    }

    const created = await prisma.post.create({
      data: {
        content: postContent || "",
        fk_user_id: getCurrentUser(request).id,
        created_on: createdOn || getCurrentDate(),
        images: mediaItems.length === 0 ? null : JSON.stringify(mediaItems)
      }
    });

    await notifyMentions(postContent || "", getCurrentUser(request).id, created.id);

    return response.json({ success: true });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao criar post");
  }
});

posts.get("/comments/:postID", async (request, response) => {
  try {
    const comments = await prisma.comment.findMany({
      where: { fk_post_id: Number(request.params.postID) },
      orderBy: { id: "desc" },
      include: {
        user: {
          select: { id: true, username: true, image_url: true }
        }
      }
    });

    return response.json({
      success: true,
      comments: comments.map(comment => ({
        userID: comment.user.id,
        commentID: comment.id,
        username: comment.user.username,
        image_url: withUserImage(comment.user.image_url),
        content: comment.content,
        created_on: comment.created_on
      }))
    });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao buscar comentários");
  }
});

posts.put("/new-comment", writeRateLimit, validate(newCommentSchema), async (request, response) => {
  try {
    const { content, postID } = request.body;

    const userId = getCurrentUser(request).id;
    const postId = Number(postID);

    await prisma.comment.create({
      data: {
        content,
        fk_user_id: userId,
        fk_post_id: postId,
        created_on: getCurrentDate()
      }
    });

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { fk_user_id: true }
    });

    if (post) {
      await notify({ userId: post.fk_user_id, actorId: userId, type: "comment", postId });
    }

    await notifyMentions(content, userId, postId);

    return response.json({ success: true });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao criar comentários.");
  }
});

posts.delete("/:postID", async (request, response) => {
  try {
    const postID = Number(request.params.postID);
    const post = await prisma.post.findUnique({
      where: { id: postID },
      select: { images: true, fk_user_id: true }
    });

    if (!post) {
      return fail(response, 404, "Post não encontrado.");
    }

    if (post.fk_user_id !== getCurrentUser(request).id) {
      return fail(response, 403, "Usuário sem permissão.");
    }

    await prisma.post.delete({ where: { id: postID } });

    for (const item of parsePostMedia(post.images)) {
      const isCloudinary = item.url.includes("res.cloudinary.com") || (!item.url.startsWith("http") && isCloudinaryConfigured);
      if (isCloudinary && isCloudinaryConfigured) {
        const publicId = item.url.startsWith("http")
          ? item.url.match(/\/(?:image|video)\/upload\/(?:v\d+\/)?(.+)$/)?.[1]?.replace(/\.[a-z0-9]+$/i, "")
          : item.url;
        if (publicId) {
          await cloudinary.uploader.destroy(publicId, { resource_type: item.kind === "video" ? "video" : "image" });
        }
        continue;
      }

      try {
        const fileName = item.url.split("/").pop() || "";
        if (item.url.includes("/media/posts/")) {
          fs.unlinkSync(publicPath("media", "posts", fileName));
        } else {
          fs.unlinkSync(publicPath("images", "posts", fileName));
        }
      } catch {
        console.log("Arquivo local não encontrado");
      }
    }

    return response.json({ success: true });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao deletar post");
  }
});

export { posts };
