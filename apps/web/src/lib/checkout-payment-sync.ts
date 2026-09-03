import { apiGet } from "../api";
import type { PaymentRow } from "../types/shared";
import type { StudentMembershipRow } from "../types/student";

export async function syncCheckoutPaymentStatus(token: string, paymentId: string) {
  return apiGet<{
    payment: PaymentRow;
    membership: StudentMembershipRow;
    alreadyActive: boolean;
    syncedFromAsaas?: boolean;
  }>(`/checkout/payments/${paymentId}/status`, token);
}

export function pickPendingCheckoutPayment(payments: PaymentRow[]) {
  return payments.find((item) => item.status === "PENDING" || item.status === "OVERDUE") ?? null;
}
