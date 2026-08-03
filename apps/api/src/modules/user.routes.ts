import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { env } from "../env.js";
import { prisma } from "../prisma.js";

const eventRegistrationSchema = z.object({
  eventId: z.string().min(1)
});

const supportTicketSchema = z.object({
  subject: z.string().min(3),
  message: z.string().min(8),
  category: z.enum(["GENERAL", "WORKOUT", "PAYMENT", "TECHNICAL"]).default("GENERAL"),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]).default("NORMAL")
});

const aiWorkoutRequestSchema = z.object({
  objective: z.string().min(3),
  level: z.string().min(3),
  daysPerWeek: z.coerce.number().int().min(2).max(6),
  focus: z.string().optional()
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

function todayUtcOnly() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addCycleDate(start: Date, cycle: string) {
  const end = new Date(start);
  if (cycle === "YEARLY") {
    end.setFullYear(end.getFullYear() + 1);
  } else {
    end.setMonth(end.getMonth() + 1);
  }

  return end;
}

function resolveMembershipEndsAt(membership: {
  startsAt: Date;
  endsAt: Date | null;
  plan: { billingCycle: string };
  payments: Array<{ status: string; dueDate: Date; paidAt: Date | null }>;
}) {
  const hasPlaceholderEnd = membership.endsAt ? membership.endsAt.getFullYear() >= 2099 : true;

  if (!hasPlaceholderEnd) {
    return membership.endsAt;
  }

  const latestConfirmedPayment = membership.payments
    .filter((payment) => payment.status === "CONFIRMED")
    .sort((a, b) => b.dueDate.getTime() - a.dueDate.getTime())[0];
  const cycleStart = latestConfirmedPayment?.dueDate ?? latestConfirmedPayment?.paidAt ?? membership.startsAt;

  return addCycleDate(cycleStart, membership.plan.billingCycle);
}

async function recordDailyAttendance(userId: string) {
  if (!env.DATABASE_URL) return;

  await prisma.attendanceRecord.upsert({
    where: {
      userId_date: {
        userId,
        date: todayUtcOnly()
      }
    },
    create: {
      userId,
      date: todayUtcOnly()
    },
    update: {}
  });
}

async function requireActiveMembership(userId: string) {
  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      status: "ACTIVE"
    }
  });

  if (!membership) {
    const error = new Error("Assinatura ativa obrigatória para acessar esta funcionalidade.") as Error & {
      statusCode: number;
    };
    error.statusCode = 402;
    throw error;
  }

  return membership;
}

async function getCurrentUserMembership(userId: string) {
  const now = new Date();
  const activeMembership = await prisma.membership.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      startsAt: {
        lte: now
      },
      OR: [{ endsAt: null }, { endsAt: { gte: now } }]
    },
    include: {
      plan: true,
      payments: true
    },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }]
  });

  if (activeMembership) {
    return activeMembership;
  }

  return prisma.membership.findFirst({
    where: {
      userId,
      status: {
        in: ["ACTIVE", "PENDING", "OVERDUE"]
      }
    },
    include: {
      plan: true,
      payments: true
    },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }]
  });
}

function buildAiWorkoutPlan(input: {
  objective: string;
  level: string;
  daysPerWeek: number;
  focus?: string;
}) {
  const split =
    input.daysPerWeek >= 5
      ? ["Push", "Pull", "Pernas", "Upper", "Lower", "Mobilidade"]
      : input.daysPerWeek === 4
        ? ["Upper A", "Lower A", "Upper B", "Lower B"]
        : ["Full body A", "Full body B", "Condicionamento"];
  const level = input.level.toLowerCase();
  const sets = level.includes("avanc") ? 4 : level.includes("inter") ? 3 : 2;
  const restSeconds = level.includes("avanc") ? 90 : 60;
  const focus = input.focus || input.objective;
  const exerciseMap = [
    ["Agachamento", "Supino reto", "Remada curvada", "Prancha"],
    ["Levantamento terra romeno", "Desenvolvimento", "Puxada alta", "Panturrilha"],
    ["Leg press", "Flexao de bracos", "Remada baixa", "Abdominal dead bug"],
    ["Avanão", "Crucifixo", "Face pull", "Farmer walk"],
    ["Cadeira extensora", "Mesa flexora", "Elevação lateral", "Cardio intervalado"],
    ["Mobilidade de quadril", "Mobilidade toracica", "Core anti-rotacao", "Caminhada inclinada"]
  ];

  return {
    summary: `Plano ${input.daysPerWeek}x por semana para ${input.objective}, com foco em ${focus}.`,
    recommendations: [
      "Registrar carga e repetições a cada sessão.",
      "Manter 1 a 2 repetições em reserva nos exercícios principais.",
      "Reavaliar medidas e desempenho em 30 dias."
    ],
    days: split.slice(0, input.daysPerWeek).map((title, index) => ({
      title,
      focus,
      exercises: exerciseMap[index % exerciseMap.length].map((name, exerciseIndex) => ({
        name,
        sets,
        reps: exerciseIndex === 3 ? "30-45s" : level.includes("avanc") ? "6-10" : "10-12",
        restSeconds
      }))
    }))
  };
}

export async function registerUserRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (request) => {
    if (request.url.startsWith("/user")) {
      const user = await requireAuth(app, request);
      if (
        env.DATABASE_URL &&
        !request.url.startsWith("/user/profile") &&
        !request.url.startsWith("/user/membership") &&
        !request.url.startsWith("/user/payments")
      ) {
        await requireActiveMembership(user.id);
        await recordDailyAttendance(user.id);
      }
    }
  });

  app.get("/user/profile", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const profile = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: {
        profile: true
      }
    });

    return {
      profile: {
        name: profile.name,
        email: profile.email,
        phone: profile.phone ?? profile.profile?.phone,
        document: profile.profile?.document,
        objective: profile.profile?.objective,
        level: profile.profile?.level
      }
    };
  });

  app.get("/user/workout", async (request) => {
    requireDatabase();
    await requireAuth(app, request);

    const workout = await prisma.workout.findFirst({
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

    return { workout };
  });

  app.get("/user/membership", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const membership = await getCurrentUserMembership(user.id);

    return {
      membership: membership
        ? {
            ...membership,
            endsAt: resolveMembershipEndsAt(membership)
          }
        : null
    };
  });

  app.get("/user/payments", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const payments = await prisma.payment.findMany({
      where: {
        membership: {
          userId: user.id
        }
      },
      orderBy: {
        dueDate: "desc"
      }
    });

    return { payments };
  });

  app.get("/user/notifications", async (request) => {
    requireDatabase();
    await requireAuth(app, request);

    const [programs, events, workouts] = await Promise.all([
      prisma.program.findMany({
        where: {
          status: "PUBLISHED",
          isActive: true
        },
        orderBy: {
          publishedAt: "desc"
        },
        take: 10
      }),
      prisma.event.findMany({
        where: {
          status: "SCHEDULED"
        },
        orderBy: {
          startsAt: "asc"
        },
        take: 10
      }),
      prisma.workout.findMany({
        orderBy: {
          createdAt: "desc"
        },
        take: 10
      })
    ]);

    const notifications = [
      ...programs.map((program) => ({
        id: `program-${program.id}`,
        type: "WORKOUT_PROGRAM",
        title: "Novo programa de treino",
        message: program.title,
        publishedAt: program.publishedAt ?? program.createdAt
      })),
      ...events.map((event) => ({
        id: `event-${event.id}`,
        type: "EVENT",
        title: "Evento publicado",
        message: event.title,
        publishedAt: event.createdAt
      })),
      ...workouts.map((workout) => ({
        id: `workout-${workout.id}`,
        type: "WORKOUT",
        title: "Treino publicado",
        message: workout.title,
        publishedAt: workout.createdAt
      }))
    ].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    return {
      notifications: notifications.slice(0, 20)
    };
  });

  app.get("/user/attendance", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const records = await prisma.attendanceRecord.findMany({
      where: {
        userId: user.id
      },
      orderBy: {
        date: "desc"
      },
      take: 30
    });

    return { records };
  });

  app.get("/user/physical-assessments", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const assessments = await prisma.physicalAssessment.findMany({
      where: {
        userId: user.id
      },
      orderBy: {
        assessedAt: "desc"
      },
      take: 12
    });

    return { assessments };
  });

  app.get("/user/events", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const events = await prisma.event.findMany({
      where: {
        status: "SCHEDULED"
      },
      include: {
        registrations: true
      },
      orderBy: {
        startsAt: "asc"
      }
    });

    return {
      events: events.map((event) => ({
        ...event,
        registered: event.registrations.some((registration) => registration.userId === user.id),
        registrationCount: event.registrations.length
      }))
    };
  });

  app.post("/user/events/register", async (request, reply) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const body = eventRegistrationSchema.parse(request.body);
    const event = await prisma.event.findUniqueOrThrow({
      where: { id: body.eventId },
      include: {
        registrations: true
      }
    });

    if (event.status !== "SCHEDULED") {
      return reply.code(400).send({ message: "Evento indisponível para inscrição." });
    }

    if (event.capacity && event.registrations.length >= event.capacity) {
      return reply.code(409).send({ message: "Capacidade do evento esgotada." });
    }

    const registration = await prisma.eventRegistration.upsert({
      where: {
        eventId_userId: {
          eventId: body.eventId,
          userId: user.id
        }
      },
      create: {
        eventId: body.eventId,
        userId: user.id
      },
      update: {}
    });

    return reply.code(201).send({ registration });
  });

  app.get("/user/support-tickets", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const tickets = await prisma.supportTicket.findMany({
      where: {
        userId: user.id
      },
      orderBy: {
        updatedAt: "desc"
      }
    });

    return { tickets };
  });

  app.post("/user/support-tickets", async (request, reply) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const body = supportTicketSchema.parse(request.body);
    const ticket = await prisma.supportTicket.create({
      data: {
        ...body,
        userId: user.id
      }
    });

    return reply.code(201).send({ ticket });
  });

  app.get("/user/ai-workout-plans", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const plans = await prisma.aiWorkoutPlan.findMany({
      where: {
        userId: user.id
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 5
    });

    return { plans };
  });

  app.post("/user/ai-workout-plans", async (request, reply) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const body = aiWorkoutRequestSchema.parse(request.body);
    const generatedPlan = buildAiWorkoutPlan(body);
    const plan = await prisma.aiWorkoutPlan.create({
      data: {
        userId: user.id,
        objective: body.objective,
        level: body.level,
        daysPerWeek: body.daysPerWeek,
        focus: body.focus,
        plan: generatedPlan
      }
    });

    return reply.code(201).send({ plan });
  });
}
