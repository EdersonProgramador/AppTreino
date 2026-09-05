import type { Order, OrderStatus, Payment, User } from "@prisma/client";
import {
  buildActivatePaymentUrl,
  isDeliverableEmail,
  queueEmail,
  sendOrderConfirmedEmail,
  sendOrderPlacedEmail,
  sendOrderShippingEmail,
  sendPaymentOverdueEmail,
  sendPaymentPendingEmail,
  sendRefundOrCancellationEmail,
  sendSubscriptionActiveEmail,
  sendSupportReplyEmail,
  sendWelcomeEmail
} from "./email.js";
import { prisma } from "./prisma.js";
import { ORDER_PAID_STATUSES } from "./modules/commerce.utils.js";

type UserLike = Pick<User, "id" | "name"> & { email?: string | null };

function summarizeOrderItems(items: Array<{ productName: string; quantity: number }>) {
  if (items.length === 0) return "Pedido vitrine";
  const first = items[0];
  const suffix = items.length > 1 ? ` +${items.length - 1} item(ns)` : "";
  return `${first.productName}${first.quantity > 1 ? ` (${first.quantity}x)` : ""}${suffix}`;
}

async function loadUser(userId: string): Promise<UserLike | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true }
  });
}

function queueForUser(user: UserLike | null | undefined, task: (recipient: UserLike) => Promise<void>, context: string) {
  if (!user || !isDeliverableEmail(user.email)) return;
  queueEmail(() => task(user), context);
}

export function notifyWelcomeEmail(user: UserLike) {
  queueForUser(user, (recipient) => sendWelcomeEmail(recipient.email!, recipient.name), "welcome");
}

export function notifySubscriptionActivated(input: {
  userId: string;
  planName: string;
  endsAt?: Date | null;
}) {
  queueEmail(async () => {
    const user = await loadUser(input.userId);
    if (!user || !isDeliverableEmail(user.email)) return;
    await sendSubscriptionActiveEmail(user.email!, user.name, input.planName, input.endsAt);
  }, "subscription-active");
}

export function notifySubscriptionPaymentPending(input: {
  userId: string;
  planName: string;
  amountInCents: number;
  dueDate: Date;
  paymentUrl?: string | null;
}) {
  queueEmail(async () => {
    const user = await loadUser(input.userId);
    if (!user || !isDeliverableEmail(user.email)) return;
    await sendPaymentPendingEmail({
      to: user.email!,
      userName: user.name,
      planName: input.planName,
      amountInCents: input.amountInCents,
      dueDate: input.dueDate,
      paymentUrl: input.paymentUrl ?? buildActivatePaymentUrl()
    });
  }, "subscription-pending");
}

export function notifySubscriptionPaymentOverdue(input: {
  userId: string;
  planName: string;
  amountInCents: number;
  paymentUrl?: string | null;
}) {
  queueEmail(async () => {
    const user = await loadUser(input.userId);
    if (!user || !isDeliverableEmail(user.email)) return;
    await sendPaymentOverdueEmail({
      to: user.email!,
      userName: user.name,
      planName: input.planName,
      amountInCents: input.amountInCents,
      paymentUrl: input.paymentUrl ?? buildActivatePaymentUrl()
    });
  }, "subscription-overdue");
}

export function notifySubscriptionPaymentOverdueFromPayment(input: {
  payment: Payment & { membership?: { userId: string; plan?: { name?: string | null } | null } | null };
  previousStatus: Payment["status"];
  nextStatus: Payment["status"];
}) {
  const userId = input.payment.membership?.userId;
  const planName = input.payment.membership?.plan?.name ?? "Assinatura";
  if (!userId) return;

  if (input.nextStatus === "OVERDUE" && input.previousStatus !== "OVERDUE") {
    notifySubscriptionPaymentOverdue({
      userId,
      planName,
      amountInCents: input.payment.amountInCents,
      paymentUrl: input.payment.paymentUrl
    });
  }
}

export function notifyOrderPlaced(order: Order & { items: Array<{ productName: string; quantity: number }>; user: UserLike }) {
  queueForUser(
    order.user,
    (recipient) =>
      sendOrderPlacedEmail({
        to: recipient.email!,
        userName: recipient.name,
        orderId: order.id,
        amountInCents: order.amountInCents,
        itemSummary: summarizeOrderItems(order.items),
        paymentUrl: order.paymentUrl
      }),
    "order-placed"
  );
}

export function notifyOrderStatusChange(input: {
  order: Order & {
    items: Array<{ productName: string; quantity: number }>;
    user: UserLike;
    shippingAddress?: string | null;
  };
  previousStatus: OrderStatus;
  nextStatus: OrderStatus;
}) {
  const { order, previousStatus, nextStatus } = input;
  if (nextStatus === previousStatus) return;

  const itemSummary = summarizeOrderItems(order.items);

  if (nextStatus === "CONFIRMED" && !ORDER_PAID_STATUSES.includes(previousStatus)) {
    queueForUser(
      order.user,
      (recipient) =>
        sendOrderConfirmedEmail({
          to: recipient.email!,
          userName: recipient.name,
          orderId: order.id,
          amountInCents: order.amountInCents,
          itemSummary
        }),
      "order-confirmed"
    );
    return;
  }

  if ((nextStatus === "READY" || nextStatus === "DELIVERED") && previousStatus !== nextStatus) {
    queueForUser(
      order.user,
      (recipient) =>
        sendOrderShippingEmail({
          to: recipient.email!,
          userName: recipient.name,
          orderId: order.id,
          itemSummary,
          status: nextStatus,
          shippingAddress: order.shippingAddress
        }),
      "order-shipping"
    );
    return;
  }

  if (nextStatus === "REFUNDED" && previousStatus !== "REFUNDED") {
    queueForUser(
      order.user,
      (recipient) =>
        sendRefundOrCancellationEmail({
          to: recipient.email!,
          userName: recipient.name,
          subjectLine: "Reembolso aprovado",
          detail: `O reembolso do pedido ${itemSummary} foi processado. O valor será estornado conforme o prazo da operadora de pagamento.`
        }),
      "order-refund"
    );
  }
}

export function notifySupportReply(input: { user: UserLike; ticketSubject: string; messagePreview: string }) {
  queueForUser(
    input.user,
    (recipient) =>
      sendSupportReplyEmail({
        to: recipient.email!,
        userName: recipient.name,
        ticketSubject: input.ticketSubject,
        messagePreview: input.messagePreview
      }),
    "support-reply"
  );
}

export function notifyPaymentRefundOrCancel(input: {
  userId: string;
  planName?: string | null;
  kind: "REFUNDED" | "CANCELED";
}) {
  queueEmail(async () => {
    const user = await loadUser(input.userId);
    if (!user || !isDeliverableEmail(user.email)) return;

    const planLabel = input.planName?.trim() ? ` do plano ${input.planName.trim()}` : "";
    if (input.kind === "REFUNDED") {
      await sendRefundOrCancellationEmail({
        to: user.email!,
        userName: user.name,
        subjectLine: "Reembolso aprovado",
        detail: `Confirmamos o reembolso do pagamento${planLabel}. O valor será estornado conforme o prazo da operadora.`
      });
      return;
    }

    await sendRefundOrCancellationEmail({
      to: user.email!,
      userName: user.name,
      subjectLine: "Assinatura cancelada",
      detail: `Sua assinatura${planLabel} foi cancelada. Se precisar de ajuda, responda este e-mail ou fale conosco pelo suporte no app.`
    });
  }, `payment-${input.kind.toLowerCase()}`);
}

export function notifyMembershipCanceled(input: { userId: string; planName?: string | null }) {
  notifyPaymentRefundOrCancel({ userId: input.userId, planName: input.planName, kind: "CANCELED" });
}
