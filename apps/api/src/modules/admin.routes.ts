import type { FastifyInstance } from "fastify";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { hashPassword, requireRole } from "../auth.js";
import { env } from "../env.js";
import { prisma } from "../prisma.js";
import { autoCloseStaleTickets, FINALIZE_PROMPT, ticketInclude } from "./ticket.utils.js";

const uploadsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../uploads");
const uploadGroups = ["lessons", "materials", "images", "audio"] as const;
const uploadSchema = z.object({
  group: z.enum(uploadGroups).default("materials")
});
const allowedUploadMimeTypes = new Set([
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/ogg",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv"
]);

const userSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6).optional(),
  role: z.enum(["ADMIN", "USER"]).default("USER"),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  phone: z.string().optional(),
  document: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE"]).optional().or(z.literal("")),
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

const workoutProgramSchema = workoutSchema.extend({
  publish: z.coerce.boolean().default(true),
  assignToActiveStudents: z.coerce.boolean().default(true)
});

const cmsExerciseSchema = z.object({
  title: z.string().min(2),
  videoUrl: z.string().url().optional().or(z.literal("")),
  audioUrl: z.string().url().optional().or(z.literal("")),
  materialUrl: z.string().url().optional().or(z.literal("")),
  notes: z.string().optional(),
  targetMuscles: z.array(z.string().min(1)).default([]),
  equipmentTags: z.array(z.string().min(1)).default([]),
  modalityIds: z.array(z.string().min(1)).default([]),
  alternativeIds: z.array(z.string().min(1)).default([])
});

const cmsWorkoutBlockSchema = z.object({
  title: z.string().min(2),
  structureType: z.enum(["NORMAL", "BI_SET", "DROP_SET", "REST_PAUSE"]).default("NORMAL"),
  restTime: z.coerce.number().int().min(0),
  exercises: z
    .array(
      z.object({
        exerciseId: z.string().min(1),
        sets: z.coerce.number().int().min(1),
        repsRange: z.string().min(1),
        order: z.coerce.number().int().min(1)
      })
    )
    .min(1, "Cadastre ao menos um exercício no bloco.")
});

const cmsProgramSchema = z.object({
  title: z.string().min(2),
  description: z.string().min(2),
  modalityId: z.string().min(1),
  targetGender: z.enum(["ALL", "MALE", "FEMALE"]).default("ALL"),
  totalWorkouts: z.coerce.number().int().min(1).default(30),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
  isActive: z.coerce.boolean().default(true),
  days: z
    .array(
      z.object({
        workoutBlockId: z.string().min(1),
        dayNumber: z.coerce.number().int().min(1),
        order: z.coerce.number().int().min(1)
      })
    )
    .min(1, "Cadastre ao menos um dia no programa.")
});

const cmsProgramUpdateSchema = cmsProgramSchema.partial().extend({
  days: cmsProgramSchema.shape.days.optional()
});

const cmsExerciseUpdateSchema = cmsExerciseSchema.partial();

const cmsWorkoutBlockUpdateSchema = cmsWorkoutBlockSchema.partial();

const cmsModalitySchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  imageUrl: z.string().url().optional().or(z.literal("")),
  type: z.string().default("EXERCISE"),
  isActive: z.coerce.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).default(0)
});

const cmsProgramAssignSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1),
  currentDay: z.coerce.number().int().min(1).default(1),
  totalWorkouts: z.coerce.number().int().min(1).optional()
});

const cmsLocationSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).optional(),
  type: z.enum(["ACADEMY", "UNIT", "CLUB"]).default("ACADEMY"),
  description: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  phone: z.string().optional(),
  imageUrl: z.string().url().optional().or(z.literal("")),
  isActive: z.coerce.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).optional()
});

const cmsAnnouncementSchema = z.object({
  title: z.string().min(2),
  body: z.string().min(2),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT")
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

const paymentUpdateSchema = z.object({
  amountInCents: z.coerce.number().int().positive().optional(),
  dueDate: z.coerce.date().optional(),
  status: z.enum(["PENDING", "CONFIRMED", "OVERDUE", "REFUNDED", "CANCELED"]).optional(),
  paidAt: z.coerce.date().nullable().optional()
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
  status: z.enum(["OPEN", "IN_PROGRESS", "WAITING_STUDENT", "RESOLVED", "CLOSED"]).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]).optional()
});

const adminTicketMessageSchema = z.object({
  body: z.string().min(1).max(2000)
});

const idParamSchema = z.object({
  id: z.string().min(1)
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

function httpError(statusCode: number, message: string) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;

  return error;
}

function safeFileExtension(filename: string) {
  return extname(filename).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 12);
}

function publicUploadUrl(request: { headers: { host?: string }; protocol: string }, relativePath: string) {
  const host = request.headers.host ?? `localhost:${env.API_PORT}`;
  return `${request.protocol}://${host}/uploads/${relativePath.replace(/\\/g, "/")}`;
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const defaultModalities = [
  "Musculação",
  "Treino Aeróbico",
  "Hiit (Treino Intervalado de Alta Intensidade)",
  "Treino Funcional",
  "Crossfit",
  "Jump",
  "Pilates",
  "FitDance",
  "Dança de Salão",
  "Run (Roridão)"
];

async function ensureDefaultModalities() {
  const count = await prisma.modality.count();

  if (count > 0) {
    return;
  }

  await prisma.$transaction(
    defaultModalities.map((name, index) =>
      prisma.modality.upsert({
        where: {
          slug: slugify(name)
        },
        create: {
          name,
          slug: slugify(name),
          sortOrder: index + 1,
          isActive: true
        },
        update: {}
      })
    )
  );
}

function buildProgramDescription(description: string, modality?: string) {
  return JSON.stringify({
    description,
    modality: modality || "Hipertrofia"
  });
}

async function assertModalitySlugAvailable(slug: string, excludeId?: string) {
  const existing = await prisma.modality.findFirst({
    where: {
      slug,
      ...(excludeId ? { id: { not: excludeId } } : {})
    },
    select: {
      id: true
    }
  });

  if (existing) {
    throw httpError(409, "Já existe uma modalidade com este nome.");
  }
}

async function assertLocationSlugAvailable(slug: string, excludeId?: string) {
  const existing = await prisma.location.findFirst({
    where: {
      slug,
      ...(excludeId ? { id: { not: excludeId } } : {})
    },
    select: {
      id: true
    }
  });

  if (existing) {
    throw httpError(409, "Já existe uma localidade com este nome.");
  }
}

async function assertModalitiesExist(modalityIds: string[]) {
  const uniqueIds = uniqueValues(modalityIds);

  if (uniqueIds.length === 0) {
    return;
  }

  const existing = await prisma.modality.findMany({
    where: {
      id: {
        in: uniqueIds
      }
    },
    select: {
      id: true
    }
  });
  const existingIds = new Set(existing.map((modality) => modality.id));
  const missingIds = uniqueIds.filter((id) => !existingIds.has(id));

  if (missingIds.length > 0) {
    throw httpError(400, `Modalidade não encontrada: ${missingIds.join(", ")}.`);
  }
}

async function assertCmsExercisesExist(exerciseIds: string[]) {
  const uniqueIds = uniqueValues(exerciseIds);

  if (uniqueIds.length === 0) {
    return;
  }

  const existing = await prisma.exercise.findMany({
    where: {
      id: {
        in: uniqueIds
      },
      workoutDayId: null
    },
    select: {
      id: true
    }
  });
  const existingIds = new Set(existing.map((exercise) => exercise.id));
  const missingIds = uniqueIds.filter((id) => !existingIds.has(id));

  if (missingIds.length > 0) {
    throw httpError(400, `Exercício CMS não encontrado: ${missingIds.join(", ")}.`);
  }
}

async function assertWorkoutBlocksExist(workoutBlockIds: string[]) {
  const uniqueIds = uniqueValues(workoutBlockIds);

  if (uniqueIds.length === 0) {
    return;
  }

  const existing = await prisma.workoutBlock.findMany({
    where: {
      id: {
        in: uniqueIds
      }
    },
    select: {
      id: true
    }
  });
  const existingIds = new Set(existing.map((block) => block.id));
  const missingIds = uniqueIds.filter((id) => !existingIds.has(id));

  if (missingIds.length > 0) {
    throw httpError(400, `Bloco CMS não encontrado: ${missingIds.join(", ")}.`);
  }
}

async function assignProgramToStudents(programId: string, currentDay = 1, totalWorkouts?: number) {
  return assignProgramToActiveStudents(programId, currentDay, totalWorkouts);
}

async function getActiveStudentIds(userIds?: string[], targetGender: "ALL" | "MALE" | "FEMALE" = "ALL") {
  const students = await prisma.user.findMany({
    where: {
      role: "USER",
      status: "ACTIVE",
      id: userIds
        ? {
            in: userIds
          }
        : undefined,
      OR: [
        {
          enrollmentStatus: "ACTIVE"
        },
        {
          memberships: {
            some: {
              status: "ACTIVE"
            }
          }
        }
      ]
    },
    select: {
      id: true,
      profile: {
        select: {
          gender: true
        }
      }
    }
  });

  return students
    .filter((student) => targetGender === "ALL" || student.profile?.gender === targetGender)
    .map((student) => student.id);
}

async function assignProgramToActiveStudents(programId: string, currentDay = 1, totalWorkouts?: number, userIds?: string[]) {
  const program = await prisma.program.findUniqueOrThrow({
    where: { id: programId },
    select: {
      targetGender: true,
      totalWorkouts: true
    }
  });
  const workoutGoal = totalWorkouts ?? program.totalWorkouts;
  const activeStudentIds = await getActiveStudentIds(userIds, program.targetGender);

  if (activeStudentIds.length === 0) {
    return [];
  }

  return prisma.$transaction(
    activeStudentIds.map((userId) =>
      prisma.userProgram.upsert({
        where: {
          userId_programId: {
            userId,
            programId
          }
        },
        create: {
          userId,
          programId,
          currentDay,
          totalWorkouts: workoutGoal,
          completedWorkouts: 0,
          status: "ACTIVE"
        },
        update: {
          currentDay,
          totalWorkouts: workoutGoal,
          status: "ACTIVE",
          completedAt: null
        }
      })
    )
  );
}

async function getCmsProgramById(programId: string) {
  return prisma.program.findUniqueOrThrow({
    where: { id: programId },
    include: {
      days: {
        include: {
          workoutBlock: {
            include: {
              exercises: {
                include: {
                  exercise: true
                },
                orderBy: {
                  order: "asc"
                }
              }
            }
          }
        },
        orderBy: [{ dayNumber: "asc" }, { order: "asc" }]
      },
      assignedUsers: {
        include: {
          user: true
        },
        orderBy: {
          startedAt: "desc"
        }
      }
    }
  });
}

async function createCmsProgramFromWorkout(input: z.infer<typeof workoutProgramSchema>) {
  if (input.days.length === 0 || input.days.every((day) => day.exercises.length === 0)) {
    throw httpError(400, "Cadastre ao menos um dia com exercício para distribuir o treino.");
  }

  const programStatus = input.publish ? "PUBLISHED" : "DRAFT";
  const program = await prisma.$transaction(async (tx) => {
    const createdProgram = await tx.program.create({
      data: {
        title: input.title,
        description: input.objective || `Programa criado a partir do treino ${input.title}.`,
        status: programStatus,
        isActive: input.publish,
        publishedAt: input.publish ? new Date() : null
      }
    });

    for (const [dayIndex, day] of input.days.entries()) {
      const workoutBlock = await tx.workoutBlock.create({
        data: {
          title: day.title,
          structureType: "NORMAL",
          restTime: day.exercises[0]?.restSeconds ?? 60
        }
      });

      for (const [exerciseIndex, exercise] of day.exercises.entries()) {
        const cmsExercise = await tx.exercise.create({
          data: {
            title: exercise.name,
            name: exercise.name,
            notes: exercise.notes,
            sets: exercise.sets,
            reps: exercise.reps,
            restSeconds: exercise.restSeconds,
            sortOrder: exerciseIndex
          }
        });

        await tx.workoutBlockExercise.create({
          data: {
            workoutBlockId: workoutBlock.id,
            exerciseId: cmsExercise.id,
            sets: exercise.sets,
            repsRange: exercise.reps,
            order: exerciseIndex + 1
          }
        });
      }

      await tx.programDayWorkout.create({
        data: {
          programId: createdProgram.id,
          workoutBlockId: workoutBlock.id,
          dayNumber: dayIndex + 1,
          order: 1
        }
      });
    }

    return createdProgram;
  });

  const assignments =
    input.publish && input.assignToActiveStudents ? await assignProgramToActiveStudents(program.id) : [];
  const cmsProgram = await getCmsProgramById(program.id);

  return { program: cmsProgram, assignments };
}

export async function registerAdminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (request) => {
    if (request.url.startsWith("/admin")) {
      await requireRole(app, request, "ADMIN");
    }
  });

  app.post("/admin/uploads", async (request, reply) => {
    const { group } = uploadSchema.parse(request.query);
    const file = await request.file();

    if (!file) {
      throw httpError(400, "Selecione um arquivo para enviar.");
    }

    if (!allowedUploadMimeTypes.has(file.mimetype)) {
      throw httpError(400, "Tipo de arquivo não permitido para o CMS Fitness.");
    }

    const targetDir = resolve(uploadsDir, group);
    mkdirSync(targetDir, { recursive: true });

    const extension = safeFileExtension(file.filename);
    const filename = `${Date.now()}-${randomUUID()}${extension}`;
    const targetPath = resolve(targetDir, filename);

    await pipeline(file.file, createWriteStream(targetPath));

    const relativePath = `${group}/${filename}`;

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

  app.get("/admin/students/:id/overview", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const today = toDateOnly();
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));

    const [
      student,
      payments,
      assessments,
      attendance,
      workoutSessions,
      programAssignments,
      eventRegistrations,
      tickets,
      aiPlans
    ] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id },
        include: {
          profile: true,
          memberships: {
            include: {
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
          }
        }
      }),
      prisma.payment.findMany({
        where: {
          membership: {
            userId: id
          }
        },
        include: {
          membership: {
            include: {
              plan: true
            }
          }
        },
        orderBy: {
          dueDate: "desc"
        }
      }),
      prisma.physicalAssessment.findMany({
        where: { userId: id },
        orderBy: {
          assessedAt: "desc"
        }
      }),
      prisma.attendanceRecord.findMany({
        where: { userId: id },
        orderBy: {
          date: "desc"
        },
        take: 90
      }),
      prisma.workoutSession.findMany({
        where: { userId: id },
        orderBy: {
          startedAt: "desc"
        },
        take: 30
      }),
      prisma.userProgram.findMany({
        where: { userId: id },
        include: {
          program: {
            include: {
              modality: true,
              days: {
                include: {
                  workoutBlock: true
                },
                orderBy: [{ dayNumber: "asc" }, { order: "asc" }]
              }
            }
          }
        },
        orderBy: {
          updatedAt: "desc"
        }
      }),
      prisma.eventRegistration.findMany({
        where: { userId: id },
        include: {
          event: true
        },
        orderBy: {
          createdAt: "desc"
        }
      }),
      prisma.supportTicket.findMany({
        where: { userId: id },
        include: {
          assignedTo: true
        },
        orderBy: {
          updatedAt: "desc"
        }
      }),
      prisma.aiWorkoutPlan.findMany({
        where: { userId: id },
        orderBy: {
          createdAt: "desc"
        },
        take: 8
      })
    ]);

    const attendanceThisMonth = attendance.filter((record) => record.date >= monthStart && record.date < monthEnd);
    const completedWorkoutSessions = workoutSessions.filter((session) => session.status === "COMPLETED");
    const activeMembership = student.memberships.find((membership) => membership.status === "ACTIVE") ?? null;

    return {
      student,
      activeMembership,
      payments,
      assessments,
      attendance,
      workoutSessions,
      programAssignments,
      eventRegistrations,
      tickets,
      aiPlans,
      summary: {
        attendanceThisMonth: attendanceThisMonth.length,
        completedWorkoutSessions: completedWorkoutSessions.length,
        pendingPayments: payments.filter((payment) => payment.status === "PENDING").length,
        openTickets: tickets.filter((ticket) => ticket.status === "OPEN" || ticket.status === "IN_PROGRESS").length
      }
    };
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
            gender: body.gender || null,
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
    const { password, phone, document, gender, objective, level, ...userData } = body;

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...userData,
        email: userData.email?.toLowerCase(),
        phone,
        passwordHash: password ? await hashPassword(password) : undefined,
        profile: {
          upsert: {
            create: { phone, document, gender: gender || null, objective, level },
            update: { phone, document, gender: gender || null, objective, level }
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
    const body = workoutProgramSchema.parse(request.body);
    const result = await createCmsProgramFromWorkout(body);

    return reply.code(201).send(result);
  });

  app.post("/admin/workout-programs", async (request, reply) => {
    requireDatabase();
    const body = workoutProgramSchema.parse(request.body);
    const result = await createCmsProgramFromWorkout(body);

    return reply.code(201).send(result);
  });

  app.post("/admin/workouts/legacy", async (request, reply) => {
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

  app.get("/admin/cms/modalities", async () => {
    requireDatabase();
    await ensureDefaultModalities();
    const modalities = await prisma.modality.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    });

    return { modalities };
  });

  app.post("/admin/cms/modalities", async (request, reply) => {
    requireDatabase();
    const body = cmsModalitySchema.parse(request.body);
    const slug = body.slug ? slugify(body.slug) : slugify(body.name);
    await assertModalitySlugAvailable(slug);
    const modality = await prisma.modality.create({
      data: {
        name: body.name,
        slug,
        description: body.description,
        icon: body.icon,
        imageUrl: body.imageUrl || null,
        type: body.type,
        isActive: body.isActive,
        sortOrder: body.sortOrder
      }
    });

    return reply.code(201).send({ modality });
  });

  app.put("/admin/cms/modalities/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const body = cmsModalitySchema.partial().parse(request.body);

    if (body.slug) {
      await assertModalitySlugAvailable(slugify(body.slug), id);
    }

    const modality = await prisma.modality.update({
      where: { id },
      data: {
        name: body.name,
        slug: body.slug ? slugify(body.slug) : undefined,
        description: body.description,
        icon: body.icon,
        imageUrl: body.imageUrl || null,
        type: body.type,
        isActive: body.isActive,
        sortOrder: body.sortOrder
      }
    });

    return { modality };
  });

  app.delete("/admin/cms/modalities/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.modality.update({
      where: { id },
      data: {
        isActive: false
      }
    });

    return { ok: true };
  });

  app.get("/admin/cms/locations", async () => {
    requireDatabase();
    const locations = await prisma.location.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    });

    return { locations };
  });

  app.post("/admin/cms/locations", async (request, reply) => {
    requireDatabase();
    const body = cmsLocationSchema.parse(request.body);
    const slug = body.slug ? slugify(body.slug) : slugify(body.name);
    await assertLocationSlugAvailable(slug);

    const maxSort = body.sortOrder ?? undefined;
    const sortOrder =
      maxSort ??
      ((await prisma.location.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0) + 1;

    const location = await prisma.location.create({
      data: {
        name: body.name,
        slug,
        type: body.type,
        description: body.description,
        address: body.address,
        city: body.city,
        state: body.state,
        phone: body.phone,
        imageUrl: body.imageUrl || null,
        isActive: body.isActive,
        sortOrder
      }
    });

    return reply.code(201).send({ location });
  });

  app.put("/admin/cms/locations/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const body = cmsLocationSchema.partial().parse(request.body);

    if (body.slug) {
      await assertLocationSlugAvailable(slugify(body.slug), id);
    }

    const location = await prisma.location.update({
      where: { id },
      data: {
        name: body.name,
        slug: body.slug ? slugify(body.slug) : undefined,
        type: body.type,
        description: body.description,
        address: body.address,
        city: body.city,
        state: body.state,
        phone: body.phone,
        imageUrl: body.imageUrl === undefined ? undefined : body.imageUrl || null,
        isActive: body.isActive,
        sortOrder: body.sortOrder
      }
    });

    return { location };
  });

  app.delete("/admin/cms/locations/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.location.update({
      where: { id },
      data: {
        isActive: false
      }
    });

    return { ok: true };
  });

  app.get("/admin/cms/announcements", async () => {
    requireDatabase();
    const announcements = await prisma.announcement.findMany({
      orderBy: {
        createdAt: "desc"
      }
    });

    return { announcements };
  });

  app.post("/admin/cms/announcements", async (request, reply) => {
    requireDatabase();
    const body = cmsAnnouncementSchema.parse(request.body);
    const announcement = await prisma.announcement.create({
      data: {
        title: body.title,
        body: body.body,
        status: body.status,
        publishedAt: body.status === "PUBLISHED" ? new Date() : null
      }
    });

    return reply.code(201).send({ announcement });
  });

  app.put("/admin/cms/announcements/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const body = cmsAnnouncementSchema.partial().parse(request.body);
    const current = await prisma.announcement.findUniqueOrThrow({ where: { id } });
    const nextStatus = body.status ?? current.status;
    const announcement = await prisma.announcement.update({
      where: { id },
      data: {
        title: body.title,
        body: body.body,
        status: nextStatus,
        publishedAt: nextStatus === "PUBLISHED" && current.status !== "PUBLISHED" ? new Date() : undefined
      }
    });

    return { announcement };
  });

  app.delete("/admin/cms/announcements/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.announcement.delete({ where: { id } });

    return { ok: true };
  });

  app.get("/admin/cms/exercises", async () => {
    requireDatabase();
    const exercises = await prisma.exercise.findMany({
      where: {
        workoutDayId: null
      },
      include: {
        alternatives: true,
        alternativeTo: true,
        modalityLinks: {
          include: {
            modality: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return { exercises };
  });

  app.post("/admin/cms/exercises", async (request, reply) => {
    requireDatabase();
    const body = cmsExerciseSchema.parse(request.body);
    await assertModalitiesExist(body.modalityIds);
    await assertCmsExercisesExist(body.alternativeIds);
    const exercise = await prisma.exercise.create({
      data: {
        title: body.title,
        videoUrl: body.videoUrl || null,
        audioUrl: body.audioUrl || null,
        materialUrl: body.materialUrl || null,
        notes: body.notes || null,
        targetMuscles: body.targetMuscles,
        equipmentTags: body.equipmentTags,
        modalityLinks: {
          create: body.modalityIds.map((modalityId, index) => ({
            modalityId,
            principal: index === 0
          }))
        },
        alternatives: {
          connect: body.alternativeIds.map((id) => ({ id }))
        }
      },
      include: {
        alternatives: true,
        alternativeTo: true,
        modalityLinks: {
          include: {
            modality: true
          }
        }
      }
    });

    return reply.code(201).send({ exercise });
  });

  app.put("/admin/cms/exercises/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const body = cmsExerciseUpdateSchema.parse(request.body);

    if (body.modalityIds !== undefined) {
      await assertModalitiesExist(body.modalityIds);
    }

    if (body.alternativeIds !== undefined) {
      await assertCmsExercisesExist(body.alternativeIds);
    }

    const current = await prisma.exercise.findUniqueOrThrow({
      where: { id },
      include: { alternatives: true }
    });
    await prisma.$transaction([
      ...(body.modalityIds !== undefined
        ? [prisma.exerciseModality.deleteMany({ where: { exerciseId: id } })]
        : []),
      prisma.exercise.update({
        where: { id },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.videoUrl !== undefined ? { videoUrl: body.videoUrl || null } : {}),
          ...(body.audioUrl !== undefined ? { audioUrl: body.audioUrl || null } : {}),
          ...(body.materialUrl !== undefined ? { materialUrl: body.materialUrl || null } : {}),
          ...(body.notes !== undefined ? { notes: body.notes || null } : {}),
          ...(body.targetMuscles !== undefined ? { targetMuscles: body.targetMuscles } : {}),
          ...(body.equipmentTags !== undefined ? { equipmentTags: body.equipmentTags } : {}),
          ...(body.modalityIds !== undefined
            ? {
                modalityLinks: {
                  create: body.modalityIds.map((modalityId, index) => ({
                    modalityId,
                    principal: index === 0
                  }))
                }
              }
            : {}),
          ...(body.alternativeIds !== undefined
            ? {
                alternatives: {
                  disconnect: current.alternatives.map((item) => ({ id: item.id })),
                  connect: body.alternativeIds.map((alternativeId) => ({ id: alternativeId }))
                }
              }
            : {})
        }
      })
    ]);

    const exercise = await prisma.exercise.findUniqueOrThrow({
      where: { id },
      include: {
        alternatives: true,
        alternativeTo: true,
        modalityLinks: {
          include: {
            modality: true
          }
        }
      }
    });

    return { exercise };
  });

  app.delete("/admin/cms/exercises/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.$transaction([
      prisma.userProgress.deleteMany({ where: { exerciseId: id } }),
      prisma.workoutBlockExercise.deleteMany({ where: { exerciseId: id } }),
      prisma.exerciseModality.deleteMany({ where: { exerciseId: id } }),
      prisma.exercise.update({
        where: { id },
        data: {
          alternatives: { set: [] },
          alternativeTo: { set: [] }
        }
      }),
      prisma.exercise.delete({ where: { id } })
    ]);

    return { ok: true };
  });

  app.get("/admin/cms/workout-blocks", async () => {
    requireDatabase();
    const workoutBlocks = await prisma.workoutBlock.findMany({
      include: {
        exercises: {
          include: {
            exercise: true
          },
          orderBy: {
            order: "asc"
          }
        },
        programDays: {
          include: {
            program: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return { workoutBlocks };
  });

  app.post("/admin/cms/workout-blocks", async (request, reply) => {
    requireDatabase();
    const body = cmsWorkoutBlockSchema.parse(request.body);
    await assertCmsExercisesExist(body.exercises.map((exercise) => exercise.exerciseId));
    const workoutBlock = await prisma.workoutBlock.create({
      data: {
        title: body.title,
        structureType: body.structureType,
        restTime: body.restTime,
        exercises: {
          create: body.exercises.map((exercise) => ({
            exerciseId: exercise.exerciseId,
            sets: exercise.sets,
            repsRange: exercise.repsRange,
            order: exercise.order
          }))
        }
      },
      include: {
        exercises: {
          include: {
            exercise: true
          },
          orderBy: {
            order: "asc"
          }
        }
      }
    });

    return reply.code(201).send({ workoutBlock });
  });

  app.put("/admin/cms/workout-blocks/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const body = cmsWorkoutBlockUpdateSchema.parse(request.body);

    if (body.exercises !== undefined) {
      await assertCmsExercisesExist(body.exercises.map((exercise) => exercise.exerciseId));
    }

    await prisma.$transaction([
      ...(body.exercises !== undefined
        ? [prisma.workoutBlockExercise.deleteMany({ where: { workoutBlockId: id } })]
        : []),
      prisma.workoutBlock.update({
        where: { id },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.structureType !== undefined ? { structureType: body.structureType } : {}),
          ...(body.restTime !== undefined ? { restTime: body.restTime } : {}),
          ...(body.exercises !== undefined
            ? {
                exercises: {
                  create: body.exercises.map((exercise) => ({
                    exerciseId: exercise.exerciseId,
                    sets: exercise.sets,
                    repsRange: exercise.repsRange,
                    order: exercise.order
                  }))
                }
              }
            : {})
        }
      })
    ]);

    const workoutBlock = await prisma.workoutBlock.findUniqueOrThrow({
      where: { id },
      include: {
        exercises: {
          include: {
            exercise: true
          },
          orderBy: {
            order: "asc"
          }
        }
      }
    });

    return { workoutBlock };
  });

  app.delete("/admin/cms/workout-blocks/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.$transaction([
      prisma.programDayWorkout.deleteMany({ where: { workoutBlockId: id } }),
      prisma.workoutBlockExercise.deleteMany({ where: { workoutBlockId: id } }),
      prisma.workoutBlock.delete({ where: { id } })
    ]);

    return { ok: true };
  });

  app.get("/admin/cms/programs", async () => {
    requireDatabase();
    const programs = await prisma.program.findMany({
      include: {
        modality: true,
        days: {
          include: {
            workoutBlock: true
          },
          orderBy: [{ dayNumber: "asc" }, { order: "asc" }]
        },
        assignedUsers: {
          include: {
            user: true
          },
          orderBy: {
            startedAt: "desc"
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return { programs };
  });

  app.post("/admin/cms/programs", async (request, reply) => {
    requireDatabase();
    const body = cmsProgramSchema.parse(request.body);
    await assertModalitiesExist([body.modalityId]);
    const modality = await prisma.modality.findUniqueOrThrow({ where: { id: body.modalityId } });
    await assertWorkoutBlocksExist(body.days.map((day) => day.workoutBlockId));
    const program = await prisma.program.create({
      data: {
        modalityId: body.modalityId,
        title: body.title,
        description: buildProgramDescription(body.description, modality.name),
        targetGender: body.targetGender,
        totalWorkouts: body.totalWorkouts,
        status: body.status,
        isActive: body.isActive,
        publishedAt: body.status === "PUBLISHED" ? new Date() : null,
        days: {
          create: body.days.map((day) => ({
            workoutBlockId: day.workoutBlockId,
            dayNumber: day.dayNumber,
            order: day.order
          }))
        }
      },
      include: {
        modality: true,
        days: {
          include: {
            workoutBlock: true
          },
          orderBy: [{ dayNumber: "asc" }, { order: "asc" }]
        },
        assignedUsers: {
          include: {
            user: true
          }
        }
      }
    });

    if (program.status === "PUBLISHED" && program.isActive) {
      await assignProgramToStudents(program.id, 1, program.totalWorkouts);
    }

    return reply.code(201).send({ program });
  });

  app.put("/admin/cms/programs/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const body = cmsProgramUpdateSchema.parse(request.body);
    const currentProgram = await prisma.program.findUniqueOrThrow({
      where: { id },
      include: {
        modality: true
      }
    });
    const nextModalityId = body.modalityId ?? currentProgram.modalityId;
    const modality = nextModalityId ? await prisma.modality.findUniqueOrThrow({ where: { id: nextModalityId } }) : null;

    if (body.modalityId) {
      await assertModalitiesExist([body.modalityId]);
    }

    if (body.days) {
      await assertWorkoutBlocksExist(body.days.map((day) => day.workoutBlockId));
    }

    const descriptionText = body.description
      ? buildProgramDescription(body.description, modality?.name ?? currentProgram.modality?.name ?? "Hipertrofia")
      : currentProgram.description;
    const publishedAt =
      body.status === "PUBLISHED" ? new Date() : body.status === "DRAFT" || body.status === "ARCHIVED" ? null : currentProgram.publishedAt;

    await prisma.$transaction([
      ...(body.days ? [prisma.programDayWorkout.deleteMany({ where: { programId: id } })] : []),
      prisma.program.update({
        where: { id },
        data: {
          modalityId: nextModalityId,
          title: body.title ?? currentProgram.title,
          description: descriptionText,
          targetGender: body.targetGender ?? currentProgram.targetGender,
          totalWorkouts: body.totalWorkouts ?? currentProgram.totalWorkouts,
          status: body.status ?? currentProgram.status,
          isActive: body.isActive ?? currentProgram.isActive,
          publishedAt,
          ...(body.days
            ? {
                days: {
                  create: body.days.map((day) => ({
                    workoutBlockId: day.workoutBlockId,
                    dayNumber: day.dayNumber,
                    order: day.order
                  }))
                }
              }
            : {})
        }
      })
    ]);

    const program = await prisma.program.findUniqueOrThrow({
      where: { id },
      include: {
        modality: true,
        days: {
          include: {
            workoutBlock: true
          },
          orderBy: [{ dayNumber: "asc" }, { order: "asc" }]
        },
        assignedUsers: {
          include: {
            user: true
          }
        }
      }
    });

    if (program.status === "PUBLISHED" && program.isActive) {
      await assignProgramToStudents(program.id, 1, program.totalWorkouts);
    }

    return { program };
  });

  app.post("/admin/cms/programs/:id/publish", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const currentProgram = await prisma.program.findUniqueOrThrow({
      where: { id },
      include: {
        days: true
      }
    });

    if (currentProgram.days.length === 0) {
      throw httpError(409, "Cadastre ao menos um dia antes de publicar o programa.");
    }

    const program = await prisma.program.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        isActive: true,
        publishedAt: new Date()
      },
      include: {
        modality: true,
        days: {
          include: {
            workoutBlock: true
          },
          orderBy: [{ dayNumber: "asc" }, { order: "asc" }]
        },
        assignedUsers: {
          include: {
            user: true
          }
        }
      }
    });
    await assignProgramToStudents(program.id, 1, program.totalWorkouts);

    return { program };
  });

  app.post("/admin/cms/programs/:id/archive", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const program = await prisma.program.update({
      where: { id },
      data: {
        status: "ARCHIVED",
        isActive: false
      }
    });

    await prisma.userProgram.updateMany({
      where: {
        programId: id,
        status: "ACTIVE"
      },
      data: {
        status: "CANCELED"
      }
    });

    return { program };
  });

  app.post("/admin/cms/programs/:id/assign", async (request, reply) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const body = cmsProgramAssignSchema.parse(request.body);
    const program = await prisma.program.findUniqueOrThrow({
      where: { id },
      include: {
        days: true
      }
    });

    if (program.status !== "PUBLISHED" || !program.isActive || program.days.length === 0) {
      return reply.code(409).send({
        message: "Publique o programa e cadastre ao menos um dia antes de atribuir aos alunos."
      });
    }

    const assignments = await assignProgramToActiveStudents(id, body.currentDay, body.totalWorkouts ?? program.totalWorkouts, body.userIds);

    if (assignments.length === 0) {
      return reply.code(409).send({
        message: "Nenhum aluno ativo foi encontrado para receber este programa."
      });
    }

    return reply.code(201).send({ assignments });
  });

  app.delete("/admin/cms/programs/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.$transaction([
      prisma.programDayWorkout.deleteMany({ where: { programId: id } }),
      prisma.program.delete({ where: { id } })
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

    if (membership.status === "ACTIVE") {
      await prisma.user.update({
        where: { id: membership.userId },
        data: { enrollmentStatus: "ACTIVE" }
      });
    }

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

    if (membership.status === "ACTIVE") {
      await prisma.user.update({
        where: { id: membership.userId },
        data: { enrollmentStatus: "ACTIVE" }
      });
    }

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

  app.put("/admin/payments/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const body = paymentUpdateSchema.parse(request.body);
    const payment = await prisma.payment.update({
      where: { id },
      data: body
    });

    return { payment };
  });

  app.delete("/admin/payments/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.payment.delete({ where: { id } });

    return { ok: true };
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

  app.put("/admin/events/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const body = eventSchema.partial().parse(request.body);
    const event = await prisma.event.update({
      where: { id },
      data: body,
      include: {
        registrations: true
      }
    });

    return { event };
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
      include: ticketInclude,
      orderBy: {
        updatedAt: "desc"
      }
    });

    await autoCloseStaleTickets(prisma, tickets.map((ticket) => ticket.id));

    if (
      tickets.some(
        (ticket) => ticket.status === "OPEN" || ticket.status === "IN_PROGRESS" || ticket.status === "WAITING_STUDENT"
      )
    ) {
      const refreshed = await prisma.supportTicket.findMany({
        include: ticketInclude,
        orderBy: {
          updatedAt: "desc"
        }
      });
      return { tickets: refreshed };
    }

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
      include: ticketInclude
    });

    return { ticket };
  });

  app.post("/admin/support-tickets/:id/messages", async (request, reply) => {
    requireDatabase();
    const authUser = await requireRole(app, request, "ADMIN");
    const { id } = idParamSchema.parse(request.params);
    const body = adminTicketMessageSchema.parse(request.body);

    const ticket = await prisma.supportTicket.update({
      where: { id },
      data: {
        status: "IN_PROGRESS",
        assignedToId: authUser.id,
        messages: {
          create: {
            senderId: authUser.id,
            senderType: "ADMIN",
            body: body.body
          }
        }
      },
      include: ticketInclude
    });

    return { ticket };
  });

  app.post("/admin/support-tickets/:id/finalize", async (request) => {
    requireDatabase();
    const authUser = await requireRole(app, request, "ADMIN");
    const { id } = idParamSchema.parse(request.params);

    const ticket = await prisma.supportTicket.update({
      where: { id },
      data: {
        status: "WAITING_STUDENT",
        assignedToId: authUser.id,
        messages: {
          create: {
            senderId: authUser.id,
            senderType: "ADMIN",
            body: FINALIZE_PROMPT
          }
        }
      },
      include: ticketInclude
    });

    return { ticket };
  });

  app.post("/admin/support-tickets/:id/close", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);

    const ticket = await prisma.supportTicket.update({
      where: { id },
      data: { status: "CLOSED" },
      include: ticketInclude
    });

    return { ticket };
  });

  app.delete("/admin/support-tickets/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.supportTicket.delete({ where: { id } });

    return { ok: true };
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

  app.delete("/admin/ai-workout-plans/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.aiWorkoutPlan.delete({ where: { id } });

    return { ok: true };
  });

  // ===== Módulos: Produtos, Compras, Cartões, Favoritos, Avaliações, Contato e Configurações =====

  const productSchema = z.object({
    name: z.string().min(2),
    description: z.string().optional(),
    priceInCents: z.number().int().min(0).default(0),
    imageUrl: z.string().optional(),
    category: z.string().optional(),
    isActive: z.boolean().default(true)
  });

  const purchaseSchema = z.object({
    userId: z.string().min(1),
    productId: z.string().min(1),
    amountInCents: z.number().int().min(0),
    status: z.enum(["PENDING", "CONFIRMED", "CANCELED", "REFUNDED"]).default("PENDING"),
    paymentMethod: z.string().optional()
  });

  const paymentCardSchema = z.object({
    userId: z.string().min(1),
    brand: z.string().optional(),
    lastFour: z.string().length(4),
    holderName: z.string().optional(),
    isDefault: z.boolean().default(false)
  });

  const contactMessageUpdateSchema = z.object({
    status: z.enum(["OPEN", "RESOLVED", "CLOSED"]).optional()
  });

  app.get("/admin/products", async () => {
    requireDatabase();
    const products = await prisma.product.findMany({
      include: {
        _count: { select: { purchases: true, favorites: true, ratings: true } }
      },
      orderBy: { createdAt: "desc" }
    });

    return { products };
  });

  app.post("/admin/products", async (request, reply) => {
    requireDatabase();
    const body = productSchema.parse(request.body);
    const product = await prisma.product.create({ data: body });

    return reply.code(201).send({ product });
  });

  app.put("/admin/products/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const body = productSchema.partial().parse(request.body);
    const product = await prisma.product.update({ where: { id }, data: body });

    return { product };
  });

  app.delete("/admin/products/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.$transaction([
      prisma.favorite.deleteMany({ where: { productId: id } }),
      prisma.rating.deleteMany({ where: { productId: id } }),
      prisma.product.delete({ where: { id } })
    ]);

    return { ok: true };
  });

  app.get("/admin/purchases", async () => {
    requireDatabase();
    const purchases = await prisma.purchase.findMany({
      include: { user: true, product: true },
      orderBy: { createdAt: "desc" }
    });

    return { purchases };
  });

  app.post("/admin/purchases", async (request, reply) => {
    requireDatabase();
    const body = purchaseSchema.parse(request.body);
    const purchase = await prisma.purchase.create({
      data: body,
      include: { user: true, product: true }
    });

    return reply.code(201).send({ purchase });
  });

  app.put("/admin/purchases/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const body = purchaseSchema.partial().parse(request.body);
    const purchase = await prisma.purchase.update({
      where: { id },
      data: {
        ...body,
        ...(body.status ? { paidAt: body.status === "CONFIRMED" ? new Date() : null } : {})
      },
      include: { user: true, product: true }
    });

    return { purchase };
  });

  app.delete("/admin/purchases/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.purchase.delete({ where: { id } });

    return { ok: true };
  });

  app.get("/admin/payment-cards", async () => {
    requireDatabase();
    const paymentCards = await prisma.paymentCard.findMany({
      include: { user: true },
      orderBy: { createdAt: "desc" }
    });

    return { paymentCards };
  });

  app.post("/admin/payment-cards", async (request, reply) => {
    requireDatabase();
    const body = paymentCardSchema.parse(request.body);
    if (body.isDefault) {
      await prisma.paymentCard.updateMany({
        where: { userId: body.userId },
        data: { isDefault: false }
      });
    }
    const paymentCard = await prisma.paymentCard.create({
      data: body,
      include: { user: true }
    });

    return reply.code(201).send({ paymentCard });
  });

  app.delete("/admin/payment-cards/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.paymentCard.delete({ where: { id } });

    return { ok: true };
  });

  app.get("/admin/favorites", async () => {
    requireDatabase();
    const favorites = await prisma.favorite.findMany({
      include: { user: true, product: true },
      orderBy: { createdAt: "desc" }
    });

    return { favorites };
  });

  app.delete("/admin/favorites/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.favorite.delete({ where: { id } });

    return { ok: true };
  });

  app.get("/admin/ratings", async () => {
    requireDatabase();
    const ratings = await prisma.rating.findMany({
      include: { user: true, product: true },
      orderBy: { createdAt: "desc" }
    });

    return { ratings };
  });

  app.delete("/admin/ratings/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.rating.delete({ where: { id } });

    return { ok: true };
  });

  app.get("/admin/contact-messages", async () => {
    requireDatabase();
    const contactMessages = await prisma.contactMessage.findMany({
      orderBy: { createdAt: "desc" }
    });

    return { contactMessages };
  });

  app.put("/admin/contact-messages/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const body = contactMessageUpdateSchema.parse(request.body);
    const contactMessage = await prisma.contactMessage.update({
      where: { id },
      data: {
        ...body,
        repliedAt: body.status === "RESOLVED" ? new Date() : null
      }
    });

    return { contactMessage };
  });

  app.delete("/admin/contact-messages/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.contactMessage.delete({ where: { id } });

    return { ok: true };
  });

  app.get("/admin/settings", async () => {
    requireDatabase();
    const records = await prisma.systemSetting.findMany();
    const settings = records.reduce<Record<string, string>>((acc, record) => {
      acc[record.key] = record.value;
      return acc;
    }, {});

    return { settings };
  });

  app.put("/admin/settings", async (request) => {
    requireDatabase();
    const body = z.record(z.string(), z.string()).parse(request.body);
    const entries = Object.entries(body);
    await prisma.$transaction(
      entries.map(([key, value]) =>
        prisma.systemSetting.upsert({
          where: { key },
          update: { value },
          create: { key, value }
        })
      )
    );

    return { ok: true };
  });
}
