/**
 * App Treino RBAC
 * ---------------
 * Roles (Prisma): ADMIN | USER
 * Permissions are the extension point for UI + API without new DB enums.
 */

export type UserRole = "ADMIN" | "USER";

export const USER_ROLES = ["ADMIN", "USER"] as const satisfies readonly UserRole[];

export type RbacResource =
  | "admin_panel"
  | "student_panel"
  | "users"
  | "cms"
  | "plans"
  | "memberships"
  | "payments"
  | "assessments"
  | "events"
  | "tickets"
  | "products"
  | "workouts"
  | "profile"
  | "enrollment"
  | "checkout"
  | "locations"
  | "reports";

export type RbacAction = "access" | "read" | "write" | "delete" | "manage";

export type Permission =
  | `${RbacResource}:${RbacAction}`
  | `${RbacResource}:*`
  | "*:*";

/** Canonical route homes per role (SPA). */
export const ROLE_HOME_PATH: Record<UserRole, string> = {
  ADMIN: "/admin",
  USER: "/aluno"
};

/**
 * Grants per role.
 * ADMIN owns the operations panel; USER owns the student app.
 * Wildcards: `resource:*` and `*:*`.
 *
 * Note: ADMIN has `*:*` for admin APIs, but `canAccessPanel("student")` is
 * denied so the SPA never mounts the student shell for admins (and vice versa).
 */
export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  ADMIN: [
    "*:*",
    "admin_panel:access",
    "admin_panel:manage",
    "users:*",
    "cms:*",
    "plans:*",
    "memberships:*",
    "payments:*",
    "assessments:*",
    "events:*",
    "tickets:*",
    "products:*",
    "workouts:*",
    "locations:*",
    "reports:*",
    "enrollment:*"
  ],
  USER: [
    "student_panel:access",
    "profile:*",
    "workouts:*",
    "assessments:*",
    "events:read",
    "tickets:*",
    "products:read",
    "products:write",
    "memberships:read",
    "payments:read",
    "payments:write",
    "enrollment:read",
    "checkout:*",
    "locations:read"
  ]
};

function expandPermission(permission: Permission): { resource: string; action: string } {
  const [resource, action = "*"] = permission.split(":");
  return { resource, action };
}

function grantMatches(grant: Permission, needed: Permission): boolean {
  if (grant === "*:*" || grant === needed) return true;

  const g = expandPermission(grant);
  const n = expandPermission(needed);

  if (g.resource !== "*" && g.resource !== n.resource) return false;
  if (g.action === "*" || g.action === "manage") return true;
  return g.action === n.action;
}

export function isUserRole(value: unknown): value is UserRole {
  return value === "ADMIN" || value === "USER";
}

/** Fail closed: unknown roles become USER (never escalate to ADMIN). */
export function normalizeRole(role: unknown): UserRole {
  return role === "ADMIN" ? "ADMIN" : "USER";
}

export function permissionsFor(role: UserRole): readonly Permission[] {
  return ROLE_PERMISSIONS[normalizeRole(role)];
}

export function can(role: UserRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  const grants = permissionsFor(role);
  return grants.some((grant) => grantMatches(grant, permission));
}

export function canAny(role: UserRole | null | undefined, permissions: Permission[]): boolean {
  return permissions.some((permission) => can(role, permission));
}

export function canAll(role: UserRole | null | undefined, permissions: Permission[]): boolean {
  return permissions.every((permission) => can(role, permission));
}

export function hasRole(role: UserRole | null | undefined, required: UserRole): boolean {
  return normalizeRole(role) === required;
}

export function hasAnyRole(role: UserRole | null | undefined, required: readonly UserRole[]): boolean {
  if (!role) return false;
  return required.includes(normalizeRole(role));
}

/**
 * Panel ACL for SPA shells.
 * Explicit panel permissions only — `*:*` alone does not open the other panel.
 */
export function canAccessPanel(role: UserRole | null | undefined, panel: "admin" | "student"): boolean {
  if (!role) return false;
  const normalized = normalizeRole(role);
  if (panel === "admin") {
    return normalized === "ADMIN" && can(normalized, "admin_panel:access");
  }
  return normalized === "USER" && can(normalized, "student_panel:access");
}

export function homePathForRole(role: UserRole | null | undefined): string {
  return ROLE_HOME_PATH[normalizeRole(role)];
}

export function assertCan(role: UserRole | null | undefined, permission: Permission): void {
  if (!can(role, permission)) {
    const error = new Error("Perfil sem permissão para este recurso.") as Error & { statusCode: number };
    error.statusCode = 403;
    throw error;
  }
}
