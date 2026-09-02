import type { FastifyInstance, FastifyReply } from "fastify";
import type { PaymentStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { hashPassword, isAdminStudentPreview, requireAuth, toAuthUser } from "../auth.js";
import { env } from "../env.js";
import { prisma } from "../prisma.js";
import { subscriptionCheckoutCallbacks, tryCreateAsaasCheckout } from "./asaas.client.js";
import { asaasStatusToPaymentStatus } from "./asaas.routes.js";
import {
  asaasCheckoutItemDescription,
  asaasCheckoutItemName,
  evaluateSandboxConfirmGate,
  incrementSubscriptionCouponUsage,
  canReuseAsaasCheckoutUrl,
  getAsaasCheckoutAmountError,
  normalizeCheckoutCouponInput,
  pendingCheckoutPricingMatches,
  resolveCheckoutSessionPricing,
  resolveSubscriptionCheckoutPricing
} from "./checkout.utils.js";

const planCodeSchema = z.string().trim().min(1).max(80);

const checkoutRegisterSchema = z
  .object({
    name: z.string().trim().min(2, "Informe seu nome."),
    email: z.string().trim().email("Informe um e-mail valido.").optional().or(z.literal("")),
    phone: z.string().trim().min(8, "Informe um telefone valido.").optional().or(z.literal("")),
    password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres."),
    gender: z.enum(["MALE", "FEMALE"], {
      required_error: "Selecione o sexo para continuar."
    }),
    birthDate: z.string().optional().or(z.literal("")),
    objective: z.string().min(3).optional(),
    level: z.string().min(3).optional(),
    daysPerWeek: z.coerce.number().int().min(2).max(7).optional(),
    equipmentTags: z.array(z.string().min(1)).optional(),
    planCode: planCodeSchema,
    billingType: z.enum(["BOLETO", "CREDIT_CARD", "PIX", "UNDEFINED"]).default("UNDEFINED"),
    couponCode: z.string().trim().max(40).optional().nullable(),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: "Aceite os Termos de Uso para continuar." })
    }),
    acceptPrivacy: z.literal(true, {
      errorMap: () => ({ message: "Aceite a Política de Privacidade para continuar." })
    })
  })
  .superRefine((data, ctx) => {
    if (!data.email && !data.phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe e-mail ou telefone para continuar."
      });
    }
  });

const checkoutSessionSchema = z.object({
  planCode: planCodeSchema,
  billingType: z.enum(["BOLETO", "CREDIT_CARD", "PIX", "UNDEFINED"]).default("UNDEFINED"),
  couponCode: z.string().trim().max(40).optional().nullable()
});

const checkoutSandboxConfirmationSchema = z.object({
  paymentId: z.string().min(1)
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

async function resolveCheckoutPlan(planCode: string) {
  const plan = await prisma.plan.findFirst({
    where: { code: planCode, deletedAt: null },
    include: { coupon: true }
  });
  if (!plan) {
    const error = new Error("Plano inválido ou indisponível.") as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }
  return plan;
}

function buildPaymentData(pricing: Awaited<ReturnType<typeof resolveSubscriptionCheckoutPricing>>, dueDate: Date) {
  return {
    amountInCents: pricing.amountInCents,
    originalAmountInCents: pricing.originalAmountInCents,
    discountInCents: pricing.discountInCents,
    couponId: pricing.couponId,
    couponCode: pricing.couponCode,
    dueDate
  };
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

function checkoutAmountErrorReply(amountInCents: number, reply: FastifyReply) {
  const message = getAsaasCheckoutAmountError(amountInCents);
  if (!message) return null;
  return reply.code(400).send({ message, paymentProviderError: message });
}

const pendingPaymentStatuses: PaymentStatus[] = ["PENDING", "OVERDUE"];

const pendingMembershipInclude = {
  plan: true,
  payments: {
    where: {
      status: {
        in: pendingPaymentStatuses
      }
    },
    orderBy: {
      dueDate: "desc"
    },
    take: 1
  }
} satisfies Prisma.MembershipInclude;

async function findPendingMembershipForCheckout(userId: string, planId: string) {
  const forSelectedPlan = await prisma.membership.findFirst({
    where: {
      userId,
      planId,
      deletedAt: null,
      status: {
        in: ["PENDING", "OVERDUE"]
      }
    },
    include: pendingMembershipInclude,
    orderBy: {
      createdAt: "desc"
    }
  });

  if (forSelectedPlan) return forSelectedPlan;

  return prisma.membership.findFirst({
    where: {
      userId,
      deletedAt: null,
      status: {
        in: ["PENDING", "OVERDUE"]
      }
    },
    include: pendingMembershipInclude,
    orderBy: {
      createdAt: "desc"
    }
  });
}

export async function registerCheckoutRoutes(app: FastifyInstance) {
  app.post("/checkout/session", async (request, reply) => {
    requireDatabase();
    const authUser = await requireAuth(app, request);
    if (isAdminStudentPreview(authUser)) {
      return reply.code(403).send({
        message: "Checkout indisponível no modo preview do administrador.",
        code: "ADMIN_PREVIEW_READONLY"
      });
    }
    const body = checkoutSessionSchema.parse(request.body);
    const planSeed = await resolveCheckoutPlan(body.planCode);
    const requestedCouponCode = normalizeCheckoutCouponInput(body.couponCode);

    const activeMembership = await prisma.membership.findFirst({
      where: {
        userId: authUser.id,
        status: "ACTIVE",
        deletedAt: null
      },
      include: {
        plan: true,
        payments: {
          orderBy: {
            dueDate: "desc"
          },
          take: 1
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    if (activeMembership) {
      return reply.send({
        membership: activeMembership,
        payment: activeMembership.payments[0] ?? null,
        alreadyActive: true
      });
    }

    const pendingMembership = await findPendingMembershipForCheckout(authUser.id, planSeed.id);

    if (pendingMembership?.payments[0]) {
      const pricing = await resolveCheckoutSessionPricing(planSeed, body.couponCode);
      const amountError = checkoutAmountErrorReply(pricing.amountInCents, reply);
      if (amountError) return amountError;

      let membership = pendingMembership;
      let payment = pendingMembership.payments[0];
      const checkoutMatchInput = {
        payment,
        membershipPlanId: pendingMembership.planId,
        membershipPlanCode: pendingMembership.plan?.code,
        selectedPlanId: planSeed.id,
        selectedPlanCode: body.planCode,
        requestedCouponCode,
        pricing
      };

      if (!pendingCheckoutPricingMatches(checkoutMatchInput)) {
        const startsAt = todayUtcOnly();
        const pendingPayment = pendingMembership.payments[0];
        const planChanged = pendingMembership.planId !== planSeed.id;
        const refreshed = await prisma.$transaction(async (tx) => {
          const membership = planChanged
            ? await tx.membership.update({
                where: { id: pendingMembership.id },
                data: {
                  planId: planSeed.id,
                  endsAt: addCycleDate(startsAt, planSeed.billingCycle)
                },
                include: pendingMembershipInclude
              })
            : pendingMembership;

          const payment = await tx.payment.update({
            where: { id: pendingPayment.id },
            data: {
              ...buildPaymentData(pricing, pendingPayment.dueDate ?? startsAt),
              asaasPaymentId: null,
              paymentUrl: null
            }
          });

          return { membership, payment };
        });

        membership = refreshed.membership;
        payment = refreshed.payment;
      }

      if (!canReuseAsaasCheckoutUrl(payment)) {
        const { checkout: asaasPayment, providerError } = await tryCreateAsaasCheckout({
          externalReference: payment.id,
          itemName: asaasCheckoutItemName(membership.plan?.name ?? planSeed.name),
          itemDescription: asaasCheckoutItemDescription(authUser.name),
          amountInCents: payment.amountInCents,
          billingType: body.billingType,
          callbacks: subscriptionCheckoutCallbacks()
        });

        if (asaasPayment) {
          payment = await prisma.payment.update({
            where: { id: payment.id },
            data: {
              asaasPaymentId: asaasPayment.id,
              paymentUrl: asaasPayment.url,
              status: asaasStatusToPaymentStatus(asaasPayment.status)
            }
          });
        }

        return reply.send({
          membership,
          payment,
          alreadyActive: false,
          paymentProviderError: providerError ?? undefined
        });
      }

      return reply.send({
        membership,
        payment,
        alreadyActive: false
      });
    }

    const startsAt = todayUtcOnly();
    const plan = planSeed;
    const pricing = await resolveCheckoutSessionPricing(plan, body.couponCode);
    const amountError = checkoutAmountErrorReply(pricing.amountInCents, reply);
    if (amountError) return amountError;

    const { user, membership, payment } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: {
          id: authUser.id
        }
      });

      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          planId: plan.id,
          status: "PENDING",
          startsAt,
          endsAt: addCycleDate(startsAt, plan.billingCycle)
        },
        include: {
          plan: true
        }
      });

      const payment = await tx.payment.create({
        data: {
          membershipId: membership.id,
          ...buildPaymentData(pricing, startsAt)
        }
      });

      return { user, membership, payment };
    });

    const { checkout: asaasPayment, providerError } = await tryCreateAsaasCheckout({
      externalReference: payment.id,
      itemName: asaasCheckoutItemName(planSeed.name),
      itemDescription: asaasCheckoutItemDescription(user.name),
      amountInCents: payment.amountInCents,
      billingType: body.billingType,
      callbacks: subscriptionCheckoutCallbacks()
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

    return reply.code(201).send({
      membership,
      payment: updatedPayment,
      alreadyActive: false,
      paymentProviderError: providerError ?? undefined
    });
  });

  app.post("/checkout/confirm-sandbox", async (request, reply) => {
    requireDatabase();

    const gate = evaluateSandboxConfirmGate({
      nodeEnv: env.NODE_ENV,
      enableSandboxConfirm: env.ENABLE_SANDBOX_CONFIRM,
      hasAsaasApiKey: Boolean(env.ASAAS_API_KEY),
      allowManualPaymentConfirmation: env.ALLOW_MANUAL_PAYMENT_CONFIRMATION === "true"
    });
    if (!gate.ok) {
      return reply.code(gate.statusCode).send({ message: gate.message });
    }

    const authUser = await requireAuth(app, request);
    if (isAdminStudentPreview(authUser)) {
      return reply.code(403).send({
        message: "Checkout indisponível no modo preview do administrador.",
        code: "ADMIN_PREVIEW_READONLY"
      });
    }
    const body = checkoutSandboxConfirmationSchema.parse(request.body);

    const payment = await prisma.payment.findFirst({
      where: {
        id: body.paymentId,
        membership: {
          userId: authUser.id
        }
      }
    });

    if (!payment) {
      return reply.code(404).send({
        message: "Pagamento não encontrado."
      });
    }

    const confirmedPayment = await prisma.payment.update({
      where: {
        id: payment.id
      },
      data: {
        status: "CONFIRMED",
        paidAt: new Date()
      }
    });

    if (payment.status !== "CONFIRMED" && confirmedPayment.couponId) {
      await incrementSubscriptionCouponUsage(confirmedPayment.couponId);
    }

    const membership = await prisma.membership.update({
      where: {
        id: confirmedPayment.membershipId
      },
      data: {
        status: "ACTIVE",
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

    return reply.send({
      membership,
      payment: confirmedPayment
    });
  });

  app.post(
    "/checkout/register",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
    requireDatabase();
    const body = checkoutRegisterSchema.parse(request.body);
    const email = body.email ? body.email.toLowerCase() : null;
    const phone = body.phone || null;
    const fallbackEmail = email ?? (phone ? `phone-${phone.replace(/[^a-z0-9]+/gi, "").toLowerCase()}@app-treino.local` : null);
    const planSeed = await resolveCheckoutPlan(body.planCode);

    const existingUser =
      (email ? await prisma.user.findUnique({ where: { email } }) : null) ??
      (phone ? await prisma.user.findUnique({ where: { phone } }) : null);

    if (existingUser) {
      return reply.code(409).send({
        message: "E-mail já cadastrado. Faça login para continuar o pagamento."
      });
    }

    const startsAt = todayUtcOnly();
    const plan = planSeed;
    const pricing = await resolveCheckoutSessionPricing(plan, body.couponCode);
    const registerAmountError = checkoutAmountErrorReply(pricing.amountInCents, reply);
    if (registerAmountError) return registerAmountError;

    const birthDate = body.birthDate ? new Date(body.birthDate) : null;
    const consentAt = new Date();

    const { user, payment } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
          data: {
            name: body.name,
            email: fallbackEmail,
            phone,
            passwordHash: await hashPassword(body.password),
            role: "USER",
            profile: {
              create: {
                phone,
                gender: body.gender,
                birthDate: birthDate && !Number.isNaN(birthDate.getTime()) ? birthDate : null,
                objective: body.objective ?? null,
                level: body.level ?? null,
                daysPerWeek: body.daysPerWeek ?? null,
                equipmentTags: body.equipmentTags ?? [],
                termsAcceptedAt: consentAt,
                privacyAcceptedAt: consentAt
              }
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
          ...buildPaymentData(pricing, startsAt)
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

    const { checkout: asaasPayment, providerError } = await tryCreateAsaasCheckout({
      externalReference: payment.id,
      itemName: asaasCheckoutItemName(planSeed.name),
      itemDescription: asaasCheckoutItemDescription(user.name),
      amountInCents: payment.amountInCents,
      billingType: body.billingType,
      callbacks: subscriptionCheckoutCallbacks()
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
      payment: updatedPayment,
      paymentProviderError: providerError ?? undefined
    });
    }
  );
}
