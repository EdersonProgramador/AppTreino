import type { Prisma } from "@prisma/client";
import type { AppPrismaClient } from "../prisma.js";

/** Matrícula ACTIVE e dentro da vigência (startsAt/endsAt). */
export function validActiveMembershipWhere(now = new Date()): Prisma.MembershipWhereInput {
  return {
    status: "ACTIVE",
    deletedAt: null,
    startsAt: { lte: now },
    OR: [{ endsAt: null }, { endsAt: { gte: now } }]
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
