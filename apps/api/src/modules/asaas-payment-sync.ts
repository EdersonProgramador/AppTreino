import type { Membership, Payment, Plan } from "@prisma/client";
import {
  notifySubscriptionActivated,
  notifySubscriptionPaymentOverdueFromPayment,
  notifyPaymentRefundOrCancel
} from "../email-notifications.js";
import { env } from "../env.js";
import { prisma } from "../prisma.js";
import {
  findAsaasPaymentByExternalReference,
  getAsaasPayment,
  resolveAsaasNetAmounts
} from "./asaas.client.js";
import { addCycleDate, asaasStatusToPaymentStatus, shouldActivateMembership } from "./asaas.routes.js";
import {
  accrueCoachCommissionForPayment,
  ensureCoachReferralLink,
  reverseCoachCommissionForPayment,
  syncReferralAttributionMembershipStatus
} from "./coach-affiliate.service.js";
import { syncCoachReferralEligibility } from "./coach-eligibility.js";

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
    netAmountInCents?: number | null;
    providerFeeInCents?: number | null;
  }
): Promise<SubscriptionPaymentSyncResult> {
  const nextStatus = asaasStatusToPaymentStatus(input.status);
  const wasConfirmed = payment.status === "CONFIRMED";
  const shouldActivate = shouldActivateMembership(nextStatus);
  const membershipNeedsActivation = payment.membership.status !== "ACTIVE";
  const shouldExtendMembership = shouldActivate && (!wasConfirmed || membershipNeedsActivation);

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
        : payment.paidAt,
      ...(input.netAmountInCents != null
        ? {
            netAmountInCents: input.netAmountInCents,
            providerFeeInCents: input.providerFeeInCents ?? 0
          }
        : {})
    },
    include: {
      membership: {
        include: {
          plan: true
        }
      }
    }
  });

  if (shouldExtendMembership && !wasConfirmed && payment.couponId) {
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
    await syncCoachReferralEligibility(membership.userId);
    await ensureCoachReferralLink(membership.userId);
  }

  if (shouldExtendMembership && !wasConfirmed) {
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

  if (nextStatus === "CONFIRMED") {
    await syncReferralAttributionMembershipStatus(membership.userId, membership.status);
    await accrueCoachCommissionForPayment({
      ...updatedPayment,
      membership: {
        userId: membership.userId,
        status: membership.status
      }
    });
  } else if (nextStatus === "REFUNDED") {
    await reverseCoachCommissionForPayment(updatedPayment.id);
  } else if (["CANCELED", "OVERDUE"].includes(nextStatus)) {
    await syncReferralAttributionMembershipStatus(membership.userId, membership.status);
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

  const asaasAmounts = resolveAsaasNetAmounts({
    value: remote.value,
    netValue: remote.netValue,
    fallbackGrossInCents: payment.amountInCents
  });

  if (remoteStatus === payment.status) {
    if (payment.status === "CONFIRMED" && payment.netAmountInCents == null) {
      await backfillPaymentNetFromAsaas(payment);
    }
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
    amountInCents: null,
    ...(shouldActivateMembership(remoteStatus)
      ? {
          netAmountInCents: asaasAmounts.netCents,
          providerFeeInCents: asaasAmounts.feeCents
        }
      : {})
  });

  return {
    ...result,
    syncedFromAsaas: true
  };
}

export async function backfillPaymentNetFromAsaas(
  payment: Pick<Payment, "id" | "asaasPaymentId" | "amountInCents" | "netAmountInCents">
) {
  if (!env.ASAAS_API_KEY || !payment.asaasPaymentId || payment.netAmountInCents != null) {
    return;
  }

  const remote = await getAsaasPayment(payment.asaasPaymentId);
  if (!remote?.id) {
    return;
  }

  const { netCents, feeCents } = resolveAsaasNetAmounts({
    value: remote.value,
    netValue: remote.netValue,
    fallbackGrossInCents: payment.amountInCents
  });

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      netAmountInCents: netCents,
      providerFeeInCents: feeCents
    }
  });
}

let lastAdminPanelPaymentSyncAt = 0;
const ADMIN_PANEL_PAYMENT_SYNC_MIN_INTERVAL_MS = 15_000;

/** Sincroniza cobranças recentes com o Asaas antes do painel admin ler a base. */
export async function syncSubscriptionPaymentsForAdminPanel() {
  if (!env.ASAAS_API_KEY) {
    return;
  }

  const nowMs = Date.now();
  if (nowMs - lastAdminPanelPaymentSyncAt < ADMIN_PANEL_PAYMENT_SYNC_MIN_INTERVAL_MS) {
    return;
  }
  lastAdminPanelPaymentSyncAt = nowMs;

  const since = new Date();
  since.setDate(since.getDate() - 14);

  const pendingPayments = await prisma.payment.findMany({
    where: {
      status: { in: ["PENDING", "OVERDUE"] },
      deletedAt: null,
      OR: [{ createdAt: { gte: since } }, { dueDate: { gte: since } }]
    },
    include: {
      membership: {
        include: {
          plan: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 30
  });

  for (const payment of pendingPayments) {
    try {
      await syncSubscriptionPaymentFromAsaas(payment);
    } catch {
      // Não interrompe a listagem do admin.
    }
  }

  const confirmedWithoutActiveMembership = await prisma.payment.findMany({
    where: {
      status: "CONFIRMED",
      deletedAt: null,
      createdAt: { gte: since },
      membership: {
        deletedAt: null,
        status: { not: "ACTIVE" }
      }
    },
    include: {
      membership: {
        include: {
          plan: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 20
  });

  for (const payment of confirmedWithoutActiveMembership) {
    try {
      await applySubscriptionPaymentConfirmation(payment, {
        status: "CONFIRMED",
        paidAt: payment.paidAt ?? new Date()
      });
    } catch {
      // Reparo best-effort para cadastros confirmados sem matrícula ACTIVE.
    }
  }

  const confirmedMissingNet = await prisma.payment.findMany({
    where: {
      status: "CONFIRMED",
      deletedAt: null,
      netAmountInCents: null,
      asaasPaymentId: { not: null },
      createdAt: { gte: since }
    },
    select: {
      id: true,
      asaasPaymentId: true,
      amountInCents: true,
      netAmountInCents: true
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 40
  });

  for (const payment of confirmedMissingNet) {
    try {
      await backfillPaymentNetFromAsaas(payment);
    } catch {
      // Best-effort para alinhar valor líquido com o painel Asaas.
    }
  }
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
