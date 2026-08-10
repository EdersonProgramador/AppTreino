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

function checkoutStatusToPaymentStatus(status?: string) {
  if (status === "PAID") return "CONFIRMED";
  if (status === "CANCELLED") return "CANCELED";
  if (status === "EXPIRED") return "OVERDUE";
  return "PENDING";
}

function shouldActivateMembership(status: string) {
  return status === "CONFIRMED";
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

    console.log("[Asaas Webhook] Recebido", {
      tokenMatches: webhookToken === env.ASAAS_WEBHOOK_TOKEN,
      hasDatabase: Boolean(env.DATABASE_URL),
      body: request.body
    });

    if (env.ASAAS_WEBHOOK_TOKEN && webhookToken !== env.ASAAS_WEBHOOK_TOKEN) {
      console.log("[Asaas Webhook] Token inválido");
      return reply.code(401).send({
        error: "Invalid webhook token"
      });
    }

    if (env.DATABASE_URL) {
      const payload = request.body as {
        event?: string;
        payment?: {
          id?: string;
          status?: string;
          externalReference?: string;
          invoiceUrl?: string;
          bankSlipUrl?: string;
          paymentDate?: string;
          confirmedDate?: string;
        };
        checkout?: {
          id?: string;
          status?: string;
          externalReference?: string;
          link?: string;
        };
      };

      const asaasPayment = payload.payment;
      const checkout = payload.checkout;
      const paymentId = asaasPayment?.externalReference ?? checkout?.externalReference ?? null;
      const status = asaasPayment
        ? asaasStatusToPaymentStatus(asaasPayment?.status)
        : checkoutStatusToPaymentStatus(checkout?.status);
      const where = paymentId
        ? { id: paymentId }
        : asaasPayment?.id
          ? { asaasPaymentId: asaasPayment.id }
          : null;

      console.log("[Asaas Webhook] Processando", { paymentId, status, where });

      if (where) {
        const existing = await prisma.payment.findFirst({ where });

        if (existing) {
          console.log("[Asaas Webhook] Pagamento encontrado", { id: existing.id, membershipId: existing.membershipId });
          const payment = await prisma.payment.update({
            where: { id: existing.id },
            data: {
              ...(asaasPayment?.id ? { asaasPaymentId: asaasPayment.id } : {}),
              ...(checkout?.link ? { paymentUrl: checkout.link } : {}),
              status,
              paidAt: shouldActivateMembership(status)
                ? new Date(asaasPayment?.paymentDate ?? asaasPayment?.confirmedDate ?? Date.now())
                : undefined
            }
          });

          if (shouldActivateMembership(status)) {
            console.log("[Asaas Webhook] Ativando membership", { membershipId: payment.membershipId });
            await prisma.membership.update({
              where: {
                id: payment.membershipId
              },
              data: {
                status: "ACTIVE",
                user: {
                  update: {
                    enrollmentStatus: "ACTIVE"
                  }
                }
              }
            });
          }
        } else {
          console.log("[Asaas Webhook] Pagamento não encontrado para", where);
        }
      }
    }

    return reply.code(200).send({
      received: true
    });
  });
}
