import { prisma } from "../prisma.js";
import { validActiveMembershipWhere } from "./membership.utils.js";

export async function hasActiveStudentSubscription(userId: string) {
  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      ...validActiveMembershipWhere()
    },
    select: { id: true }
  });
  return Boolean(membership);
}

export async function getCoachEligibility(userId: string) {
  const [coachMembership, hasActiveSubscription] = await Promise.all([
    prisma.organizationMember.findFirst({
      where: {
        userId,
        role: "COACH",
        status: "ACTIVE"
      },
      select: {
        id: true,
        organizationId: true,
        unitId: true,
        organization: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: "asc" }
    }),
    hasActiveStudentSubscription(userId)
  ]);

  return {
    hasCoachRole: Boolean(coachMembership),
    hasActiveSubscription,
    isActiveCoach: Boolean(coachMembership && hasActiveSubscription),
    coachMembership
  };
}

export async function syncCoachReferralEligibility(coachUserId: string) {
  const { isActiveCoach } = await getCoachEligibility(coachUserId);
  if (isActiveCoach) return;

  await prisma.coachReferralLink.updateMany({
    where: { coachUserId, isActive: true },
    data: { isActive: false }
  });
}
