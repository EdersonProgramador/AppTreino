import { money } from "../theme";

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
  appleProductId?: string | null;
};

export const ASAAS_MIN_CHECKOUT_CENTS = 500;
export const MAX_ANNUAL_CARD_INSTALLMENTS = 12;

export function planAllowsCreditCardCheckout(plan: Pick<CatalogPlan, "billingCycle"> | null | undefined) {
  return plan?.billingCycle === "YEARLY";
}

export function listAnnualInstallmentCounts(amountInCents: number, max = MAX_ANNUAL_CARD_INSTALLMENTS) {
  const counts = [1];
  for (let installmentCount = 2; installmentCount <= max; installmentCount += 1) {
    const installmentValueCents = Math.ceil(amountInCents / installmentCount);
    if (installmentValueCents >= ASAAS_MIN_CHECKOUT_CENTS) {
      counts.push(installmentCount);
    }
  }
  return counts;
}

export function formatCardInstallmentLabel(installmentCount: number, amountInCents: number) {
  if (installmentCount === 1) {
    return `À vista — ${money(amountInCents)}`;
  }
  const installmentValueCents = Math.ceil(amountInCents / installmentCount);
  return `${installmentCount}× de ${money(installmentValueCents)} (total ${money(amountInCents)})`;
}

export function defaultAnnualInstallmentCount(amountInCents: number) {
  const available = listAnnualInstallmentCounts(amountInCents);
  return available.includes(MAX_ANNUAL_CARD_INSTALLMENTS)
    ? MAX_ANNUAL_CARD_INSTALLMENTS
    : available[available.length - 1] ?? 1;
}

export function getEffectivePriceCents(plan: CatalogPlan): number {
  return plan.effectivePriceInCents ?? plan.priceInCents;
}

export function getOriginalPriceCents(plan: CatalogPlan): number {
  return plan.originalPriceInCents ?? plan.priceInCents;
}

export function planHasPromoDiscount(plan: CatalogPlan | null | undefined): boolean {
  if (!plan) return false;
  return (plan.discountInCents ?? 0) > 0 && getEffectivePriceCents(plan) < getOriginalPriceCents(plan);
}

export function isCheckoutEligiblePlan(plan: CatalogPlan): boolean {
  return getEffectivePriceCents(plan) >= ASAAS_MIN_CHECKOUT_CENTS;
}

export function getCheckoutMinimumAmountMessage(plan: CatalogPlan): string | null {
  const amount = getEffectivePriceCents(plan);
  if (amount >= ASAAS_MIN_CHECKOUT_CENTS) return null;
  return `Pagamento online exige no mínimo ${money(ASAAS_MIN_CHECKOUT_CENTS)}. Este plano está em ${money(amount)}.`;
}

export function normalizeCatalogPlan(
  plan: Partial<CatalogPlan> & Pick<CatalogPlan, "code" | "name" | "priceInCents">
): CatalogPlan {
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
    showOnFunnel: plan.showOnFunnel,
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

export function clearPlanPromoDisplay(plan: CatalogPlan): CatalogPlan {
  const original = getOriginalPriceCents(plan);
  return {
    ...plan,
    effectivePriceInCents: original,
    discountInCents: 0,
    couponCode: null
  };
}

export function plansForCouponDisplay(
  plans: CatalogPlan[],
  selectedPlanCode: string | null | undefined,
  options?: { appliedCoupon?: string | null; couponValidForSelection?: boolean | null }
): CatalogPlan[] {
  const resolvedSelectedCode = selectedPlanCode?.trim() || "";
  const couponActive = Boolean(options?.appliedCoupon?.trim());
  const couponConfirmedOnSelection = options?.couponValidForSelection === true;

  return plans.map((plan) => {
    const isSelected = plan.code === resolvedSelectedCode;
    const mayShowPromo =
      isSelected && (!couponActive || couponConfirmedOnSelection) && planHasPromoDiscount(plan);
    return mayShowPromo ? plan : clearPlanPromoDisplay(plan);
  });
}

export function couponAppliesToAnyCatalogPlan(allPlans: CatalogPlan[]): boolean {
  return allPlans.some((plan) => planHasPromoDiscount(plan));
}

export function evaluateCouponForSelectedPlan(
  appliedCoupon: string | null | undefined,
  selectedPlanCode: string | null | undefined,
  allPlans: CatalogPlan[],
  options: { couponCatalogReady: boolean; loadedCouponCode: string | null }
): { pending: true } | { pending: false; valid: boolean; feedback: string | null } {
  if (!options.couponCatalogReady) return { pending: true };

  const expectedCoupon = appliedCoupon?.trim().toUpperCase() || null;
  if (expectedCoupon && options.loadedCouponCode !== expectedCoupon) return { pending: true };

  if (!expectedCoupon) {
    return { pending: false, valid: false, feedback: null };
  }

  const plan = allPlans.find((item) => item.code === selectedPlanCode) ?? null;
  const valid = Boolean(plan && planHasPromoDiscount(plan));

  return {
    pending: false,
    valid,
    feedback: valid ? null : "Cupom inválido."
  };
}

export type CouponValidationState = {
  appliedCoupon: string | null;
  couponValidForSelection: boolean | null;
  couponApplying: boolean;
  couponFeedback: string | null;
  clearedInvalidCoupon: boolean;
  rejectedCouponCode: string | null;
};

export function resolveCouponValidationState(
  appliedCoupon: string | null | undefined,
  selectedPlanCode: string | null | undefined,
  allPlans: CatalogPlan[],
  options: { couponCatalogReady: boolean; loadedCouponCode: string | null }
): CouponValidationState {
  const normalizedCoupon = appliedCoupon?.trim().toUpperCase() || null;

  if (!normalizedCoupon) {
    return {
      appliedCoupon: null,
      couponValidForSelection: false,
      couponApplying: false,
      couponFeedback: null,
      clearedInvalidCoupon: false,
      rejectedCouponCode: null
    };
  }

  const result = evaluateCouponForSelectedPlan(normalizedCoupon, selectedPlanCode, allPlans, options);
  if (result.pending) {
    return {
      appliedCoupon: normalizedCoupon,
      couponValidForSelection: null,
      couponApplying: true,
      couponFeedback: null,
      clearedInvalidCoupon: false,
      rejectedCouponCode: null
    };
  }

  if (!result.valid) {
    return {
      appliedCoupon: null,
      couponValidForSelection: false,
      couponApplying: false,
      couponFeedback: result.feedback ?? "Cupom inválido.",
      clearedInvalidCoupon: true,
      rejectedCouponCode: normalizedCoupon
    };
  }

  return {
    appliedCoupon: normalizedCoupon,
    couponValidForSelection: true,
    couponApplying: false,
    couponFeedback: null,
    clearedInvalidCoupon: false,
    rejectedCouponCode: null
  };
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

  if (plan.billingCycle === "YEARLY") {
    const baselineMonthly = monthlyBaseline ? getEffectivePriceCents(monthlyBaseline) : 0;
    const anchorCents = baselineMonthly ? baselineMonthly * 12 : listPrice;
    const savingsCents = hasCouponDiscount
      ? listPrice - effectivePrice
      : getAnnualSavingsCents({ ...plan, priceInCents: listPrice }, monthlyBaseline);
    const installmentCents = Math.round(effectivePrice / 12);
    return {
      primary: `12× ${money(installmentCents)}`,
      secondary: `ou ${money(effectivePrice)} à vista${savingsCents > 0 ? ` · economize ${money(savingsCents)}` : ""}`,
      anchor: hasCouponDiscount || (anchorCents > 0 && savingsCents > 0) ? money(hasCouponDiscount ? listPrice : anchorCents) : null,
      discountLabel: hasCouponDiscount ? `Economia de ${money(plan.discountInCents ?? 0)}` : null,
      hasPromo: Boolean(hasCouponDiscount || savingsCents > 0)
    };
  }

  return {
    primary: money(effectivePrice),
    secondary: "/ mês",
    anchor: hasCouponDiscount ? money(listPrice) : null,
    discountLabel: hasCouponDiscount ? `Economia de ${money(plan.discountInCents ?? 0)}` : null,
    hasPromo: hasCouponDiscount
  };
}
