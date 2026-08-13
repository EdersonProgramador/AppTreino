const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3333";

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export function getApiBaseUrl() {
  return API_URL;
}

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
  const response = await fetch(`${API_URL}${path}`, {
    headers: authHeaders(token)
  });

  return parseResponse<T>(response, Boolean(token));
}

export async function apiPost<T>(path: string, body: unknown, token?: string | null): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
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
  const response = await fetch(`${API_URL}${path}`, {
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
  const response = await fetch(`${API_URL}${path}`, {
    method: "DELETE",
    headers: authHeaders(token)
  });

  return parseResponse<T>(response, Boolean(token));
}

export async function apiUpload<T>(path: string, body: FormData, token?: string | null): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: authHeaders(token),
    body
  });

  return parseResponse<T>(response, Boolean(token));
}
