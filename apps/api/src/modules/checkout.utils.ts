import type { Coupon, Plan } from "@prisma/client";
import { prisma } from "../prisma.js";
import { findValidCoupon } from "./commerce.utils.js";

export type SubscriptionCheckoutPricing = {
  originalAmountInCents: number;
  discountInCents: number;
  amountInCents: number;
  couponId: string | null;
  couponCode: string | null;
};

export type SandboxConfirmGateInput = {
  nodeEnv: string;
  enableSandboxConfirm: boolean;
  hasAsaasApiKey: boolean;
  allowManualPaymentConfirmation: boolean;
};

export type SandboxConfirmGateResult =
  | { ok: true }
  | { ok: false; statusCode: 403 | 404; message: string };

/** Mirrors API rules for POST /checkout/confirm-sandbox. */
export function evaluateSandboxConfirmGate(input: SandboxConfirmGateInput): SandboxConfirmGateResult {
  if (input.nodeEnv === "production" || !input.enableSandboxConfirm) {
    return { ok: false, statusCode: 404, message: "Recurso não encontrado." };
  }
  if (input.hasAsaasApiKey && !input.allowManualPaymentConfirmation) {
    return {
      ok: false,
      statusCode: 403,
      message: "Confirmação manual disponível apenas no sandbox local sem Asaas configurado."
    };
  }
  return { ok: true };
}

export function asaasCheckoutItemName(productLabel: string, brandName = "App Treino Social") {
  return `${brandName} - ${productLabel}`;
}

export function asaasCheckoutItemDescription(userName: string, brandName = "App Treino Social") {
  return `Assinatura ${brandName} - ${userName}`;
}

export function buildSubscriptionPricingFromCoupon(
  originalAmountInCents: number,
  coupon: Coupon | null,
  discountInCents: number
): SubscriptionCheckoutPricing {
  const safeDiscount = Math.min(originalAmountInCents, Math.max(0, discountInCents));
  return {
    originalAmountInCents,
    discountInCents: safeDiscount,
    amountInCents: Math.max(0, originalAmountInCents - safeDiscount),
    couponId: coupon?.id ?? null,
    couponCode: coupon?.code ?? null
  };
}

export async function resolveSubscriptionCheckoutPricing(
  plan: Plan & { coupon?: Coupon | null },
  explicitCouponCode?: string | null
): Promise<SubscriptionCheckoutPricing> {
  const originalAmountInCents = plan.priceInCents;
  const trimmedExplicit = explicitCouponCode?.trim().toUpperCase() || null;
  const autoCode = !trimmedExplicit && plan.coupon ? plan.coupon.code : null;
  const couponCode = trimmedExplicit ?? autoCode;

  if (!couponCode) {
    return buildSubscriptionPricingFromCoupon(originalAmountInCents, null, 0);
  }

  const resolved = await findValidCoupon(couponCode, originalAmountInCents, {
    scope: "SUBSCRIPTION",
    silent: !trimmedExplicit
  });

  if (!resolved) {
    return buildSubscriptionPricingFromCoupon(originalAmountInCents, null, 0);
  }

  return buildSubscriptionPricingFromCoupon(originalAmountInCents, resolved.coupon, resolved.discountInCents);
}

export async function incrementSubscriptionCouponUsage(couponId: string | null | undefined) {
  if (!couponId) return;
  await prisma.coupon.update({
    where: { id: couponId },
    data: { usedCount: { increment: 1 } }
  });
}
