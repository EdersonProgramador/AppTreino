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
