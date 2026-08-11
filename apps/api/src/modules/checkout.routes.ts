import type { FastifyInstance } from "fastify";
import { initialPlans } from "@app-treino/shared";
import { z } from "zod";
import { hashPassword, requireAuth, toAuthUser } from "../auth.js";
import { env } from "../env.js";
import { prisma } from "../prisma.js";

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

const checkoutSessionSchema = z.object({
  planCode: z.enum(["monthly", "annual"], {
    required_error: "Escolha um plano para continuar."
  }),
  billingType: z.enum(["BOLETO", "CREDIT_CARD", "PIX", "UNDEFINED"]).default("UNDEFINED")
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

function asaasBillingTypes(billingType: "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED") {
  if (billingType === "PIX") return ["PIX"] as const;
  if (billingType === "CREDIT_CARD") return ["CREDIT_CARD"] as const;
  return ["PIX", "CREDIT_CARD"] as const;
}

async function createAsaasCheckout(input: {
  paymentId: string;
  planName: string;
  customerName: string;
  amountInCents: number;
  billingType: "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED";
}) {
  console.log("[Asaas Checkout] createAsaasCheckout called", {
    hasApiKey: Boolean(env.ASAAS_API_KEY),
    apiUrl: env.ASAAS_API_URL,
    webOrigin: env.WEB_ORIGIN
  });

  if (!env.ASAAS_API_KEY) {
    return null;
  }

  const webOrigin = env.ASAAS_CALLBACK_URL?.split(",")[0]?.trim() ?? env.WEB_ORIGIN.split(",")[0]?.trim() ?? env.WEB_ORIGIN;
  const isHttps = webOrigin.startsWith("https://");
  const callbackBase = isHttps ? webOrigin : "https://example.com";
  const callback = {
    successUrl: `${callbackBase}/`,
    cancelUrl: `${callbackBase}/`,
    expiredUrl: `${callbackBase}/`
  };

  const response = await fetch(`${env.ASAAS_API_URL}/checkouts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: env.ASAAS_API_KEY
    },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      billingTypes: asaasBillingTypes(input.billingType),
      chargeTypes: ["DETACHED"],
      minutesToExpire: 120,
      externalReference: input.paymentId,
      callback,
      items: [
        {
          externalReference: input.paymentId,
          name: `App Treino - ${input.planName}`,
          description: `Assinatura App Treino - ${input.customerName}`,
          quantity: 1,
          value: input.amountInCents / 100
        }
      ]
    })
  });

  if (!response.ok) {
    const message = await response.text();
    console.error("[Asaas Checkout] Erro ao criar checkout:", message);
    throw new Error(`Falha ao criar checkout no Asaas: ${message}`);
  }

  const data = (await response.json()) as {
    id?: string;
    link?: string;
    status?: string;
  };

  console.log("[Asaas Checkout] Checkout criado:", { id: data.id, link: data.link, status: data.status });

  return {
    id: data.id,
    url: data.link,
    status: data.status
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
  app.post("/checkout/session", async (request, reply) => {
    requireDatabase();
    const authUser = await requireAuth(app, request);
    const body = checkoutSessionSchema.parse(request.body);
    const planSeed = initialPlans.find((plan) => plan.code === body.planCode);

    if (!planSeed) {
      return reply.code(400).send({
        message: "Plano inválido."
      });
    }

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

    const pendingMembership = await prisma.membership.findFirst({
      where: {
        userId: authUser.id,
        deletedAt: null,
        status: {
          in: ["PENDING", "OVERDUE"]
        }
      },
      include: {
        plan: true,
        payments: {
          where: {
            status: {
              in: ["PENDING", "OVERDUE"]
            }
          },
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

    if (pendingMembership?.payments[0]) {
      let payment = pendingMembership.payments[0];

      if (!payment.paymentUrl) {
        const asaasPayment = await createAsaasCheckout({
          paymentId: payment.id,
          planName: pendingMembership.plan?.name ?? planSeed.name,
          customerName: authUser.name,
          amountInCents: payment.amountInCents,
          billingType: body.billingType
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
      }

      return reply.send({
        membership: pendingMembership,
        payment,
        alreadyActive: false
      });
    }

    const startsAt = todayUtcOnly();
    const plan = await prisma.plan.upsert({
      where: { code: planSeed.code },
      create: planSeed,
      update: {}
    });

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
          amountInCents: plan.priceInCents,
          dueDate: startsAt
        }
      });

      return { user, membership, payment };
    });

    const asaasPayment = await createAsaasCheckout({
      paymentId: payment.id,
      planName: planSeed.name,
      customerName: user.name,
      amountInCents: payment.amountInCents,
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

    return reply.code(201).send({
      membership,
      payment: updatedPayment,
      alreadyActive: false
    });
  });

  app.post("/checkout/confirm-sandbox", async (request, reply) => {
    requireDatabase();

    if (env.NODE_ENV === "production" || !env.ENABLE_SANDBOX_CONFIRM) {
      return reply.code(404).send({
        message: "Recurso não encontrado."
      });
    }

    const authUser = await requireAuth(app, request);
    const body = checkoutSandboxConfirmationSchema.parse(request.body);

    if (env.ASAAS_API_KEY && env.ALLOW_MANUAL_PAYMENT_CONFIRMATION !== "true") {
      return reply.code(403).send({
        message: "Confirmação manual disponível apenas no sandbox local sem Asaas configurado."
      });
    }

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
    const planSeed = initialPlans.find((plan) => plan.code === body.planCode);

    if (!planSeed) {
      return reply.code(400).send({
        message: "Plano inválido."
      });
    }

    const existingUser =
      (email ? await prisma.user.findUnique({ where: { email } }) : null) ??
      (phone ? await prisma.user.findUnique({ where: { phone } }) : null);

    if (existingUser) {
      return reply.code(409).send({
        message: "E-mail já cadastrado. Faça login para continuar o pagamento."
      });
    }

    const startsAt = todayUtcOnly();
    const plan = await prisma.plan.upsert({
      where: { code: planSeed.code },
      create: planSeed,
      update: {}
    });

    const birthDate = body.birthDate ? new Date(body.birthDate) : null;

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
                equipmentTags: body.equipmentTags ?? []
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

    const asaasPayment = await createAsaasCheckout({
      paymentId: payment.id,
      planName: planSeed.name,
      customerName: user.name,
      amountInCents: payment.amountInCents,
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
    }
  );
}
