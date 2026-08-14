import type { OrderStatus, ProductKind, PurchaseStatus, ShippingMethod } from "@prisma/client";
import { prisma } from "../prisma.js";

export const PURCHASE_PAID_STATUSES: PurchaseStatus[] = ["CONFIRMED", "READY", "DELIVERED"];
export const PURCHASE_OPEN_STATUSES: PurchaseStatus[] = ["PENDING", "CONFIRMED", "READY"];
export const ORDER_PAID_STATUSES: OrderStatus[] = ["CONFIRMED", "READY", "DELIVERED"];

export const DEFAULT_DELIVERY_FEE_CENTS = 1500;

export async function isModuleEnabled(key: string, defaultEnabled = true) {
  const setting = await prisma.systemSetting.findUnique({ where: { key } });
  if (!setting) return defaultEnabled;
  return setting.value !== "false";
}

export async function assertModuleEnabled(key: string, message = "Módulo comercial desativado.") {
  const enabled = await isModuleEnabled(key);
  if (!enabled) {
    const error = new Error(message) as Error & { statusCode: number };
    error.statusCode = 403;
    throw error;
  }
}

export function blockingPurchaseStatusesForProduct(kind: ProductKind): PurchaseStatus[] {
  if (kind === "DIGITAL") {
    return ["PENDING", "CONFIRMED", "READY", "DELIVERED"];
  }
  return ["PENDING", "CONFIRMED", "READY"];
}

export function resolvePurchaseTimestamps(
  nextStatus: PurchaseStatus | undefined,
  current?: { paidAt: Date | null; fulfilledAt: Date | null }
) {
  if (!nextStatus) {
    return {};
  }

  const paidAt =
    PURCHASE_PAID_STATUSES.includes(nextStatus)
      ? current?.paidAt ?? new Date()
      : nextStatus === "PENDING"
        ? null
        : current?.paidAt ?? null;

  const fulfilledAt =
    nextStatus === "READY" || nextStatus === "DELIVERED"
      ? current?.fulfilledAt ?? new Date()
      : nextStatus === "PENDING" || nextStatus === "CONFIRMED"
        ? null
        : current?.fulfilledAt ?? null;

  return { paidAt, fulfilledAt };
}

export function resolveOrderTimestamps(
  nextStatus: OrderStatus | undefined,
  current?: { paidAt: Date | null; fulfilledAt: Date | null }
) {
  if (!nextStatus) return {};

  const paidAt =
    ORDER_PAID_STATUSES.includes(nextStatus)
      ? current?.paidAt ?? new Date()
      : nextStatus === "PENDING"
        ? null
        : current?.paidAt ?? null;

  const fulfilledAt =
    nextStatus === "READY" || nextStatus === "DELIVERED"
      ? current?.fulfilledAt ?? new Date()
      : nextStatus === "PENDING" || nextStatus === "CONFIRMED"
        ? null
        : current?.fulfilledAt ?? null;

  return { paidAt, fulfilledAt };
}

export async function decrementProductStock(productId: string, quantity: number) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { stock: true }
  });
  if (product?.stock == null) return;
  await prisma.product.update({
    where: { id: productId },
    data: { stock: Math.max(0, product.stock - quantity) }
  });
}

export async function getDeliveryFeeCents() {
  const setting = await prisma.systemSetting.findUnique({ where: { key: "commerce_delivery_fee_cents" } });
  if (!setting) return DEFAULT_DELIVERY_FEE_CENTS;
  const parsed = Number.parseInt(setting.value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_DELIVERY_FEE_CENTS;
}

export async function resolveShippingQuote(
  method: ShippingMethod,
  items: Array<{ kind: ProductKind }>
) {
  const allDigital = items.length > 0 && items.every((item) => item.kind === "DIGITAL");
  if (allDigital || method === "DIGITAL") {
    return { shippingMethod: "DIGITAL" as const, shippingInCents: 0 };
  }
  if (method === "DELIVERY") {
    return { shippingMethod: "DELIVERY" as const, shippingInCents: await getDeliveryFeeCents() };
  }
  return { shippingMethod: "PICKUP" as const, shippingInCents: 0 };
}

export async function findValidCoupon(code: string, subtotalInCents: number) {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;

  const coupon = await prisma.coupon.findFirst({
    where: {
      code: normalized,
      isActive: true,
      deletedAt: null
    }
  });
  if (!coupon) {
    const error = new Error("Cupom inválido ou expirado.") as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) {
    const error = new Error("Cupom ainda não está válido.") as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }
  if (coupon.endsAt && coupon.endsAt < now) {
    const error = new Error("Cupom expirado.") as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
    const error = new Error("Cupom esgotado.") as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }
  if (subtotalInCents < coupon.minOrderCents) {
    const error = new Error(
      `Cupom válido a partir de R$ ${(coupon.minOrderCents / 100).toFixed(2).replace(".", ",")}.`
    ) as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  let discountInCents = 0;
  if (coupon.percentOff != null && coupon.percentOff > 0) {
    discountInCents = Math.round((subtotalInCents * Math.min(100, coupon.percentOff)) / 100);
  } else if (coupon.amountOffCents != null && coupon.amountOffCents > 0) {
    discountInCents = coupon.amountOffCents;
  }
  discountInCents = Math.min(subtotalInCents, Math.max(0, discountInCents));

  return { coupon, discountInCents };
}

export async function getOrCreateCart(userId: string) {
  return prisma.cart.upsert({
    where: { userId },
    create: { userId },
    update: {},
    include: {
      items: {
        include: { product: true },
        orderBy: { createdAt: "asc" }
      }
    }
  });
}

export async function buildCartTotals(cart: {
  couponCode: string | null;
  items: Array<{
    quantity: number;
    product: { priceInCents: number; kind: ProductKind; isActive: boolean; deletedAt: Date | null; stock: number | null };
  }>;
}, shippingMethod: ShippingMethod = "PICKUP") {
  const activeItems = cart.items.filter((item) => item.product.isActive && !item.product.deletedAt);
  const subtotalInCents = activeItems.reduce(
    (sum, item) => sum + item.product.priceInCents * item.quantity,
    0
  );

  let discountInCents = 0;
  let couponId: string | null = null;
  let couponCode: string | null = null;
  if (cart.couponCode) {
    try {
      const resolved = await findValidCoupon(cart.couponCode, subtotalInCents);
      if (resolved) {
        discountInCents = resolved.discountInCents;
        couponId = resolved.coupon.id;
        couponCode = resolved.coupon.code;
      }
    } catch {
      couponCode = cart.couponCode;
    }
  }

  const shipping = await resolveShippingQuote(
    shippingMethod,
    activeItems.map((item) => ({ kind: item.product.kind }))
  );

  const amountInCents = Math.max(0, subtotalInCents - discountInCents + shipping.shippingInCents);

  return {
    items: activeItems,
    subtotalInCents,
    discountInCents,
    shippingInCents: shipping.shippingInCents,
    shippingMethod: shipping.shippingMethod,
    amountInCents,
    couponId,
    couponCode,
    itemCount: activeItems.reduce((sum, item) => sum + item.quantity, 0)
  };
}
