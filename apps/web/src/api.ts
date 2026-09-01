function isPrivateLanHost(hostname: string) {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname);
}

/**
 * Dev (Vite): same-origin so Expo/WebView hits :5174 and the proxy reaches the API.
 * LAN production-like: same host as the page, port 3333.
 */
export function getApiBaseUrl() {
  if (import.meta.env.DEV) {
    return "";
  }

  const configured = String(import.meta.env.VITE_API_URL ?? "").trim().replace(/\/$/, "");
  if (typeof window !== "undefined" && isPrivateLanHost(window.location.hostname)) {
    return `${window.location.protocol}//${window.location.hostname}:3333`;
  }

  return configured || "http://localhost:3333";
}

/** Mesmo CDN default do app nativo — evita web em /uploads no Render e Expo no R2. */
const DEFAULT_MEDIA_URL = "https://pub-7bceff9c425e44b29161a5f8570c5266.r2.dev";

/** CDN/base para mídia (R2). Em dev, cai no proxy /uploads da API. */
export function getMediaBaseUrl() {
  if (import.meta.env.DEV) {
    return "";
  }

  const configured = String(import.meta.env.VITE_MEDIA_URL ?? "").trim().replace(/\/+$/, "");
  if (configured) {
    return configured;
  }

  return DEFAULT_MEDIA_URL;
}

function apiUrl(path: string) {
  return `${getApiBaseUrl()}${path}`;
}

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

export function notifyUnauthorized() {
  unauthorizedHandler?.();
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function getErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { message?: string; error?: string; issues?: Array<{ message: string }> };
    const issueMessage = data.issues?.[0]?.message;
    const baseMessage = data.message ?? data.error;
    const detail =
      baseMessage && !baseMessage.startsWith("Dados inválidos")
        ? baseMessage
        : issueMessage ?? baseMessage;
    if (detail) return detail;
  } catch {
    // ignore
  }
  if (COLD_START_STATUSES.has(response.status)) {
    return "Servidor indisponível. Ele está acordando — tente de novo em instantes.";
  }
  return `API error: ${response.status}`;
}

/** O Render free hiberna: a primeira chamada devolve 502/503 enquanto acorda. */
const COLD_START_STATUSES = new Set([502, 503, 504]);
const RETRY_DELAYS_MS = [2_000, 5_000];

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Só leitura e upload são repetidos. Um 502 em POST/PUT/DELETE pode ter chegado
 * ao servidor, e repetir criaria post ou live duplicados; um upload repetido no
 * pior caso deixa um arquivo órfão.
 */
async function withColdStartRetry<T>(attempt: () => Promise<T>, maxAttempts: number): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await attempt();
    } catch (err) {
      const coldStart = err instanceof ApiError && COLD_START_STATUSES.has(err.status);
      if (!coldStart || i >= maxAttempts - 1) throw err;
      await sleep(RETRY_DELAYS_MS[i]);
    }
  }
}

function authHeaders(token?: string | null): Record<string, string> {
  return token
    ? {
        Authorization: `Bearer ${token}`
      }
    : {};
}

/**
 * Only session-authenticated 401s should wipe the SPA session.
 * Login/register/forgot failures also return 401 and must NOT bounce to Home.
 */
async function parseResponse<T>(response: Response, hadSessionToken: boolean): Promise<T> {
  if (response.status === 401 && hadSessionToken) {
    unauthorizedHandler?.();
  }

  if (!response.ok) {
    throw new ApiError(response.status, await getErrorMessage(response));
  }

  return response.json() as Promise<T>;
}

export async function apiGet<T>(path: string, token?: string | null): Promise<T> {
  return withColdStartRetry(async () => {
    const response = await fetch(`${apiUrl(path)}`, {
      headers: authHeaders(token)
    });

    return parseResponse<T>(response, Boolean(token));
  }, RETRY_DELAYS_MS.length + 1);
}

export async function apiPost<T>(path: string, body: unknown, token?: string | null): Promise<T> {
  const response = await fetch(`${apiUrl(path)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token)
    },
    body: JSON.stringify(body)
  });

  return parseResponse<T>(response, Boolean(token));
}

export async function apiPut<T>(path: string, body: unknown, token?: string | null): Promise<T> {
  const response = await fetch(`${apiUrl(path)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token)
    },
    body: JSON.stringify(body)
  });

  return parseResponse<T>(response, Boolean(token));
}

export async function apiPatch<T>(path: string, body: unknown, token?: string | null): Promise<T> {
  const response = await fetch(`${apiUrl(path)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token)
    },
    body: JSON.stringify(body)
  });

  return parseResponse<T>(response, Boolean(token));
}

export async function apiDelete<T>(path: string, token?: string | null): Promise<T> {
  const response = await fetch(`${apiUrl(path)}`, {
    method: "DELETE",
    headers: authHeaders(token)
  });

  return parseResponse<T>(response, Boolean(token));
}

export async function apiUpload<T>(path: string, body: FormData, token?: string | null): Promise<T> {
  return withColdStartRetry(async () => {
    const response = await fetch(`${apiUrl(path)}`, {
      method: "POST",
      headers: authHeaders(token),
      body
    });

    return parseResponse<T>(response, Boolean(token));
  }, 2);
}
