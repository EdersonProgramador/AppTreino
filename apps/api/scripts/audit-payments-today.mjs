import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
config({ path: resolve(rootDir, ".env") });
config({ path: resolve(rootDir, "apps/api/.env") });

const prisma = new PrismaClient();

const start = new Date("2026-09-03T03:00:00.000Z");
const end = new Date("2026-09-05T02:59:59.999Z");

try {
  const payments = await prisma.payment.findMany({
    where: {
      deletedAt: null,
      OR: [
        { createdAt: { gte: start, lte: end } },
        { paidAt: { gte: start, lte: end } },
        { updatedAt: { gte: start, lte: end } }
      ]
    },
    include: {
      membership: {
        include: {
          plan: { select: { code: true, name: true, priceInCents: true, billingCycle: true } },
          user: { select: { id: true, name: true, email: true, phone: true, enrollmentStatus: true } }
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  const formatBRL = (cents) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;

  console.log(
    JSON.stringify(
      {
        window: { start: start.toISOString(), end: end.toISOString() },
        count: payments.length,
        payments: payments.map((payment) => ({
          id: payment.id,
          status: payment.status,
          amount: formatBRL(payment.amountInCents),
          amountInCents: payment.amountInCents,
          originalAmountInCents: payment.originalAmountInCents,
          discountInCents: payment.discountInCents,
          couponCode: payment.couponCode,
          asaasPaymentId: payment.asaasPaymentId,
          paymentUrl: payment.paymentUrl ? "[set]" : null,
          dueDate: payment.dueDate,
          paidAt: payment.paidAt,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
          plan: payment.membership.plan,
          membership: {
            id: payment.membership.id,
            status: payment.membership.status,
            startsAt: payment.membership.startsAt,
            endsAt: payment.membership.endsAt
          },
          user: payment.membership.user
        }))
      },
      null,
      2
    )
  );
} finally {
  await prisma.$disconnect();
}
