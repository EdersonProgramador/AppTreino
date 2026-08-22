import { Router } from "express";
import { prisma } from "../../config";
import { verifyToken } from "../../middleware";
import { fail, getCurrentUser, withUserImage } from "../../shared";

const notifications = Router();

notifications.use(verifyToken);

notifications.get("/", async (request, response) => {
  try {
    const rows = await prisma.notification.findMany({
      where: { user_id: getCurrentUser(request).id },
      orderBy: { id: "desc" },
      take: 40,
      include: {
        actor: {
          select: { id: true, username: true, image_url: true }
        }
      }
    });

    return response.json({
      success: true,
      unread: rows.filter(row => !row.read).length,
      notifications: rows.map(row => ({
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
      }))
    });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao buscar notificações.");
  }
});

notifications.post("/read", async (request, response) => {
  try {
    await prisma.notification.updateMany({
      where: { user_id: getCurrentUser(request).id, read: false },
      data: { read: true }
    });

    return response.json({ success: true });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao marcar notificações.");
  }
});

export { notifications };
