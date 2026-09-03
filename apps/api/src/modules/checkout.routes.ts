import type { FastifyInstance, FastifyReply } from "fastify";
import type { PaymentStatus, Prisma, Payment } from "@prisma/client";
import { isValidCpf, normalizeCpfDigits } from "@app-treino/shared";
import { z } from "zod";
import { hashPassword, isAdminStudentPreview, requireAuth, toAuthUser } from "../auth.js";
import { env } from "../env.js";
import { prisma } from "../prisma.js";
import {
  buildNativeCheckoutResponse,
  payNativeSubscriptionWithCard,
  persistUserCheckoutDocument,
  prepareNativeSubscriptionCheckout
} from "./checkout.native.js";
import {
  evaluateSandboxConfirmGate,
  incrementSubscriptionCouponUsage,
  getAsaasCheckoutAmountError,
  normalizeCheckoutCouponInput,
  pendingCheckoutPricingMatches,
  resolveCheckoutSessionPricing,
  resolveCheckoutCardInstallment,
  resolveSubscriptionCheckoutPricing
} from "./checkout.utils.js";
import { syncSubscriptionPaymentFromAsaas } from "./asaas-payment-sync.js";

const planCodeSchema = z.string().trim().min(1).max(80);

const checkoutRegisterSchema = z
  .object({
    name: z.string().trim().min(2, "Informe seu nome."),
    email: z.string().trim().email("Informe um e-mail valido.").optional().or(z.literal("")),
    phone: z.string().trim().min(8, "Informe um telefone valido.").optional().or(z.literal("")),
    document: z
      .string()
      .trim()
      .min(11, "Informe um CPF valido.")
      .refine((value) => isValidCpf(value), "Informe um CPF valido."),
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
  couponCode: z.string().trim().max(40).optional().nullable(),
  cpfCnpj: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((value) => !value || isValidCpf(value), "Informe um CPF valido.")
});

const checkoutSandboxConfirmationSchema = z.object({
  paymentId: z.string().min(1)
});

const checkoutCardPaymentSchema = z.object({
  holderName: z.string().trim().min(3, "Informe o nome impresso no cartão."),
  number: z.string().trim().min(13, "Informe o número do cartão."),
  expiryMonth: z.string().trim().min(2).max(2),
  expiryYear: z.string().trim().min(2).max(4),
  ccv: z.string().trim().min(3).max(4),
  holderEmail: z.string().trim().email("Informe um e-mail válido."),
  holderCpfCnpj: z
    .string()
    .trim()
    .min(11, "Informe o CPF do titular.")
    .refine((value) => isValidCpf(value), "Informe um CPF valido."),
  holderPostalCode: z.string().trim().min(8, "Informe o CEP."),
  holderAddressNumber: z.string().trim().min(1, "Informe o número do endereço."),
  holderPhone: z.string().trim().min(8, "Informe o telefone do titular."),
  installmentCount: z.coerce.number().int().min(1).max(12).optional()
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

async function loadCheckoutUser(userId: string) {
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { profile: true }
  });
}

async function finalizeNativeSubscriptionCheckout(input: {
  membership: { plan?: { name?: string | null } | null } & Record<string, unknown>;
  payment: { id: string; amountInCents: number; dueDate: Date; asaasPaymentId?: string | null; status: string };
  userId: string;
  planName: string;
  billingType: "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED";
  cpfCnpj?: string | null;
}) {
  const user = await loadCheckoutUser(input.userId);
  const native = await prepareNativeSubscriptionCheckout({
    payment: input.payment as Payment,
    membership: input.membership as never,
    user,
    planName: input.planName,
    billingType: input.billingType,
    cpfCnpj: input.cpfCnpj
  });

  return buildNativeCheckoutResponse({
    membership: input.membership as never,
    payment: native.payment,
    alreadyActive: false,
    nativeCheckout: native.nativeCheckout,
    paymentProviderError: native.providerError
  });
}

async function resolveSessionCheckoutCpf(
  userId: string,
  billingType: "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED",
  cpfCnpj?: string | null
): Promise<{ cpfCnpj?: string | null; error?: string }> {
  if (billingType !== "PIX") {
    return { cpfCnpj: null };
  }

  const normalizedInput = normalizeCpfDigits(cpfCnpj ?? "");
  if (normalizedInput) {
    const persisted = await persistUserCheckoutDocument(userId, normalizedInput);
    if (!persisted.ok) {
      return { error: persisted.error };
    }
    return { cpfCnpj: persisted.cpfCnpj };
  }

  const user = await loadCheckoutUser(userId);
  const profileCpf = normalizeCpfDigits(user.profile?.document ?? "");
  if (!isValidCpf(profileCpf)) {
    return { error: "Informe um CPF valido para gerar o Pix." };
  }

  return { cpfCnpj: profileCpf };
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
    const cpfResolution = await resolveSessionCheckoutCpf(authUser.id, body.billingType, body.cpfCnpj);
    if (cpfResolution.error) {
      return reply.code(400).send({ message: cpfResolution.error });
    }
    const sessionCpfCnpj = cpfResolution.cpfCnpj ?? null;
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

      const nativeResult = await finalizeNativeSubscriptionCheckout({
        membership,
        payment,
        userId: authUser.id,
        planName: membership.plan?.name ?? planSeed.name,
        billingType: body.billingType,
        cpfCnpj: sessionCpfCnpj
      });

      return reply.send(nativeResult);
    }

    const startsAt = todayUtcOnly();
    const plan = planSeed;
    const pricing = await resolveCheckoutSessionPricing(plan, body.couponCode);
    const amountError = checkoutAmountErrorReply(pricing.amountInCents, reply);
    if (amountError) return amountError;

    const { membership, payment } = await prisma.$transaction(async (tx) => {
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

      return { membership, payment };
    });

    const nativeResult = await finalizeNativeSubscriptionCheckout({
      membership,
      payment,
      userId: authUser.id,
      planName: planSeed.name,
      billingType: body.billingType,
      cpfCnpj: sessionCpfCnpj
    });

    return reply.code(201).send(nativeResult);
  });

  app.get("/checkout/payments/:paymentId/status", async (request, reply) => {
    requireDatabase();
    const authUser = await requireAuth(app, request);
    const params = z.object({ paymentId: z.string().min(1) }).parse(request.params);

    let payment = await prisma.payment.findFirst({
      where: {
        id: params.paymentId,
        membership: {
          userId: authUser.id
        }
      },
      include: {
        membership: {
          include: {
            plan: true
          }
        }
      }
    });

    if (!payment) {
      return reply.code(404).send({ message: "Pagamento não encontrado." });
    }

    if (["PENDING", "OVERDUE"].includes(payment.status)) {
      try {
        const synced = await syncSubscriptionPaymentFromAsaas(payment);
        if (synced) {
          payment = synced.payment;
        }
      } catch (error) {
        request.log.warn({ err: error, paymentId: payment.id }, "Asaas payment status sync failed");
      }
    }

    return reply.send({
      payment,
      membership: payment.membership,
      alreadyActive: payment.membership.status === "ACTIVE",
      syncedFromAsaas: payment.status === "CONFIRMED"
    });
  });

  app.post("/checkout/payments/:paymentId/card", async (request, reply) => {
    requireDatabase();
    const authUser = await requireAuth(app, request);
    if (isAdminStudentPreview(authUser)) {
      return reply.code(403).send({
        message: "Checkout indisponível no modo preview do administrador.",
        code: "ADMIN_PREVIEW_READONLY"
      });
    }

    const params = z.object({ paymentId: z.string().min(1) }).parse(request.params);
    const body = checkoutCardPaymentSchema.parse(request.body);

    const payment = await prisma.payment.findFirst({
      where: {
        id: params.paymentId,
        membership: {
          userId: authUser.id,
          status: {
            in: ["PENDING", "OVERDUE"]
          }
        }
      },
      include: {
        membership: {
          include: {
            plan: true
          }
        }
      }
    });

    if (!payment) {
      return reply.code(404).send({ message: "Pagamento não encontrado." });
    }

    if (payment.status === "CONFIRMED") {
      return reply.send(
        buildNativeCheckoutResponse({
          membership: payment.membership,
          payment,
          alreadyActive: payment.membership.status === "ACTIVE"
        })
      );
    }

    const user = await loadCheckoutUser(authUser.id);
    const installmentResolution = resolveCheckoutCardInstallment({
      billingCycle: payment.membership.plan?.billingCycle,
      installmentCount: body.installmentCount,
      amountInCents: payment.amountInCents
    });
    if (!installmentResolution.ok) {
      return reply.code(400).send({ message: installmentResolution.error });
    }

    const cardResult = await payNativeSubscriptionWithCard({
      payment,
      membership: payment.membership,
      user,
      planName: payment.membership.plan?.name ?? "Assinatura",
      creditCard: {
        holderName: body.holderName,
        number: body.number,
        expiryMonth: body.expiryMonth,
        expiryYear: body.expiryYear,
        ccv: body.ccv
      },
      creditCardHolderInfo: {
        name: body.holderName,
        email: body.holderEmail,
        cpfCnpj: body.holderCpfCnpj,
        postalCode: body.holderPostalCode,
        addressNumber: body.holderAddressNumber,
        phone: body.holderPhone
      },
      remoteIp: request.ip,
      installmentCount: installmentResolution.installmentCount
    });

    if (cardResult.payment.status === "CONFIRMED" && cardResult.payment.couponId) {
      await incrementSubscriptionCouponUsage(cardResult.payment.couponId);
    }

    if (cardResult.payment.status === "CONFIRMED") {
      const membership = await prisma.membership.update({
        where: { id: payment.membershipId },
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

      return reply.send(
        buildNativeCheckoutResponse({
          membership,
          payment: cardResult.payment,
          alreadyActive: true,
          paymentProviderError: cardResult.providerError
        })
      );
    }

    return reply.send(
      buildNativeCheckoutResponse({
        membership: payment.membership,
        payment: cardResult.payment,
        alreadyActive: false,
        paymentProviderError: cardResult.providerError
      })
    );
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
                document: normalizeCpfDigits(body.document),
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

    const membershipWithPlan = await prisma.membership.findUniqueOrThrow({
      where: { id: payment.membershipId },
      include: { plan: true }
    });

    const nativeResult = await finalizeNativeSubscriptionCheckout({
      membership: membershipWithPlan,
      payment,
      userId: user.id,
      planName: planSeed.name,
      billingType: body.billingType
    });

    const authUser = toAuthUser(user);
    const token = app.jwt.sign(authUser);

    return reply.code(201).send({
      token,
      user: authUser,
      ...nativeResult
    });
    }
  );
}
