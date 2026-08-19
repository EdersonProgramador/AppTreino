import Constants from "expo-constants";

const DEFAULT_WEB_URL = "https://edersonprogramador.com";
const DEFAULT_WEB_PORT = "5174";

function metroLanHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as { linkingUri?: string }).linkingUri ||
    "";
  const match = String(hostUri).match(/(\d{1,3}(?:\.\d{1,3}){3})/);
  return match?.[1] ?? null;
}

function isLanHost(host: string) {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)
  );
}

/** Resolve the web app URL, rewriting stale LAN IPs to the Expo QR host. */
function resolveWebUrl() {
  const raw = (process.env.EXPO_PUBLIC_WEB_URL ?? DEFAULT_WEB_URL).replace(/\/$/, "");
  const metroHost = metroLanHost();

  try {
    const parsed = new URL(raw.includes("://") ? raw : `http://${raw}`);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      if (metroHost) parsed.hostname = metroHost;
      return parsed.origin;
    }
    if (metroHost && isLanHost(parsed.hostname) && parsed.hostname !== metroHost) {
      parsed.hostname = metroHost;
      return parsed.origin;
    }
    return parsed.origin;
  } catch {
    if (metroHost) return `http://${metroHost}:${DEFAULT_WEB_PORT}`;
    return raw;
  }
}

const DEFAULT_API_URL = "https://api.edersonprogramador.com";
const DEFAULT_API_PORT = "3333";

function resolveApiUrl() {
  const raw = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");
  const metroHost = metroLanHost();

  if (raw) {
    try {
      const parsed = new URL(raw.includes("://") ? raw : `http://${raw}`);
      if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
        if (metroHost) parsed.hostname = metroHost;
        return parsed.origin;
      }
      if (metroHost && isLanHost(parsed.hostname) && parsed.hostname !== metroHost) {
        parsed.hostname = metroHost;
        return parsed.origin;
      }
      return parsed.origin;
    } catch {
      if (metroHost) return `http://${metroHost}:${DEFAULT_API_PORT}`;
      return raw;
    }
  }

  try {
    const web = new URL(WEB_URL);
    if (web.hostname === "localhost" || web.hostname === "127.0.0.1" || isLanHost(web.hostname)) {
      return `http://${metroHost || web.hostname}:${DEFAULT_API_PORT}`;
    }
  } catch {
    // ignore
  }

  if (metroHost) return `http://${metroHost}:${DEFAULT_API_PORT}`;
  return DEFAULT_API_URL;
}

export const WEB_URL = resolveWebUrl();
export const API_URL = resolveApiUrl();

/** App opens on login — not the marketing landing. */
export const APP_ENTRY_URL = `${WEB_URL}/login?app=mobile`;
export const APP_STUDENT_URL = `${WEB_URL}/aluno`;
export const APP_ADMIN_URL = `${WEB_URL}/admin`;

function hostnameOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

export function isAppOrigin(url: string): boolean {
  try {
    const target = new URL(url);
    if (target.protocol === "about:" || target.protocol === "data:" || target.protocol === "blob:") return true;
    const origin = new URL(WEB_URL);
    if (target.origin === origin.origin) return true;
    if (isLanHost(target.hostname) && (target.port === "3333" || target.port === "5173" || target.port === "5174")) {
      return true;
    }
    return hostnameOf(url) === hostnameOf(WEB_URL) && Boolean(hostnameOf(url));
  } catch {
    return false;
  }
}

export function isExternalScheme(url: string): boolean {
  return /^(tel:|mailto:|sms:|whatsapp:|intent:|market:|itms-apps:)/i.test(url);
}

function pathOf(url: string) {
  try {
    return new URL(url).pathname.replace(/\/$/, "") || "/";
  } catch {
    return "";
  }
}

/** Nunca reabre /login se a sessão ainda está no snapshot. */
export function entryUrlFromSnapshot(snapshot: {
  href?: string;
  localStorage?: Record<string, string>;
} | null): string {
  const token = snapshot?.localStorage?.["app-treino-token"];
  const href = snapshot?.href && isAppOrigin(snapshot.href) ? snapshot.href : "";
  const path = href ? pathOf(href) : "";
  const guest = !path || path === "/" || path === "/login" || path === "/baixar-app";

  if (token && guest) {
    try {
      const user = JSON.parse(snapshot?.localStorage?.["app-treino-user"] ?? "null") as { role?: string } | null;
      return user?.role === "ADMIN" ? APP_ADMIN_URL : APP_STUDENT_URL;
    } catch {
      return APP_STUDENT_URL;
    }
  }
  if (href) return href;
  return APP_ENTRY_URL;
}

export function panelUrlForRole(role?: string | null) {
  return role === "ADMIN" ? APP_ADMIN_URL : APP_STUDENT_URL;
}
