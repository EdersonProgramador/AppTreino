import type { FastifyRequest } from "fastify";
import type { AuthTokenPayload } from "../../auth.js";
import { prisma } from "../../prisma.js";
import type { OrgAuthContext, OrgMembershipRecord } from "./authorize.js";

export async function loadOrgAuthContext(user: AuthTokenPayload): Promise<OrgAuthContext> {
  const [platformOperator, memberships] = await Promise.all([
    prisma.platformOperator.findUnique({ where: { userId: user.id }, select: { userId: true } }),
    prisma.organizationMember.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      select: {
        organizationId: true,
        unitId: true,
        role: true,
        status: true
      }
    })
  ]);

  return {
    userId: user.id,
    isPlatformOperator: Boolean(platformOperator),
    isPlatformAdmin: user.role === "ADMIN",
    memberships: memberships.map(
      (member): OrgMembershipRecord => ({
        organizationId: member.organizationId,
        unitId: member.unitId,
        role: member.role,
        status: member.status
      })
    )
  };
}

export async function assertOrgAuthorized(
  request: FastifyRequest,
  user: AuthTokenPayload,
  ctx: OrgAuthContext,
  input: Parameters<typeof import("./authorize.js").authorize>[0]
) {
  const { authorize } = await import("./authorize.js");
  const result = authorize({ ...input, ctx });
  if (result === "DENY") {
    const error = new Error("Acesso negado ao recurso organizacional.") as Error & { statusCode: number };
    error.statusCode = 403;
    throw error;
  }
}

export async function writeAuditLog(input: {
  userId?: string | null;
  organizationId?: string | null;
  unitId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  await prisma.auditLog.create({
    data: {
      userId: input.userId ?? undefined,
      organizationId: input.organizationId ?? undefined,
      unitId: input.unitId ?? undefined,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? undefined,
      oldValues: input.oldValues ?? undefined,
      newValues: input.newValues ?? undefined,
      ipAddress: input.ipAddress ?? undefined,
      userAgent: input.userAgent ?? undefined
    }
  });
}
