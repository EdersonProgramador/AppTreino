import type { FastifyInstance } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "../env.js";
import { prisma } from "../prisma.js";
import { parseOrderExternalReference, parsePurchaseExternalReference } from "./asaas.client.js";
import {
  applyOrderStatusSideEffects,
  applyPurchaseStatusSideEffects,
  resolveOrderTimestamps,
  resolvePurchaseTimestamps
} from "./commerce.utils.js";
import type { OrderStatus, PurchaseStatus } from "@prisma/client";

export function asaasStatusToPaymentStatus(status?: string) {
  if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(status ?? "")) return "CONFIRMED";
  if (["OVERDUE"].includes(status ?? "")) return "OVERDUE";
  if (["REFUNDED", "REFUND_REQUESTED", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE"].includes(status ?? "")) {
    return "REFUNDED";
  }
  if (["DELETED"].includes(status ?? "")) return "CANCELED";
  return "PENDING";
}

function checkoutStatusToPaymentStatus(status?: string) {
  if (status === "PAID") return "CONFIRMED";
  if (status === "CANCELLED") return "CANCELED";
  if (status === "EXPIRED") return "OVERDUE";
  return "PENDING";
}

export function shouldActivateMembership(status: string) {
  return status === "CONFIRMED";
}

function mapAsaasStatusToPurchaseStatus(status: string): PurchaseStatus | null {
  if (status === "CONFIRMED") return "CONFIRMED";
  if (status === "REFUNDED") return "REFUNDED";
  if (status === "CANCELED") return "CANCELED";
  return null;
}

function mapAsaasStatusToOrderStatus(status: string): OrderStatus | null {
  if (status === "CONFIRMED") return "CONFIRMED";
  if (status === "REFUNDED") return "REFUNDED";
  if (status === "CANCELED") return "CANCELED";
  return null;
}

export function addCycleDate(start: Date, cycle: "MONTHLY" | "YEARLY") {
  const end = new Date(start);
  if (cycle === "YEARLY") {
    end.setFullYear(end.getFullYear() + 1);
  } else {
    end.setMonth(end.getMonth() + 1);
  }
  return end;
}

const asaasWebhookSchema = z
  .object({
    event: z.string().optional(),
    payment: z
      .object({
        id: z.string().optional(),
        status: z.string().optional(),
        externalReference: z.string().optional(),
        invoiceUrl: z.string().optional(),
        bankSlipUrl: z.string().optional(),
        paymentDate: z.string().optional(),
        confirmedDate: z.string().optional(),
        value: z.union([z.number(), z.string()]).optional()
      })
      .optional(),
    checkout: z
      .object({
        id: z.string().optional(),
        status: z.string().optional(),
        externalReference: z.string().optional(),
        link: z.string().optional()
      })
      .optional()
  })
  .superRefine((data, ctx) => {
    const payment = data.payment;
    const checkout = data.checkout;
    const status = payment
      ? asaasStatusToPaymentStatus(payment.status)
      : checkoutStatusToPaymentStatus(checkout?.status);

    if (shouldActivateMembership(status)) {
      if (payment && (payment.value == null || payment.value === "")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["payment", "value"],
          message: "Valor do pagamento é obrigatório para confirmação."
        });
      }

      const externalReference = payment?.externalReference ?? checkout?.externalReference;
      const asaasId = payment?.id ?? checkout?.id;

      if (!externalReference && !asaasId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["payment"],
          message: "Referência externa do pagamento é obrigatória."
        });
      }
    }
  });

function requireDatabase() {
  if (!env.DATABASE_URL) {
    const error = new Error("Banco de dados não configurado para esta operação.") as Error & {
      statusCode: number;
    };
    error.statusCode = 503;
    throw error;
  }
}

function tokenMatches(candidate: unknown, expected: string): boolean {
  const candidateBuffer = Buffer.from(String(candidate ?? ""));
  const expectedBuffer = Buffer.from(expected);

  return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
}

export async function registerAsaasRoutes(app: FastifyInstance) {
  app.get("/webhooks/asaas", async (_request, reply) => {
    return reply.code(200).send({
      received: true
    });
  });

  app.get("/asaas-callback-redirect", async (request, reply) => {
    const webOrigin = env.WEB_ORIGIN.split(",")[0]?.trim() ?? env.WEB_ORIGIN;
    const query = new URLSearchParams(request.query as Record<string, string>).toString();
    const redirectUrl = `${webOrigin}/?${query ? `${query}&` : ""}asaas_callback=1`;
    return reply.redirect(redirectUrl);
  });

  app.post("/webhooks/asaas", async (request, reply) => {
    const webhookToken = request.headers["asaas-access-token"];

    if (!env.ASAAS_WEBHOOK_TOKEN) {
      return reply.code(401).send({
        error: "Webhook do Asaas não configurado no servidor."
      });
    }

    if (!tokenMatches(webhookToken, env.ASAAS_WEBHOOK_TOKEN)) {
      return reply.code(401).send({
        error: "Invalid webhook token"
      });
    }

    requireDatabase();

    const parsed = asaasWebhookSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid webhook payload",
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
      });
    }

    const asaasPayment = parsed.data.payment;
    const checkout = parsed.data.checkout;
    const paymentId = asaasPayment?.externalReference ?? checkout?.externalReference ?? null;
    const status = asaasPayment
      ? asaasStatusToPaymentStatus(asaasPayment.status)
      : checkoutStatusToPaymentStatus(checkout?.status);
    const amountInCents =
      asaasPayment?.value != null && asaasPayment.value !== ""
        ? Math.round(Number(asaasPayment.value) * 100)
        : null;

    request.log.info(
      {
        event: parsed.data.event ?? asaasPayment?.status ?? checkout?.status ?? "unknown",
        paymentId: asaasPayment?.id ?? checkout?.id
      },
      "Asaas webhook received"
    );

    if (!paymentId && !asaasPayment?.id && !checkout?.id) {
      return reply.code(200).send({
        received: true
      });
    }

    const orderRefId = parseOrderExternalReference(paymentId);
    if (orderRefId) {
      const order = await prisma.order.findFirst({
        where: { id: orderRefId, deletedAt: null },
        include: { items: true }
      });
      if (!order) {
        request.log.warn({ externalReference: paymentId }, "Asaas webhook order not found");
        return reply.code(200).send({ received: true, ignored: true });
      }
      if (shouldActivateMembership(status) && amountInCents != null && amountInCents !== order.amountInCents) {
        return reply.code(400).send({ error: "Payment value mismatch" });
      }
      const nextOrderStatus = mapAsaasStatusToOrderStatus(status);
      const timestamps = resolveOrderTimestamps(nextOrderStatus ?? undefined, {
        paidAt: order.paidAt,
        fulfilledAt: order.fulfilledAt
      });
      const updatedOrder = await prisma.order.update({
        where: { id: order.id },
        data: {
          ...(asaasPayment?.id || checkout?.id
            ? { asaasPaymentId: asaasPayment?.id ?? checkout?.id }
            : {}),
          paymentUrl: asaasPayment?.invoiceUrl ?? asaasPayment?.bankSlipUrl ?? checkout?.link ?? order.paymentUrl,
          ...(nextOrderStatus ? { status: nextOrderStatus, ...timestamps } : {})
        }
      });
      if (nextOrderStatus && nextOrderStatus !== order.status) {
        await applyOrderStatusSideEffects(order, order.status, nextOrderStatus);
      }
      return reply.code(200).send({ received: true, orderId: updatedOrder.id });
    }

    const purchaseRefId = parsePurchaseExternalReference(paymentId);
    if (purchaseRefId || !paymentId) {
      const purchase = await prisma.purchase.findFirst({
        where: purchaseRefId
          ? { id: purchaseRefId, deletedAt: null }
          : asaasPayment?.id
            ? { asaasPaymentId: asaasPayment.id, deletedAt: null }
            : { asaasPaymentId: checkout?.id, deletedAt: null }
      });

      if (purchase) {
        if (shouldActivateMembership(status) && amountInCents != null && amountInCents !== purchase.amountInCents) {
          return reply.code(400).send({
            error: "Payment value mismatch"
          });
        }

        const nextPurchaseStatus = mapAsaasStatusToPurchaseStatus(status);
        const timestamps = resolvePurchaseTimestamps(nextPurchaseStatus ?? undefined, {
          paidAt: purchase.paidAt,
          fulfilledAt: purchase.fulfilledAt
        });

        const updatedPurchase = await prisma.purchase.update({
          where: { id: purchase.id },
          data: {
            ...(asaasPayment?.id || checkout?.id
              ? { asaasPaymentId: asaasPayment?.id ?? checkout?.id }
              : {}),
            paymentUrl: asaasPayment?.invoiceUrl ?? asaasPayment?.bankSlipUrl ?? checkout?.link ?? purchase.paymentUrl,
            ...(nextPurchaseStatus
              ? {
                  status: nextPurchaseStatus,
                  ...timestamps
                }
              : {})
          }
        });

        if (nextPurchaseStatus && nextPurchaseStatus !== purchase.status) {
          await applyPurchaseStatusSideEffects(purchase, purchase.status, nextPurchaseStatus);
        }

        return reply.code(200).send({
          received: true,
          purchaseId: updatedPurchase.id
        });
      }

      if (purchaseRefId) {
        request.log.warn(
          {
            asaasPaymentId: asaasPayment?.id ?? checkout?.id,
            externalReference: paymentId
          },
          "Asaas webhook purchase not found"
        );
        return reply.code(200).send({
          received: true,
          ignored: true
        });
      }
    }

    const payment = await prisma.payment.findFirst({
      where: paymentId
        ? { id: paymentId }
        : asaasPayment?.id
          ? { asaasPaymentId: asaasPayment.id }
          : { asaasPaymentId: checkout?.id }
    });

    if (!payment) {
      request.log.warn(
        {
          asaasPaymentId: asaasPayment?.id ?? checkout?.id,
          externalReference: paymentId
        },
        "Asaas webhook payment not found"
      );
      return reply.code(200).send({
        received: true,
        ignored: true
      });
    }

    if (shouldActivateMembership(status) && amountInCents != null && amountInCents !== payment.amountInCents) {
      return reply.code(400).send({
        error: "Payment value mismatch"
      });
    }

    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        ...(asaasPayment?.id ? { asaasPaymentId: asaasPayment.id } : {}),
        status,
        paymentUrl: asaasPayment?.invoiceUrl ?? asaasPayment?.bankSlipUrl ?? checkout?.link,
        paidAt: shouldActivateMembership(status)
          ? new Date(asaasPayment?.paymentDate ?? asaasPayment?.confirmedDate ?? Date.now())
          : undefined
      }
    });

    const shouldExtendMembership = shouldActivateMembership(status) && payment.status !== "CONFIRMED";

    if (shouldExtendMembership && payment.couponId) {
      await prisma.coupon.update({
        where: { id: payment.couponId },
        data: { usedCount: { increment: 1 } }
      });
    }

    if (shouldExtendMembership) {
      const membership = await prisma.membership.findUnique({
        where: { id: payment.membershipId },
        include: {
          plan: true
        }
      });

      if (membership) {
        const now = new Date();
        const cycle = membership.plan.billingCycle;
        let endsAt = membership.endsAt;

        if (membership.status === "ACTIVE") {
          const base = membership.endsAt && membership.endsAt > now ? membership.endsAt : now;
          endsAt = addCycleDate(base, cycle);
        } else if (!endsAt || endsAt <= now) {
          endsAt = addCycleDate(now, cycle);
        }

        await prisma.membership.update({
          where: {
            id: membership.id
          },
          data: {
            status: "ACTIVE",
            endsAt,
            user: {
              update: {
                enrollmentStatus: "ACTIVE"
              }
            }
          }
        });
      }
    }

    return reply.code(200).send({
      received: true,
      paymentId: updatedPayment.id
    });
  });
}
