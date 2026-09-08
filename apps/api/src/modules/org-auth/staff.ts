import type { OrganizationMemberRole } from "@app-treino/shared";
import { prisma } from "../../prisma.js";
import type { OrgAuthContext } from "./authorize.js";

export const ORG_STAFF_ROLES = new Set<OrganizationMemberRole>([
  "PLATFORM_OWNER",
  "ORGANIZATION_ADMIN",
  "UNIT_MANAGER",
  "COACH",
  "NUTRITIONIST"
]);

export function hasActiveOrgStaffMembership(ctx: OrgAuthContext, organizationId?: string | null) {
  return ctx.memberships.some(
    (member) =>
      member.status === "ACTIVE" &&
      ORG_STAFF_ROLES.has(member.role) &&
      (!organizationId || member.organizationId === organizationId)
  );
}

export function canAccessOrgPlatform(ctx: OrgAuthContext) {
  return ctx.isPlatformOperator || ctx.isPlatformAdmin;
}

export async function userHasActiveOrgStaffMembership(
  userId: string,
  organizationId?: string | null
) {
  const member = await prisma.organizationMember.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      role: { in: [...ORG_STAFF_ROLES] },
      ...(organizationId ? { organizationId } : {})
    },
    select: { id: true }
  });
  return Boolean(member);
}
