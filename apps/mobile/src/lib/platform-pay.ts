import { Platform } from "react-native";

/** iOS App Store exige IAP para assinaturas e conteúdo digital consumido no app. */
export function isIosStoreCheckout(): boolean {
  return Platform.OS === "ios";
}

/** Pagamentos Asaas (PIX/cartão/link externo) ficam restritos ao Android e web. */
export function allowsAsaasCheckout(): boolean {
  return !isIosStoreCheckout();
}
