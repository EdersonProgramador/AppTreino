import type { OrgPermission } from "@app-treino/shared";
import { prisma } from "../../prisma.js";
import type { OrgAuthContext } from "./authorize.js";
import { authorize, type AuthorizeResult } from "./authorize.js";

/** Resolve vínculos coach/nutri ↔ aluno para o authorize ASSIGNED_ATHLETES. */
export async function resolveAthleteScopeFlags(input: {
  ctx: OrgAuthContext;
  organizationId?: string | null;
  athleteId?: string | null;
}) {
  const { ctx, organizationId, athleteId } = input;
  if (!athleteId) {
    return { hasProfessionalAssignment: false, hasClassMembership: false };
  }

  const [assignment, classMember] = await Promise.all([
    prisma.professionalAssignment.findFirst({
      where: {
        athleteId,
        professionalId: ctx.userId,
        status: "ACTIVE",
        deletedAt: null,
        ...(organizationId ? { organizationId } : {})
      },
      select: { id: true }
    }),
    prisma.trainingClassMember.findFirst({
      where: {
        athleteId,
        status: "ACTIVE",
        class: {
          coachId: ctx.userId,
          deletedAt: null,
          ...(organizationId ? { organizationId } : {})
        }
      },
      select: { id: true }
    })
  ]);

  return {
    hasProfessionalAssignment: Boolean(assignment),
    hasClassMembership: Boolean(classMember)
  };
}

export async function authorizeOrg(input: {
  ctx: OrgAuthContext;
  permission: OrgPermission;
  organizationId?: string | null;
  unitId?: string | null;
  athleteId?: string | null;
}): Promise<AuthorizeResult> {
  const flags = await resolveAthleteScopeFlags({
    ctx: input.ctx,
    organizationId: input.organizationId,
    athleteId: input.athleteId
  });

  return authorize({
    ...input,
    hasProfessionalAssignment: flags.hasProfessionalAssignment,
    hasClassMembership: flags.hasClassMembership
  });
}

export function httpOrgError(statusCode: number, message: string) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}
