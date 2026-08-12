import type { AuthUser } from "@app-treino/shared";

export const paths = {
  home: "/",
  login: "/login",
  admin: "/admin",
  student: "/aluno"
} as const;

export function homePathForRole(role: AuthUser["role"]) {
  return role === "ADMIN" ? paths.admin : paths.student;
}

export function loginPath(planCode?: string | null) {
  if (planCode === "monthly" || planCode === "annual") {
    return `${paths.login}?plan=${planCode}`;
  }
  return paths.login;
}
