import { Server } from "socket.io";
import { Server as HttpServer } from "http";
import { getCurrentDate, chatMessageSchema, excludedAuthorIds } from "../shared";
import { prisma } from "../config";
import { verifyAuthToken } from "../shared/token";
import { setIo } from "./registry";

interface OnlineUsers {
  [socketId: string]: string;
}

export function useSocket(httpServer: HttpServer, frontendOrigin: string | string[]) {
  const io = new Server(httpServer, {
    cors: {
      origin: frontendOrigin,
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  setIo(io);

  const allUsers: OnlineUsers = {};

  io.use(async (socket, next) => {
    try {
      const token = String(socket.handshake.auth?.token || "");
      if (!token) {
        return next(new Error("unauthorized"));
      }

      const decoded = verifyAuthToken(token);
      const user = decoded.id
        ? await prisma.user.findUnique({
            where: { id: decoded.id },
            select: { id: true, suspended_at: true }
          })
        : await prisma.user.findFirst({
            where: { email: decoded.email },
            select: { id: true, suspended_at: true }
          });

      if (!user || user.suspended_at) {
        return next(new Error("unauthorized"));
      }

      socket.data.userId = user.id;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = String(socket.data.userId);
    socket.join(`user:${userId}`);

    socket.on("new-user", (callback) => {
      allUsers[socket.id] = userId;
      socket.broadcast.emit("new-user", socket.id, userId);
      callback({ allUsers });
    });

    socket.on("new-message", async (message, callback) => {
      const parsed = chatMessageSchema.safeParse(message);
      if (!parsed.success) {
        callback(false);
        return;
      }

      const createdOn = getCurrentDate();
      const result = await prisma.global_messages.create({
        data: {
          user_id: userId,
          message: parsed.data,
          created_on: createdOn
        },
        select: { id: true }
      });

      io.sockets.emit("received-message", {
        googleID: userId,
        message: parsed.data,
        createdOn,
        messageID: result.id
      });
      callback(true);
    });

    socket.on("typing", async (toUserId: string) => {
      if (!toUserId || toUserId === userId) {
        return;
      }
      const excluded = await excludedAuthorIds(userId);
      if (excluded.has(String(toUserId))) {
        return;
      }
      io.to(`user:${toUserId}`).emit("typing", { fromUserId: userId });
    });

    socket.on("live:join", async (liveId: string, callback?: (result: { ok: boolean; hostId?: string; viewers?: number }) => void) => {
      try {
        const live = await prisma.liveSession.findUnique({
          where: { id: String(liveId) },
          select: { id: true, status: true, user_id: true }
        });
        if (!live || live.status !== "live") {
          callback?.({ ok: false });
          return;
        }
        const excluded = await excludedAuthorIds(userId);
        if (excluded.has(live.user_id) && live.user_id !== userId) {
          callback?.({ ok: false });
          return;
        }
        socket.join(`live:${live.id}`);
        socket.data.liveId = live.id;
        const room = io.sockets.adapter.rooms.get(`live:${live.id}`);
        const viewers = Math.max(0, (room?.size || 1) - 1);
        if (viewers > 0) {
          await prisma.liveSession.updateMany({
            where: { id: live.id, viewer_peak: { lt: viewers } },
            data: { viewer_peak: viewers }
          });
        }
        socket.to(`live:${live.id}`).emit("live:peer-joined", {
          socketId: socket.id,
          userId,
          isHost: live.user_id === userId
        });
        callback?.({ ok: true, hostId: live.user_id, viewers });
      } catch {
        callback?.({ ok: false });
      }
    });

    socket.on("live:signal", (payload: { liveId?: string; to?: string; data?: unknown }) => {
      const liveId = String(payload?.liveId || socket.data.liveId || "");
      const to = String(payload?.to || "");
      if (!liveId || !to || !payload?.data) {
        return;
      }
      io.to(to).emit("live:signal", {
        from: socket.id,
        userId,
        data: payload.data
      });
    });

    socket.on("live:chat", async (payload: { liveId?: string; content?: string }) => {
      const liveId = String(payload?.liveId || socket.data.liveId || "");
      const parsed = chatMessageSchema.safeParse(payload?.content);
      if (!liveId || !parsed.success) {
        return;
      }
      const live = await prisma.liveSession.findUnique({
        where: { id: liveId },
        select: { status: true }
      });
      if (!live || live.status !== "live") {
        return;
      }
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true }
      });
      const row = await prisma.liveMessage.create({
        data: { live_id: liveId, user_id: userId, content: parsed.data.slice(0, 280) }
      });
      io.to(`live:${liveId}`).emit("live:chat", {
        id: row.id,
        content: row.content,
        user_id: userId,
        username: user?.username || "alguém"
      });
    });

    socket.on("live:end", async (liveId: string) => {
      const id = String(liveId || socket.data.liveId || "");
      if (!id) {
        return;
      }
      const updated = await prisma.liveSession.updateMany({
        where: { id, user_id: userId, status: "live" },
        data: { status: "ended", ended_on: new Date() }
      });
      if (updated.count) {
        io.to(`live:${id}`).emit("live:ended");
      }
    });

    socket.on("disconnect", () => {
      socket.broadcast.emit("delete-user", allUsers[socket.id]);
      delete allUsers[socket.id];
      const liveId = socket.data.liveId as string | undefined;
      if (liveId) {
        socket.to(`live:${liveId}`).emit("live:peer-left", { socketId: socket.id, userId });
      }
    });
  });
}
