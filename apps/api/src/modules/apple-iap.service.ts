import type { Membership, Payment, Plan } from "@prisma/client";
import { env } from "../env.js";
import { prisma } from "../prisma.js";
import { applySubscriptionPaymentConfirmation } from "./asaas-payment-sync.js";
import { addCycleDate } from "./asaas.routes.js";
import {
  APPLE_IAP_ENTITLEMENT_ID,
  resolveAppleProductId,
  resolvePlanCodeFromAppleProductId
} from "./apple-iap.utils.js";
import { resolveCheckoutSessionPricing } from "./checkout.utils.js";

type RevenueCatSubscriber = {
  subscriber?: {
    entitlements?: Record<
      string,
      {
        expires_date?: string | null;
        product_identifier?: string | null;
        purchase_date?: string | null;
      }
    >;
    subscriptions?: Record<
      string,
      {
        expires_date?: string | null;
        store_transaction_id?: string | null;
        original_transaction_id?: string | null;
      }
    >;
  };
};

function todayUtcOnly() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function fetchRevenueCatSubscriber(appUserId: string): Promise<RevenueCatSubscriber | null> {
  const secret = env.REVENUECAT_SECRET_KEY?.trim();
  if (!secret) return null;

  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`RevenueCat verification failed (${response.status}): ${body.slice(0, 200)}`);
  }

  return (await response.json()) as RevenueCatSubscriber;
}

export function pickActiveAppleProductFromSubscriber(
  subscriber: RevenueCatSubscriber | null,
  expectedProductId?: string | null
): { productId: string; transactionId: string; originalTransactionId: string | null } | null {
  if (!subscriber?.subscriber) return null;

  const entitlement = subscriber.subscriber.entitlements?.[APPLE_IAP_ENTITLEMENT_ID];
  if (entitlement?.expires_date) {
    const expiresAt = new Date(entitlement.expires_date);
    if (expiresAt > new Date()) {
      const productId = entitlement.product_identifier?.trim();
      if (productId) {
        const subscription = subscriber.subscriber.subscriptions?.[productId];
        return {
          productId,
          transactionId:
            subscription?.store_transaction_id?.trim() ||
            `${productId}:${entitlement.purchase_date ?? "active"}`,
          originalTransactionId: subscription?.original_transaction_id?.trim() ?? null
        };
      }
    }
  }

  const subscriptions = subscriber.subscriber.subscriptions ?? {};
  for (const [productId, subscription] of Object.entries(subscriptions)) {
    if (expectedProductId && productId !== expectedProductId) continue;
    if (!subscription.expires_date) continue;
    if (new Date(subscription.expires_date) <= new Date()) continue;
    return {
      productId,
      transactionId: subscription.store_transaction_id?.trim() || `${productId}:active`,
      originalTransactionId: subscription.original_transaction_id?.trim() ?? null
    };
  }

  return null;
}

async function resolveCheckoutPlan(planCode: string) {
  const plan = await prisma.plan.findFirst({
    where: { code: planCode, deletedAt: null }
  });
  if (!plan) {
    const error = new Error("Plano não encontrado.") as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }
  return plan;
}

async function findOrCreateApplePendingCheckout(userId: string, plan: Plan) {
  const activeMembership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE", deletedAt: null },
    include: { plan: true, payments: { orderBy: { dueDate: "desc" }, take: 1 } }
  });
  if (activeMembership) {
    return { membership: activeMembership, payment: activeMembership.payments[0] ?? null, alreadyActive: true as const };
  }

  const pendingMembership = await prisma.membership.findFirst({
    where: {
      userId,
      status: "PENDING",
      deletedAt: null,
      payments: { some: { paymentProvider: "APPLE", status: "PENDING", deletedAt: null } }
    },
    include: {
      plan: true,
      payments: {
        where: { paymentProvider: "APPLE", status: "PENDING", deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    },
    orderBy: { createdAt: "desc" }
  });

  if (pendingMembership?.payments[0]) {
    if (pendingMembership.planId !== plan.id) {
      const startsAt = todayUtcOnly();
      const updated = await prisma.$transaction(async (tx) => {
        const membership = await tx.membership.update({
          where: { id: pendingMembership.id },
          data: {
            planId: plan.id,
            endsAt: addCycleDate(startsAt, plan.billingCycle)
          },
          include: { plan: true }
        });
        const pricing = await resolveCheckoutSessionPricing(plan);
        const payment = await tx.payment.update({
          where: { id: pendingMembership.payments[0]!.id },
          data: {
            amountInCents: pricing.amountInCents,
            originalAmountInCents: pricing.originalAmountInCents,
            discountInCents: pricing.discountInCents,
            couponId: pricing.couponId,
            couponCode: pricing.couponCode
          }
        });
        return { membership, payment };
      });
      return { membership: updated.membership, payment: updated.payment, alreadyActive: false as const };
    }
    return {
      membership: pendingMembership,
      payment: pendingMembership.payments[0],
      alreadyActive: false as const
    };
  }

  const startsAt = todayUtcOnly();
  const pricing = await resolveCheckoutSessionPricing(plan);
  const created = await prisma.$transaction(async (tx) => {
    const membership = await tx.membership.create({
      data: {
        userId,
        planId: plan.id,
        status: "PENDING",
        startsAt,
        endsAt: addCycleDate(startsAt, plan.billingCycle)
      },
      include: { plan: true }
    });
    const payment = await tx.payment.create({
      data: {
        membershipId: membership.id,
        paymentProvider: "APPLE",
        amountInCents: pricing.amountInCents,
        originalAmountInCents: pricing.originalAmountInCents,
        discountInCents: pricing.discountInCents,
        couponId: pricing.couponId,
        couponCode: pricing.couponCode,
        status: "PENDING",
        dueDate: startsAt
      }
    });
    return { membership, payment };
  });

  return { ...created, alreadyActive: false as const };
}

export async function prepareAppleCheckoutSession(userId: string, planCode: string) {
  const plan = await resolveCheckoutPlan(planCode);
  const checkout = await findOrCreateApplePendingCheckout(userId, plan);
  return {
    ...checkout,
    appleProductId: resolveAppleProductId(plan),
    plan
  };
}

export async function confirmAppleCheckoutPurchase(input: {
  userId: string;
  planCode: string;
  productId: string;
  transactionId?: string | null;
  originalTransactionId?: string | null;
}) {
  const plan = await resolveCheckoutPlan(input.planCode);
  const expectedProductId = resolveAppleProductId(plan);
  if (input.productId.trim() !== expectedProductId) {
    const error = new Error("Produto Apple não corresponde ao plano selecionado.") as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  let transactionId = input.transactionId?.trim() || null;
  let originalTransactionId = input.originalTransactionId?.trim() || null;

  const subscriber = await fetchRevenueCatSubscriber(input.userId);
  if (subscriber) {
    const active = pickActiveAppleProductFromSubscriber(subscriber, expectedProductId);
    if (!active) {
      const error = new Error("Assinatura Apple ainda não confirmada. Tente restaurar compras.") as Error & {
        statusCode: number;
      };
      error.statusCode = 402;
      throw error;
    }
    transactionId = active.transactionId;
    originalTransactionId = active.originalTransactionId;
  } else if (env.NODE_ENV === "production") {
    const error = new Error("Validação Apple IAP não configurada no servidor.") as Error & { statusCode: number };
    error.statusCode = 503;
    throw error;
  } else if (!transactionId) {
    transactionId = `dev-${input.userId}-${expectedProductId}-${Date.now()}`;
  }

  const existing = await prisma.payment.findFirst({
    where: {
      appleTransactionId: transactionId,
      status: "CONFIRMED",
      deletedAt: null
    },
    include: {
      membership: { include: { plan: true } }
    }
  });
  if (existing) {
    return {
      payment: existing,
      membership: existing.membership,
      alreadyActive: existing.membership.status === "ACTIVE"
    };
  }

  const checkout = await findOrCreateApplePendingCheckout(input.userId, plan);
  if (checkout.alreadyActive) {
    return {
      payment: checkout.payment,
      membership: checkout.membership,
      alreadyActive: true
    };
  }

  if (!checkout.payment) {
    const error = new Error("Pagamento Apple pendente não encontrado.") as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  const paymentWithMembership = await prisma.payment.update({
    where: { id: checkout.payment.id },
    data: {
      paymentProvider: "APPLE",
      appleTransactionId: transactionId,
      appleOriginalTransactionId: originalTransactionId
    },
    include: {
      membership: { include: { plan: true } }
    }
  });

  const synced = await applySubscriptionPaymentConfirmation(paymentWithMembership, {
    status: "CONFIRMED",
    paidAt: new Date(),
    amountInCents: paymentWithMembership.amountInCents
  });

  return {
    payment: synced.payment,
    membership: synced.membership,
    alreadyActive: synced.membership.status === "ACTIVE"
  };
}

export async function syncAppleMembershipFromRevenueCat(userId: string) {
  const subscriber = await fetchRevenueCatSubscriber(userId);
  const active = pickActiveAppleProductFromSubscriber(subscriber);
  if (!active) return null;

  const plans = await prisma.plan.findMany({ where: { deletedAt: null } });
  const planCode = resolvePlanCodeFromAppleProductId(active.productId, plans);
  if (!planCode) return null;

  return confirmAppleCheckoutPurchase({
    userId,
    planCode,
    productId: active.productId,
    transactionId: active.transactionId,
    originalTransactionId: active.originalTransactionId
  });
}

export type AppleCheckoutResult = {
  payment: Payment;
  membership: Membership & { plan: Plan };
  alreadyActive: boolean;
};
