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

async function readError(response: Response) {
  try {
    const data = (await response.json()) as { message?: string; issues?: Array<{ message: string }> };
    return data.message ?? data.issues?.[0]?.message ?? `API ${response.status}`;
  } catch {
    return `API ${response.status}`;
  }
}

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((init.headers as Record<string, string> | undefined) ?? {})
  };

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (response.status === 401 && token) {
    unauthorizedHandler?.();
  }
  if (!response.ok) {
    throw new NativeApiError(response.status, await readError(response));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
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
  if (declared) return declared;
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".mp4") || lower.endsWith(".m4v")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".webm")) return "video/webm";
  return "image/jpeg";
}

export async function apiUploadFile<T>(
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

  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`
    },
    body: form
  });
  if (response.status === 401) unauthorizedHandler?.();
  if (!response.ok) {
    throw new NativeApiError(response.status, await readError(response));
  }
  return response.json() as Promise<T>;
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
