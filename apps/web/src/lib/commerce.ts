/** Labels e helpers do módulo comercial (admin + vitrine do aluno). */

export type ProductKindCode = "PHYSICAL" | "DIGITAL";
export type PurchaseStatusCode =
  | "PENDING"
  | "CONFIRMED"
  | "READY"
  | "DELIVERED"
  | "CANCELED"
  | "REFUNDED";
export type OrderStatusCode = PurchaseStatusCode;
export type ShippingMethodCode = "PICKUP" | "DELIVERY" | "DIGITAL";

export const productKindLabel: Record<ProductKindCode, string> = {
  PHYSICAL: "Físico",
  DIGITAL: "Digital"
};

export const purchaseStatusLabel: Record<PurchaseStatusCode, string> = {
  PENDING: "Aguardando pagamento",
  CONFIRMED: "Pago",
  READY: "Pronto para retirada",
  DELIVERED: "Entregue",
  CANCELED: "Cancelado",
  REFUNDED: "Reembolsado"
};

export const shippingMethodLabel: Record<ShippingMethodCode, string> = {
  PICKUP: "Retirada na unidade",
  DELIVERY: "Entrega",
  DIGITAL: "Digital / online"
};

export function labelProductKind(kind: string | null | undefined) {
  if (!kind) return productKindLabel.PHYSICAL;
  return productKindLabel[kind as ProductKindCode] ?? kind;
}

export function labelPurchaseStatus(status: string) {
  return purchaseStatusLabel[status as PurchaseStatusCode] ?? status;
}

export function labelOrderStatus(status: string) {
  return labelPurchaseStatus(status);
}

export function labelShippingMethod(method: string | null | undefined) {
  if (!method) return shippingMethodLabel.PICKUP;
  return shippingMethodLabel[method as ShippingMethodCode] ?? method;
}

export function purchaseStatusTone(
  status: string
): "success" | "warning" | "danger" | "neutral" | "info" {
  switch (status) {
    case "CONFIRMED":
    case "DELIVERED":
      return "success";
    case "READY":
      return "info";
    case "PENDING":
      return "warning";
    case "CANCELED":
    case "REFUNDED":
      return "danger";
    default:
      return "neutral";
  }
}

export const orderStatusTone = purchaseStatusTone;
