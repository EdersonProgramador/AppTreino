import type { Coupon, Plan } from "@prisma/client";
import { normalizePromoCouponCode, resolvePlanPromoDiscount } from "@app-treino/shared";
import { prisma } from "../prisma.js";

export type PlanPromoInput = {
  couponCode: string;
  mode: "PERCENT" | "AMOUNT_OFF" | "TARGET_PRICE";
  percentOff?: number;
  amountOffCents?: number;
  targetPriceInCents?: number;
  planPriceInCents?: number;
  maxUses?: number | null;
};

export async function isCouponLinkedToPlan(couponId: string, planId: string) {
  const coupon = await prisma.coupon.findFirst({
    where: {
      id: couponId,
      deletedAt: null,
      OR: [{ planId }, { featuredPlans: { some: { id: planId, deletedAt: null } } }]
    },
    select: { id: true }
  });
  return Boolean(coupon);
}

export async function syncPlanPromoCoupon(plan: Plan & { coupon?: Coupon | null }, body: PlanPromoInput) {
  let code: string;
  try {
    code = normalizePromoCouponCode(body.couponCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nome do cupom inválido.";
    const err = new Error(message) as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  const planPriceInCents = body.planPriceInCents ?? plan.priceInCents;
  const resolved = resolvePlanPromoDiscount({
    planPriceInCents,
    mode: body.mode,
    percentOff: body.percentOff,
    amountOffCents: body.amountOffCents,
    targetPriceInCents: body.targetPriceInCents
  });

  const couponData = {
    code,
    description: `Promo · ${plan.name}`,
    percentOff: resolved.percentOff,
    amountOffCents: resolved.amountOffCents,
    minOrderCents: resolved.minOrderCents,
    maxUses: body.maxUses ?? null,
    isActive: true,
    startsAt: null as Date | null,
    endsAt: null as Date | null,
    deletedAt: null as Date | null,
    scope: "SUBSCRIPTION" as const,
    planId: plan.id
  };

  const existingByCode = await prisma.coupon.findUnique({ where: { code } });
  const existingForPlan = await prisma.coupon.findFirst({
    where: { code, planId: plan.id, deletedAt: null }
  });

  if (
    existingByCode &&
    existingByCode.deletedAt === null &&
    existingByCode.planId &&
    existingByCode.planId !== plan.id &&
    !existingForPlan
  ) {
    const otherPlan = await prisma.plan.findFirst({
      where: { id: existingByCode.planId, deletedAt: null },
      select: { name: true }
    });
    const error = new Error(
      `O cupom "${code}" já está vinculado ao plano "${otherPlan?.name ?? "outro plano"}". Use outro código.`
    ) as Error & { statusCode: number };
    error.statusCode = 409;
    throw error;
  }

  let coupon: Coupon;
  if (existingForPlan) {
    coupon = await prisma.coupon.update({
      where: { id: existingForPlan.id },
      data: couponData
    });
  } else if (existingByCode?.deletedAt) {
    coupon = await prisma.coupon.update({
      where: { id: existingByCode.id },
      data: couponData
    });
  } else if (existingByCode && existingByCode.scope === "STORE") {
    coupon = await prisma.coupon.update({
      where: { id: existingByCode.id },
      data: { ...couponData, scope: "ALL" }
    });
  } else if (existingByCode && existingByCode.deletedAt === null) {
    const error = new Error(`Já existe um cupom ativo com o código "${code}".`) as Error & {
      statusCode: number;
    };
    error.statusCode = 409;
    throw error;
  } else {
    coupon = await prisma.coupon.create({ data: couponData });
  }

  await prisma.plan.update({
    where: { id: plan.id },
    data: { couponId: coupon.id }
  });

  return { coupon, pricing: resolved };
}

export async function clearPlanPromoCoupon(planId: string, couponId: string | null | undefined) {
  if (!couponId) return;

  const plan = await prisma.plan.findFirst({
    where: { id: planId, deletedAt: null },
    select: { couponId: true }
  });
  if (!plan) return;

  if (plan.couponId === couponId) {
    const fallback = await prisma.coupon.findFirst({
      where: {
        planId,
        deletedAt: null,
        id: { not: couponId }
      },
      orderBy: { createdAt: "desc" },
      select: { id: true }
    });
    await prisma.plan.update({
      where: { id: planId },
      data: { couponId: fallback?.id ?? null }
    });
  }

  const coupon = await prisma.coupon.findFirst({ where: { id: couponId, deletedAt: null } });
  if (!coupon) return;

  await prisma.coupon.update({
    where: { id: couponId },
    data: { deletedAt: new Date(), isActive: false }
  });
}

export async function linkSubscriptionCouponToPlan(planId: string, couponId: string) {
  const [plan, coupon] = await Promise.all([
    prisma.plan.findFirst({ where: { id: planId, deletedAt: null } }),
    prisma.coupon.findFirst({ where: { id: couponId, deletedAt: null } })
  ]);
  if (!plan) {
    const error = new Error("Plano não encontrado.") as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }
  if (!coupon) {
    const error = new Error("Cupom não encontrado.") as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  const updated = await prisma.coupon.update({
    where: { id: coupon.id },
    data: {
      planId: plan.id,
      scope: coupon.scope === "STORE" ? "ALL" : "SUBSCRIPTION"
    }
  });

  await prisma.plan.update({
    where: { id: plan.id },
    data: { couponId: updated.id }
  });

  return updated;
}
