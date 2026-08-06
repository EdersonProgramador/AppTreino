import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { env } from "../env.js";
import { prisma } from "../prisma.js";
import { autoCloseStaleTickets, ticketInclude } from "./ticket.utils.js";

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

function calculateBodyFatEstimate(input: {
  gender: string;
  heightCm: number | null;
  neckCm: number | null;
  waistCm: number | null;
  hipCm: number | null;
  weightKg: number | null;
  birthDate?: string;
}) {
  const { gender, heightCm, neckCm, waistCm, hipCm } = input;
  const isMale = gender === "Masculino";
  const isFemale = gender === "Feminino";

  if (
    (!isMale && !isFemale) ||
    !heightCm ||
    !neckCm ||
    !waistCm ||
    heightCm <= 0 ||
    neckCm <= 0 ||
    waistCm <= 0
  ) {
    return null;
  }

  const log10 = Math.log10;

  if (isMale) {
    if (waistCm - neckCm > 0) {
      const bodyFat =
        495 / (1.0324 - 0.19077 * log10(waistCm - neckCm) + 0.15456 * log10(heightCm)) - 450;
      return Math.max(0, Math.min(100, Math.round(bodyFat * 10) / 10));
    }
  } else if (hipCm && hipCm > 0 && waistCm + hipCm - neckCm > 0) {
    const bodyFat =
      495 / (1.29579 - 0.35004 * log10(waistCm + hipCm - neckCm) + 0.221 * log10(heightCm)) - 450;
    return Math.max(0, Math.min(100, Math.round(bodyFat * 10) / 10));
  }

  const { weightKg, birthDate } = input;
  if (!weightKg || weightKg <= 0) return null;

  const bmi = weightKg / Math.pow(heightCm / 100, 2);
  let age = 0;
  if (birthDate) {
    const born = new Date(`${birthDate}T00:00:00`);
    if (!Number.isNaN(born.getTime())) {
      const today = new Date();
      age = today.getFullYear() - born.getFullYear();
      const monthDiff = today.getMonth() - born.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < born.getDate())) age -= 1;
    }
  }
  const bodyFat = 1.2 * bmi + 0.23 * age - 10.8 * (isMale ? 1 : 0) - 5.4;

  return Math.max(0, Math.min(100, Math.round(bodyFat * 10) / 10));
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
        level: profile.profile?.level
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
    level: z.string().optional()
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
              level: body.level
            },
            update: {
              phone: body.phone,
              document: body.document,
              gender: body.gender || null,
              birthDate,
              objective: body.objective,
              level: body.level
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
        level: updated.profile?.level
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

    const [programs, events, workouts, tickets] = await Promise.all([
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
      }),
      prisma.supportTicket.findMany({
        where: {
          userId: user.id
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

    const notifications = [
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

  const perimeterItemSchema = z.object({
    detalhe: z.string(),
    valor: z.number().nullable()
  });

  const physicalAssessmentFormSchema = z.object({
    formulario_avaliacao_fisica: z.object({
      dados_pessoais_e_objetivos: z.object({
        nome_completo: z.string(),
        data_nascimento: z.string(),
        genero_biologico: z.object({ opcoes: z.array(z.string()), resposta: z.string() }),
        objetivo_principal: z.object({ opcoes: z.array(z.string()), resposta: z.string() }),
        nivel_atividade_atual: z.object({ opcoes: z.array(z.string()), resposta: z.string() })
      }),
      historico_de_saude_anamnese: z.object({
        possui_lesao: z.object({ descricao: z.string(), resposta: z.string() }),
        medicamento_continuo: z.object({ descricao: z.string(), resposta: z.string() }),
        restricao_medica_cardiaca: z.object({ descricao: z.string(), resposta: z.string() })
      }),
      composicao_corporal_basica: z.object({
        instrucao: z.string(),
        peso_atual_kg: z.number().nullable(),
        altura_cm: z.number().nullable()
      }),
      perimetros_corporais_cm: z.object({
        instrucao: z.string(),
        pescoço: perimeterItemSchema,
        torax: perimeterItemSchema,
        cintura: perimeterItemSchema,
        abdomen: perimeterItemSchema,
        quadril: perimeterItemSchema,
        braco_direito_relaxado: perimeterItemSchema,
        braco_esquerdo_relaxado: perimeterItemSchema,
        coxa_direita: perimeterItemSchema,
        coxa_esquerda: perimeterItemSchema,
        panturrilha_direita: perimeterItemSchema,
        panturrilha_esquerda: perimeterItemSchema
      }),
      fotos_analise_visual: z.object({
        instrucao: z.string(),
        arquivos: z.object({
          foto_frente: z.string(),
          foto_costas: z.string(),
          foto_perfil: z.string()
        })
      })
    })
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
      include: ticketInclude,
      orderBy: {
        updatedAt: "desc"
      }
    });

    await autoCloseStaleTickets(prisma, tickets.map((ticket) => ticket.id));

    if (tickets.some((ticket) => ticket.status === "OPEN" || ticket.status === "IN_PROGRESS" || ticket.status === "WAITING_STUDENT")) {
      const refreshed = await prisma.supportTicket.findMany({
        where: {
          userId: user.id
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
      where: { id, userId: user.id }
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
      where: { id, userId: user.id }
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
