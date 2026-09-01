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
    scope: "SUBSCRIPTION" as const
  };

  const existingByCode = await prisma.coupon.findUnique({ where: { code } });
  const linkedCoupon =
    plan.couponId != null
      ? await prisma.coupon.findFirst({ where: { id: plan.couponId, deletedAt: null } })
      : null;

  if (
    existingByCode &&
    existingByCode.deletedAt === null &&
    existingByCode.id !== linkedCoupon?.id
  ) {
    const otherPlan = await prisma.plan.findFirst({
      where: { couponId: existingByCode.id, deletedAt: null, id: { not: plan.id } }
    });
    if (otherPlan) {
      const error = new Error(
        `O cupom "${code}" já está em uso no plano "${otherPlan.name}". Cada plano precisa de um nome exclusivo.`
      ) as Error & { statusCode: number };
      error.statusCode = 409;
      throw error;
    }
  }

  let coupon: Coupon;
  if (linkedCoupon) {
    coupon = await prisma.coupon.update({
      where: { id: linkedCoupon.id },
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
  } else if (existingByCode) {
    coupon = await prisma.coupon.update({
      where: { id: existingByCode.id },
      data: couponData
    });
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
  await prisma.plan.update({ where: { id: planId }, data: { couponId: null } });
  const coupon = await prisma.coupon.findFirst({ where: { id: couponId, deletedAt: null } });
  if (!coupon) return;
  await prisma.coupon.update({
    where: { id: couponId },
    data: { deletedAt: new Date(), isActive: false }
  });
}
