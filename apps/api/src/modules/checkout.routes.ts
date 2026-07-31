import type { FastifyInstance } from "fastify";
import { initialPlans } from "@app-treino/shared";
import { z } from "zod";
import { hashPassword, toAuthUser } from "../auth.js";
import { env } from "../env.js";
import { prisma } from "../prisma.js";

const checkoutRegisterSchema = z
  .object({
    name: z.string().trim().min(2, "Informe seu nome."),
    email: z.string().trim().email("Informe um e-mail valido.").optional().or(z.literal("")),
    phone: z.string().trim().min(8, "Informe um telefone valido.").optional().or(z.literal("")),
    password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres."),
    planCode: z.enum(["monthly", "annual"], {
      required_error: "Escolha um plano para continuar."
    }),
    billingType: z.enum(["BOLETO", "CREDIT_CARD", "PIX", "UNDEFINED"]).default("UNDEFINED")
  })
  .superRefine((data, ctx) => {
    if (!data.email && !data.phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe e-mail ou telefone para continuar."
      });
    }
  });

function requireDatabase() {
  if (!env.DATABASE_URL) {
    const error = new Error("Banco de dados nao configurado para esta operacao.") as Error & {
      statusCode: number;
    };
    error.statusCode = 503;
    throw error;
  }
}

function addCycleDate(start: Date, cycle: "MONTHLY" | "YEARLY") {
  const end = new Date(start);
  if (cycle === "YEARLY") {
    end.setFullYear(end.getFullYear() + 1);
  } else {
    end.setMonth(end.getMonth() + 1);
  }
  return end;
}

function todayUtcOnly() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function createAsaasPaymentLink(input: {
  paymentId: string;
  customerName: string;
  amountInCents: number;
  dueDate: Date;
  billingType: "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED";
}) {
  if (!env.ASAAS_API_KEY) {
    return null;
  }

  const response = await fetch(`${env.ASAAS_API_URL}/paymentLinks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: env.ASAAS_API_KEY
    },
    body: JSON.stringify({
      name: `App Treino - ${input.customerName}`,
      description: `Pagamento App Treino - ${input.customerName}`,
      billingType: input.billingType,
      chargeType: "DETACHED",
      value: input.amountInCents / 100,
      dueDateLimitDays: 10,
      endDate: input.dueDate.toISOString().slice(0, 10),
      externalReference: input.paymentId
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Falha ao criar link de pagamento no Asaas: ${message}`);
  }

  return (await response.json()) as {
    id?: string;
    url?: string;
    status?: string;
  };
}

function asaasStatusToPaymentStatus(status?: string) {
  if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(status ?? "")) return "CONFIRMED";
  if (["OVERDUE"].includes(status ?? "")) return "OVERDUE";
  if (["REFUNDED", "REFUND_REQUESTED", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE"].includes(status ?? "")) {
    return "REFUNDED";
  }
  if (["DELETED"].includes(status ?? "")) return "CANCELED";
  return "PENDING";
}

export async function registerCheckoutRoutes(app: FastifyInstance) {
  app.post("/checkout/register", async (request, reply) => {
    requireDatabase();
    const body = checkoutRegisterSchema.parse(request.body);
    const email = body.email ? body.email.toLowerCase() : null;
    const phone = body.phone || null;
    const fallbackEmail = email ?? (phone ? `phone-${phone.replace(/[^a-z0-9]+/gi, "").toLowerCase()}@app-treino.local` : null);
    const planSeed = initialPlans.find((plan) => plan.code === body.planCode);

    if (!planSeed) {
      return reply.code(400).send({
        message: "Plano invalido."
      });
    }

    const existingUser =
      (email ? await prisma.user.findUnique({ where: { email } }) : null) ??
      (phone ? await prisma.user.findUnique({ where: { phone } }) : null);

    if (existingUser) {
      return reply.code(409).send({
        message: "E-mail ja cadastrado. Faca login para continuar o pagamento."
      });
    }

    const startsAt = todayUtcOnly();
    const plan = await prisma.plan.upsert({
      where: { code: planSeed.code },
      create: planSeed,
      update: {}
    });

    const { user, payment } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
          data: {
            name: body.name,
            email: fallbackEmail,
            phone,
            passwordHash: await hashPassword(body.password),
            role: "USER",
            profile: {
              create: { phone }
            }
          }
        });

      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          planId: plan.id,
          status: "PENDING",
          startsAt,
          endsAt: addCycleDate(startsAt, plan.billingCycle)
        }
      });

      const payment = await tx.payment.create({
        data: {
          membershipId: membership.id,
          amountInCents: plan.priceInCents,
          dueDate: startsAt
        }
      });

      await tx.attendanceRecord.create({
        data: {
          userId: user.id,
          date: startsAt
        }
      });

      return { user, payment };
    });

    const asaasPayment = await createAsaasPaymentLink({
      paymentId: payment.id,
      customerName: user.name,
      amountInCents: payment.amountInCents,
      dueDate: payment.dueDate,
      billingType: body.billingType
    });

    const updatedPayment = asaasPayment
      ? await prisma.payment.update({
          where: { id: payment.id },
          data: {
            asaasPaymentId: asaasPayment.id,
            paymentUrl: asaasPayment.url,
            status: asaasStatusToPaymentStatus(asaasPayment.status)
          }
        })
      : payment;

    const authUser = toAuthUser(user);
    const token = app.jwt.sign(authUser);

    return reply.code(201).send({
      token,
      user: authUser,
      payment: updatedPayment
    });
  });
}
