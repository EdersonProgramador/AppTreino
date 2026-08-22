import { Server } from "socket.io";

let ioRef: Server | null = null;

export function setIo(io: Server) {
  ioRef = io;
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  ioRef?.to(`user:${userId}`).emit(event, payload);
}
