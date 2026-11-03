/** Labels e badges padronizados do módulo financeiro (admin + aluno). */

export type MembershipStatusCode = "ACTIVE" | "PENDING" | "OVERDUE" | "CANCELED";
export type PaymentStatusCode = "PENDING" | "CONFIRMED" | "OVERDUE" | "REFUNDED" | "CANCELED";
export type BillingTypeCode = "PIX" | "BOLETO" | "CREDIT_CARD" | "UNDEFINED";
export type BillingCycleCode = "MONTHLY" | "YEARLY";

export const membershipStatusLabel: Record<MembershipStatusCode, string> = {
  ACTIVE: "Ativa",
  PENDING: "Pendente",
  OVERDUE: "Em atraso",
  CANCELED: "Cancelada"
};

export const paymentStatusLabel: Record<PaymentStatusCode, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  OVERDUE: "Em atraso",
  REFUNDED: "Reembolsado",
  CANCELED: "Cancelado"
};

export const billingTypeLabel: Record<BillingTypeCode, string> = {
  PIX: "Pix",
  BOLETO: "Boleto",
  CREDIT_CARD: "Cartão",
  UNDEFINED: "Checkout"
};

export const billingCycleLabel: Record<BillingCycleCode, string> = {
  MONTHLY: "Mensal",
  YEARLY: "Anual"
};

export function financeStatusTone(
  status: string
): "success" | "warning" | "danger" | "neutral" | "info" {
  switch (status) {
    case "ACTIVE":
    case "CONFIRMED":
      return "success";
    case "PENDING":
      return "warning";
    case "OVERDUE":
      return "danger";
    case "REFUNDED":
      return "info";
    case "CANCELED":
    default:
      return "neutral";
  }
}

export function financeStatusBadgeClass(status: string) {
  return `finance-status-badge tone-${financeStatusTone(status)}`;
}

export function labelMembershipStatus(status: string) {
  return membershipStatusLabel[status as MembershipStatusCode] ?? status;
}

function isMembershipValidNowClient(membership: {
  status: string;
  startsAt?: string | Date;
  endsAt?: string | Date | null;
}) {
  if (membership.status !== "ACTIVE") return false;
  const now = Date.now();
  const startsAt = new Date(membership.startsAt ?? 0).getTime();
  if (!Number.isFinite(startsAt) || startsAt > now) return false;
  if (membership.endsAt) {
    const endsAt = new Date(membership.endsAt).getTime();
    if (Number.isFinite(endsAt) && endsAt < now) return false;
  }
  return true;
}

/** Status efetivo exibido na lista de usuários (matrícula real > liberação admin). */
export function labelUserEnrollmentColumn(user: {
  enrollmentStatus: string;
  memberships?: Array<{ status: string; startsAt?: string | Date; endsAt?: string | Date | null }> | null;
}) {
  const memberships = user.memberships ?? [];
  const activeMembership = memberships.find((item) => isMembershipValidNowClient(item));
  if (activeMembership) {
    return labelMembershipStatus("ACTIVE");
  }
  if (memberships.length > 0) {
    return labelMembershipStatus(memberships[0].status);
  }
  if (user.enrollmentStatus === "ACTIVE") {
    return "Ativa (liberação)";
  }
  if (user.enrollmentStatus === "CANCELED") {
    return labelMembershipStatus("CANCELED");
  }
  return labelMembershipStatus("PENDING");
}

export function labelPaymentStatus(status: string) {
  return paymentStatusLabel[status as PaymentStatusCode] ?? status;
}

/** Valor exibido no admin: líquido Asaas quando confirmado. */
export function paymentAdminDisplayAmountCents(payment: {
  amountInCents: number;
  netAmountInCents?: number | null;
  status: string;
}) {
  if (payment.status === "CONFIRMED" && payment.netAmountInCents != null) {
    return payment.netAmountInCents;
  }
  return payment.amountInCents;
}

export function paymentAdminFeeLabel(payment: {
  amountInCents: number;
  netAmountInCents?: number | null;
  providerFeeInCents?: number | null;
  status: string;
}) {
  if (payment.status !== "CONFIRMED" || payment.netAmountInCents == null) {
    return null;
  }
  const fee =
    payment.providerFeeInCents ??
    Math.max(0, payment.amountInCents - payment.netAmountInCents);
  if (fee <= 0) {
    return null;
  }
  return fee;
}

export function labelBillingType(type: string) {
  return billingTypeLabel[type as BillingTypeCode] ?? type;
}

export function labelBillingCycle(cycle: string) {
  return billingCycleLabel[cycle as BillingCycleCode] ?? cycle;
}
