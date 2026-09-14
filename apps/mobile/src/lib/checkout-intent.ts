import AsyncStorage from "@react-native-async-storage/async-storage";

const CHECKOUT_INTENT_KEY = "atlly-checkout-intent";

export type CheckoutIntent = {
  planCode?: string;
  couponCode?: string;
  referralSlug?: string;
  source?: "activate" | "landing" | "login";
};

export async function setCheckoutIntent(intent: CheckoutIntent) {
  try {
    await AsyncStorage.setItem(CHECKOUT_INTENT_KEY, JSON.stringify(intent));
  } catch {
    // storage blocked
  }
}

export async function readCheckoutIntent(): Promise<CheckoutIntent | null> {
  try {
    const raw = await AsyncStorage.getItem(CHECKOUT_INTENT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CheckoutIntent;
  } catch {
    return null;
  }
}

export async function clearCheckoutIntent() {
  try {
    await AsyncStorage.removeItem(CHECKOUT_INTENT_KEY);
  } catch {
    // storage blocked
  }
}

export async function patchCheckoutIntent(patch: CheckoutIntent) {
  const current = await readCheckoutIntent();
  await setCheckoutIntent({
    planCode: "planCode" in patch ? patch.planCode : current?.planCode,
    couponCode: "couponCode" in patch ? patch.couponCode : current?.couponCode,
    referralSlug: "referralSlug" in patch ? patch.referralSlug : current?.referralSlug,
    source: patch.source ?? current?.source ?? "activate"
  });
}

export function resolveCheckoutPlanSelection(input: {
  checkoutIntent?: CheckoutIntent | null;
  planFromUrl?: string | null;
  membershipPlanCode?: string | null;
  preferUrl?: boolean;
}): string {
  const fromUrl = input.planFromUrl?.trim();
  const fromIntent = input.checkoutIntent?.planCode?.trim();
  if (input.preferUrl && fromUrl) return fromUrl;
  if (fromIntent) return fromIntent;
  if (fromUrl) return fromUrl;
  return input.membershipPlanCode?.trim() ?? "";
}

export function resolveCheckoutCouponSelection(input: {
  checkoutIntent?: CheckoutIntent | null;
  couponFromUrl?: string | null;
  preferUrl?: boolean;
}): string {
  const fromUrl = input.couponFromUrl?.trim().toUpperCase();
  const fromIntent = input.checkoutIntent?.couponCode?.trim().toUpperCase();
  if (input.preferUrl && fromUrl) return fromUrl;
  if (fromIntent) return fromIntent;
  if (fromUrl) return fromUrl;
  return "";
}

export function resolveCheckoutReferralSelection(input: {
  checkoutIntent?: CheckoutIntent | null;
  referralFromUrl?: string | null;
  preferUrl?: boolean;
}): string {
  const fromUrl = input.referralFromUrl?.trim().toLowerCase();
  const fromIntent = input.checkoutIntent?.referralSlug?.trim().toLowerCase();
  if (input.preferUrl && fromUrl) return fromUrl;
  if (fromIntent) return fromIntent;
  if (fromUrl) return fromUrl;
  return "";
}
