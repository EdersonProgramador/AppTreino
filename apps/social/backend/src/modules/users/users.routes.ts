import { Router } from "express";
import bcrypt from "bcrypt";
import { verifyToken, validate } from "../../middleware";
import { cloudinary, isCloudinaryConfigured, prisma } from "../../config";
import {
  blockSchema,
  blockedIds,
  excludedAuthorIds,
  fail,
  followSchema,
  getCurrentUser,
  imageUpload,
  notify,
  onboardSchema,
  reportSchema,
  withUserImage
} from "../../shared";

const user = Router();
const upload = imageUpload("user", 1).array("picture", 1);
const BCRYPT_ROUNDS = 10;

user.use(verifyToken);

user.get("/profile/:userID", async (request, response) => {
  try {
    const { userID } = request.params;

    const foundUser = await prisma.user.findFirst({
      where: { id: userID },
      select: {
        id: true,
        username: true,
        image_url: true,
        created_on: true,
        cover_color: true,
        bio: true,
        password: true,
        is_private: true
      }
    });

    if (!foundUser) {
      return response.json({ success: true, userExists: false });
    }

    const me = getCurrentUser(request).id;

    const [following, followers, isFollowing, iBlocked, theyBlocked, iMuted, followRequest] = await Promise.all([
      prisma.follower.count({ where: { fk_user_id: foundUser.id } }),
      prisma.follower.count({ where: { fk_follower_id: foundUser.id } }),
      prisma.follower.findFirst({
        where: {
          fk_user_id: me,
          fk_follower_id: userID
        },
        select: { id: true }
      }),
      prisma.block.findFirst({
        where: { blocker_id: me, blocked_id: userID },
        select: { id: true }
      }),
      prisma.block.findFirst({
        where: { blocker_id: userID, blocked_id: me },
        select: { id: true }
      }),
      prisma.mute.findFirst({
        where: { muter_id: me, muted_id: userID },
        select: { id: true }
      }),
      prisma.followRequest.findFirst({
        where: { from_id: me, to_id: userID },
        select: { id: true }
      })
    ]);

    if (theyBlocked) {
      return fail(response, 403, "Este perfil não está disponível.");
    }

    return response.json({
      success: true,
      userExists: true,
      user: {
        id: foundUser.id,
        username: foundUser.username,
        image_url: withUserImage(foundUser.image_url),
        created_on: foundUser.created_on,
        cover_color: foundUser.cover_color || "#2F5BAC",
        bio: foundUser.bio || "Sem biografia",
        havePassword: Boolean(foundUser.password),
        following,
        followers,
        is_private: foundUser.is_private
      },
      isFollowing: Boolean(isFollowing),
      isBlocked: Boolean(iBlocked),
      isMuted: Boolean(iMuted),
      followPending: Boolean(followRequest),
      canSeePosts: me === foundUser.id || Boolean(isFollowing) || !foundUser.is_private
    });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao buscar profile.");
  }
});

user.get("/posts/:userID", async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const targetId = request.params.userID;
    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { is_private: true }
    });

    if (!target) {
      return fail(response, 404, "Usuário não encontrado.");
    }

    const following = me === targetId
      ? true
      : Boolean(await prisma.follower.findFirst({
          where: { fk_user_id: me, fk_follower_id: targetId },
          select: { id: true }
        }));

    if (target.is_private && !following) {
      return response.json({ success: true, posts: [], private: true });
    }

    const posts = await prisma.post.findMany({
      where: { fk_user_id: targetId, hidden: false },
      orderBy: { id: "desc" },
      include: {
        user: {
          select: { username: true, image_url: true }
        }
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
        image_url: withUserImage(post.user.image_url)
      }))
    });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao selecionar posts do usuário.");
  }
});

user.put("/new-follow", validate(followSchema), async (request, response) => {
  try {
    const followerID = request.body.followerID as string;

    if (followerID === getCurrentUser(request).id) {
      return fail(response, 400, "Você não pode seguir a si mesmo.");
    }

    const me = getCurrentUser(request).id;
    const blocked = await blockedIds(me);
    if (blocked.has(followerID)) {
      return fail(response, 403, "Não é possível seguir este usuário.");
    }

    const target = await prisma.user.findUnique({
      where: { id: followerID },
      select: { id: true, is_private: true }
    });

    if (!target) {
      return fail(response, 404, "Usuário não encontrado.");
    }

    if (target.is_private) {
      await prisma.followRequest.upsert({
        where: { from_id_to_id: { from_id: me, to_id: followerID } },
        update: {},
        create: { from_id: me, to_id: followerID }
      });
      await notify({ userId: followerID, actorId: me, type: "follow_request" });
      return response.json({ success: true, pending: true });
    }

    try {
      await prisma.follower.create({
        data: {
          fk_user_id: me,
          fk_follower_id: followerID
        }
      });
    } catch {
      return fail(response, 400, "Você já segue este usuário.");
    }

    await notify({ userId: followerID, actorId: me, type: "follow" });

    return response.json({ success: true });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao seguir o usuário.");
  }
});

user.delete("/unfollow/:followerID", async (request, response) => {
  try {
    await prisma.follower.deleteMany({
      where: {
        fk_user_id: getCurrentUser(request).id,
        fk_follower_id: request.params.followerID
      }
    });
    await prisma.followRequest.deleteMany({
      where: {
        from_id: getCurrentUser(request).id,
        to_id: request.params.followerID
      }
    });

    return response.json({ success: true });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao parar de seguir usuário.");
  }
});

user.get("/all", async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const excluded = await excludedAuthorIds(me);
    const users = await prisma.user.findMany({
      where: excluded.size ? { id: { notIn: [...excluded, me] } } : { id: { not: me } },
      select: {
        id: true,
        username: true,
        image_url: true
      }
    });

    return response.json({
      success: true,
      users: users.map(item => ({
        ...item,
        image_url: withUserImage(item.image_url)
      }))
    });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao buscar usuários.");
  }
});

user.get("/current", async (request, response) => {
  return response.json({
    user: {
      id: getCurrentUser(request).id,
      email: getCurrentUser(request).email
    }
  });
});

user.post("/update-info", upload, async (request, response) => {
  try {
    const body = JSON.parse(request.body.body || "{}");
    const { bio, cover_color, name, currentPassword, newPassword, is_private } = body;
    const files = request.files as Express.Multer.File[] | undefined;
    const uploadedFile = files?.[0];

    const currentUser = await prisma.user.findUnique({
      where: { id: getCurrentUser(request).id },
      select: { cloudinary_id: true, password: true }
    });

    if (!currentUser) {
      return fail(response, 403, "Permission denied.");
    }

    if (uploadedFile && currentUser.cloudinary_id && isCloudinaryConfigured) {
      await cloudinary.uploader.destroy(currentUser.cloudinary_id);
    }

    const imageData = uploadedFile
      ? isCloudinaryConfigured
        ? await cloudinary.uploader.upload(uploadedFile.path)
        : {
            secure_url: `${process.env.SERVER_URL}/images/user/${uploadedFile.filename}`,
            public_id: ""
          }
      : null;

    const data: {
      bio: string;
      cover_color: string | null;
      username: string;
      image_url?: string;
      cloudinary_id?: string;
      password?: string;
      is_private?: boolean;
    } = {
      bio,
      cover_color,
      username: name,
      ...(typeof is_private === "boolean" ? { is_private } : {}),
      ...(imageData ? {
        image_url: imageData.secure_url,
        cloudinary_id: imageData.public_id
      } : {})
    };

    if (currentPassword || newPassword) {
      const match = currentUser.password
        ? await bcrypt.compare(String(currentPassword || ""), currentUser.password)
        : true;

      if (!match) {
        return fail(response, 400, "Senha incorreta.");
      }

      if (!newPassword || String(newPassword).length < 6) {
        return fail(response, 400, "A nova senha deve ter ao menos 6 caracteres.");
      }

      data.password = await bcrypt.hash(String(newPassword), BCRYPT_ROUNDS);
    }

    await prisma.user.update({
      where: { id: getCurrentUser(request).id },
      data
    });

    return response.json({ success: true });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao atualizar dados.");
  }
});

user.get("/suggestions", async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const [following, excluded] = await Promise.all([
      prisma.follower.findMany({
        where: { fk_user_id: me },
        select: { fk_follower_id: true }
      }),
      excludedAuthorIds(me)
    ]);

    const exclude = [me, ...following.map(row => row.fk_follower_id), ...excluded];
    const users = await prisma.user.findMany({
      where: { id: { notIn: exclude } },
      select: { id: true, username: true, image_url: true, bio: true },
      take: 12,
      orderBy: { created_on: "desc" }
    });

    return response.json({
      success: true,
      users: users.map(item => ({
        ...item,
        image_url: withUserImage(item.image_url),
        bio: item.bio || "Sem biografia"
      }))
    });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao sugerir pessoas.");
  }
});

user.post("/onboard", validate(onboardSchema), async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const followIds = ((request.body.followIds || []) as string[]).filter(id => id !== me);

    if (followIds.length) {
      const blocked = await blockedIds(me);
      const allowed = followIds.filter(id => !blocked.has(id));
      const targets = await prisma.user.findMany({
        where: { id: { in: allowed } },
        select: { id: true, is_private: true }
      });
      const open = targets.filter(item => !item.is_private).map(item => item.id);
      const locked = targets.filter(item => item.is_private).map(item => item.id);

      if (open.length) {
        await prisma.follower.createMany({
          data: open.map(fk_follower_id => ({
            fk_user_id: me,
            fk_follower_id
          })),
          skipDuplicates: true
        });
        await Promise.all(open.map(id => notify({ userId: id, actorId: me, type: "follow" })));
      }

      if (locked.length) {
        await prisma.followRequest.createMany({
          data: locked.map(to_id => ({ from_id: me, to_id })),
          skipDuplicates: true
        });
        await Promise.all(locked.map(id => notify({ userId: id, actorId: me, type: "follow_request" })));
      }
    }

    await prisma.user.update({
      where: { id: me },
      data: { onboarded: true }
    });

    return response.json({ success: true });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao concluir o onboarding.");
  }
});

user.post("/block", validate(blockSchema), async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const userId = request.body.userId as string;

    if (userId === me) {
      return fail(response, 400, "Você não pode bloquear a si mesmo.");
    }

    await prisma.$transaction([
      prisma.block.upsert({
        where: {
          blocker_id_blocked_id: { blocker_id: me, blocked_id: userId }
        },
        update: {},
        create: { blocker_id: me, blocked_id: userId }
      }),
      prisma.follower.deleteMany({
        where: {
          OR: [
            { fk_user_id: me, fk_follower_id: userId },
            { fk_user_id: userId, fk_follower_id: me }
          ]
        }
      })
    ]);

    return response.json({ success: true });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao bloquear usuário.");
  }
});

user.delete("/block/:userId", async (request, response) => {
  try {
    await prisma.block.deleteMany({
      where: {
        blocker_id: getCurrentUser(request).id,
        blocked_id: request.params.userId
      }
    });

    return response.json({ success: true });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao desbloquear usuário.");
  }
});

user.post("/report", validate(reportSchema), async (request, response) => {
  try {
    const { targetType, reason, targetUserId, postId } = request.body;

    await prisma.report.create({
      data: {
        target_type: targetType,
        reason,
        reporter_id: getCurrentUser(request).id,
        target_user_id: targetType === "user" ? targetUserId : null,
        post_id: targetType === "post" ? Number(postId) : null
      }
    });

    return response.json({ success: true, message: "Denúncia registrada." });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao registrar denúncia.");
  }
});

user.post("/mute", validate(blockSchema), async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const userId = request.body.userId as string;
    if (userId === me) {
      return fail(response, 400, "Você não pode silenciar a si mesmo.");
    }

    await prisma.mute.upsert({
      where: { muter_id_muted_id: { muter_id: me, muted_id: userId } },
      update: {},
      create: { muter_id: me, muted_id: userId }
    });

    return response.json({ success: true });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao silenciar usuário.");
  }
});

user.delete("/mute/:userId", async (request, response) => {
  try {
    await prisma.mute.deleteMany({
      where: { muter_id: getCurrentUser(request).id, muted_id: request.params.userId }
    });
    return response.json({ success: true });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao reativar usuário.");
  }
});

user.get("/follow-requests", async (request, response) => {
  try {
    const rows = await prisma.followRequest.findMany({
      where: { to_id: getCurrentUser(request).id },
      orderBy: { id: "desc" },
      include: {
        from: { select: { id: true, username: true, image_url: true } }
      }
    });

    return response.json({
      success: true,
      requests: rows.map(row => ({
        id: row.id,
        user: {
          id: row.from.id,
          username: row.from.username,
          image_url: withUserImage(row.from.image_url)
        }
      }))
    });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao listar pedidos.");
  }
});

user.post("/follow-requests/:id/accept", async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const row = await prisma.followRequest.findFirst({
      where: { id: Number(request.params.id), to_id: me }
    });

    if (!row) {
      return fail(response, 404, "Pedido não encontrado.");
    }

    await prisma.$transaction([
      prisma.follower.createMany({
        data: [{ fk_user_id: row.from_id, fk_follower_id: me }],
        skipDuplicates: true
      }),
      prisma.followRequest.delete({ where: { id: row.id } })
    ]);
    await notify({ userId: row.from_id, actorId: me, type: "follow" });

    return response.json({ success: true });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao aceitar pedido.");
  }
});

user.post("/follow-requests/:id/reject", async (request, response) => {
  try {
    await prisma.followRequest.deleteMany({
      where: { id: Number(request.params.id), to_id: getCurrentUser(request).id }
    });
    return response.json({ success: true });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao recusar pedido.");
  }
});

user.get("/me/export", async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const [profile, posts, comments, following, followers, notifications] = await Promise.all([
      prisma.user.findUnique({
        where: { id: me },
        select: {
          id: true, username: true, email: true, bio: true, created_on: true, is_private: true
        }
      }),
      prisma.post.findMany({ where: { fk_user_id: me }, select: { id: true, content: true, created_on: true } }),
      prisma.comment.findMany({ where: { fk_user_id: me }, select: { id: true, content: true, created_on: true } }),
      prisma.follower.findMany({ where: { fk_user_id: me }, select: { fk_follower_id: true } }),
      prisma.follower.findMany({ where: { fk_follower_id: me }, select: { fk_user_id: true } }),
      prisma.notification.findMany({ where: { user_id: me }, take: 200, orderBy: { id: "desc" } })
    ]);

    return response.json({
      success: true,
      exported_at: new Date().toISOString(),
      data: { profile, posts, comments, following, followers, notifications }
    });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao exportar dados.");
  }
});

user.delete("/me", async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const currentUser = await prisma.user.findUnique({
      where: { id: me },
      select: { cloudinary_id: true }
    });

    if (currentUser?.cloudinary_id && isCloudinaryConfigured) {
      await cloudinary.uploader.destroy(currentUser.cloudinary_id);
    }

    await prisma.$transaction([
      prisma.follower.deleteMany({
        where: { OR: [{ fk_user_id: me }, { fk_follower_id: me }] }
      }),
      prisma.conversation.deleteMany({
        where: { OR: [{ user_a_id: me }, { user_b_id: me }] }
      }),
      prisma.user.delete({ where: { id: me } })
    ]);

    return response.json({ success: true });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao excluir a conta.");
  }
});

export { user };
