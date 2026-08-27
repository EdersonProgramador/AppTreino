import { io, type Socket } from "socket.io-client";
import { API_URL } from "../config";

let socket: Socket | null = null;
let socketToken: string | null = null;

/**
 * Socket compartilhado entre feed, mensagens e live: uma conexão só por sessão.
 */
export function getSocket(token: string) {
  // Reaproveitar o socket após um novo login manteria o token do usuário anterior.
  if (socket?.connected && socketToken === token) return socket;
  socket?.disconnect();
  socketToken = token;
  socket = io(API_URL, { path: "/socket.io", auth: { token }, transports: ["websocket"] });
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
  socketToken = null;
}
