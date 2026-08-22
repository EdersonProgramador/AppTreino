import type { FastifyInstance } from "fastify";
import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { prisma } from "../prisma.js";
import { env } from "../env.js";
import type { AuthTokenPayload } from "../auth.js";

let io: Server | null = null;
const onlineBySocket = new Map<string, string>();

export function getSocialIo() {
  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function registerSocialSockets(app: FastifyInstance, httpServer: HttpServer) {
  const origins = env.WEB_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  io = new Server(httpServer, {
    path: "/socket.io",
    cors: {
      origin: (origin, callback) => {
        if (!origin || origins.includes(origin) || /^http:\/\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(origin)) {
          callback(null, true);
          return;
        }
        callback(null, origins.includes("*") || origins.length === 0);
      },
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  io.use(async (socket, next) => {
    try {
      const token = String(socket.handshake.auth?.token || "").replace(/^Bearer\s+/i, "");
      if (!token) return next(new Error("unauthorized"));
      const payload = app.jwt.verify<AuthTokenPayload>(token);
      const user = await prisma.user.findUnique({
        where: { id: payload.id },
        select: { id: true, status: true, deletedAt: true }
      });
      if (!user || user.deletedAt || user.status !== "ACTIVE") return next(new Error("unauthorized"));
      socket.data.userId = user.id;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = String(socket.data.userId);
    socket.join(`user:${userId}`);

    socket.on("presence:hello", (callback?: (payload: { online: Record<string, string> }) => void) => {
      onlineBySocket.set(socket.id, userId);
      socket.broadcast.emit("presence:join", { socketId: socket.id, userId });
      callback?.({ online: Object.fromEntries(onlineBySocket) });
    });

    socket.on("chat:global", async (content: string, callback?: (ok: boolean) => void) => {
      const text = String(content || "").trim().slice(0, 1000);
      if (!text) {
        callback?.(false);
        return;
      }
      const row = await prisma.socialGlobalMessage.create({
        data: { userId, content: text },
        include: { user: { select: { id: true, name: true, profile: { select: { avatarUrl: true } } } } }
      });
      const payload = {
        id: row.id,
        content: row.content,
        createdAt: row.createdAt.toISOString(),
        userId: row.userId,
        name: row.user.name,
        avatarUrl: row.user.profile?.avatarUrl ?? null
      };
      io?.emit("chat:global", payload);
      callback?.(true);
    });

    socket.on("dm:typing", (toUserId: string) => {
      if (!toUserId || toUserId === userId) return;
      io?.to(`user:${toUserId}`).emit("dm:typing", { fromUserId: userId });
    });

    socket.on("live:join", async (liveId: string, callback?: (result: { ok: boolean; hostId?: string; viewers?: number }) => void) => {
      try {
        const live = await prisma.socialLiveSession.findUnique({
          where: { id: String(liveId) },
          select: { id: true, status: true, hostId: true }
        });
        if (!live || live.status !== "live") {
          callback?.({ ok: false });
          return;
        }
        socket.join(`live:${live.id}`);
        socket.data.liveId = live.id;
        const room = io?.sockets.adapter.rooms.get(`live:${live.id}`);
        const viewers = Math.max(0, (room?.size || 1) - 1);
        if (viewers > 0) {
          await prisma.socialLiveSession.updateMany({
            where: { id: live.id, viewerPeak: { lt: viewers } },
            data: { viewerPeak: viewers }
          });
        }
        socket.to(`live:${live.id}`).emit("live:peer-joined", {
          socketId: socket.id,
          userId,
          isHost: live.hostId === userId
        });
        callback?.({ ok: true, hostId: live.hostId, viewers });
      } catch {
        callback?.({ ok: false });
      }
    });

    socket.on("live:signal", (payload: { liveId?: string; to?: string; data?: unknown }) => {
      const liveId = String(payload?.liveId || socket.data.liveId || "");
      const to = String(payload?.to || "");
      if (!liveId || !to || !payload?.data) return;
      io?.to(to).emit("live:signal", { from: socket.id, userId, data: payload.data });
    });

    socket.on("live:chat", async (payload: { liveId?: string; content?: string }) => {
      const liveId = String(payload?.liveId || socket.data.liveId || "");
      const content = String(payload?.content || "").trim().slice(0, 280);
      if (!liveId || !content) return;
      const live = await prisma.socialLiveSession.findUnique({ where: { id: liveId }, select: { status: true } });
      if (!live || live.status !== "live") return;
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
      const row = await prisma.socialLiveMessage.create({
        data: { liveId, userId, content }
      });
      io?.to(`live:${liveId}`).emit("live:chat", {
        id: row.id,
        content: row.content,
        userId,
        name: user?.name || "alguém"
      });
    });

    socket.on("live:end", async (liveId: string) => {
      const id = String(liveId || socket.data.liveId || "");
      if (!id) return;
      const updated = await prisma.socialLiveSession.updateMany({
        where: { id, hostId: userId, status: "live" },
        data: { status: "ended", endedAt: new Date() }
      });
      if (updated.count) io?.to(`live:${id}`).emit("live:ended");
    });

    socket.on("disconnect", () => {
      onlineBySocket.delete(socket.id);
      socket.broadcast.emit("presence:leave", { socketId: socket.id, userId });
      const liveId = socket.data.liveId as string | undefined;
      if (liveId) socket.to(`live:${liveId}`).emit("live:peer-left", { socketId: socket.id, userId });
    });
  });

  app.log.info("Social sockets registered on /socket.io");
}
