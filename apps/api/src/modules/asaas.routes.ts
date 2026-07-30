import type { FastifyInstance } from "fastify";
import { env } from "../env.js";
import { prisma } from "../prisma.js";

function asaasStatusToPaymentStatus(status?: string) {
  if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(status ?? "")) return "CONFIRMED";
  if (["OVERDUE"].includes(status ?? "")) return "OVERDUE";
  if (["REFUNDED", "REFUND_REQUESTED", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE"].includes(status ?? "")) {
    return "REFUNDED";
  }
  if (["DELETED"].includes(status ?? "")) return "CANCELED";
  return "PENDING";
}

function shouldActivateMembership(status: string) {
  return status === "CONFIRMED";
}

export async function registerAsaasRoutes(app: FastifyInstance) {
  app.post("/webhooks/asaas", async (request, reply) => {
    const webhookToken = request.headers["asaas-access-token"];

    if (env.ASAAS_WEBHOOK_TOKEN && webhookToken !== env.ASAAS_WEBHOOK_TOKEN) {
      return reply.code(401).send({
        error: "Invalid webhook token"
      });
    }

    request.log.info({ payload: request.body }, "Asaas webhook received");

    if (env.DATABASE_URL) {
      const payload = request.body as {
        payment?: {
          id?: string;
          status?: string;
          externalReference?: string;
          invoiceUrl?: string;
          bankSlipUrl?: string;
          paymentDate?: string;
          confirmedDate?: string;
        };
      };

      const asaasPayment = payload.payment;
      const paymentId = asaasPayment?.externalReference;
      const status = asaasStatusToPaymentStatus(asaasPayment?.status);

      if (paymentId || asaasPayment?.id) {
        const payment = await prisma.payment.update({
          where: paymentId ? { id: paymentId } : { asaasPaymentId: asaasPayment?.id },
          data: {
            asaasPaymentId: asaasPayment?.id,
            status,
            paymentUrl: asaasPayment?.invoiceUrl ?? asaasPayment?.bankSlipUrl,
            paidAt: shouldActivateMembership(status)
              ? new Date(asaasPayment?.paymentDate ?? asaasPayment?.confirmedDate ?? Date.now())
              : undefined
          }
        });

        if (shouldActivateMembership(status)) {
          await prisma.membership.update({
            where: {
              id: payment.membershipId
            },
            data: {
              status: "ACTIVE"
            }
          });
        }
      }
    }

    return reply.code(200).send({
      received: true
    });
  });
}
