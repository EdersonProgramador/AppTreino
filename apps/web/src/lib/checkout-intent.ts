const CHECKOUT_INTENT_KEY = "atlly-checkout-intent";

export type CheckoutIntent = {
  planCode?: string;
  couponCode?: string;
  source?: "activate" | "landing" | "login";
};

export function setCheckoutIntent(intent: CheckoutIntent) {
  try {
    window.sessionStorage.setItem(CHECKOUT_INTENT_KEY, JSON.stringify(intent));
  } catch {
    // storage blocked
  }
}

export function readCheckoutIntent(): CheckoutIntent | null {
  try {
    const raw = window.sessionStorage.getItem(CHECKOUT_INTENT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CheckoutIntent;
  } catch {
    return null;
  }
}

export function consumeCheckoutIntent(): CheckoutIntent | null {
  const intent = readCheckoutIntent();
  try {
    window.sessionStorage.removeItem(CHECKOUT_INTENT_KEY);
  } catch {
    // storage blocked
  }
  return intent;
}

export function clearCheckoutIntent() {
  try {
    window.sessionStorage.removeItem(CHECKOUT_INTENT_KEY);
  } catch {
    // storage blocked
  }
}

/** Plano escolhido no funil: intent → URL → store → matrícula pendente. */
export function resolveCheckoutPlanSelection(input: {
  checkoutIntent?: CheckoutIntent | null;
  planFromUrl?: string | null;
  selectedPlanCode?: string | null;
  membershipPlanCode?: string | null;
}): string {
  const fromIntent = input.checkoutIntent?.planCode?.trim();
  if (fromIntent) return fromIntent;

  const fromUrl = input.planFromUrl?.trim();
  if (fromUrl) return fromUrl;

  const fromStore = input.selectedPlanCode?.trim();
  if (fromStore) return fromStore;

  return input.membershipPlanCode?.trim() ?? "";
}

/** Cupom aplicado no funil: intent → URL → pagamento pendente. */
export function resolveCheckoutCouponSelection(input: {
  checkoutIntent?: CheckoutIntent | null;
  couponFromUrl?: string | null;
  paymentCouponCode?: string | null;
}): string {
  const fromIntent = input.checkoutIntent?.couponCode?.trim().toUpperCase();
  if (fromIntent) return fromIntent;

  const fromUrl = input.couponFromUrl?.trim().toUpperCase();
  if (fromUrl) return fromUrl;

  const fromPayment = input.paymentCouponCode?.trim().toUpperCase();
  if (fromPayment) return fromPayment;

  return "";
}

export function patchCheckoutIntent(patch: CheckoutIntent) {
  const current = readCheckoutIntent();
  setCheckoutIntent({
    planCode: "planCode" in patch ? patch.planCode : current?.planCode,
    couponCode: "couponCode" in patch ? patch.couponCode : current?.couponCode,
    source: patch.source ?? current?.source ?? "activate"
  });
}
