import { Router } from "express";
import { prisma } from "../../config";
import { verifyToken, validate } from "../../middleware";
import {
  blockedIds,
  conversationPair,
  dmSchema,
  fail,
  getCurrentUser,
  notify,
  otherUserId,
  withUserImage,
  writeRateLimit
} from "../../shared";
import { emitToUser } from "../../sockets/registry";

const messages = Router();

messages.use(verifyToken);

async function getOrCreateConversation(me: string, other: string) {
  const pair = conversationPair(me, other);
  return prisma.conversation.upsert({
    where: {
      user_a_id_user_b_id: pair
    },
    update: {},
    create: pair
  });
}

function serializeMessage(row: {
  id: number;
  content: string;
  created_on: Date;
  sender_id: string;
  sender?: { username: string; image_url: string | null };
}) {
  return {
    id: row.id,
    content: row.content,
    created_on: row.created_on,
    sender_id: row.sender_id,
    username: row.sender?.username,
    image_url: row.sender ? withUserImage(row.sender.image_url) : undefined
  };
}

messages.get("/conversations", async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const blocked = await blockedIds(me);
    const rows = await prisma.conversation.findMany({
      where: {
        OR: [{ user_a_id: me }, { user_b_id: me }]
      },
      orderBy: { updated_on: "desc" },
      include: {
        messages: {
          orderBy: { id: "desc" },
          take: 1
        }
      }
    });

    const otherIds = rows
      .map(row => otherUserId(row, me))
      .filter(id => !blocked.has(id));

    const users = await prisma.user.findMany({
      where: { id: { in: otherIds } },
      select: { id: true, username: true, image_url: true }
    });
    const byId = new Map(users.map(user => [user.id, user]));

    return response.json({
      success: true,
      conversations: rows
        .map(row => {
          const otherId = otherUserId(row, me);
          const other = byId.get(otherId);
          if (!other) {
            return null;
          }

          return {
            id: row.id,
            user: {
              id: other.id,
              username: other.username,
              image_url: withUserImage(other.image_url)
            },
            lastMessage: row.messages[0]
              ? serializeMessage(row.messages[0])
              : null,
            updated_on: row.updated_on
          };
        })
        .filter(Boolean)
    });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao listar conversas.");
  }
});

messages.get("/:userId", async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const otherId = request.params.userId;

    if (otherId === me) {
      return fail(response, 400, "Conversa inválida.");
    }

    const blocked = await blockedIds(me);
    if (blocked.has(otherId)) {
      return fail(response, 403, "Não é possível conversar com este usuário.");
    }

    const other = await prisma.user.findUnique({
      where: { id: otherId },
      select: { id: true, username: true, image_url: true }
    });

    if (!other) {
      return fail(response, 404, "Usuário não encontrado.");
    }

    const pair = conversationPair(me, otherId);
    const conversation = await prisma.conversation.findUnique({
      where: { user_a_id_user_b_id: pair }
    });

    const thread = conversation
      ? await prisma.directMessage.findMany({
          where: { conversation_id: conversation.id },
          orderBy: { id: "asc" },
          take: 80,
          include: {
            sender: {
              select: { username: true, image_url: true }
            }
          }
        })
      : [];

    return response.json({
      success: true,
      user: {
        id: other.id,
        username: other.username,
        image_url: withUserImage(other.image_url)
      },
      messages: thread.map(serializeMessage)
    });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao abrir conversa.");
  }
});

messages.post("/:userId", writeRateLimit, validate(dmSchema), async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const otherId = request.params.userId;
    const content = request.body.content as string;

    if (otherId === me) {
      return fail(response, 400, "Conversa inválida.");
    }

    const blocked = await blockedIds(me);
    if (blocked.has(otherId)) {
      return fail(response, 403, "Não é possível conversar com este usuário.");
    }

    const other = await prisma.user.findUnique({
      where: { id: otherId },
      select: { id: true }
    });

    if (!other) {
      return fail(response, 404, "Usuário não encontrado.");
    }

    const conversation = await getOrCreateConversation(me, otherId);
    const message = await prisma.directMessage.create({
      data: {
        conversation_id: conversation.id,
        sender_id: me,
        content
      },
      include: {
        sender: {
          select: { username: true, image_url: true }
        }
      }
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updated_on: new Date() }
    });

    const payload = serializeMessage(message);
    emitToUser(otherId, "direct-message", { ...payload, conversation_user_id: me });
    emitToUser(me, "direct-message", { ...payload, conversation_user_id: otherId });
    await notify({ userId: otherId, actorId: me, type: "message" });

    return response.json({ success: true, message: payload });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao enviar mensagem.");
  }
});

export { messages };
