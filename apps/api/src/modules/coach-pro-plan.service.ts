import { COACH_PRO_ANNUAL_PLAN_CODE, coachProAnnualPlanCard } from "@app-treino/shared";
import { prisma } from "../prisma.js";

export async function ensureCoachProAnnualPlan() {
  const card = coachProAnnualPlanCard();
  return prisma.plan.upsert({
    where: { code: COACH_PRO_ANNUAL_PLAN_CODE },
    create: {
      code: card.code,
      name: card.name,
      priceInCents: card.priceInCents,
      billingCycle: card.billingCycle,
      description: card.description,
      badgeLabel: card.badgeLabel,
      isFeatured: false,
      sortOrder: 90,
      showOnFunnel: true,
      cardBenefits: [
        "Painel Coach ATLLY e estúdio de treinos",
        "Cadastro de alunos vinculados ao coach (sem plano individual)",
        "Distribuição de programas e agenda",
        "Corrida, treino ATLLY e histórico para seus alunos"
      ]
    },
    update: {
      name: card.name,
      priceInCents: card.priceInCents,
      billingCycle: card.billingCycle,
      description: card.description,
      badgeLabel: card.badgeLabel,
      showOnFunnel: true,
      deletedAt: null
    }
  });
}

export async function userHasCoachProAnnualPlan(userId: string) {
  const plan = await prisma.plan.findUnique({
    where: { code: COACH_PRO_ANNUAL_PLAN_CODE },
    select: { id: true }
  });
  if (!plan) return false;

  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      planId: plan.id,
      deletedAt: null,
      status: { in: ["ACTIVE", "PENDING", "OVERDUE"] }
    },
    select: { id: true }
  });
  return Boolean(membership);
}
