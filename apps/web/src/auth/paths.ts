import type { UserRole } from "@app-treino/shared";
import { homePathForRole as resolveHomePath, paths as sessionPaths } from "./session";

export const paths = sessionPaths;

export function homePathForRole(role: UserRole) {
  return resolveHomePath(role);
}

export function loginPath(planCode?: string | null) {
  if (planCode && planCode.trim()) {
    return `${paths.login}?plan=${encodeURIComponent(planCode.trim())}`;
  }
  return paths.login;
}
