import type { PaymentRow } from "../types/shared";
import type { StudentMembershipRow } from "../types/student";
import { getEffectivePriceCents, type CatalogPlan } from "./plan-catalog";

export function paymentMatchesPlanPricing(
  payment: PaymentRow | null | undefined,
  plan: CatalogPlan | null | undefined
): boolean {
  if (!payment || !plan) return false;
  return payment.amountInCents === getEffectivePriceCents(plan);
}

export function resolvePendingPaymentForSelectedPlan(
  selectedPlanCode: string,
  membership: StudentMembershipRow | null | undefined,
  payments: PaymentRow[],
  checkoutPayment: PaymentRow | null | undefined
): PaymentRow | null {
  if (!membership || (membership.status !== "PENDING" && membership.status !== "OVERDUE")) {
    return null;
  }
  if (membership.plan.code !== selectedPlanCode) {
    return null;
  }

  const candidates = [
    checkoutPayment,
    payments.find((item) => item.status === "PENDING" && item.membershipId === membership.id),
    payments.find((item) => item.status === "PENDING")
  ];

  for (const payment of candidates) {
    if (!payment || payment.status !== "PENDING") continue;
    if (payment.membershipId && payment.membershipId !== membership.id) continue;
    return payment;
  }

  return null;
}
