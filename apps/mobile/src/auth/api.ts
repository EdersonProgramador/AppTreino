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

async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((init.headers as Record<string, string> | undefined) ?? {})
  };

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
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
