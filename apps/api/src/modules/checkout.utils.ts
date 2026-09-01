import type { Coupon, Plan } from "@prisma/client";
import { normalizePromoCouponCode } from "@app-treino/shared";
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

/** Asaas Checkout exige valor líquido mínimo de R$ 5,00 em produção. */
export const ASAAS_MIN_CHECKOUT_CENTS = 500;

export function getAsaasCheckoutAmountError(amountInCents: number): string | null {
  if (amountInCents >= ASAAS_MIN_CHECKOUT_CENTS) return null;

  const formatBRL = (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return `O valor mínimo para pagamento online é ${formatBRL(ASAAS_MIN_CHECKOUT_CENTS)}. O plano selecionado está em ${formatBRL(amountInCents)} — escolha outro plano ou ajuste o preço no admin.`;
}

export function assertAsaasCheckoutAmount(amountInCents: number) {
  const message = getAsaasCheckoutAmountError(amountInCents);
  if (!message) return;
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = 400;
  throw error;
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

export function previewLinkedCouponPricing(plan: Pick<Plan, "priceInCents">, coupon: Coupon | null) {
  if (!coupon) {
    return {
      originalAmountInCents: plan.priceInCents,
      discountInCents: 0,
      amountInCents: plan.priceInCents
    };
  }

  let discountInCents = 0;
  if (coupon.percentOff != null && coupon.percentOff > 0) {
    discountInCents = Math.round((plan.priceInCents * coupon.percentOff) / 100);
  } else if (coupon.amountOffCents != null && coupon.amountOffCents > 0) {
    discountInCents = coupon.amountOffCents;
  }

  return buildSubscriptionPricingFromCoupon(plan.priceInCents, coupon, discountInCents);
}

export type PaymentPricingSnapshot = {
  amountInCents: number;
  originalAmountInCents?: number | null;
  discountInCents: number;
  couponId?: string | null;
  couponCode?: string | null;
};

export function paymentMatchesSubscriptionPricing(
  payment: PaymentPricingSnapshot,
  pricing: SubscriptionCheckoutPricing
): boolean {
  return (
    payment.amountInCents === pricing.amountInCents &&
    (payment.originalAmountInCents ?? payment.amountInCents) === pricing.originalAmountInCents &&
    payment.discountInCents === pricing.discountInCents &&
    (payment.couponId ?? null) === pricing.couponId &&
    (payment.couponCode ?? null) === (pricing.couponCode ?? null)
  );
}

export function canReusePendingCheckoutPayment(input: {
  payment: PaymentPricingSnapshot & { paymentUrl?: string | null };
  membershipPlanId: string;
  membershipPlanCode?: string | null;
  selectedPlanId: string;
  selectedPlanCode: string;
  requestedCouponCode?: string | null;
  pricing: SubscriptionCheckoutPricing;
}): boolean {
  if (!input.payment.paymentUrl) return false;
  if (input.membershipPlanId !== input.selectedPlanId) return false;
  if (input.membershipPlanCode && input.membershipPlanCode !== input.selectedPlanCode) return false;

  const requestedCoupon = input.requestedCouponCode?.trim().toUpperCase() || null;
  const pricedCoupon = input.pricing.couponCode?.trim().toUpperCase() || null;
  const storedCoupon = input.payment.couponCode?.trim().toUpperCase() || null;
  if (requestedCoupon !== pricedCoupon || pricedCoupon !== storedCoupon) return false;

  return paymentMatchesSubscriptionPricing(input.payment, input.pricing);
}

export async function resolveSubscriptionCheckoutPricing(
  plan: Plan & { coupon?: Coupon | null },
  explicitCouponCode?: string | null,
  options?: { forgiveInvalidExplicitCoupon?: boolean }
): Promise<SubscriptionCheckoutPricing> {
  const originalAmountInCents = plan.priceInCents;
  const trimmedExplicit = explicitCouponCode?.trim().toUpperCase() || null;

  if (!trimmedExplicit) {
    return buildSubscriptionPricingFromCoupon(originalAmountInCents, null, 0);
  }

  const resolved = await findValidCoupon(trimmedExplicit, originalAmountInCents, {
    scope: "SUBSCRIPTION",
    silent: options?.forgiveInvalidExplicitCoupon
  });

  if (!resolved) {
    return buildSubscriptionPricingFromCoupon(originalAmountInCents, null, 0);
  }

  if (plan.couponId && resolved.coupon.id !== plan.couponId) {
    if (options?.forgiveInvalidExplicitCoupon) {
      return buildSubscriptionPricingFromCoupon(originalAmountInCents, null, 0);
    }
    const error = new Error("Código promocional inválido ou indisponível para este plano.") as Error & {
      statusCode: number;
    };
    error.statusCode = 400;
    throw error;
  }

  return buildSubscriptionPricingFromCoupon(originalAmountInCents, resolved.coupon, resolved.discountInCents);
}

export function normalizeCheckoutCouponInput(raw?: string | null): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    return normalizePromoCouponCode(trimmed);
  } catch {
    return null;
  }
}

/** Pricing for checkout — só aplica cupom quando o código é enviado explicitamente. */
export async function resolveCheckoutSessionPricing(
  plan: Plan & { coupon?: Coupon | null },
  explicitCouponCode?: string | null
): Promise<SubscriptionCheckoutPricing> {
  const normalizedExplicit = normalizeCheckoutCouponInput(explicitCouponCode);
  if (!normalizedExplicit) {
    return resolveSubscriptionCheckoutPricing(plan, null);
  }

  return resolveSubscriptionCheckoutPricing(plan, normalizedExplicit);
}

export async function incrementSubscriptionCouponUsage(couponId: string | null | undefined) {
  if (!couponId) return;
  await prisma.coupon.update({
    where: { id: couponId },
    data: { usedCount: { increment: 1 } }
  });
}
