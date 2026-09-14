import { apiGet } from "../auth/api";
import type { MembershipRow, PaymentRow } from "../types";

export async function syncCheckoutPaymentStatus(token: string, paymentId: string) {
  return apiGet<{
    payment: PaymentRow;
    membership: MembershipRow;
    alreadyActive: boolean;
    syncedFromAsaas?: boolean;
    nativeCheckout?: {
      billingType: "PIX" | "CREDIT_CARD";
      pix?: { qrCodeBase64: string; copyPaste: string; expiresAt: string | null };
    } | null;
  }>(`/checkout/payments/${paymentId}/status`, token);
}

export function pickPendingCheckoutPayment(payments: PaymentRow[]) {
  return payments.find((item) => item.status === "PENDING" || item.status === "OVERDUE") ?? null;
}
