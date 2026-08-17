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
    const data = (await response.json()) as { message?: string; issues?: Array<{ message: string }> };
    return data.message ?? data.issues?.[0]?.message ?? `API error: ${response.status}`;
  } catch {
    return `API error: ${response.status}`;
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
  const response = await fetch(`${apiUrl(path)}`, {
    headers: authHeaders(token)
  });

  return parseResponse<T>(response, Boolean(token));
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

export async function apiDelete<T>(path: string, token?: string | null): Promise<T> {
  const response = await fetch(`${apiUrl(path)}`, {
    method: "DELETE",
    headers: authHeaders(token)
  });

  return parseResponse<T>(response, Boolean(token));
}

export async function apiUpload<T>(path: string, body: FormData, token?: string | null): Promise<T> {
  const response = await fetch(`${apiUrl(path)}`, {
    method: "POST",
    headers: authHeaders(token),
    body
  });

  return parseResponse<T>(response, Boolean(token));
}
