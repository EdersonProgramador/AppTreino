import type { OrderStatus, ProductKind, PurchaseStatus, ShippingMethod } from "@prisma/client";
import { prisma } from "../prisma.js";
import { productToShippingInput, quoteShipping } from "./shipping.service.js";

export const PURCHASE_PAID_STATUSES: PurchaseStatus[] = ["CONFIRMED", "READY", "DELIVERED"];
export const PURCHASE_OPEN_STATUSES: PurchaseStatus[] = ["PENDING", "CONFIRMED", "READY"];
export const ORDER_PAID_STATUSES: OrderStatus[] = ["CONFIRMED", "READY", "DELIVERED"];

export const DEFAULT_DELIVERY_FEE_CENTS = 1500;

export const DEFAULT_SYSTEM_SETTINGS: Record<string, string> = {
  module_products: "true",
  module_purchases: "true",
  module_qr: "true",
  module_cards: "true",
  module_contact: "true",
  module_ratings: "true",
  module_favorites: "true",
  module_ai: "true",
  module_social_publicar: "true",
  module_social_momentos: "true",
  module_social_clipes: "false",
  module_social_live: "false",
  module_social_nota: "false",
  qr_checkin_enabled: "true",
  commerce_delivery_fee_cents: "1500",
  commerce_origin_postal_code: "01310100",
  commerce_shipping_provider: "auto",
  legal_company_name: "ATLLY",
  legal_cnpj: "",
  legal_contact_email: "contato@atlly.com.br",
  legal_dpo_email: "privacidade@atlly.com.br"
};

const PLACEHOLDER_LEGAL_CNPJ_DIGITS = "00000000000100";

export function isPublicLegalCnpj(cnpj: string | undefined) {
  const digits = (cnpj ?? "").replace(/\D/g, "");
  return digits.length > 0 && digits !== PLACEHOLDER_LEGAL_CNPJ_DIGITS;
}

/** Oculta CNPJ/razão social fictícios na config pública até regularização. */
export function sanitizePublicSystemSettings(config: Record<string, string>) {
  if (isPublicLegalCnpj(config.legal_cnpj)) {
    return config;
  }

  return {
    ...config,
    legal_cnpj: "",
    legal_company_name: "ATLLY"
  };
}

export async function ensureDefaultSystemSettings() {
  const keys = Object.keys(DEFAULT_SYSTEM_SETTINGS);
  const existing = await prisma.systemSetting.findMany({
    where: { key: { in: keys } },
    select: { key: true }
  });
  const present = new Set(existing.map((item) => item.key));
  const missing = keys.filter((key) => !present.has(key));
  if (missing.length === 0) return;

  await prisma.$transaction(
    missing.map((key) =>
      prisma.systemSetting.create({
        data: { key, value: DEFAULT_SYSTEM_SETTINGS[key] }
      })
    )
  );
}

/** Liga todos os módulos públicos do aluno (Configurações do admin). */
export async function activateSystemModules() {
  const entries = Object.entries(DEFAULT_SYSTEM_SETTINGS);
  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.systemSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value }
      })
    )
  );
}

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

export async function incrementProductStock(productId: string, quantity: number) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { stock: true }
  });
  if (product?.stock == null) return;
  await prisma.product.update({
    where: { id: productId },
    data: { stock: product.stock + quantity }
  });
}

const ORDER_RESTOCK_STATUSES: OrderStatus[] = ["REFUNDED", "CANCELED"];
const PURCHASE_RESTOCK_STATUSES: PurchaseStatus[] = ["REFUNDED", "CANCELED"];

export async function applyOrderStatusSideEffects(
  order: {
    couponId: string | null;
    items: Array<{ productId: string; quantity: number }>;
  },
  previousStatus: OrderStatus,
  nextStatus: OrderStatus
) {
  const wasPaid = ORDER_PAID_STATUSES.includes(previousStatus);
  const isPaid = ORDER_PAID_STATUSES.includes(nextStatus);
  const shouldRestock = wasPaid && ORDER_RESTOCK_STATUSES.includes(nextStatus) && !isPaid;

  if (!wasPaid && isPaid) {
    for (const item of order.items) {
      await decrementProductStock(item.productId, item.quantity);
    }
    if (order.couponId) {
      await prisma.coupon.update({
        where: { id: order.couponId },
        data: { usedCount: { increment: 1 } }
      });
    }
    return;
  }

  if (shouldRestock) {
    for (const item of order.items) {
      await incrementProductStock(item.productId, item.quantity);
    }
    if (order.couponId) {
      const coupon = await prisma.coupon.findUnique({
        where: { id: order.couponId },
        select: { usedCount: true }
      });
      if (coupon && coupon.usedCount > 0) {
        await prisma.coupon.update({
          where: { id: order.couponId },
          data: { usedCount: { decrement: 1 } }
        });
      }
    }
  }
}

/** @deprecated Use applyOrderStatusSideEffects */
export async function applyOrderPaymentSideEffects(
  order: {
    couponId: string | null;
    items: Array<{ productId: string; quantity: number }>;
  },
  previousStatus: OrderStatus,
  nextStatus: OrderStatus
) {
  return applyOrderStatusSideEffects(order, previousStatus, nextStatus);
}

export async function applyPurchaseStatusSideEffects(
  purchase: { productId: string; quantity: number },
  previousStatus: PurchaseStatus,
  nextStatus: PurchaseStatus
) {
  const wasPaid = PURCHASE_PAID_STATUSES.includes(previousStatus);
  const isPaid = PURCHASE_PAID_STATUSES.includes(nextStatus);
  const shouldRestock = wasPaid && PURCHASE_RESTOCK_STATUSES.includes(nextStatus) && !isPaid;

  if (!wasPaid && isPaid) {
    await decrementProductStock(purchase.productId, purchase.quantity);
    return;
  }

  if (shouldRestock) {
    await incrementProductStock(purchase.productId, purchase.quantity);
  }
}

export async function getDeliveryFeeCents() {
  const setting = await prisma.systemSetting.findUnique({ where: { key: "commerce_delivery_fee_cents" } });
  if (!setting) return DEFAULT_DELIVERY_FEE_CENTS;
  const parsed = Number.parseInt(setting.value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_DELIVERY_FEE_CENTS;
}

/** Entrega definida pelo admin no produto — o aluno só vê o resultado no carrinho. */
export function resolveShippingMethodFromProducts(
  items: Array<{ kind: ProductKind; shippingMethod?: ShippingMethod | null }>
): ShippingMethod {
  if (items.length === 0) return "PICKUP";

  const allDigital = items.every(
    (item) => item.kind === "DIGITAL" || item.shippingMethod === "DIGITAL"
  );
  if (allDigital) return "DIGITAL";

  // Se qualquer item físico exige entrega, o pedido fica como entrega.
  const needsDelivery = items.some(
    (item) => item.kind === "PHYSICAL" && item.shippingMethod === "DELIVERY"
  );
  return needsDelivery ? "DELIVERY" : "PICKUP";
}

export function normalizeProductShippingMethod(
  kind: ProductKind,
  shippingMethod?: ShippingMethod | null
): ShippingMethod {
  if (kind === "DIGITAL") return "DIGITAL";
  if (shippingMethod === "DELIVERY") return "DELIVERY";
  return "PICKUP";
}

export async function resolveShippingQuote(
  items: Array<{ kind: ProductKind; shippingMethod?: ShippingMethod | null }>
) {
  const shippingMethod = resolveShippingMethodFromProducts(items);

  if (shippingMethod === "DIGITAL") {
    return { shippingMethod: "DIGITAL" as const, shippingInCents: 0 };
  }
  if (shippingMethod === "DELIVERY") {
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

type CartWithItems = Awaited<ReturnType<typeof getOrCreateCart>>;

export async function clearCartAfterCheckout(cartId: string) {
  await prisma.$transaction([
    prisma.cartItem.deleteMany({ where: { cartId } }),
    prisma.cart.update({
      where: { id: cartId },
      data: {
        couponCode: null,
        fulfillmentMethod: null,
        destinationPostalCode: null,
        destinationStreet: null,
        destinationNumber: null,
        destinationComplement: null,
        destinationNeighborhood: null,
        destinationCity: null,
        destinationState: null,
        shippingCarrier: null,
        shippingServiceId: null,
        shippingServiceName: null
      }
    })
  ]);
}

export async function buildCartTotals(cart: CartWithItems) {
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

  const shippingItems = activeItems.map((item) => productToShippingInput(item.product, item.quantity));
  const shippingQuote = await quoteShipping({
    items: shippingItems,
    fulfillmentMethod: cart.fulfillmentMethod,
    destination: {
      postalCode: cart.destinationPostalCode,
      street: cart.destinationStreet,
      number: cart.destinationNumber,
      complement: cart.destinationComplement,
      neighborhood: cart.destinationNeighborhood,
      city: cart.destinationCity,
      state: cart.destinationState
    },
    selectedServiceId: cart.shippingServiceId
  });

  const amountInCents = Math.max(0, subtotalInCents - discountInCents + shippingQuote.shippingInCents);

  return {
    items: activeItems,
    subtotalInCents,
    discountInCents,
    shippingInCents: shippingQuote.shippingInCents,
    shippingMethod: shippingQuote.shippingMethod,
    shippingQuote,
    amountInCents,
    couponId,
    couponCode,
    itemCount: activeItems.reduce((sum, item) => sum + item.quantity, 0)
  };
}
