import { Router } from "express";
import { prisma } from "../../config";
import { verifyToken } from "../../middleware";
import { fail, getCurrentUser, publicPath, searchQuerySchema, excludedAuthorIds } from "../../shared";

const index = Router();

index.get("/health", (_request, response) => {
  return response.json({ success: true });
});

index.get("/search/posts/:searchQuery", verifyToken, async (request, response) => {
  try {
    const parsed = searchQuerySchema.safeParse(request.params.searchQuery);
    if (!parsed.success) {
      return fail(response, 400, "Busca inválida.");
    }

    const me = getCurrentUser(request).id;
    const excluded = await excludedAuthorIds(me);
    const term = parsed.data.replace(/^#/, "");
    const posts = await prisma.post.findMany({
      where: {
        hidden: false,
        content: { contains: term, mode: "insensitive" },
        ...(excluded.size ? { fk_user_id: { notIn: [...excluded] } } : {})
      },
      orderBy: { id: "desc" },
      take: 30,
      include: {
        user: { select: { username: true, image_url: true } }
      }
    });

    return response.json({
      success: true,
      posts: posts.map(post => ({
        id: post.id,
        fk_user_id: post.fk_user_id,
        content: post.content,
        images: post.images,
        created_on: post.created_on,
        username: post.user.username,
        image_url: post.user.image_url || process.env.SERVER_URL + "/images/user/profile-user.png"
      }))
    });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao pesquisar publicações");
  }
});

index.get("/search/:searchQuery", verifyToken, async (request, response) => {
  try {
    const parsed = searchQuerySchema.safeParse(request.params.searchQuery);
    if (!parsed.success) {
      return fail(response, 400, "Busca inválida.");
    }

    const excluded = await excludedAuthorIds(getCurrentUser(request).id);
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        image_url: true
      },
      where: {
        username: {
          contains: parsed.data,
          mode: "insensitive"
        },
        ...(excluded.size ? { id: { notIn: [...excluded] } } : {})
      },
      take: 30
    });

    return response.json({
      success: true,
      users: users.map(user => ({
        ...user,
        image_url: user.image_url || process.env.SERVER_URL + "/images/user/profile-user.png"
      })
    )});
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao pesquisar usuários");
  }
});

index.get("/images/user/:image", (request, response) => {
  try {
    return response.sendFile(publicPath("images", "user", request.params.image));
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro. Arquivo inválido.");
  }
});

index.get("/images/post/:image", (request, response) => {
  try {
    return response.sendFile(publicPath("images", "posts", request.params.image));
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro. Arquivo inválido.");
  }
});

index.get("/images/posts/:image", (request, response) => {
  try {
    return response.sendFile(publicPath("images", "posts", request.params.image));
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro. Arquivo inválido.");
  }
});

index.get("/media/posts/:file", (request, response) => {
  try {
    return response.sendFile(publicPath("media", "posts", request.params.file));
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro. Arquivo inválido.");
  }
});

index.get("/images/stories/:image", (request, response) => {
  try {
    return response.sendFile(publicPath("images", "stories", request.params.image));
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro. Arquivo inválido.");
  }
});

index.get("/videos/reels/:video", (request, response) => {
  try {
    return response.sendFile(publicPath("videos", "reels", request.params.video));
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro. Arquivo inválido.");
  }
});

index.post("/all-messages", verifyToken, async (request, response) => {
  try {
    const indexValue = Math.max(0, Number(request.body.index) || 0);
    const messagesLimitPerPage = 5;

    const excluded = await excludedAuthorIds(getCurrentUser(request).id);
    const messages = await prisma.global_messages.findMany({
      skip: messagesLimitPerPage * indexValue,
      take: messagesLimitPerPage,
      where: excluded.size ? { user_id: { notIn: [...excluded] } } : undefined,
      orderBy: {
        id: "desc"
      }
    });

    return response.json({ success: true, messages });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao buscar mensagens.");
  }
});

export { index };
