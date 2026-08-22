import { io, type Socket } from "socket.io-client";
import { getApiBaseUrl } from "../api";

let socket: Socket | null = null;

export function getSocialSocket(token: string) {
  if (socket?.connected) return socket;
  socket?.disconnect();
  socket = io(getApiBaseUrl(), {
    path: "/socket.io",
    auth: { token },
    transports: ["websocket", "polling"],
    autoConnect: true
  });
  return socket;
}

export function disconnectSocialSocket() {
  socket?.disconnect();
  socket = null;
}
