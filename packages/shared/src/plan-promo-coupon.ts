export type PlanPromoDiscountMode = "PERCENT" | "AMOUNT_OFF" | "TARGET_PRICE";

export const PLAN_PROMO_COUPON_SUFFIX = "-PROMO";
export const DEFAULT_MIN_CHECKOUT_CENTS = 500;

export function normalizePromoCouponCode(raw: string): string {
  const code = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 40);
  if (code.length < 2) {
    throw new Error("Nome do cupom deve ter ao menos 2 caracteres (letras, números, _ ou -).");
  }
  return code;
}

/** @deprecated Prefer normalizePromoCouponCode — cupom agora tem nome definido no plano. */
export function buildPlanPromoCouponCode(planCode: string): string {
  const base = planCode
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 32);
  return `${base || "PLAN"}${PLAN_PROMO_COUPON_SUFFIX}`;
}

export type ResolvePlanPromoDiscountInput = {
  planPriceInCents: number;
  mode: PlanPromoDiscountMode;
  percentOff?: number | null;
  amountOffCents?: number | null;
  targetPriceInCents?: number | null;
  minCheckoutCents?: number;
};

export type ResolvedPlanPromoDiscount = {
  percentOff: number | null;
  amountOffCents: number | null;
  discountInCents: number;
  finalPriceInCents: number;
  minOrderCents: number;
};

export function resolvePlanPromoDiscount(input: ResolvePlanPromoDiscountInput): ResolvedPlanPromoDiscount {
  const minCheckoutCents = input.minCheckoutCents ?? DEFAULT_MIN_CHECKOUT_CENTS;
  const planPriceInCents = input.planPriceInCents;

  if (!Number.isFinite(planPriceInCents) || planPriceInCents < 1) {
    throw new Error("Informe um preço válido para o plano.");
  }

  let percentOff: number | null = null;
  let amountOffCents: number | null = null;
  let discountInCents = 0;

  if (input.mode === "PERCENT") {
    const value = input.percentOff;
    if (value == null || !Number.isFinite(value) || value < 1 || value > 100) {
      throw new Error("Informe um desconto percentual entre 1 e 100.");
    }
    percentOff = Math.round(value);
    discountInCents = Math.round((planPriceInCents * percentOff) / 100);
  } else if (input.mode === "AMOUNT_OFF") {
    const value = input.amountOffCents;
    if (value == null || !Number.isFinite(value) || value < 1) {
      throw new Error("Informe um valor de desconto em R$.");
    }
    amountOffCents = Math.round(value);
    discountInCents = amountOffCents;
  } else {
    const target = input.targetPriceInCents;
    if (target == null || !Number.isFinite(target) || target < 1) {
      throw new Error("Informe o preço promocional desejado.");
    }
    if (target >= planPriceInCents) {
      throw new Error("O preço promocional deve ser menor que o valor do plano.");
    }
    amountOffCents = planPriceInCents - Math.round(target);
    discountInCents = amountOffCents;
  }

  discountInCents = Math.min(planPriceInCents, Math.max(0, discountInCents));
  const finalPriceInCents = planPriceInCents - discountInCents;

  if (finalPriceInCents < minCheckoutCents) {
    throw new Error(
      `O valor final (${formatCentsBRL(finalPriceInCents)}) fica abaixo do mínimo de pagamento online (${formatCentsBRL(minCheckoutCents)}).`
    );
  }

  if (discountInCents < 1) {
    throw new Error("O desconto precisa ser maior que zero.");
  }

  return {
    percentOff,
    amountOffCents,
    discountInCents,
    finalPriceInCents,
    minOrderCents: 0
  };
}

function formatCentsBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}
