import { useMemo } from "react";
import {
  can,
  canAccessPanel,
  canAny,
  hasRole,
  homePathForRole,
  permissionsFor,
  type Permission,
  type UserRole
} from "@app-treino/shared";
import { useAuth } from "./AuthContext";

/** Hook RBAC — permissões do usuário autenticado no contexto do sistema. */
export function useRbac() {
  const { user, isAuthenticated } = useAuth();
  const role = user?.role ?? null;

  return useMemo(
    () => ({
      role,
      isAuthenticated,
      isAdmin: hasRole(role, "ADMIN"),
      isStudent: hasRole(role, "USER"),
      permissions: role ? permissionsFor(role) : [],
      can: (permission: Permission) => can(role, permission),
      canAny: (permissions: Permission[]) => canAny(role, permissions),
      canAccessAdmin: canAccessPanel(role, "admin"),
      canAccessStudent: canAccessPanel(role, "student"),
      homePath: role ? homePathForRole(role) : "/login",
      assertPanel: (panel: "admin" | "student") => canAccessPanel(role, panel)
    }),
    [role, isAuthenticated]
  );
}

export type { Permission, UserRole };
