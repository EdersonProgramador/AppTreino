/** Papéis organizacionais (camada adicional — não substitui users.role ADMIN/USER). */
export type OrganizationMemberRole =
  | "PLATFORM_OWNER"
  | "ORGANIZATION_ADMIN"
  | "UNIT_MANAGER"
  | "COACH"
  | "NUTRITIONIST"
  | "ATHLETE";

export type AccessScope = "GLOBAL" | "ORGANIZATION" | "UNIT" | "ASSIGNED_ATHLETES" | "SELF";

export type OrgPermission =
  | "organizations.view"
  | "organizations.create"
  | "organizations.update"
  | "organizations.delete"
  | "units.view"
  | "units.create"
  | "units.update"
  | "units.delete"
  | "athletes.view"
  | "athletes.create"
  | "athletes.update"
  | "athletes.link"
  | "athletes.unlink"
  | "coaches.view"
  | "coaches.create"
  | "coaches.update"
  | "nutritionists.view"
  | "nutritionists.create"
  | "nutritionists.update"
  | "training.view"
  | "training.create"
  | "training.update"
  | "training.delete"
  | "training.assign"
  | "training.publish"
  | "nutrition.view"
  | "nutrition.create"
  | "nutrition.update"
  | "nutrition.assign"
  | "nutrition.publish"
  | "classes.view"
  | "classes.create"
  | "classes.update"
  | "classes.delete"
  | "classes.assign_athletes"
  | "roles.view"
  | "roles.manage"
  | "audit_logs.view";

export const ORG_ROLE_SCOPE: Record<OrganizationMemberRole, AccessScope> = {
  PLATFORM_OWNER: "GLOBAL",
  ORGANIZATION_ADMIN: "ORGANIZATION",
  UNIT_MANAGER: "UNIT",
  COACH: "ASSIGNED_ATHLETES",
  NUTRITIONIST: "ASSIGNED_ATHLETES",
  ATHLETE: "SELF"
};

/** Permissões padrão por papel organizacional. */
export const ORG_ROLE_PERMISSIONS: Record<OrganizationMemberRole, readonly OrgPermission[]> = {
  PLATFORM_OWNER: [
    "organizations.view",
    "organizations.create",
    "organizations.update",
    "organizations.delete",
    "units.view",
    "units.create",
    "units.update",
    "units.delete",
    "athletes.view",
    "athletes.create",
    "athletes.update",
    "athletes.link",
    "athletes.unlink",
    "coaches.view",
    "coaches.create",
    "coaches.update",
    "nutritionists.view",
    "nutritionists.create",
    "nutritionists.update",
    "training.view",
    "training.create",
    "training.update",
    "training.delete",
    "training.assign",
    "training.publish",
    "nutrition.view",
    "nutrition.create",
    "nutrition.update",
    "nutrition.assign",
    "nutrition.publish",
    "classes.view",
    "classes.create",
    "classes.update",
    "classes.delete",
    "classes.assign_athletes",
    "roles.view",
    "roles.manage",
    "audit_logs.view"
  ],
  ORGANIZATION_ADMIN: [
    "organizations.view",
    "organizations.update",
    "units.view",
    "units.create",
    "units.update",
    "units.delete",
    "athletes.view",
    "athletes.create",
    "athletes.update",
    "athletes.link",
    "athletes.unlink",
    "coaches.view",
    "coaches.create",
    "coaches.update",
    "nutritionists.view",
    "nutritionists.create",
    "nutritionists.update",
    "training.view",
    "training.create",
    "training.update",
    "training.delete",
    "training.assign",
    "training.publish",
    "nutrition.view",
    "nutrition.create",
    "nutrition.update",
    "nutrition.assign",
    "nutrition.publish",
    "classes.view",
    "classes.create",
    "classes.update",
    "classes.delete",
    "classes.assign_athletes",
    "audit_logs.view"
  ],
  UNIT_MANAGER: [
    "units.view",
    "units.update",
    "athletes.view",
    "athletes.link",
    "athletes.unlink",
    "coaches.view",
    "nutritionists.view",
    "training.view",
    "training.assign",
    "nutrition.view",
    "nutrition.assign",
    "classes.view",
    "classes.create",
    "classes.update",
    "classes.assign_athletes"
  ],
  COACH: [
    "athletes.view",
    "training.view",
    "training.create",
    "training.update",
    "training.assign",
    "classes.view",
    "classes.assign_athletes"
  ],
  NUTRITIONIST: [
    "athletes.view",
    "nutrition.view",
    "nutrition.create",
    "nutrition.update",
    "nutrition.assign"
  ],
  ATHLETE: ["athletes.view"]
};

export function orgRoleHasPermission(role: OrganizationMemberRole, permission: OrgPermission): boolean {
  return ORG_ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Features de assinatura individual — independentes de organização. */
export const PLAN_FEATURE_KEYS = [
  "running_engine",
  "walking_engine",
  "cycling_engine",
  "fixed_training_programs",
  "progress_tracking",
  "activity_history"
] as const;

export type PlanFeatureKey = (typeof PLAN_FEATURE_KEYS)[number];
