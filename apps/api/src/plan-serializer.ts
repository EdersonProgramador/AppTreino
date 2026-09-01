import type { Coupon, Plan } from "@prisma/client";
import { resolveSubscriptionCheckoutPricing } from "./modules/checkout.utils.js";

export type SerializedPlan = {
  id: string;
  code: string;
  name: string;
  priceInCents: number;
  billingCycle: Plan["billingCycle"];
  description: string | null;
  cardBenefits: string[];
  badgeLabel: string | null;
  isFeatured: boolean;
  sortOrder: number;
  showOnFunnel: boolean;
  couponId: string | null;
  couponCode: string | null;
  couponPercentOff?: number | null;
  couponAmountOffCents?: number | null;
  couponMaxUses?: number | null;
  originalPriceInCents: number;
  effectivePriceInCents: number;
  discountInCents: number;
};

export function parseCardBenefits(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function activeLinkedCoupon(plan: Plan & { coupon?: Coupon | null }) {
  if (!plan.coupon || plan.coupon.deletedAt) return null;
  return plan.coupon;
}

export async function serializePlanRecord(
  plan: Plan & { coupon?: Coupon | null },
  explicitCouponCode?: string | null,
  options?: { forgiveInvalidExplicitCoupon?: boolean; adminView?: boolean }
): Promise<SerializedPlan> {
  const pricing = await resolveSubscriptionCheckoutPricing(plan, explicitCouponCode ?? undefined, options);
  const linkedCoupon = activeLinkedCoupon(plan);
  const couponCode = options?.adminView
    ? linkedCoupon?.code ?? pricing.couponCode
    : pricing.couponCode;
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    priceInCents: plan.priceInCents,
    billingCycle: plan.billingCycle,
    description: plan.description,
    cardBenefits: parseCardBenefits(plan.cardBenefits),
    badgeLabel: plan.badgeLabel,
    isFeatured: plan.isFeatured,
    sortOrder: plan.sortOrder,
    showOnFunnel: plan.showOnFunnel,
    couponId: linkedCoupon?.id ?? plan.couponId,
    couponCode,
    couponPercentOff: linkedCoupon?.percentOff ?? plan.coupon?.percentOff ?? null,
    couponAmountOffCents: linkedCoupon?.amountOffCents ?? plan.coupon?.amountOffCents ?? null,
    couponMaxUses: linkedCoupon?.maxUses ?? plan.coupon?.maxUses ?? null,
    originalPriceInCents: pricing.originalAmountInCents,
    effectivePriceInCents: pricing.amountInCents,
    discountInCents: pricing.discountInCents
  };
}

export async function serializePublicPlan(
  plan: Plan & { coupon?: Coupon | null; features?: Array<{ featureKey: string }> },
  explicitCouponCode?: string | null
): Promise<SerializedPlan & { featureKeys?: string[] }> {
  const base = await serializePlanRecord(plan, explicitCouponCode, {
    forgiveInvalidExplicitCoupon: Boolean(explicitCouponCode?.trim())
  });
  if (!plan.features) return base;
  return {
    ...base,
    featureKeys: plan.features.map((item) => item.featureKey)
  };
}
