import type { FastifyInstance } from "fastify";
import { createWriteStream, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { env } from "../env.js";
import { prisma } from "../prisma.js";
import { allowedUploadMimeTypes, publicUploadUrl, safeFileExtension, uploadsDir } from "./admin.routes.js";
import { autoCloseStaleTickets, ticketInclude } from "./ticket.utils.js";
import { calculateBodyFatEstimate, physicalAssessmentFormSchema } from "./physical-assessment.utils.js";

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

const eventRegistrationSchema = z.object({
  eventId: z.string().min(1)
});

const supportTicketSchema = z.object({
  subject: z.string().min(3),
  message: z.string().min(8),
  category: z.enum(["GENERAL", "WORKOUT", "PAYMENT", "TECHNICAL"]).default("GENERAL"),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]).default("NORMAL")
});

const ticketMessageSchema = z.object({
  body: z.string().min(1).max(2000)
});

const ticketIdParamSchema = z.object({
  id: z.string().min(1)
});

const assessmentIdParamSchema = z.object({
  id: z.string().min(1)
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

function resolveMembershipStartsAt(membership: {
  startsAt: Date;
  payments: Array<{ status: string; dueDate: Date; paidAt: Date | null }>;
}) {
  const latestConfirmedPayment = membership.payments
    .filter((payment) => payment.status === "CONFIRMED")
    .sort((a, b) => b.dueDate.getTime() - a.dueDate.getTime())[0];

  return latestConfirmedPayment?.paidAt ?? latestConfirmedPayment?.dueDate ?? membership.startsAt;
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
      status: "ACTIVE",
      deletedAt: null
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
      deletedAt: null,
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
      deletedAt: null,
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
        !request.url.startsWith("/user/payments") &&
        !request.url.startsWith("/user/uploads") &&
        !request.url.startsWith("/user/physical-assessments")
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
        gender: profile.profile?.gender,
        birthDate: profile.profile?.birthDate,
        objective: profile.profile?.objective,
        level: profile.profile?.level,
        city: profile.profile?.city ?? null,
        state: profile.profile?.state ?? null,
        avatarUrl: profile.profile?.avatarUrl ?? null,
        locationId: profile.profile?.locationId ?? null
      }
    };
  });

  const updateProfileSchema = z.object({
    name: z.string().min(2).optional(),
    phone: z.string().optional(),
    document: z.string().optional(),
    gender: z.enum(["MALE", "FEMALE"]).nullable().optional(),
    birthDate: z.string().optional(),
    objective: z.string().optional(),
    level: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    avatarUrl: z.string().optional().or(z.literal("")),
    locationId: z.string().optional().or(z.literal(""))
  });

  app.put("/user/profile", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const body = updateProfileSchema.parse(request.body);
    const birthDate = body.birthDate ? new Date(body.birthDate) : undefined;

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: body.name,
        phone: body.phone,
        profile: {
          upsert: {
            create: {
              phone: body.phone,
              document: body.document,
              gender: body.gender || null,
              birthDate,
              objective: body.objective,
              level: body.level,
              city: body.city,
              state: body.state,
              avatarUrl: body.avatarUrl === undefined ? undefined : body.avatarUrl || null,
              locationId: body.locationId || null
            },
            update: {
              phone: body.phone,
              document: body.document,
              gender: body.gender || null,
              birthDate,
              objective: body.objective,
              level: body.level,
              city: body.city,
              state: body.state,
              avatarUrl: body.avatarUrl === undefined ? undefined : body.avatarUrl || null,
              locationId: body.locationId || null
            }
          }
        }
      },
      include: {
        profile: true
      }
    });

    return {
      profile: {
        name: updated.name,
        email: updated.email,
        phone: updated.phone ?? updated.profile?.phone,
        document: updated.profile?.document,
        gender: updated.profile?.gender,
        birthDate: updated.profile?.birthDate,
        objective: updated.profile?.objective,
        level: updated.profile?.level,
        city: updated.profile?.city ?? null,
        state: updated.profile?.state ?? null,
        avatarUrl: updated.profile?.avatarUrl ?? null,
        locationId: updated.profile?.locationId ?? null
      }
    };
  });

  app.post("/user/uploads", async (request, reply) => {
    requireDatabase();
    await requireAuth(app, request);
    const file = await request.file();

    if (!file) {
      return reply.code(400).send({ error: "Selecione um arquivo para enviar." });
    }

    if (!allowedUploadMimeTypes.has(file.mimetype)) {
      return reply.code(400).send({ error: "Tipo de arquivo não permitido." });
    }

    const targetDir = resolve(uploadsDir, "images");
    mkdirSync(targetDir, { recursive: true });

    const extension = safeFileExtension(file.filename);
    const filename = `${Date.now()}-${randomUUID()}${extension}`;
    const targetPath = resolve(targetDir, filename);

    await pipeline(file.file, createWriteStream(targetPath));

    const relativePath = `images/${filename}`;

    return reply.code(201).send({
      file: {
        originalName: file.filename,
        filename,
        mimeType: file.mimetype,
        url: publicUploadUrl(request, relativePath),
        path: relativePath
      }
    });
  });

  app.get("/user/workout", async (request) => {
    requireDatabase();
    await requireAuth(app, request);

    const workout = await prisma.workout.findFirst({
      where: { deletedAt: null },
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
            startsAt: resolveMembershipStartsAt(membership),
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
    const user = await requireAuth(app, request);
    const userProfile = await prisma.profile.findUnique({
      where: { userId: user.id },
      select: { city: true, state: true }
    });

    const [programs, events, workouts, tickets, announcements, locations] = await Promise.all([
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
          status: "SCHEDULED",
          deletedAt: null
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
      }),
      prisma.supportTicket.findMany({
        where: {
          userId: user.id,
          deletedAt: null
        },
        orderBy: {
          updatedAt: "desc"
        },
        include: {
          messages: {
            orderBy: {
              createdAt: "desc"
            },
            take: 1
          }
        }
      }),
      prisma.announcement.findMany({
        where: {
          status: "PUBLISHED",
          deletedAt: null
        },
        orderBy: {
          publishedAt: "desc"
        },
        take: 10
      }),
      prisma.location.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 10
      })
    ]);

    const supportNotifications = tickets
      .map((ticket) => {
        const lastMessage = ticket.messages[0];
        const isActive =
          ticket.status === "OPEN" || ticket.status === "IN_PROGRESS" || ticket.status === "WAITING_STUDENT";

        if (isActive && lastMessage && lastMessage.senderType === "ADMIN") {
          return {
            id: `support-${ticket.id}`,
            type: "SUPPORT",
            title: "Nova resposta no seu atendimento",
            message: ticket.subject,
            publishedAt: lastMessage.createdAt
          };
        }

        const closedSince = new Date().getTime() - new Date(ticket.updatedAt).getTime();
        if (ticket.status === "CLOSED" && closedSince < 7 * 24 * 60 * 60 * 1000) {
          return {
            id: `support-closed-${ticket.id}`,
            type: "SUPPORT",
            title: "Atendimento encerrado",
            message: ticket.subject,
            publishedAt: ticket.updatedAt
          };
        }

        return null;
      })
      .filter((notification): notification is NonNullable<typeof notification> => notification !== null);

    const profileCity = normalizeSearch(userProfile?.city ?? "");
    const profileState = normalizeSearch(userProfile?.state ?? "");

    const locationNotifications = locations
      .filter((location) => {
        if (!profileCity) return false;
        const locationCity = normalizeSearch(location.city ?? "");
        if (!locationCity || locationCity !== profileCity) return false;
        if (profileState) {
          const locationState = normalizeSearch(location.state ?? "");
          if (locationState && locationState !== profileState) return false;
        }
        return true;
      })
      .map((location) => ({
        id: `location-${location.id}`,
        type: "LOCATION",
        title: "Nova unidade cadastrada",
        message: location.name,
        publishedAt: location.createdAt
      }));

    const notifications = [
      ...locationNotifications,
      ...supportNotifications,
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
      ...announcements.map((announcement) => ({
        id: `announcement-${announcement.id}`,
        type: "ANNOUNCEMENT",
        title: announcement.title,
        message: announcement.body,
        publishedAt: announcement.publishedAt ?? announcement.createdAt
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

  app.post("/user/physical-assessments", async (request, reply) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const body = physicalAssessmentFormSchema.parse(request.body);
    const form = body.formulario_avaliacao_fisica;
    const bodyFatPct = calculateBodyFatEstimate({
      gender: form.dados_pessoais_e_objetivos.genero_biologico.resposta,
      heightCm: form.composicao_corporal_basica.altura_cm,
      neckCm: form.perimetros_corporais_cm.pescoço.valor,
      waistCm: form.perimetros_corporais_cm.cintura.valor,
      hipCm: form.perimetros_corporais_cm.quadril.valor,
      weightKg: form.composicao_corporal_basica.peso_atual_kg,
      birthDate: form.dados_pessoais_e_objetivos.data_nascimento
    });

    const assessment = await prisma.physicalAssessment.create({
      data: {
        userId: user.id,
        source: "STUDENT",
        assessedAt: new Date(),
        weightKg: form.composicao_corporal_basica.peso_atual_kg,
        heightCm: form.composicao_corporal_basica.altura_cm,
        bodyFatPct,
        waistCm: form.perimetros_corporais_cm.cintura.valor,
        chestCm: form.perimetros_corporais_cm.torax.valor,
        hipCm: form.perimetros_corporais_cm.quadril.valor,
        details: body
      }
    });

    return reply.code(201).send({ assessment });
  });

  app.put("/user/physical-assessments/:id", async (request, reply) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { id } = assessmentIdParamSchema.parse(request.params);
    const existing = await prisma.physicalAssessment.findFirst({
      where: {
        id,
        userId: user.id,
        source: "STUDENT",
        deletedAt: null
      }
    });

    if (!existing) {
      return reply.code(404).send({ message: "Avaliação física não encontrada." });
    }

    const body = physicalAssessmentFormSchema.parse(request.body);
    const form = body.formulario_avaliacao_fisica;
    const bodyFatPct = calculateBodyFatEstimate({
      gender: form.dados_pessoais_e_objetivos.genero_biologico.resposta,
      heightCm: form.composicao_corporal_basica.altura_cm,
      neckCm: form.perimetros_corporais_cm.pescoço.valor,
      waistCm: form.perimetros_corporais_cm.cintura.valor,
      hipCm: form.perimetros_corporais_cm.quadril.valor,
      weightKg: form.composicao_corporal_basica.peso_atual_kg,
      birthDate: form.dados_pessoais_e_objetivos.data_nascimento
    });

    const assessment = await prisma.physicalAssessment.update({
      where: { id },
      data: {
        source: "STUDENT",
        weightKg: form.composicao_corporal_basica.peso_atual_kg,
        heightCm: form.composicao_corporal_basica.altura_cm,
        bodyFatPct,
        waistCm: form.perimetros_corporais_cm.cintura.valor,
        chestCm: form.perimetros_corporais_cm.torax.valor,
        hipCm: form.perimetros_corporais_cm.quadril.valor,
        details: body
      }
    });

    return { assessment };
  });

  app.get("/user/events", async (request) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const events = await prisma.event.findMany({
      where: {
        status: "SCHEDULED",
        deletedAt: null
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
      where: { id: body.eventId, deletedAt: null },
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
        userId: user.id,
        deletedAt: null
      },
      include: ticketInclude,
      orderBy: {
        updatedAt: "desc"
      }
    });

    await autoCloseStaleTickets(prisma, tickets.map((ticket) => ticket.id));

    if (tickets.some((ticket) => ticket.status === "OPEN" || ticket.status === "IN_PROGRESS" || ticket.status === "WAITING_STUDENT")) {
      const refreshed = await prisma.supportTicket.findMany({
        where: {
          userId: user.id,
          deletedAt: null
        },
        include: ticketInclude,
        orderBy: {
          updatedAt: "desc"
        }
      });
      return { tickets: refreshed };
    }

    return { tickets };
  });

  app.post("/user/support-tickets", async (request, reply) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const body = supportTicketSchema.parse(request.body);
    const ticket = await prisma.supportTicket.create({
      data: {
        ...body,
        userId: user.id,
        messages: {
          create: {
            senderId: user.id,
            senderType: "STUDENT",
            body: body.message
          }
        }
      },
      include: ticketInclude
    });

    return reply.code(201).send({ ticket });
  });

  app.post("/user/support-tickets/:id/messages", async (request, reply) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { id } = ticketIdParamSchema.parse(request.params);
    const body = ticketMessageSchema.parse(request.body);

    const ticket = await prisma.supportTicket.findFirstOrThrow({
      where: { id, userId: user.id, deletedAt: null }
    });

    if (ticket.status === "CLOSED" || ticket.status === "RESOLVED") {
      return reply.code(409).send({ error: "Atendimento encerrado." });
    }

    const updatedTicket = await prisma.supportTicket.update({
      where: { id },
      data: {
        status: "OPEN",
        messages: {
          create: {
            senderId: user.id,
            senderType: "STUDENT",
            body: body.body
          }
        }
      },
      include: ticketInclude
    });

    return { ticket: updatedTicket };
  });

  app.post("/user/support-tickets/:id/close", async (request, reply) => {
    requireDatabase();
    const user = await requireAuth(app, request);
    const { id } = ticketIdParamSchema.parse(request.params);

    const ticket = await prisma.supportTicket.findFirstOrThrow({
      where: { id, userId: user.id, deletedAt: null }
    });

    if (ticket.status === "CLOSED") {
      return reply.code(409).send({ error: "Atendimento já encerrado." });
    }

    const updatedTicket = await prisma.supportTicket.update({
      where: { id },
      data: { status: "CLOSED" },
      include: ticketInclude
    });

    return { ticket: updatedTicket };
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
