import type { OrganizationMemberRole, OrgPermission, AccessScope } from "@app-treino/shared";
import { orgRoleHasPermission, ORG_ROLE_SCOPE } from "@app-treino/shared";

export type OrgMembershipRecord = {
  organizationId: string;
  unitId: string | null;
  role: OrganizationMemberRole;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
};

export type OrgAuthContext = {
  userId: string;
  isPlatformOperator: boolean;
  /** Legacy platform admin (users.role = ADMIN). */
  isPlatformAdmin: boolean;
  memberships: OrgMembershipRecord[];
};

export type AuthorizeInput = {
  ctx: OrgAuthContext;
  permission: OrgPermission;
  organizationId?: string | null;
  unitId?: string | null;
  athleteId?: string | null;
  /** Coach/nutritionist already verified assignment to athlete. */
  hasProfessionalAssignment?: boolean;
  /** Athlete belongs to class coached by requester. */
  hasClassMembership?: boolean;
};

export type AuthorizeResult = "ALLOW" | "DENY";

function activeMemberships(ctx: OrgAuthContext, organizationId?: string | null, unitId?: string | null) {
  return ctx.memberships.filter((member) => {
    if (member.status !== "ACTIVE") return false;
    if (organizationId && member.organizationId !== organizationId) return false;
    if (unitId && member.unitId && member.unitId !== unitId) return false;
    return true;
  });
}

function rolesWithPermission(
  ctx: OrgAuthContext,
  permission: OrgPermission,
  organizationId?: string | null,
  unitId?: string | null
): OrganizationMemberRole[] {
  const memberships = activeMemberships(ctx, organizationId, unitId);
  return memberships
    .filter((member) => orgRoleHasPermission(member.role, permission))
    .map((member) => member.role);
}

function highestScope(roles: OrganizationMemberRole[]): AccessScope | null {
  if (roles.includes("PLATFORM_OWNER")) return "GLOBAL";
  if (roles.includes("ORGANIZATION_ADMIN")) return "ORGANIZATION";
  if (roles.includes("UNIT_MANAGER")) return "UNIT";
  if (roles.some((role) => role === "COACH" || role === "NUTRITIONIST")) return "ASSIGNED_ATHLETES";
  if (roles.includes("ATHLETE")) return "SELF";
  return null;
}

/** Autorização para recursos organizacionais — não substitui assinatura individual. */
export function authorize(input: AuthorizeInput): AuthorizeResult {
  const { ctx, permission, organizationId, unitId, athleteId, hasProfessionalAssignment, hasClassMembership } =
    input;

  if (ctx.isPlatformOperator || ctx.isPlatformAdmin) {
    return "ALLOW";
  }

  const grantedRoles = rolesWithPermission(ctx, permission, organizationId, unitId);
  if (!grantedRoles.length) {
    return "DENY";
  }

  const scope = highestScope(grantedRoles);
  if (!scope) {
    return "DENY";
  }

  if (scope === "GLOBAL") {
    return "ALLOW";
  }

  if (!organizationId) {
    return scope === "ORGANIZATION" ? "DENY" : "DENY";
  }

  if (scope === "ORGANIZATION") {
    const inOrg = activeMemberships(ctx, organizationId).some((member) =>
      orgRoleHasPermission(member.role, permission)
    );
    return inOrg ? "ALLOW" : "DENY";
  }

  if (scope === "UNIT") {
    if (!unitId) return "DENY";
    const inUnit = activeMemberships(ctx, organizationId, unitId).some(
      (member) => member.role === "UNIT_MANAGER" && orgRoleHasPermission(member.role, permission)
    );
    return inUnit ? "ALLOW" : "DENY";
  }

  if (scope === "ASSIGNED_ATHLETES") {
    if (!athleteId) return "DENY";
    if (athleteId === ctx.userId && permission.endsWith(".view")) {
      return "ALLOW";
    }
    if (hasProfessionalAssignment || hasClassMembership) {
      return "ALLOW";
    }
    return "DENY";
  }

  if (scope === "SELF") {
    if (athleteId && athleteId !== ctx.userId) {
      return "DENY";
    }
    return "ALLOW";
  }

  return "DENY";
}

export function scopeForRole(role: OrganizationMemberRole): AccessScope {
  return ORG_ROLE_SCOPE[role];
}
