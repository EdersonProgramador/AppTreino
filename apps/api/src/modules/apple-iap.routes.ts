import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { isAdminStudentPreview, requireAuth } from "../auth.js";
import { env } from "../env.js";
import { prisma } from "../prisma.js";
import { resolvePlanCodeFromAppleProductId } from "./apple-iap.utils.js";
import {
  confirmAppleCheckoutPurchase,
  prepareAppleCheckoutSession,
  syncAppleMembershipFromRevenueCat
} from "./apple-iap.service.js";

const appleSessionSchema = z.object({
  planCode: z.string().trim().min(1).max(80)
});

const appleConfirmSchema = z.object({
  planCode: z.string().trim().min(1).max(80),
  productId: z.string().trim().min(3).max(200),
  transactionId: z.string().trim().min(1).max(200).optional().nullable(),
  originalTransactionId: z.string().trim().min(1).max(200).optional().nullable()
});

function requireDatabase() {
  if (!env.DATABASE_URL) {
    const error = new Error("Banco de dados não configurado para esta operação.") as Error & { statusCode: number };
    error.statusCode = 503;
    throw error;
  }
}

export async function registerAppleIapRoutes(app: FastifyInstance) {
  app.post("/checkout/apple/session", async (request, reply) => {
    requireDatabase();
    const authUser = await requireAuth(app, request);
    if (isAdminStudentPreview(authUser)) {
      return reply.code(403).send({
        message: "Checkout indisponível no modo preview do administrador.",
        code: "ADMIN_PREVIEW_READONLY"
      });
    }

    const body = appleSessionSchema.parse(request.body);
    const session = await prepareAppleCheckoutSession(authUser.id, body.planCode);
    return reply.code(session.alreadyActive ? 200 : 201).send({
      alreadyActive: session.alreadyActive,
      membership: session.membership,
      payment: session.payment,
      appleProductId: session.appleProductId
    });
  });

  app.post("/checkout/apple/confirm", async (request, reply) => {
    requireDatabase();
    const authUser = await requireAuth(app, request);
    if (isAdminStudentPreview(authUser)) {
      return reply.code(403).send({
        message: "Checkout indisponível no modo preview do administrador.",
        code: "ADMIN_PREVIEW_READONLY"
      });
    }

    const body = appleConfirmSchema.parse(request.body);
    const result = await confirmAppleCheckoutPurchase({
      userId: authUser.id,
      planCode: body.planCode,
      productId: body.productId,
      transactionId: body.transactionId,
      originalTransactionId: body.originalTransactionId
    });

    return reply.send({
      alreadyActive: result.alreadyActive,
      membership: result.membership,
      payment: result.payment
    });
  });

  app.post("/checkout/apple/restore", async (request, reply) => {
    requireDatabase();
    const authUser = await requireAuth(app, request);
    const result = await syncAppleMembershipFromRevenueCat(authUser.id);
    if (!result) {
      return reply.code(404).send({ message: "Nenhuma assinatura Apple ativa encontrada." });
    }
    return reply.send({
      alreadyActive: result.alreadyActive,
      membership: result.membership,
      payment: result.payment
    });
  });

  app.post("/webhooks/revenuecat", async (request, reply) => {
    requireDatabase();
    const authHeader = request.headers.authorization?.trim() ?? "";
    const expected = env.REVENUECAT_WEBHOOK_AUTH?.trim();
    if (expected && authHeader !== `Bearer ${expected}`) {
      return reply.code(401).send({ message: "Unauthorized webhook." });
    }

    const payload = z
      .object({
        event: z
          .object({
            type: z.string(),
            app_user_id: z.string().optional().nullable(),
            product_id: z.string().optional().nullable(),
            transaction_id: z.string().optional().nullable(),
            original_transaction_id: z.string().optional().nullable()
          })
          .passthrough()
      })
      .passthrough()
      .parse(request.body ?? {});

    const userId = payload.event.app_user_id?.trim();
    if (!userId) {
      return reply.send({ ok: true, ignored: true });
    }

    const eventType = payload.event.type;
    const renewEvents = new Set([
      "INITIAL_PURCHASE",
      "RENEWAL",
      "UNCANCELLATION",
      "SUBSCRIPTION_EXTENDED",
      "PRODUCT_CHANGE"
    ]);
    const cancelEvents = new Set(["CANCELLATION", "EXPIRATION", "BILLING_ISSUE"]);

    if (renewEvents.has(eventType)) {
      const productId = payload.event.product_id?.trim();
      if (productId) {
        const plans = await prisma.plan.findMany({ where: { deletedAt: null } });
        const planCode = resolvePlanCodeFromAppleProductId(productId, plans);
        if (planCode) {
          await confirmAppleCheckoutPurchase({
            userId,
            planCode,
            productId,
            transactionId: payload.event.transaction_id,
            originalTransactionId: payload.event.original_transaction_id
          });
        } else {
          await syncAppleMembershipFromRevenueCat(userId);
        }
      } else {
        await syncAppleMembershipFromRevenueCat(userId);
      }
    } else if (cancelEvents.has(eventType)) {
      await prisma.membership.updateMany({
        where: {
          userId,
          status: "ACTIVE",
          deletedAt: null,
          payments: { some: { paymentProvider: "APPLE" } }
        },
        data: { status: "CANCELED" }
      });
    }

    return reply.send({ ok: true });
  });
}
