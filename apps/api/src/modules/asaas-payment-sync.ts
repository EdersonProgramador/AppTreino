import type { Membership, Payment, Plan } from "@prisma/client";
import {
  notifySubscriptionActivated,
  notifySubscriptionPaymentOverdueFromPayment,
  notifyPaymentRefundOrCancel
} from "../email-notifications.js";
import { env } from "../env.js";
import { prisma } from "../prisma.js";
import { getAsaasPayment, findAsaasPaymentByExternalReference } from "./asaas.client.js";
import { addCycleDate, asaasStatusToPaymentStatus, shouldActivateMembership } from "./asaas.routes.js";

type PaymentWithMembership = Payment & {
  membership: Membership & {
    plan: Plan;
  };
};

export type SubscriptionPaymentSyncResult = {
  payment: PaymentWithMembership;
  membership: Membership & { plan: Plan };
  activated: boolean;
  syncedFromAsaas: boolean;
};

function resolvePaidAt(input: { paymentDate?: string | null; confirmedDate?: string | null }) {
  const raw = input.paymentDate ?? input.confirmedDate;
  return raw ? new Date(raw) : new Date();
}

export async function applySubscriptionPaymentConfirmation(
  payment: PaymentWithMembership,
  input: {
    status: string;
    asaasPaymentId?: string | null;
    paymentUrl?: string | null;
    paidAt?: Date;
    amountInCents?: number | null;
  }
): Promise<SubscriptionPaymentSyncResult> {
  const nextStatus = asaasStatusToPaymentStatus(input.status);
  const wasConfirmed = payment.status === "CONFIRMED";
  const shouldExtendMembership = shouldActivateMembership(nextStatus) && !wasConfirmed;

  if (
    shouldExtendMembership &&
    input.amountInCents != null &&
    input.amountInCents !== payment.amountInCents
  ) {
    throw new Error("Payment value mismatch");
  }

  const updatedPayment = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      ...(input.asaasPaymentId ? { asaasPaymentId: input.asaasPaymentId } : {}),
      status: nextStatus,
      paymentUrl: input.paymentUrl ?? payment.paymentUrl,
      paidAt: shouldActivateMembership(nextStatus)
        ? input.paidAt ?? payment.paidAt ?? new Date()
        : payment.paidAt
    },
    include: {
      membership: {
        include: {
          plan: true
        }
      }
    }
  });

  if (shouldExtendMembership && payment.couponId) {
    await prisma.coupon.update({
      where: { id: payment.couponId },
      data: { usedCount: { increment: 1 } }
    });
  }

  let membership = updatedPayment.membership;

  if (shouldExtendMembership) {
    const now = new Date();
    const cycle = membership.plan.billingCycle;
    let endsAt = membership.endsAt;

    if (membership.status === "ACTIVE") {
      const base = membership.endsAt && membership.endsAt > now ? membership.endsAt : now;
      endsAt = addCycleDate(base, cycle);
    } else if (!endsAt || endsAt <= now) {
      endsAt = addCycleDate(now, cycle);
    }

    membership = await prisma.membership.update({
      where: { id: membership.id },
      data: {
        status: "ACTIVE",
        endsAt,
        user: {
          update: {
            enrollmentStatus: "ACTIVE"
          }
        }
      },
      include: {
        plan: true
      }
    });
  }

  if (shouldExtendMembership) {
    notifySubscriptionActivated({
      userId: membership.userId,
      planName: membership.plan.name,
      endsAt: membership.endsAt
    });
  } else if (nextStatus === "REFUNDED" && payment.status !== "REFUNDED") {
    notifyPaymentRefundOrCancel({
      userId: membership.userId,
      planName: membership.plan.name,
      kind: "REFUNDED"
    });
  } else if (nextStatus === "CANCELED" && payment.status !== "CANCELED") {
    notifyPaymentRefundOrCancel({
      userId: membership.userId,
      planName: membership.plan.name,
      kind: "CANCELED"
    });
  } else {
    notifySubscriptionPaymentOverdueFromPayment({
      payment: { ...updatedPayment, membership },
      previousStatus: payment.status,
      nextStatus: nextStatus
    });
  }

  return {
    payment: {
      ...updatedPayment,
      membership
    },
    membership,
    activated: shouldExtendMembership,
    syncedFromAsaas: false
  };
}

export async function syncSubscriptionPaymentFromAsaas(
  payment: PaymentWithMembership
): Promise<SubscriptionPaymentSyncResult | null> {
  if (!env.ASAAS_API_KEY) {
    return null;
  }

  if (!["PENDING", "OVERDUE"].includes(payment.status)) {
    return {
      payment,
      membership: payment.membership,
      activated: false,
      syncedFromAsaas: false
    };
  }

  const remote = payment.asaasPaymentId
    ? await getAsaasPayment(payment.asaasPaymentId)
    : await findAsaasPaymentByExternalReference(payment.id);

  if (!remote?.id) {
    return null;
  }

  const remoteStatus = asaasStatusToPaymentStatus(remote.status);

  if (remoteStatus === payment.status) {
    return {
      payment,
      membership: payment.membership,
      activated: false,
      syncedFromAsaas: true
    };
  }

  const result = await applySubscriptionPaymentConfirmation(payment, {
    status: remote.status ?? payment.status,
    asaasPaymentId: remote.id,
    paymentUrl: remote.invoiceUrl ?? remote.bankSlipUrl ?? payment.paymentUrl,
    paidAt: shouldActivateMembership(remoteStatus)
      ? resolvePaidAt({
          paymentDate: remote.paymentDate,
          confirmedDate: remote.confirmedDate
        })
      : undefined,
    // Confia no status consultado diretamente no Asaas (evita falso negativo no polling).
    amountInCents: null
  });

  return {
    ...result,
    syncedFromAsaas: true
  };
}

export async function syncPendingSubscriptionPaymentsForUser(userId: string) {
  const pendingPayments = await prisma.payment.findMany({
    where: {
      status: { in: ["PENDING", "OVERDUE"] },
      membership: { userId, deletedAt: null }
    },
    include: {
      membership: {
        include: {
          plan: true
        }
      }
    },
    orderBy: {
      dueDate: "desc"
    },
    take: 5
  });

  for (const payment of pendingPayments) {
    try {
      await syncSubscriptionPaymentFromAsaas(payment);
    } catch {
      // Mantém outros pagamentos pendentes em fila sem quebrar a requisição.
    }
  }
}
