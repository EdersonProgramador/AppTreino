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

/** Status efetivo exibido na lista de usuários (matrícula real > liberação admin). */
export function labelUserEnrollmentColumn(user: {
  enrollmentStatus: string;
  memberships?: Array<{ status: string }> | null;
}) {
  const memberships = user.memberships ?? [];
  const activeMembership = memberships.find((item) => item.status === "ACTIVE");
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

export function labelBillingType(type: string) {
  return billingTypeLabel[type as BillingTypeCode] ?? type;
}

export function labelBillingCycle(cycle: string) {
  return billingCycleLabel[cycle as BillingCycleCode] ?? cycle;
}
