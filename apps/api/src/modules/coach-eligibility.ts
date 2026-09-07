import { prisma } from "../prisma.js";
import { validActiveMembershipWhere } from "./membership.utils.js";

export function httpCoachError(statusCode: number, message: string) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

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

export async function promoteUserToCoachInOrganization(input: {
  userId: string;
  organizationId: string;
  unitId?: string | null;
}) {
  const student = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, role: true, status: true, deletedAt: true, name: true, email: true }
  });
  if (!student || student.deletedAt) {
    throw httpCoachError(404, "Aluno não encontrado.");
  }
  if (student.role !== "USER") {
    throw httpCoachError(400, "Somente alunos (USER) podem ser promovidos a coach.");
  }
  if (student.status !== "ACTIVE") {
    throw httpCoachError(400, "Aluno inativo não pode ser promovido a coach.");
  }

  const hasSubscription = await hasActiveStudentSubscription(input.userId);
  if (!hasSubscription) {
    throw httpCoachError(
      400,
      "O aluno precisa de assinatura ATLLY ativa para ser coach e receber comissão."
    );
  }

  const organization = await prisma.organization.findFirst({
    where: { id: input.organizationId, deletedAt: null },
    include: {
      units: { where: { deletedAt: null }, orderBy: { name: "asc" } }
    }
  });
  if (!organization) {
    throw httpCoachError(404, "Organização não encontrada.");
  }

  const unitId = input.unitId ?? organization.units[0]?.id ?? null;
  if (input.unitId) {
    const unit = organization.units.find((item) => item.id === input.unitId);
    if (!unit) {
      throw httpCoachError(400, "Unidade inválida para a organização selecionada.");
    }
  }

  const member = await prisma.organizationMember.upsert({
    where: {
      organizationId_userId_role: {
        organizationId: input.organizationId,
        userId: input.userId,
        role: "COACH"
      }
    },
    create: {
      organizationId: input.organizationId,
      userId: input.userId,
      role: "COACH",
      unitId,
      status: "ACTIVE"
    },
    update: {
      unitId,
      status: "ACTIVE"
    },
    include: {
      organization: { select: { id: true, name: true } },
      unit: { select: { id: true, name: true } },
      user: { select: { id: true, name: true, email: true } }
    }
  });

  const coachEligibility = await getCoachEligibility(input.userId);

  return {
    member,
    coachEligibility: {
      hasCoachRole: coachEligibility.hasCoachRole,
      hasActiveSubscription: coachEligibility.hasActiveSubscription,
      isActiveCoach: coachEligibility.isActiveCoach
    },
    student: { id: student.id, name: student.name, email: student.email }
  };
}

export async function enrichOrgMembersWithCoachStatus<
  T extends { role: string; status: string; userId: string }
>(members: T[]) {
  const coachUserIds = members
    .filter((member) => member.role === "COACH" && member.status === "ACTIVE")
    .map((member) => member.userId);
  if (!coachUserIds.length) {
    return members.map((member) => ({ ...member, coachStatus: null as null }));
  }

  const activeSubscriptions = await prisma.membership.findMany({
    where: {
      userId: { in: coachUserIds },
      ...validActiveMembershipWhere()
    },
    select: { userId: true }
  });
  const subscribed = new Set(activeSubscriptions.map((item) => item.userId));

  return members.map((member) => {
    if (member.role !== "COACH") {
      return { ...member, coachStatus: null as null };
    }
    const hasActiveSubscription = subscribed.has(member.userId);
    return {
      ...member,
      coachStatus: {
        hasActiveSubscription,
        isActiveCoach: member.status === "ACTIVE" && hasActiveSubscription
      }
    };
  });
}
