import { formatPriceInBRL } from "@app-treino/shared";

export type CatalogPlan = {
  id?: string;
  code: string;
  name: string;
  priceInCents: number;
  billingCycle: "MONTHLY" | "YEARLY";
  description?: string | null;
  cardBenefits: string[];
  badgeLabel?: string | null;
  isFeatured: boolean;
  sortOrder: number;
  showOnFunnel?: boolean;
  couponId?: string | null;
  couponCode?: string | null;
  originalPriceInCents?: number;
  effectivePriceInCents?: number;
  discountInCents?: number;
};

export const ASAAS_MIN_CHECKOUT_CENTS = 500;

export function isCheckoutEligiblePlan(plan: CatalogPlan): boolean {
  return getEffectivePriceCents(plan) >= ASAAS_MIN_CHECKOUT_CENTS;
}

export function getCheckoutMinimumAmountMessage(plan: CatalogPlan): string | null {
  const amount = getEffectivePriceCents(plan);
  if (amount >= ASAAS_MIN_CHECKOUT_CENTS) return null;
  return `Pagamento online exige no mínimo ${formatPriceInBRL(ASAAS_MIN_CHECKOUT_CENTS)}. Este plano está em ${formatPriceInBRL(amount)}.`;
}

export function getEffectivePriceCents(plan: CatalogPlan): number {
  return plan.effectivePriceInCents ?? plan.priceInCents;
}

export function getOriginalPriceCents(plan: CatalogPlan): number {
  return plan.originalPriceInCents ?? plan.priceInCents;
}

export function normalizeCatalogPlan(plan: Partial<CatalogPlan> & Pick<CatalogPlan, "code" | "name" | "priceInCents">): CatalogPlan {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    priceInCents: plan.priceInCents,
    billingCycle: plan.billingCycle === "YEARLY" ? "YEARLY" : "MONTHLY",
    description: plan.description ?? null,
    cardBenefits: Array.isArray(plan.cardBenefits) ? plan.cardBenefits.filter(Boolean) : [],
    badgeLabel: plan.badgeLabel ?? null,
    isFeatured: Boolean(plan.isFeatured),
    sortOrder: typeof plan.sortOrder === "number" ? plan.sortOrder : 0,
    couponId: plan.couponId ?? null,
    couponCode: plan.couponCode ?? null,
    originalPriceInCents: plan.originalPriceInCents ?? plan.priceInCents,
    effectivePriceInCents: plan.effectivePriceInCents ?? plan.priceInCents,
    discountInCents: plan.discountInCents ?? 0
  };
}

export function sortCatalogPlans(plans: CatalogPlan[]): CatalogPlan[] {
  return [...plans].sort((left, right) => left.sortOrder - right.sortOrder || left.priceInCents - right.priceInCents);
}

export function getFunnelPlans(plans: CatalogPlan[]): CatalogPlan[] {
  return sortCatalogPlans(plans.filter((plan) => plan.showOnFunnel !== false));
}

export function getMonthlyBaseline(plans: CatalogPlan[]): CatalogPlan | null {
  return sortCatalogPlans(plans).find((plan) => plan.billingCycle === "MONTHLY") ?? null;
}

export function getAnnualSavingsCents(plan: CatalogPlan, monthlyBaseline: CatalogPlan | null): number {
  if (plan.billingCycle !== "YEARLY" || !monthlyBaseline) return 0;
  return Math.max(0, monthlyBaseline.priceInCents * 12 - plan.priceInCents);
}

export function getDefaultPlanCode(plans: CatalogPlan[], preferredCode?: string | null): string {
  const visible = getFunnelPlans(plans);
  const eligible = visible.filter(isCheckoutEligiblePlan);
  const pool = eligible.length > 0 ? eligible : visible;

  if (preferredCode && pool.some((plan) => plan.code === preferredCode)) {
    return preferredCode;
  }
  const featured = pool.find((plan) => plan.isFeatured);
  if (featured) return featured.code;
  const yearly = pool.find((plan) => plan.billingCycle === "YEARLY");
  if (yearly) return yearly.code;
  return pool[0]?.code ?? "monthly";
}

export function formatPlanPriceLines(plan: CatalogPlan, monthlyBaseline: CatalogPlan | null) {
  const listPrice = getOriginalPriceCents(plan);
  const effectivePrice = getEffectivePriceCents(plan);
  const hasCouponDiscount = (plan.discountInCents ?? 0) > 0 && effectivePrice < listPrice;
  const couponSuffix = hasCouponDiscount && plan.couponCode ? ` · cupom ${plan.couponCode}` : "";

  if (plan.billingCycle === "YEARLY") {
    const baselineMonthly = monthlyBaseline ? getEffectivePriceCents(monthlyBaseline) : 0;
    const anchorCents = baselineMonthly ? baselineMonthly * 12 : listPrice;
    const savingsCents = hasCouponDiscount
      ? listPrice - effectivePrice
      : getAnnualSavingsCents({ ...plan, priceInCents: listPrice }, monthlyBaseline);
    const installmentCents = Math.round(effectivePrice / 12);
    return {
      primary: `12× ${formatPriceInBRL(installmentCents)}`,
      secondary: `ou ${formatPriceInBRL(effectivePrice)} à vista${savingsCents > 0 ? ` · economize ${formatPriceInBRL(savingsCents)}` : ""}${couponSuffix}`,
      anchor: hasCouponDiscount || (anchorCents > 0 && savingsCents > 0) ? formatPriceInBRL(hasCouponDiscount ? listPrice : anchorCents) : null,
      discountLabel: hasCouponDiscount ? `−${formatPriceInBRL(plan.discountInCents ?? 0)}` : null
    };
  }

  return {
    primary: formatPriceInBRL(effectivePrice),
    secondary: `/ mês${couponSuffix}`,
    anchor: hasCouponDiscount ? formatPriceInBRL(listPrice) : null,
    discountLabel: hasCouponDiscount ? `−${formatPriceInBRL(plan.discountInCents ?? 0)}` : null
  };
}

export function parseBenefitsInput(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function formatBenefitsInput(benefits: string[] | undefined): string {
  return (benefits ?? []).join("\n");
}
