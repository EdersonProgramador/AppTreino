import type { Membership, Prisma, User } from "@prisma/client";
import type { AppPrismaClient } from "../prisma.js";
import { readStudentAccessProfile } from "./student-access.utils.js";

/** Matrícula ACTIVE e dentro da vigência (startsAt/endsAt). */
export function validActiveMembershipWhere(now = new Date()): Prisma.MembershipWhereInput {
  return {
    status: "ACTIVE",
    deletedAt: null,
    startsAt: { lte: now },
    OR: [{ endsAt: null }, { endsAt: { gte: now } }]
  };
}

export function isMembershipValidNow(
  membership: Pick<Membership, "status" | "startsAt" | "endsAt" | "deletedAt">,
  now = new Date()
) {
  if (membership.status !== "ACTIVE" || membership.deletedAt) return false;
  if (membership.startsAt > now) return false;
  if (membership.endsAt && membership.endsAt < now) return false;
  return true;
}

/** Mesma regra do portal do aluno (`apps/web/src/lib/student-access.ts`). */
export function resolveStudentPortalAccess(
  user: Pick<User, "enrollmentStatus" | "studentAccessProfile">,
  membership: Pick<Membership, "status" | "startsAt" | "endsAt" | "deletedAt"> | null,
  now = new Date()
) {
  if (membership && isMembershipValidNow(membership, now)) {
    return {
      hasPortalAccess: true,
      label: "Liberado (assinatura ativa)"
    };
  }

  const profile = readStudentAccessProfile(user);
  if (profile === "COACH_MANAGED" && user.enrollmentStatus === "ACTIVE") {
    return {
      hasPortalAccess: true,
      label: "Liberado (vínculo coach)"
    };
  }

  if (user.enrollmentStatus === "ACTIVE" && profile !== "COACH_MANAGED") {
    return {
      hasPortalAccess: true,
      label: "Liberado (cadastro)"
    };
  }

  return {
    hasPortalAccess: false,
    label: "Bloqueado — aguardando pagamento ou matrícula"
  };
}

/** Sincroniza enrollmentStatus com a existência de matrícula ACTIVE (não deletada). */
export async function syncUserEnrollmentFromMemberships(
  db: AppPrismaClient,
  userId: string
) {
  const activeMembership = await db.membership.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      deletedAt: null
    },
    select: { id: true }
  });

  await db.user.update({
    where: { id: userId },
    data: { enrollmentStatus: activeMembership ? "ACTIVE" : "PENDING" }
  });
}
