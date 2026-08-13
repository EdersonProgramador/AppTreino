import {
  canAccessPanel,
  homePathForRole as sharedHomePathForRole,
  normalizeRole,
  type AuthUser,
  type UserRole
} from "@app-treino/shared";

export const TOKEN_KEY = "app-treino-token";

export const paths = {
  home: "/",
  login: "/login",
  admin: "/admin",
  student: "/aluno",
  app: "/app"
} as const;

export { normalizeRole, canAccessPanel };

export function normalizeAuthUser(user: AuthUser): AuthUser {
  return {
    ...user,
    role: normalizeRole(user.role)
  };
}

export function homePathForRole(role: UserRole) {
  return sharedHomePathForRole(role);
}

export function isGuestPath(pathname: string) {
  return pathname === paths.home || pathname === paths.login || pathname === "" || pathname === "/";
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
