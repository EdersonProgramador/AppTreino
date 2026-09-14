import { Platform } from "react-native";
import Purchases, { LOG_LEVEL, type CustomerInfo, type PurchasesStoreProduct } from "react-native-purchases";
import { apiPost } from "../auth/api";
import { isIosStoreCheckout } from "./platform-pay";

const REVENUECAT_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?.trim() ?? "";
const BUNDLE_PREFIX = "com.edersonprogramador.apptreino";

let configuredForUser: string | null = null;

export function appleIapConfigured(): boolean {
  return isIosStoreCheckout() && REVENUECAT_IOS_KEY.length > 0;
}

export function resolveAppleProductId(plan: { code: string; appleProductId?: string | null }): string {
  const configured = plan.appleProductId?.trim();
  if (configured) return configured;
  return `${BUNDLE_PREFIX}.${plan.code}`;
}

export async function configureAppleIap(userId?: string | null): Promise<boolean> {
  if (!appleIapConfigured()) return false;
  if (configuredForUser === (userId ?? "__anonymous__")) return true;

  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
  Purchases.configure({
    apiKey: REVENUECAT_IOS_KEY,
    appUserID: userId ?? undefined
  });
  configuredForUser = userId ?? "__anonymous__";
  return true;
}

export async function loginAppleIapUser(userId: string): Promise<void> {
  if (!appleIapConfigured()) return;
  await configureAppleIap(userId);
  if (configuredForUser !== userId) {
    await Purchases.logIn(userId);
    configuredForUser = userId;
  }
}

export async function logoutAppleIapUser(): Promise<void> {
  if (!appleIapConfigured()) return;
  try {
    await Purchases.logOut();
  } catch {
    // ignore when anonymous
  }
  configuredForUser = null;
}

export async function loadAppleStoreProduct(productId: string): Promise<PurchasesStoreProduct | null> {
  if (!appleIapConfigured()) return null;
  const products = await Purchases.getProducts([productId]);
  return products[0] ?? null;
}

function pickTransactionId(info: CustomerInfo, productId: string): string | null {
  const subscription = info.subscriptionsByProductIdentifier[productId];
  if (subscription?.storeTransactionId) return subscription.storeTransactionId;
  const active = info.activeSubscriptions.find((id) => id === productId);
  if (active) return `${productId}:${info.requestDate}`;
  return null;
}

export async function purchaseAppleSubscription(input: {
  token: string;
  userId: string;
  planCode: string;
  productId: string;
}): Promise<{ alreadyActive: boolean }> {
  if (!appleIapConfigured()) {
    throw new Error("Assinatura App Store indisponível neste build. Configure EXPO_PUBLIC_REVENUECAT_IOS_API_KEY.");
  }

  await loginAppleIapUser(input.userId);
  await apiPost("/checkout/apple/session", { planCode: input.planCode }, input.token);

  const product = await loadAppleStoreProduct(input.productId);
  if (!product) {
    throw new Error("Plano não encontrado na App Store. Verifique os produtos no App Store Connect.");
  }

  const { customerInfo } = await Purchases.purchaseStoreProduct(product);
  const transactionId = pickTransactionId(customerInfo, input.productId);
  const originalTransactionId =
    customerInfo.subscriptionsByProductIdentifier[input.productId]?.originalPurchaseDate?.toString() ?? null;

  const response = await apiPost<{ alreadyActive?: boolean }>(
    "/checkout/apple/confirm",
    {
      planCode: input.planCode,
      productId: input.productId,
      transactionId,
      originalTransactionId
    },
    input.token
  );

  return { alreadyActive: Boolean(response.alreadyActive) };
}

export async function restoreApplePurchases(token: string): Promise<{ restored: boolean }> {
  if (!appleIapConfigured()) {
    throw new Error("Restauração App Store indisponível neste build.");
  }
  await Purchases.restorePurchases();
  try {
    await apiPost("/checkout/apple/restore", {}, token);
    return { restored: true };
  } catch {
    return { restored: false };
  }
}

/** Evita bundling acidental do SDK em plataformas sem loja Apple. */
export function appleIapPlatformGuard(): boolean {
  return Platform.OS === "ios";
}
