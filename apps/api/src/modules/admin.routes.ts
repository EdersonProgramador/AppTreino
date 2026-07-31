import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { hashPassword, requireRole } from "../auth.js";
import { env } from "../env.js";
import { prisma } from "../prisma.js";

const userSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6).optional(),
  role: z.enum(["ADMIN", "USER"]).default("USER"),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  phone: z.string().optional(),
  document: z.string().optional(),
  objective: z.string().optional(),
  level: z.string().optional()
});

const updateUserSchema = userSchema.partial().extend({
  email: z.string().email().optional(),
  password: z.string().min(6).optional()
});

const workoutSchema = z.object({
  title: z.string().min(2),
  objective: z.string().optional(),
  days: z
    .array(
      z.object({
        title: z.string().min(2),
        exercises: z
          .array(
            z.object({
              name: z.string().min(2),
              sets: z.coerce.number().int().min(1),
              reps: z.string().min(1),
              restSeconds: z.coerce.number().int().min(0).optional(),
              notes: z.string().optional()
            })
          )
          .default([])
      })
    )
    .default([])
});

const planSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  priceInCents: z.coerce.number().int().positive(),
  billingCycle: z.enum(["MONTHLY", "YEARLY"])
});

const membershipSchema = z.object({
  userId: z.string().min(1),
  planId: z.string().min(1),
  status: z.enum(["ACTIVE", "PENDING", "OVERDUE", "CANCELED"]).default("PENDING"),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional()
});

const paymentSchema = z.object({
  membershipId: z.string().min(1),
  amountInCents: z.coerce.number().int().positive(),
  dueDate: z.coerce.date(),
  billingType: z.enum(["BOLETO", "CREDIT_CARD", "PIX", "UNDEFINED"]).default("UNDEFINED")
});

const physicalAssessmentSchema = z.object({
  userId: z.string().min(1),
  assessedAt: z.coerce.date(),
  weightKg: z.coerce.number().positive().optional(),
  heightCm: z.coerce.number().positive().optional(),
  bodyFatPct: z.coerce.number().min(0).max(100).optional(),
  waistCm: z.coerce.number().positive().optional(),
  chestCm: z.coerce.number().positive().optional(),
  hipCm: z.coerce.number().positive().optional(),
  notes: z.string().optional()
});

const eventSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional(),
  location: z.string().optional(),
  capacity: z.coerce.number().int().positive().optional(),
  status: z.enum(["SCHEDULED", "CANCELED", "FINISHED"]).default("SCHEDULED")
});

const supportTicketUpdateSchema = z.object({
  assignedToId: z.string().optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]).optional()
});

const idParamSchema = z.object({
  id: z.string().min(1)
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

function toDateOnly(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
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

function asaasStatusToPaymentStatus(status?: string) {
  if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(status ?? "")) return "CONFIRMED";
  if (["OVERDUE"].includes(status ?? "")) return "OVERDUE";
  if (["REFUNDED", "REFUND_REQUESTED", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE"].includes(status ?? "")) {
    return "REFUNDED";
  }
  if (["DELETED"].includes(status ?? "")) return "CANCELED";
  return "PENDING";
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

export async function registerAdminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (request) => {
    if (request.url.startsWith("/admin")) {
      await requireRole(app, request, "ADMIN");
    }
  });

  app.get("/admin/summary", async () => {
    requireDatabase();
    const today = toDateOnly();
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const [users, activeMemberships, pendingPayments, todayAttendance] = await Promise.all([
      prisma.user.count(),
      prisma.membership.count({ where: { status: "ACTIVE" } }),
      prisma.payment.count({ where: { status: "PENDING" } }),
      prisma.attendanceRecord.count({
        where: {
          date: {
            gte: today,
            lt: tomorrow
          }
        }
      })
    ]);

    return { users, activeMemberships, pendingPayments, todayAttendance };
  });

  app.get("/admin/users", async () => {
    requireDatabase();
    const users = await prisma.user.findMany({
      include: {
        profile: true,
        memberships: {
          include: {
            plan: true
          },
          orderBy: {
            createdAt: "desc"
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return { users };
  });

  app.post("/admin/users", async (request, reply) => {
    requireDatabase();
    const body = userSchema.required({ password: true }).parse(request.body);
    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        phone: body.phone,
        passwordHash: await hashPassword(body.password),
        role: body.role,
        status: body.status,
        profile: {
          create: {
            phone: body.phone,
            document: body.document,
            objective: body.objective,
            level: body.level
          }
        }
      },
      include: {
        profile: true
      }
    });

    return reply.code(201).send({ user });
  });

  app.put("/admin/users/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const body = updateUserSchema.parse(request.body);
    const { password, phone, document, objective, level, ...userData } = body;

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...userData,
        email: userData.email?.toLowerCase(),
        phone,
        passwordHash: password ? await hashPassword(password) : undefined,
        profile: {
          upsert: {
            create: { phone, document, objective, level },
            update: { phone, document, objective, level }
          }
        }
      },
      include: {
        profile: true
      }
    });

    return { user };
  });

  app.delete("/admin/users/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const memberships = await prisma.membership.findMany({
      where: { userId: id },
      select: { id: true }
    });
    const membershipIds = memberships.map((membership) => membership.id);

    await prisma.$transaction([
      prisma.payment.deleteMany({
        where: {
          membershipId: {
            in: membershipIds
          }
        }
      }),
      prisma.membership.deleteMany({ where: { userId: id } }),
      prisma.attendanceRecord.deleteMany({ where: { userId: id } }),
      prisma.physicalAssessment.deleteMany({ where: { userId: id } }),
      prisma.eventRegistration.deleteMany({ where: { userId: id } }),
      prisma.supportTicket.deleteMany({ where: { userId: id } }),
      prisma.supportTicket.updateMany({ where: { assignedToId: id }, data: { assignedToId: null } }),
      prisma.aiWorkoutPlan.deleteMany({ where: { userId: id } }),
      prisma.profile.deleteMany({ where: { userId: id } }),
      prisma.user.delete({ where: { id } })
    ]);
    return { ok: true };
  });

  app.get("/admin/workouts", async () => {
    requireDatabase();
    const workouts = await prisma.workout.findMany({
      include: {
        days: {
          include: {
            exercises: {
              orderBy: {
                sortOrder: "asc"
              }
            }
          },
          orderBy: {
            sortOrder: "asc"
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return { workouts };
  });

  app.post("/admin/workouts", async (request, reply) => {
    requireDatabase();
    const body = workoutSchema.parse(request.body);
    const workout = await prisma.workout.create({
      data: {
        title: body.title,
        objective: body.objective,
        days: {
          create: body.days.map((day, dayIndex) => ({
            title: day.title,
            sortOrder: dayIndex,
            exercises: {
              create: day.exercises.map((exercise, exerciseIndex) => ({
                ...exercise,
                sortOrder: exerciseIndex
              }))
            }
          }))
        }
      },
      include: {
        days: {
          include: {
            exercises: true
          }
        }
      }
    });

    return reply.code(201).send({ workout });
  });

  app.put("/admin/workouts/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const body = workoutSchema.parse(request.body);

    await prisma.$transaction([
      prisma.exercise.deleteMany({
        where: {
          workoutDay: {
            workoutId: id
          }
        }
      }),
      prisma.workoutDay.deleteMany({
        where: {
          workoutId: id
        }
      }),
      prisma.workout.update({
        where: { id },
        data: {
          title: body.title,
          objective: body.objective,
          days: {
            create: body.days.map((day, dayIndex) => ({
              title: day.title,
              sortOrder: dayIndex,
              exercises: {
                create: day.exercises.map((exercise, exerciseIndex) => ({
                  ...exercise,
                  sortOrder: exerciseIndex
                }))
              }
            }))
          }
        }
      })
    ]);

    const workout = await prisma.workout.findUniqueOrThrow({
      where: { id },
      include: {
        days: {
          include: {
            exercises: true
          }
        }
      }
    });

    return { workout };
  });

  app.delete("/admin/workouts/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.$transaction([
      prisma.exercise.deleteMany({
        where: {
          workoutDay: {
            workoutId: id
          }
        }
      }),
      prisma.workoutDay.deleteMany({ where: { workoutId: id } }),
      prisma.workout.delete({ where: { id } })
    ]);
    return { ok: true };
  });

  app.get("/admin/plans", async () => {
    requireDatabase();
    const plans = await prisma.plan.findMany({ orderBy: { priceInCents: "asc" } });
    return { plans };
  });

  app.post("/admin/plans", async (request, reply) => {
    requireDatabase();
    const body = planSchema.parse(request.body);
    const plan = await prisma.plan.create({ data: body });
    return reply.code(201).send({ plan });
  });

  app.put("/admin/plans/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const body = planSchema.partial().parse(request.body);
    const plan = await prisma.plan.update({ where: { id }, data: body });
    return { plan };
  });

  app.delete("/admin/plans/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const memberships = await prisma.membership.findMany({
      where: { planId: id },
      select: { id: true }
    });
    const membershipIds = memberships.map((membership) => membership.id);
    await prisma.$transaction([
      prisma.payment.deleteMany({
        where: {
          membershipId: {
            in: membershipIds
          }
        }
      }),
      prisma.membership.deleteMany({ where: { planId: id } }),
      prisma.plan.delete({ where: { id } })
    ]);
    return { ok: true };
  });

  app.get("/admin/memberships", async () => {
    requireDatabase();
    const memberships = await prisma.membership.findMany({
      include: {
        user: true,
        plan: true,
        payments: {
          orderBy: {
            dueDate: "desc"
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });
    return { memberships };
  });

  app.post("/admin/memberships", async (request, reply) => {
    requireDatabase();
    const body = membershipSchema.parse(request.body);
    const plan = await prisma.plan.findUniqueOrThrow({ where: { id: body.planId } });
    const startsAt = body.startsAt;
    const membership = await prisma.membership.create({
      data: {
        ...body,
        startsAt,
        endsAt: body.endsAt ?? addCycleDate(startsAt, plan.billingCycle)
      },
      include: {
        user: true,
        plan: true
      }
    });

    return reply.code(201).send({ membership });
  });

  app.put("/admin/memberships/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const body = membershipSchema.partial().parse(request.body);
    const membership = await prisma.membership.update({
      where: { id },
      data: body,
      include: {
        user: true,
        plan: true
      }
    });

    return { membership };
  });

  app.delete("/admin/memberships/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.$transaction([
      prisma.payment.deleteMany({ where: { membershipId: id } }),
      prisma.membership.delete({ where: { id } })
    ]);
    return { ok: true };
  });

  app.get("/admin/payments", async () => {
    requireDatabase();
    const payments = await prisma.payment.findMany({
      include: {
        membership: {
          include: {
            user: true,
            plan: true
          }
        }
      },
      orderBy: {
        dueDate: "desc"
      }
    });
    return { payments };
  });

  app.post("/admin/payments", async (request, reply) => {
    requireDatabase();
    const body = paymentSchema.parse(request.body);
    const membership = await prisma.membership.findUniqueOrThrow({
      where: { id: body.membershipId },
      include: {
        user: true
      }
    });

    const payment = await prisma.payment.create({
      data: {
        membershipId: body.membershipId,
        amountInCents: body.amountInCents,
        dueDate: body.dueDate
      }
    });

    const asaasPayment = await createAsaasPaymentLink({
      paymentId: payment.id,
      customerName: membership.user.name,
      amountInCents: body.amountInCents,
      dueDate: body.dueDate,
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

    return reply.code(201).send({ payment: updatedPayment });
  });

  app.get("/admin/physical-assessments", async () => {
    requireDatabase();
    const assessments = await prisma.physicalAssessment.findMany({
      include: {
        user: true
      },
      orderBy: {
        assessedAt: "desc"
      }
    });

    return { assessments };
  });

  app.post("/admin/physical-assessments", async (request, reply) => {
    requireDatabase();
    const body = physicalAssessmentSchema.parse(request.body);
    const assessment = await prisma.physicalAssessment.create({
      data: body,
      include: {
        user: true
      }
    });

    return reply.code(201).send({ assessment });
  });

  app.delete("/admin/physical-assessments/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.physicalAssessment.delete({ where: { id } });
    return { ok: true };
  });

  app.get("/admin/events", async () => {
    requireDatabase();
    const events = await prisma.event.findMany({
      include: {
        registrations: {
          include: {
            user: true
          },
          orderBy: {
            createdAt: "desc"
          }
        }
      },
      orderBy: {
        startsAt: "asc"
      }
    });

    return { events };
  });

  app.post("/admin/events", async (request, reply) => {
    requireDatabase();
    const body = eventSchema.parse(request.body);
    const event = await prisma.event.create({
      data: body,
      include: {
        registrations: true
      }
    });

    return reply.code(201).send({ event });
  });

  app.delete("/admin/events/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.$transaction([
      prisma.eventRegistration.deleteMany({ where: { eventId: id } }),
      prisma.event.delete({ where: { id } })
    ]);
    return { ok: true };
  });

  app.get("/admin/support-tickets", async () => {
    requireDatabase();
    const tickets = await prisma.supportTicket.findMany({
      include: {
        user: true,
        assignedTo: true
      },
      orderBy: {
        updatedAt: "desc"
      }
    });

    return { tickets };
  });

  app.put("/admin/support-tickets/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const body = supportTicketUpdateSchema.parse(request.body);
    const ticket = await prisma.supportTicket.update({
      where: { id },
      data: {
        ...body,
        assignedToId: body.assignedToId || null
      },
      include: {
        user: true,
        assignedTo: true
      }
    });

    return { ticket };
  });

  app.get("/admin/ai-workout-plans", async () => {
    requireDatabase();
    const plans = await prisma.aiWorkoutPlan.findMany({
      include: {
        user: true
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 50
    });

    return { plans };
  });
}
