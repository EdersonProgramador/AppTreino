import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import type { NativeAuthUser, NativeSession } from "./types";

/** Sessão inteira em texto plano no AsyncStorage — lida só para migrar. */
const LEGACY_SESSION_KEY = "apptreino.session.v1";
/**
 * O token vai para Keychain/Keystore; o usuário fica no AsyncStorage porque o
 * SecureStore do iOS avisa acima de 2048 bytes e o perfil não é segredo.
 */
const TOKEN_KEY = "apptreino_token_v1";
const USER_KEY = "apptreino.user.v1";

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

async function readLegacySession(): Promise<NativeSession | null> {
  try {
    const raw = await AsyncStorage.getItem(LEGACY_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function readNativeSession(): Promise<NativeSession | null> {
  try {
    const [token, rawUser] = await Promise.all([
      SecureStore.getItemAsync(TOKEN_KEY),
      AsyncStorage.getItem(USER_KEY)
    ]);

    if (token && rawUser) {
      const session = { token, user: JSON.parse(rawUser) as unknown };
      if (isSession(session)) return session;
    }

    // Instalação anterior à migração: reescreve no formato novo e limpa o antigo.
    const legacy = await readLegacySession();
    if (!legacy) return null;
    await writeNativeSession(legacy);
    await AsyncStorage.removeItem(LEGACY_SESSION_KEY);
    return legacy;
  } catch {
    return null;
  }
}

export async function writeNativeSession(session: NativeSession) {
  await Promise.all([
    SecureStore.setItemAsync(TOKEN_KEY, session.token),
    AsyncStorage.setItem(USER_KEY, JSON.stringify(session.user))
  ]);
}

export async function clearNativeSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined),
    AsyncStorage.removeItem(USER_KEY),
    AsyncStorage.removeItem(LEGACY_SESSION_KEY)
  ]);
}

export function sessionAsLocalStorage(session: NativeSession) {
  return {
    "app-treino-token": session.token,
    "app-treino-user": JSON.stringify(session.user)
  };
}
