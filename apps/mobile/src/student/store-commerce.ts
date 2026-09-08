import type { OrderRow, PurchaseRow } from "../types";
import { labelOrderStatus, labelPurchaseStatus, labelShippingMethod } from "./commerce";

export type StoreHistoryEntry =
  | {
      kind: "order";
      id: string;
      createdAt: string;
      status: OrderRow["status"];
      amountInCents: number;
      title: string;
    }
  | {
      kind: "purchase";
      id: string;
      createdAt: string;
      status: PurchaseRow["status"];
      amountInCents: number;
      title: string;
    };

export function mergeStoreHistory(orders: OrderRow[], purchases: PurchaseRow[]): StoreHistoryEntry[] {
  const orderEntries: StoreHistoryEntry[] = orders.map((order) => ({
    kind: "order",
    id: order.id,
    createdAt: order.createdAt,
    status: order.status,
    amountInCents: order.amountInCents,
    title: (order.items ?? []).map((item) => `${item.productName}×${item.quantity}`).join(", ") || "Pedido"
  }));
  const purchaseEntries: StoreHistoryEntry[] = purchases.map((purchase) => ({
    kind: "purchase",
    id: purchase.id,
    createdAt: purchase.createdAt,
    status: purchase.status,
    amountInCents: purchase.amountInCents,
    title: purchase.product?.name ?? "Compra"
  }));
  return [...orderEntries, ...purchaseEntries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function storeHistoryStatusLabel(entry: StoreHistoryEntry) {
  return entry.kind === "order" ? labelOrderStatus(entry.status) : labelPurchaseStatus(entry.status);
}

export function storeHistoryPendingCount(entries: StoreHistoryEntry[]) {
  return entries.filter((entry) => entry.status === "PENDING").length;
}

export function formatPriceInBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
