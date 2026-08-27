import { API_URL } from "../config";
import type { NativeAuthUser, NativeSession } from "./types";

export class NativeApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "NativeApiError";
  }
}

async function readError(response: Response, path?: string) {
  try {
    const data = (await response.json()) as {
      message?: string;
      error?: string;
      issues?: Array<{ message: string }>;
    };
    const detail = data.message ?? data.error ?? data.issues?.[0]?.message;
    if (detail) return detail;
  } catch {
    // ignore
  }
  if (response.status === 502 || response.status === 503) {
    const isUpload = Boolean(path && /\/uploads(\/|$)/.test(path));
    if (isUpload) {
      return "Servidor de upload indisponível (502/503). Tente de novo em instantes.";
    }
    return "Servidor indisponível (502/503). Aguarde o deploy no Render e tente de novo.";
  }
  if (response.status === 429) {
    return "Muitas requisições. Aguarde um minuto e tente de novo.";
  }
  return `API ${response.status}`;
}

function requestTimeoutMs(path: string) {
  if (path === "/auth/login" || path === "/me") return 30_000;
  return 60_000;
}

/** Uploads carregam vídeo em rede móvel — janela maior que a das chamadas JSON. */
const UPLOAD_TIMEOUT_MS = 180_000;

function networkErrorMessage(path: string, err: unknown) {
  const base = err instanceof Error ? err.message : String(err);
  const timeout =
    (err instanceof Error && err.name === "TimeoutError") ||
    /timeout|timed out|aborted/i.test(base);
  if (timeout) {
    return `A API demorou para responder (${API_URL}). O Render pode estar acordando — tente de novo.`;
  }
  if (/network request failed|failed to fetch|network error|ECONNREFUSED|ENOTFOUND/i.test(base)) {
    if (path === "/auth/login" || path === "/me") {
      return `Sem conexão com a API (${API_URL}). Confira internet e se EXPO_PUBLIC_API_URL aponta para produção.`;
    }
    return `Sem conexão com a API (${API_URL}).`;
  }
  return base || "Erro de rede ao contactar a API.";
}

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

/** O Render free hiberna: a primeira chamada devolve 502/503 ou estoura o tempo. */
const COLD_START_STATUSES = new Set([502, 503, 504]);
const RETRY_DELAYS_MS = [2_000, 5_000];

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function requestOnce<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((init.headers as Record<string, string> | undefined) ?? {})
  };

  const timeoutMs = requestTimeoutMs(path);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal
    });
    if (response.status === 401 && token) {
      unauthorizedHandler?.();
    }
    if (!response.ok) {
      throw new NativeApiError(response.status, await readError(response, path));
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return response.json() as Promise<T>;
  } catch (err) {
    if (err instanceof NativeApiError) throw err;
    const timeout =
      err instanceof Error &&
      (err.name === "AbortError" || err.name === "TimeoutError" || /aborted|timeout/i.test(err.message));
    throw new NativeApiError(0, networkErrorMessage(path, timeout ? new Error("TimeoutError") : err));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Só GET é repetido: um 502 em POST/PUT/DELETE pode ter chegado ao servidor,
 * e repetir criaria post ou live duplicados.
 */
async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const attempts = method === "GET" ? RETRY_DELAYS_MS.length + 1 : 1;

  for (let attempt = 0; ; attempt++) {
    try {
      return await requestOnce<T>(path, init, token);
    } catch (err) {
      const coldStart =
        err instanceof NativeApiError && (err.status === 0 || COLD_START_STATUSES.has(err.status));
      if (!coldStart || attempt >= attempts - 1) throw err;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

export function apiGet<T>(path: string, token?: string | null) {
  return request<T>(path, { method: "GET" }, token);
}

export function apiPost<T>(path: string, body: unknown, token?: string | null) {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) }, token);
}

export function apiPut<T>(path: string, body: unknown, token?: string | null) {
  return request<T>(path, { method: "PUT", body: JSON.stringify(body) }, token);
}

export function apiDelete<T>(path: string, token?: string | null) {
  return request<T>(path, { method: "DELETE" }, token);
}

function guessUploadMime(filename: string, mimeType?: string | null) {
  const declared = (mimeType ?? "").split(";")[0]?.trim().toLowerCase();
  if (declared === "audio/m4a" || declared === "audio/x-m4a" || declared === "audio/aac") return "audio/mp4";
  if (declared) return declared;
  const lower = filename.toLowerCase();
  const extension = lower.split(".").pop() ?? "";
  const videoMime: Record<string, string> = {
    mp4: "video/mp4",
    m4v: "video/x-m4v",
    mov: "video/quicktime",
    qt: "video/quicktime",
    webm: "video/webm",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    divx: "video/x-msvideo",
    ogv: "video/ogg",
    ogg: "video/ogg",
    mpg: "video/mpeg",
    mpeg: "video/mpeg",
    mpe: "video/mpeg",
    ts: "video/mp2t",
    mts: "video/mp2t",
    m2ts: "video/mp2t",
    "3gp": "video/3gpp",
    "3g2": "video/3gpp2",
    flv: "video/x-flv",
    f4v: "video/x-f4v",
    wmv: "video/x-ms-wmv",
    asf: "video/x-ms-asf",
    mxf: "application/mxf",
    hevc: "video/hevc",
    h265: "video/h265",
    h264: "video/h264",
    av1: "video/av1"
  };
  if (videoMime[extension]) return videoMime[extension];
  const audioMime: Record<string, string> = {
    m4a: "audio/mp4",
    aac: "audio/mp4",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    webm: "audio/webm",
    caf: "audio/x-caf",
    ogg: "audio/ogg"
  };
  if (audioMime[extension]) return audioMime[extension];
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

async function apiUploadFileOnce<T>(
  path: string,
  uri: string,
  token: string,
  filename = "upload.jpg",
  mimeType?: string | null
): Promise<T> {
  const form = new FormData();
  form.append("file", {
    uri,
    name: filename,
    type: guessUploadMime(filename, mimeType)
  } as unknown as Blob);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`
      },
      body: form,
      signal: controller.signal
    });
    if (response.status === 401) unauthorizedHandler?.();
    if (!response.ok) {
      throw new NativeApiError(response.status, await readError(response, path));
    }
    return response.json() as Promise<T>;
  } catch (err) {
    if (err instanceof NativeApiError) throw err;
    const timeout =
      err instanceof Error &&
      (err.name === "AbortError" || err.name === "TimeoutError" || /aborted|timeout/i.test(err.message));
    throw new NativeApiError(0, networkErrorMessage(path, timeout ? new Error("TimeoutError") : err));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Uma segunda tentativa só em 502/503/504: o Render acordando derrubava o
 * upload e a mídia nunca chegava ao compositor (momento sem preview). Repetir
 * um upload perdido no máximo deixa um arquivo órfão, nunca um post duplicado.
 */
export async function apiUploadFile<T>(
  path: string,
  uri: string,
  token: string,
  filename = "upload.jpg",
  mimeType?: string | null
): Promise<T> {
  try {
    return await apiUploadFileOnce<T>(path, uri, token, filename, mimeType);
  } catch (err) {
    if (!(err instanceof NativeApiError) || !COLD_START_STATUSES.has(err.status)) throw err;
    await sleep(RETRY_DELAYS_MS[0]);
    return apiUploadFileOnce<T>(path, uri, token, filename, mimeType);
  }
}

function splitIdentifier(identifier: string) {
  const value = identifier.trim();
  if (value.includes("@")) {
    return { email: value.toLowerCase(), phone: undefined as string | undefined };
  }
  const phone = value.replace(/\D/g, "");
  return { email: undefined as string | undefined, phone: phone || undefined };
}

export async function loginWithPassword(identifier: string, password: string): Promise<NativeSession> {
  const { email, phone } = splitIdentifier(identifier);
  const body: Record<string, string> = {
    password,
    provider: "EMAIL"
  };
  if (email) body.email = email;
  if (phone) body.phone = phone;

  const data = await request<{ token?: string; user?: NativeAuthUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(body)
  });
  if (!data.token || !data.user?.id || !data.user?.role) {
    throw new NativeApiError(500, "A API não devolveu a sessão. Tente de novo.");
  }
  return { token: data.token, user: data.user };
}

export async function fetchSessionUser(token: string): Promise<NativeAuthUser | null> {
  const data = await request<{ user: NativeAuthUser | null }>("/me", { method: "GET" }, token);
  return data.user;
}

export async function requestPasswordReset(identifier: string) {
  const { email, phone } = splitIdentifier(identifier);
  return request<{ message: string }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({
      email: email || undefined,
      phone: phone || undefined
    })
  });
}
