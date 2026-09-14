export type { CatalogPlan } from "../lib/plan-catalog";

export type NativeCheckoutPixPayload = {
  qrCodeBase64: string;
  copyPaste: string;
  expiresAt: string | null;
};

export type NativeCheckoutPayload = {
  billingType: "PIX" | "CREDIT_CARD";
  pix?: NativeCheckoutPixPayload;
};

export type CheckoutPaymentRow = {
  id: string;
  status: string;
  amountInCents: number;
  paymentUrl?: string | null;
};

export type CheckoutSessionResponse = {
  membership?: { status?: string; plan?: { name?: string; code?: string } | null };
  payment: CheckoutPaymentRow | null;
  alreadyActive?: boolean;
  paymentProviderError?: string;
  nativeCheckout?: NativeCheckoutPayload | null;
};

export type CheckoutRegisterResponse = CheckoutSessionResponse & {
  token: string;
  user: { id: string; name: string; email?: string | null; role: string };
};
