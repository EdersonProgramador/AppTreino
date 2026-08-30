import type { OrderRow, PurchaseRow } from "../types/shared";
import {
  labelOrderStatus,
  labelProductKind,
  labelPurchaseStatus,
  labelShippingMethod,
  orderStatusTone,
  purchaseStatusTone
} from "./commerce";

export type StoreTab = "catalog" | "cart" | "orders";

export type StoreBillingType = "PIX" | "CREDIT_CARD" | "UNDEFINED";

export const storeBillingOptions: Array<{ value: StoreBillingType; label: string; hint: string }> = [
  { value: "PIX", label: "PIX", hint: "Confirmação rápida via Asaas" },
  { value: "CREDIT_CARD", label: "Cartão", hint: "Crédito no checkout seguro Asaas" },
  { value: "UNDEFINED", label: "Escolher depois", hint: "Selecione PIX ou cartão na página de pagamento" }
];

export type StoreHistoryEntry =
  | {
      kind: "order";
      id: string;
      createdAt: string;
      status: OrderRow["status"];
      amountInCents: number;
      title: string;
      subtitle: string;
      paymentUrl?: string | null;
      paymentMethod?: string | null;
      items: OrderRow["items"];
      shippingMethod: OrderRow["shippingMethod"];
      shippingAddress?: string | null;
      couponCode?: string | null;
      discountInCents?: number;
    }
  | {
      kind: "purchase";
      id: string;
      createdAt: string;
      status: PurchaseRow["status"];
      amountInCents: number;
      title: string;
      subtitle: string;
      paymentUrl?: string | null;
      paymentMethod?: string | null;
      productKind?: PurchaseRow["product"]["kind"];
    };

export function storeTabFromLegacySection(section: string): StoreTab | null {
  if (section === "cart") return "cart";
  if (section === "orders" || section === "purchases") return "orders";
  if (section === "products") return "catalog";
  return null;
}

export function isStoreSection(section: string) {
  return section === "products" || section === "cart" || section === "orders" || section === "purchases";
}

export function mergeStoreHistory(orders: OrderRow[], purchases: PurchaseRow[]): StoreHistoryEntry[] {
  const orderEntries: StoreHistoryEntry[] = orders.map((order) => ({
    kind: "order",
    id: order.id,
    createdAt: order.createdAt,
    status: order.status,
    amountInCents: order.amountInCents,
    title: order.items.map((item) => `${item.productName}×${item.quantity}`).join(", "),
    subtitle: `${labelShippingMethod(order.shippingMethod)} · Pedido multi-item`,
    paymentUrl: order.paymentUrl,
    paymentMethod: order.paymentMethod,
    items: order.items,
    shippingMethod: order.shippingMethod,
    shippingAddress: order.shippingAddress,
    couponCode: order.couponCode,
    discountInCents: order.discountInCents
  }));

  const purchaseEntries: StoreHistoryEntry[] = purchases.map((purchase) => ({
    kind: "purchase",
    id: purchase.id,
    createdAt: purchase.createdAt,
    status: purchase.status,
    amountInCents: purchase.amountInCents,
    title: purchase.product.name,
    subtitle: `${labelProductKind(purchase.product.kind)} · Compra direta`,
    paymentUrl: purchase.paymentUrl,
    paymentMethod: purchase.paymentMethod,
    productKind: purchase.product.kind
  }));

  return [...orderEntries, ...purchaseEntries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function storeHistoryStatusLabel(entry: StoreHistoryEntry) {
  return entry.kind === "order" ? labelOrderStatus(entry.status) : labelPurchaseStatus(entry.status);
}

export function storeHistoryStatusTone(entry: StoreHistoryEntry) {
  return entry.kind === "order" ? orderStatusTone(entry.status) : purchaseStatusTone(entry.status);
}

export function storeHistoryPendingCount(entries: StoreHistoryEntry[]) {
  return entries.filter((entry) => entry.status === "PENDING").length;
}

export function storePaymentMethodLabel(method: string | null | undefined) {
  if (!method || method === "UNDEFINED") return "A definir no checkout";
  if (method === "PIX") return "PIX";
  if (method === "CREDIT_CARD") return "Cartão de crédito";
  if (method === "BOLETO") return "Boleto";
  return method;
}
