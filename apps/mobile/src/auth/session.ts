import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NativeAuthUser, NativeSession } from "./types";

const SESSION_KEY = "apptreino.session.v1";

function isUser(value: unknown): value is NativeAuthUser {
  if (!value || typeof value !== "object") return false;
  const user = value as NativeAuthUser;
  return typeof user.id === "string" && typeof user.name === "string" && typeof user.role === "string";
}

function isSession(value: unknown): value is NativeSession {
  if (!value || typeof value !== "object") return false;
  const session = value as NativeSession;
  return typeof session.token === "string" && session.token.length > 8 && isUser(session.user);
}

export async function readNativeSession(): Promise<NativeSession | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeNativeSession(session: NativeSession) {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function clearNativeSession() {
  await AsyncStorage.removeItem(SESSION_KEY);
}

export function sessionAsLocalStorage(session: NativeSession) {
  return {
    "app-treino-token": session.token,
    "app-treino-user": JSON.stringify(session.user)
  };
}
