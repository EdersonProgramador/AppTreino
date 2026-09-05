import type { Order, OrderItem, Product, Profile, Purchase } from "@prisma/client";
import { isValidCpf, normalizeCpfDigits } from "@app-treino/shared";
import { notifyOrderStatusChange } from "../email-notifications.js";
import { env } from "../env.js";
import { prisma } from "../prisma.js";
import {
  findAsaasPaymentByExternalReference,
  formatAsaasDate,
  getAsaasPayment,
  orderExternalReference,
  parseAsaasDueDate,
  purchaseExternalReference,
  resolveAsaasDueDate,
  tryFetchAsaasPixQrCode,
  tryPayAsaasCreditCard,
  tryPrepareAsaasPixPayment,
  type AsaasCreditCardHolderInput,
  type AsaasCreditCardInput
} from "./asaas.client.js";
import { asaasStatusToPaymentStatus } from "./asaas.routes.js";
import { asaasCheckoutItemName, resolveNativeCheckoutBillingType } from "./checkout.utils.js";
import {
  applyOrderStatusSideEffects,
  applyPurchaseStatusSideEffects,
  ORDER_PAID_STATUSES,
  PURCHASE_PAID_STATUSES,
  resolveOrderTimestamps,
  resolvePurchaseTimestamps
} from "./commerce.utils.js";
import {
  buildNativeCheckoutResponse as buildSubscriptionNativeCheckoutResponse,
  ensureAsaasCustomerForUser,
  persistUserCheckoutDocument,
  type NativeCheckoutPayload
} from "./checkout.native.js";

export type { NativeCheckoutPayload };

type CheckoutUser = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  asaasCustomerId?: string | null;
  profile?: Profile | null;
};

type OrderWithItems = Order & { items: OrderItem[] };
type PurchaseWithProduct = Purchase & { product: Product };

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function resolveCheckoutCpf(user: CheckoutUser, cpfOverride?: string | null) {
  const override = normalizeCpfDigits(cpfOverride ?? "");
  if (override) return override;
  return normalizeCpfDigits(user.profile?.document ?? "");
}

function paymentStatusToOrderStatus(status: string) {
  if (status === "CONFIRMED") return "CONFIRMED" as const;
  if (status === "REFUNDED") return "REFUNDED" as const;
  if (status === "CANCELED") return "CANCELED" as const;
  return null;
}

function paymentStatusToPurchaseStatus(status: string) {
  if (status === "CONFIRMED") return "CONFIRMED" as const;
  if (status === "REFUNDED") return "REFUNDED" as const;
  if (status === "CANCELED") return "CANCELED" as const;
  return null;
}

function resolvePaidAt(input: { paymentDate?: string | null; confirmedDate?: string | null }) {
  const raw = input.paymentDate ?? input.confirmedDate;
  return raw ? new Date(raw) : new Date();
}

function canReuseStorePixCharge(input: { asaasPaymentId?: string | null; status: string; dueDate: Date }) {
  const dueDateStr = resolveAsaasDueDate(input.dueDate);
  const storedDay = formatAsaasDate(input.dueDate);
  if (storedDay < dueDateStr) return false;
  return Boolean(input.asaasPaymentId) && input.status === "PENDING";
}

function orderDescription(order: OrderWithItems) {
  return asaasCheckoutItemName(`Pedido (${order.items.length} item(ns))`);
}

function purchaseDescription(purchase: PurchaseWithProduct) {
  return asaasCheckoutItemName(purchase.product.name);
}

export function buildStoreOrderCheckoutResponse(input: {
  order: OrderWithItems;
  alreadyPaid: boolean;
  nativeCheckout?: NativeCheckoutPayload | null;
  paymentProviderError?: string;
}) {
  return {
    order: input.order,
    alreadyPaid: input.alreadyPaid,
    nativeCheckout: input.nativeCheckout ?? undefined,
    paymentProviderError: input.paymentProviderError
  };
}

export function buildStorePurchaseCheckoutResponse(input: {
  purchase: PurchaseWithProduct;
  alreadyPaid: boolean;
  nativeCheckout?: NativeCheckoutPayload | null;
  paymentProviderError?: string;
}) {
  return {
    purchase: input.purchase,
    alreadyPaid: input.alreadyPaid,
    nativeCheckout: input.nativeCheckout ?? undefined,
    paymentProviderError: input.paymentProviderError
  };
}

async function prepareNativeStorePixCheckout(input: {
  amountInCents: number;
  dueDate: Date;
  externalReference: string;
  description: string;
  user: CheckoutUser;
  cpfCnpj?: string | null;
  asaasPaymentId?: string | null;
  status: string;
}) {
  const cpfCnpj = resolveCheckoutCpf(input.user, input.cpfCnpj);
  if (!isValidCpf(cpfCnpj)) {
    return {
      nativeCheckout: null,
      asaasPaymentId: input.asaasPaymentId ?? null,
      providerError: "Informe um CPF válido para gerar o Pix."
    };
  }

  const customerId = await ensureAsaasCustomerForUser(input.user, cpfCnpj);
  if (!customerId) {
    return {
      nativeCheckout: null,
      asaasPaymentId: input.asaasPaymentId ?? null,
      providerError: "Pagamento online indisponível no momento. Tente novamente em instantes."
    };
  }

  if (canReuseStorePixCharge(input) && input.asaasPaymentId) {
    const { pix, providerError } = await tryFetchAsaasPixQrCode(input.asaasPaymentId);
    if (pix) {
      return {
        nativeCheckout: {
          billingType: "PIX" as const,
          pix: {
            qrCodeBase64: pix.encodedImage,
            copyPaste: pix.payload,
            expiresAt: pix.expirationDate ?? null
          }
        },
        asaasPaymentId: input.asaasPaymentId,
        providerError: providerError ?? undefined
      };
    }
  }

  const dueDateStr = resolveAsaasDueDate(input.dueDate);
  const dueDate = parseAsaasDueDate(dueDateStr);
  const { payment: asaasPayment, pix, providerError } = await tryPrepareAsaasPixPayment({
    customerId,
    amountInCents: input.amountInCents,
    dueDate,
    externalReference: input.externalReference,
    description: input.description
  });

  if (!asaasPayment || !pix) {
    return {
      nativeCheckout: null,
      asaasPaymentId: input.asaasPaymentId ?? null,
      providerError: providerError ?? "Não foi possível gerar o Pix."
    };
  }

  return {
    nativeCheckout: {
      billingType: "PIX" as const,
      pix: {
        qrCodeBase64: pix.encodedImage,
        copyPaste: pix.payload,
        expiresAt: pix.expirationDate ?? null
      }
    },
    asaasPaymentId: asaasPayment.id,
    providerError: providerError ?? undefined
  };
}

export async function prepareNativeOrderCheckout(input: {
  order: OrderWithItems;
  user: CheckoutUser;
  billingType: "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED";
  cpfCnpj?: string | null;
}) {
  const resolvedBillingType = resolveNativeCheckoutBillingType(input.billingType);

  if (resolvedBillingType === "CREDIT_CARD") {
    return {
      order: input.order,
      nativeCheckout: {
        billingType: "CREDIT_CARD" as const
      },
      providerError: undefined as string | undefined
    };
  }

  const pixResult = await prepareNativeStorePixCheckout({
    amountInCents: input.order.amountInCents,
    dueDate: input.order.createdAt,
    externalReference: orderExternalReference(input.order.id),
    description: orderDescription(input.order),
    user: input.user,
    cpfCnpj: input.cpfCnpj,
    asaasPaymentId: input.order.asaasPaymentId,
    status: input.order.status
  });

  if (!pixResult.nativeCheckout) {
    return {
      order: input.order,
      nativeCheckout: null,
      providerError: pixResult.providerError
    };
  }

  const updatedOrder = await prisma.order.update({
    where: { id: input.order.id },
    data: {
      asaasPaymentId: pixResult.asaasPaymentId,
      paymentUrl: null,
      paymentMethod: "PIX"
    },
    include: { items: true }
  });

  return {
    order: updatedOrder,
    nativeCheckout: pixResult.nativeCheckout,
    providerError: pixResult.providerError
  };
}

export async function prepareNativePurchaseCheckout(input: {
  purchase: PurchaseWithProduct;
  user: CheckoutUser;
  billingType: "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED";
  cpfCnpj?: string | null;
}) {
  const resolvedBillingType = resolveNativeCheckoutBillingType(input.billingType);

  if (resolvedBillingType === "CREDIT_CARD") {
    return {
      purchase: input.purchase,
      nativeCheckout: {
        billingType: "CREDIT_CARD" as const
      },
      providerError: undefined as string | undefined
    };
  }

  const pixResult = await prepareNativeStorePixCheckout({
    amountInCents: input.purchase.amountInCents,
    dueDate: input.purchase.createdAt,
    externalReference: purchaseExternalReference(input.purchase.id),
    description: purchaseDescription(input.purchase),
    user: input.user,
    cpfCnpj: input.cpfCnpj,
    asaasPaymentId: input.purchase.asaasPaymentId,
    status: input.purchase.status
  });

  if (!pixResult.nativeCheckout) {
    return {
      purchase: input.purchase,
      nativeCheckout: null,
      providerError: pixResult.providerError
    };
  }

  const updatedPurchase = await prisma.purchase.update({
    where: { id: input.purchase.id },
    data: {
      asaasPaymentId: pixResult.asaasPaymentId,
      paymentUrl: null,
      paymentMethod: "PIX"
    },
    include: { product: true }
  });

  return {
    purchase: updatedPurchase,
    nativeCheckout: pixResult.nativeCheckout,
    providerError: pixResult.providerError
  };
}

export async function payNativeOrderWithCard(input: {
  order: OrderWithItems;
  user: CheckoutUser;
  creditCard: AsaasCreditCardInput;
  creditCardHolderInfo: AsaasCreditCardHolderInput;
  remoteIp: string;
  installmentCount?: number;
}) {
  const documentResult = await persistUserCheckoutDocument(
    input.user.id,
    input.creditCardHolderInfo.cpfCnpj
  );
  if (!documentResult.ok) {
    return {
      order: input.order,
      providerError: documentResult.error
    };
  }

  const refreshedUser = await prisma.user.findUniqueOrThrow({
    where: { id: input.user.id },
    include: { profile: true }
  });

  const customerId = await ensureAsaasCustomerForUser(refreshedUser, documentResult.cpfCnpj);
  if (!customerId) {
    return {
      order: input.order,
      providerError: "Pagamento online indisponível no momento. Tente novamente em instantes."
    };
  }

  const dueDate = parseAsaasDueDate(resolveAsaasDueDate(input.order.createdAt));
  const { payment: asaasPayment, providerError } = await tryPayAsaasCreditCard({
    customerId,
    amountInCents: input.order.amountInCents,
    dueDate,
    externalReference: orderExternalReference(input.order.id),
    description: orderDescription(input.order),
    creditCard: {
      ...input.creditCard,
      number: onlyDigits(input.creditCard.number)
    },
    creditCardHolderInfo: {
      ...input.creditCardHolderInfo,
      cpfCnpj: onlyDigits(input.creditCardHolderInfo.cpfCnpj),
      postalCode: onlyDigits(input.creditCardHolderInfo.postalCode),
      phone: onlyDigits(input.creditCardHolderInfo.phone)
    },
    remoteIp: input.remoteIp,
    installmentCount: input.installmentCount
  });

  if (!asaasPayment) {
    return {
      order: input.order,
      providerError: providerError ?? "Não foi possível processar o cartão."
    };
  }

  const paymentStatus = asaasStatusToPaymentStatus(asaasPayment.status);
  const nextOrderStatus = paymentStatusToOrderStatus(paymentStatus);
  const previousStatus = input.order.status;
  const timestamps = resolveOrderTimestamps(nextOrderStatus ?? undefined, {
    paidAt: input.order.paidAt,
    fulfilledAt: input.order.fulfilledAt
  });

  const updatedOrder = await prisma.order.update({
    where: { id: input.order.id },
    data: {
      asaasPaymentId: asaasPayment.id,
      paymentUrl: null,
      paymentMethod: "CREDIT_CARD",
      ...(nextOrderStatus ? { status: nextOrderStatus, ...timestamps } : {})
    },
    include: { items: true, user: true }
  });

  if (nextOrderStatus && nextOrderStatus !== previousStatus) {
    await applyOrderStatusSideEffects(input.order, previousStatus, nextOrderStatus);
    notifyOrderStatusChange({
      order: updatedOrder,
      previousStatus,
      nextStatus: nextOrderStatus
    });
  }

  return {
    order: updatedOrder,
    providerError: providerError ?? undefined
  };
}

export async function payNativePurchaseWithCard(input: {
  purchase: PurchaseWithProduct;
  user: CheckoutUser;
  creditCard: AsaasCreditCardInput;
  creditCardHolderInfo: AsaasCreditCardHolderInput;
  remoteIp: string;
  installmentCount?: number;
}) {
  const documentResult = await persistUserCheckoutDocument(
    input.user.id,
    input.creditCardHolderInfo.cpfCnpj
  );
  if (!documentResult.ok) {
    return {
      purchase: input.purchase,
      providerError: documentResult.error
    };
  }

  const refreshedUser = await prisma.user.findUniqueOrThrow({
    where: { id: input.user.id },
    include: { profile: true }
  });

  const customerId = await ensureAsaasCustomerForUser(refreshedUser, documentResult.cpfCnpj);
  if (!customerId) {
    return {
      purchase: input.purchase,
      providerError: "Pagamento online indisponível no momento. Tente novamente em instantes."
    };
  }

  const dueDate = parseAsaasDueDate(resolveAsaasDueDate(input.purchase.createdAt));
  const { payment: asaasPayment, providerError } = await tryPayAsaasCreditCard({
    customerId,
    amountInCents: input.purchase.amountInCents,
    dueDate,
    externalReference: purchaseExternalReference(input.purchase.id),
    description: purchaseDescription(input.purchase),
    creditCard: {
      ...input.creditCard,
      number: onlyDigits(input.creditCard.number)
    },
    creditCardHolderInfo: {
      ...input.creditCardHolderInfo,
      cpfCnpj: onlyDigits(input.creditCardHolderInfo.cpfCnpj),
      postalCode: onlyDigits(input.creditCardHolderInfo.postalCode),
      phone: onlyDigits(input.creditCardHolderInfo.phone)
    },
    remoteIp: input.remoteIp,
    installmentCount: input.installmentCount
  });

  if (!asaasPayment) {
    return {
      purchase: input.purchase,
      providerError: providerError ?? "Não foi possível processar o cartão."
    };
  }

  const paymentStatus = asaasStatusToPaymentStatus(asaasPayment.status);
  const nextPurchaseStatus = paymentStatusToPurchaseStatus(paymentStatus);
  const previousStatus = input.purchase.status;
  const timestamps = resolvePurchaseTimestamps(nextPurchaseStatus ?? undefined, {
    paidAt: input.purchase.paidAt,
    fulfilledAt: input.purchase.fulfilledAt
  });

  const updatedPurchase = await prisma.purchase.update({
    where: { id: input.purchase.id },
    data: {
      asaasPaymentId: asaasPayment.id,
      paymentUrl: null,
      paymentMethod: "CREDIT_CARD",
      ...(nextPurchaseStatus ? { status: nextPurchaseStatus, ...timestamps } : {})
    },
    include: { product: true }
  });

  if (nextPurchaseStatus) {
    await applyPurchaseStatusSideEffects(input.purchase, previousStatus, nextPurchaseStatus);
  }

  return {
    purchase: updatedPurchase,
    providerError: providerError ?? undefined
  };
}

export async function syncOrderPaymentFromAsaas(
  order: OrderWithItems & { user?: { id: string; name: string; email?: string | null } | null }
) {
  if (!env.ASAAS_API_KEY) return null;

  if (order.status !== "PENDING") {
    return {
      order,
      alreadyPaid: ORDER_PAID_STATUSES.includes(order.status),
      syncedFromAsaas: false
    };
  }

  const remote = order.asaasPaymentId
    ? await getAsaasPayment(order.asaasPaymentId)
    : await findAsaasPaymentByExternalReference(orderExternalReference(order.id));

  if (!remote?.id) return null;

  const paymentStatus = asaasStatusToPaymentStatus(remote.status);
  const nextOrderStatus = paymentStatusToOrderStatus(paymentStatus);

  if (!nextOrderStatus) {
    return {
      order,
      alreadyPaid: ORDER_PAID_STATUSES.includes(order.status),
      syncedFromAsaas: true
    };
  }

  const previousStatus = order.status;
  const timestamps = resolveOrderTimestamps(nextOrderStatus, {
    paidAt: order.paidAt,
    fulfilledAt: order.fulfilledAt
  });

  const updatedOrder = await prisma.order.update({
    where: { id: order.id },
    data: {
      asaasPaymentId: remote.id,
      paymentUrl: remote.invoiceUrl ?? remote.bankSlipUrl ?? order.paymentUrl,
      status: nextOrderStatus,
      ...timestamps
    },
    include: { items: true, user: true }
  });

  await applyOrderStatusSideEffects(order, previousStatus, nextOrderStatus);
  if (updatedOrder.user) {
    notifyOrderStatusChange({
      order: updatedOrder,
      previousStatus,
      nextStatus: nextOrderStatus
    });
  }

  return {
    order: updatedOrder,
    alreadyPaid: ORDER_PAID_STATUSES.includes(nextOrderStatus),
    syncedFromAsaas: true
  };
}

export async function syncPurchasePaymentFromAsaas(purchase: PurchaseWithProduct) {
  if (!env.ASAAS_API_KEY) return null;

  if (purchase.status !== "PENDING") {
    return {
      purchase,
      alreadyPaid: PURCHASE_PAID_STATUSES.includes(purchase.status),
      syncedFromAsaas: false
    };
  }

  const remote = purchase.asaasPaymentId
    ? await getAsaasPayment(purchase.asaasPaymentId)
    : await findAsaasPaymentByExternalReference(purchaseExternalReference(purchase.id));

  if (!remote?.id) return null;

  const paymentStatus = asaasStatusToPaymentStatus(remote.status);
  const nextPurchaseStatus = paymentStatusToPurchaseStatus(paymentStatus);

  if (!nextPurchaseStatus) {
    return {
      purchase,
      alreadyPaid: PURCHASE_PAID_STATUSES.includes(purchase.status),
      syncedFromAsaas: true
    };
  }

  const previousStatus = purchase.status;
  const timestamps = resolvePurchaseTimestamps(nextPurchaseStatus, {
    paidAt: purchase.paidAt,
    fulfilledAt: purchase.fulfilledAt
  });

  const updatedPurchase = await prisma.purchase.update({
    where: { id: purchase.id },
    data: {
      asaasPaymentId: remote.id,
      paymentUrl: remote.invoiceUrl ?? remote.bankSlipUrl ?? purchase.paymentUrl,
      status: nextPurchaseStatus,
      ...timestamps
    },
    include: { product: true }
  });

  await applyPurchaseStatusSideEffects(purchase, previousStatus, nextPurchaseStatus);

  return {
    purchase: updatedPurchase,
    alreadyPaid: PURCHASE_PAID_STATUSES.includes(nextPurchaseStatus),
    syncedFromAsaas: true
  };
}

export async function finalizeNativePurchaseCheckout(input: {
  purchase: PurchaseWithProduct;
  userId: string;
  billingType: "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED";
  cpfCnpj?: string | null;
}) {
  if (input.billingType === "UNDEFINED") {
    return buildStorePurchaseCheckoutResponse({
      purchase: input.purchase,
      alreadyPaid: false
    });
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: input.userId },
    include: { profile: true }
  });

  const native = await prepareNativePurchaseCheckout({
    purchase: input.purchase,
    user,
    billingType: input.billingType,
    cpfCnpj: input.cpfCnpj
  });

  return buildStorePurchaseCheckoutResponse({
    purchase: native.purchase,
    alreadyPaid: false,
    nativeCheckout: native.nativeCheckout,
    paymentProviderError: native.providerError
  });
}

export async function resolveStorePixCpf(userId: string, billingType: string, cpfCnpj?: string | null) {
  if (billingType !== "PIX") return { cpfCnpj: null as string | null };

  const normalizedInput = normalizeCpfDigits(cpfCnpj ?? "");
  if (normalizedInput) {
    if (!isValidCpf(normalizedInput)) {
      return { error: "Informe um CPF válido." };
    }
    return { cpfCnpj: normalizedInput };
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { profile: true }
  });
  const profileCpf = normalizeCpfDigits(user.profile?.document ?? "");
  if (!isValidCpf(profileCpf)) {
    return { error: "Informe um CPF válido para gerar o Pix." };
  }

  return { cpfCnpj: profileCpf };
}

export { buildSubscriptionNativeCheckoutResponse };
