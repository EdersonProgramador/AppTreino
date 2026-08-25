import {
  canAccessPanel,
  homePathForRole as sharedHomePathForRole,
  normalizeRole,
  type AuthUser,
  type UserRole
} from "@app-treino/shared";

export const TOKEN_KEY = "app-treino-token";
export const USER_KEY = "app-treino-user";

export const paths = {
  home: "/",
  login: "/login",
  download: "/baixar-app",
  admin: "/admin",
  student: "/aluno",
  app: "/app",
  sharedPost: "/p/:postId"
} as const;

export { normalizeRole, canAccessPanel };

export function normalizeAuthUser(user: AuthUser): AuthUser {
  const role = normalizeRole(user.role);
  const previewMode = Boolean(user.previewMode && user.canReturnToAdmin && role === "USER");

  return {
    ...user,
    role,
    previewMode: previewMode || undefined,
    adminId: previewMode ? user.adminId ?? user.id : undefined,
    canReturnToAdmin: previewMode || undefined
  };
}

export function homePathForRole(role: UserRole) {
  return sharedHomePathForRole(role);
}

export function isGuestPath(pathname: string) {
  return (
    pathname === paths.home ||
    pathname === paths.login ||
    pathname === paths.download ||
    pathname.startsWith("/p/") ||
    pathname === "" ||
    pathname === "/"
  );
}

export function isAdminPath(pathname: string) {
  return pathname === paths.admin || pathname.startsWith(`${paths.admin}/`);
}

export function isStudentPath(pathname: string) {
  return pathname === paths.student || pathname.startsWith(`${paths.student}/`);
}

export function isRoleHomePath(pathname: string, role: UserRole) {
  const normalized = normalizeRole(role);
  if (normalized === "ADMIN") return isAdminPath(pathname);
  return isStudentPath(pathname);
}

/** True when the current URL is forbidden for this role (must redirect). */
export function mustRedirectForRole(pathname: string, role: UserRole) {
  const normalized = normalizeRole(role);
  if (isGuestPath(pathname)) return true;
  if (normalized === "USER" && isAdminPath(pathname)) return true;
  if (normalized === "ADMIN" && isStudentPath(pathname)) return true;
  return false;
}

export function canAccessRoleRoute(role: UserRole, required: UserRole) {
  if (required === "ADMIN") return canAccessPanel(role, "admin");
  return canAccessPanel(role, "student");
}

export function readStoredToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function readStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    if (!parsed || typeof parsed !== "object" || typeof parsed.id !== "string") return null;
    return normalizeAuthUser(parsed);
  } catch {
    return null;
  }
}

export function persistStoredUser(user: AuthUser | null) {
  if (typeof window === "undefined") return;
  try {
    if (!user) {
      window.localStorage.removeItem(USER_KEY);
      return;
    }
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // ignore
  }
}
