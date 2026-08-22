import type { FastifyInstance } from "fastify";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { hashPassword, requirePathRole, requireRole } from "../auth.js";
import { env } from "../env.js";
import { prisma } from "../prisma.js";
import { isImageUploadExtension, optimizeUploadedImage } from "../media-optimize.js";
import { buildPublicUploadUrl, saveValidatedUpload, uploadsDir } from "../upload-security.js";
import type { UploadGroup } from "../upload-security.js";
import { autoCloseStaleTickets, FINALIZE_PROMPT, ticketInclude } from "./ticket.utils.js";
import { buildPaginationMeta, parsePagination } from "./pagination.js";
import { calculateBodyFatEstimate, physicalAssessmentFormSchema } from "./physical-assessment.utils.js";
import {
  calculateProgramEndDate,
  estimateProgramDurationDays,
  parseProgramMetadata,
  parseRepetitionRange
} from "./workout-program.utils.js";
import { buildProgramPublishReadiness, studentMatchesProgramTargetGender } from "./cms-publication.utils.js";
import { syncUserEnrollmentFromMemberships, validActiveMembershipWhere } from "./membership.utils.js";
import {
  activateSystemModules,
  assertModuleEnabled,
  DEFAULT_SYSTEM_SETTINGS,
  decrementProductStock,
  ensureDefaultSystemSettings,
  normalizeProductShippingMethod,
  PURCHASE_PAID_STATUSES,
  resolvePurchaseTimestamps
} from "./commerce.utils.js";
import { fanOutStudentNotifications, notifyStudent } from "./notification.utils.js";
import { createAsaasCheckout } from "./asaas.client.js";
import { asaasStatusToPaymentStatus } from "./asaas.routes.js";

const uploadGroups = ["lessons", "materials", "images", "audio"] as const;
const uploadSchema = z.object({
  group: z.enum(uploadGroups).default("materials")
});

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
  level: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  avatarUrl: z.string().optional().or(z.literal("")),
  locationId: z.string().optional().or(z.literal(""))
});

const updateUserSchema = userSchema.partial().extend({
  email: z.string().email().optional(),
  password: z.string().min(6).optional().or(z.literal(""))
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

const urlOrRelative = z.union([z.string().url(), z.literal(""), z.string().startsWith("/")]);

const cmsExerciseSchema = z.object({
  title: z.string().min(2),
  videoUrl: urlOrRelative,
  audioUrl: urlOrRelative,
  materialUrl: urlOrRelative,
  notes: z.string().optional(),
  targetMuscles: z.array(z.string().min(1)).default([]),
  equipmentTags: z.array(z.string().min(1)).default([]),
  modalityIds: z.array(z.string().min(1)).default([]),
  alternativeIds: z.array(z.string().min(1)).default([])
});

const workoutStructureTypes = [
  "NORMAL",
  "BI_SET",
  "DROP_SET",
  "REST_PAUSE",
  "CIRCUIT",
  "AMRAP",
  "EMOM",
  "FOR_TIME",
  "TABATA",
  "INTERVAL",
  "CLASS"
] as const;
const prescriptionTypes = ["REPETITIONS", "DURATION", "DISTANCE", "INTERVAL", "ROUNDS", "HOLD", "FREE"] as const;
const intensityTypes = ["NONE", "LOAD", "RPE", "RIR", "PERCENT_1RM", "HEART_RATE_ZONE", "PACE", "SPEED"] as const;

const cmsWorkoutExerciseSchema = z
  .object({
    exerciseId: z.string().min(1),
    sets: z.coerce.number().int().min(1).default(1),
    repsRange: z.string().min(1).default("Livre"),
    prescriptionType: z.enum(prescriptionTypes).default("REPETITIONS"),
    repsMin: z.coerce.number().int().min(1).nullable().optional(),
    repsMax: z.coerce.number().int().min(1).nullable().optional(),
    durationSeconds: z.coerce.number().int().min(1).nullable().optional(),
    distanceMeters: z.coerce.number().positive().nullable().optional(),
    rounds: z.coerce.number().int().min(1).nullable().optional(),
    workSeconds: z.coerce.number().int().min(1).nullable().optional(),
    intensityType: z.enum(intensityTypes).default("NONE"),
    intensityValue: z.string().optional(),
    tempo: z.string().optional(),
    side: z.string().optional(),
    executionNotes: z.string().max(1000).optional(),
    initialLoad: z.string().optional(),
    restSeconds: z.coerce.number().int().min(0).optional(),
    supportMaterialUrl: urlOrRelative.optional(),
    order: z.coerce.number().int().min(1)
  })
  .superRefine((value, context) => {
    if (["DURATION", "HOLD"].includes(value.prescriptionType) && !value.durationSeconds) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["durationSeconds"], message: "Informe a duração em segundos." });
    }
    if (value.prescriptionType === "DISTANCE" && !value.distanceMeters) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["distanceMeters"], message: "Informe a distância em metros." });
    }
    if (value.prescriptionType === "INTERVAL" && !value.workSeconds) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["workSeconds"], message: "Informe o tempo de trabalho do intervalo." });
    }
    if (value.prescriptionType === "ROUNDS" && !value.rounds) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["rounds"], message: "Informe a quantidade de rounds." });
    }
    if (value.repsMin && value.repsMax && value.repsMax < value.repsMin) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["repsMax"], message: "A repetição máxima deve ser maior ou igual à mínima." });
    }
  });

const cmsWorkoutBlockSchema = z.object({
  title: z.string().min(2),
  identifier: z.string().optional(),
  focus: z.string().optional(),
  weeklyFrequency: z.coerce.number().int().min(1).max(7).default(1),
  structureType: z.enum(workoutStructureTypes).default("NORMAL"),
  restTime: z.coerce.number().int().min(0),
  protocolRounds: z.coerce.number().int().min(1).nullable().optional(),
  workSeconds: z.coerce.number().int().min(1).nullable().optional(),
  timeCapSeconds: z.coerce.number().int().min(1).nullable().optional(),
  instructions: z.string().max(2000).optional(),
  modalityId: z.string().min(1, "Selecione a modalidade da divisão."),
  exercises: z.array(cmsWorkoutExerciseSchema).min(1, "Cadastre ao menos um exercício no bloco.")
});

const cmsPublishBlockSchema = z.object({
  title: z.string().min(2).optional(),
  targetGender: z.enum(["ALL", "MALE", "FEMALE"]).optional(),
  audienceMode: z.enum(["ALL_ACTIVE", "SELECTED"]).default("ALL_ACTIVE"),
  durationWeeks: z.coerce.number().int().min(1).max(520).default(4),
  plannedSessions: z.coerce.number().int().min(1).max(10000).optional()
});

const cmsProgramObjectSchema = z.object({
    title: z.string().min(2),
    description: z.string().min(2),
    modalityId: z.string().min(1),
    durationYears: z.coerce.number().int().min(0).max(10).default(0),
    durationMonths: z.coerce.number().int().min(0).max(11).default(0),
    durationWeeks: z.coerce.number().int().min(0).max(520).default(0),
    durationExtraDays: z.coerce.number().int().min(0).max(6).default(0),
    durationDays: z.coerce.number().int().min(1).optional(),
    plannedSessions: z.coerce.number().int().min(1).max(10000).optional(),
    totalWorkouts: z.coerce.number().int().min(1).max(10000).optional(),
    completionMode: z.enum(["BY_SESSIONS", "BY_DATE", "BOTH", "MANUAL"]).default("BY_SESSIONS"),
    scheduleType: z.enum(["ROTATING_CYCLE", "WEEKLY", "ON_DEMAND"]).default("ROTATING_CYCLE"),
    audienceMode: z.enum(["ALL_ACTIVE", "SELECTED"]).default("ALL_ACTIVE"),
    cycleLengthDays: z.coerce.number().int().min(1).max(56).default(7),
    targetGender: z.enum(["ALL", "MALE", "FEMALE"]).default("ALL"),
    sortOrder: z.coerce.number().int().min(0).optional(),
    status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
    isActive: z.coerce.boolean().default(true),
    days: z
      .array(
        z.object({
          workoutBlockId: z.string().min(1),
          dayNumber: z.coerce.number().int().min(1).max(56),
          order: z.coerce.number().int().min(1)
        })
      )
      .min(1, "Cadastre ao menos uma sessão no programa.")
  });

const cmsProgramSchema = cmsProgramObjectSchema.superRefine((value, context) => {
    if (value.durationYears + value.durationMonths + value.durationWeeks + value.durationExtraDays === 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["durationWeeks"], message: "Informe uma duração maior que zero." });
    }
    if (value.days.some((day) => day.dayNumber > value.cycleLengthDays)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["days"], message: "Existe uma sessão fora do tamanho do ciclo configurado." });
    }
    if (!value.days.some((day) => day.dayNumber === 1)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["days"], message: "A posição 1 do ciclo é obrigatória." });
    }
    const seenDays = new Set<number>();
    for (const day of value.days) {
      if (seenDays.has(day.dayNumber)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["days"],
          message: `Existem sessões duplicadas na posição ${day.dayNumber}.`
        });
        break;
      }
      seenDays.add(day.dayNumber);
    }
    if (value.scheduleType === "WEEKLY" && value.cycleLengthDays !== 7) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["cycleLengthDays"], message: "A grade semanal deve ter exatamente 7 posições." });
    }
  });

const cmsProgramUpdateSchema = cmsProgramObjectSchema.partial().extend({
  days: cmsProgramObjectSchema.shape.days.optional()
});

const cmsExerciseUpdateSchema = cmsExerciseSchema.partial();

const cmsWorkoutBlockUpdateSchema = cmsWorkoutBlockSchema.partial();

const cmsModalitySchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  imageUrl: urlOrRelative,
  type: z.string().default("EXERCISE"),
  isActive: z.coerce.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).default(0)
});

const cmsProgramAssignSchema = z.object({
  userIds: z.array(z.string().min(1)).optional(),
  currentDay: z.coerce.number().int().min(1).default(1),
  totalWorkouts: z.coerce.number().int().min(1).optional(),
  resetProgress: z.coerce.boolean().default(false)
});

type CmsWorkoutExerciseInput = z.infer<typeof cmsWorkoutExerciseSchema>;

function buildWorkoutExerciseData(exercise: CmsWorkoutExerciseInput) {
  const parsedRange = parseRepetitionRange(exercise.repsRange);

  return {
    exerciseId: exercise.exerciseId,
    sets: exercise.sets,
    repsRange: exercise.repsRange,
    prescriptionType: exercise.prescriptionType,
    repsMin: exercise.repsMin ?? parsedRange.min,
    repsMax: exercise.repsMax ?? parsedRange.max,
    durationSeconds: exercise.durationSeconds ?? null,
    distanceMeters: exercise.distanceMeters ?? null,
    rounds: exercise.rounds ?? null,
    workSeconds: exercise.workSeconds ?? null,
    intensityType: exercise.intensityType,
    intensityValue: exercise.intensityValue || null,
    tempo: exercise.tempo || null,
    side: exercise.side || null,
    executionNotes: exercise.executionNotes || null,
    initialLoad: exercise.initialLoad || null,
    restSeconds: exercise.restSeconds ?? null,
    supportMaterialUrl: exercise.supportMaterialUrl || null,
    order: exercise.order
  };
}

function programDurationFields(input: {
  durationYears: number;
  durationMonths: number;
  durationWeeks: number;
  durationExtraDays: number;
}) {
  const duration = {
    years: input.durationYears,
    months: input.durationMonths,
    weeks: input.durationWeeks,
    days: input.durationExtraDays
  };

  return {
    duration,
    estimatedDays: estimateProgramDurationDays(duration)
  };
}

/** ACADEMY=Academia, UNIT=Box, CLUB=Studio (labels na UI). */
const locationTypeEnum = z.enum(["ACADEMY", "UNIT", "CLUB"]);

const cmsLocationSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).optional(),
  // Sem .default() aqui: em PUT parcial o default regrava o tipo indevidamente.
  type: locationTypeEnum.optional(),
  description: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  phone: z.string().optional(),
  imageUrl: urlOrRelative,
  isActive: z.coerce.boolean().optional(),
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

const physicalAssessmentFormWithUserSchema = physicalAssessmentFormSchema.extend({
  userId: z.string().min(1),
  assessedAt: z.coerce.date().optional()
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

function httpError(statusCode: number, message: string) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;

  return error;
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
      deletedAt: null,
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
      deletedAt: null,
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
      },
      deletedAt: null
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
      workoutDayId: null,
      deletedAt: null
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
      },
      deletedAt: null
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

async function assertWorkoutBlocksMatchModality(workoutBlockIds: string[], modalityId: string) {
  const blocks = await prisma.workoutBlock.findMany({
    where: {
      id: { in: uniqueValues(workoutBlockIds) },
      deletedAt: null
    },
    select: {
      id: true,
      title: true,
      modalityId: true
    }
  });
  const withoutModality = blocks.filter((block) => !block.modalityId);
  if (withoutModality.length > 0) {
    throw httpError(
      400,
      `Divisão sem modalidade (vincule a modalidade antes de publicar): ${withoutModality.map((block) => block.title).join(", ")}.`
    );
  }
  const incompatible = blocks.filter((block) => block.modalityId !== modalityId);

  if (incompatible.length > 0) {
    throw httpError(
      400,
      `A modalidade do programa não corresponde à ficha: ${incompatible.map((block) => block.title).join(", ")}.`
    );
  }
}

async function assertExercisesMatchModality(exerciseIds: string[], modalityId: string) {
  const exercises = await prisma.exercise.findMany({
    where: {
      id: { in: uniqueValues(exerciseIds) },
      deletedAt: null
    },
    select: {
      id: true,
      title: true,
      name: true,
      modalityLinks: {
        where: { modalityId },
        select: { id: true }
      }
    }
  });
  const incompatible = exercises.filter((exercise) => exercise.modalityLinks.length === 0);

  if (incompatible.length > 0) {
    throw httpError(
      400,
      `Exercício sem vínculo com a modalidade da ficha: ${incompatible.map((exercise) => exercise.title ?? exercise.name ?? exercise.id).join(", ")}.`
    );
  }
}

async function assignProgramToStudents(
  programId: string,
  currentDay = 1,
  totalWorkouts?: number,
  userIds?: string[]
) {
  return assignProgramToActiveStudents(programId, currentDay, totalWorkouts, userIds);
}

async function getActiveStudentIds(userIds?: string[], targetGender: "ALL" | "MALE" | "FEMALE" = "ALL") {
  const students = await prisma.user.findMany({
    where: {
      role: "USER",
      status: "ACTIVE",
      deletedAt: null,
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
            some: validActiveMembershipWhere()
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

async function loadProgramPublishContext(programId: string) {
  return prisma.program.findUniqueOrThrow({
    where: { id: programId },
    include: {
      modality: true,
      assignedUsers: {
        where: {
          status: "ACTIVE"
        },
        select: {
          id: true
        }
      },
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
      }
    }
  });
}

async function getProgramPublishPreview(programId: string) {
  const program = await loadProgramPublishContext(programId);
  const readiness = buildProgramPublishReadiness({
    daysCount: program.days.length,
    modality: program.modality,
    days: program.days
  });
  const eligibleStudentIds = await getActiveStudentIds(undefined, program.targetGender);
  const audienceLabel =
    program.audienceMode === "ALL_ACTIVE"
      ? "Todos os alunos ativos elegíveis"
      : "Somente alunos atribuídos manualmente";

  return {
    programId: program.id,
    title: program.title,
    status: program.status,
    audienceMode: program.audienceMode,
    audienceLabel,
    targetGender: program.targetGender,
    ready: readiness.ready,
    issues: readiness.issues,
    eligibleStudentCount:
      program.audienceMode === "ALL_ACTIVE" ? eligibleStudentIds.length : program.assignedUsers.length,
    dayCount: program.days.length,
    modalityName: program.modality?.name ?? null
  };
}

async function assertProgramReadyForPublish(programId: string) {
  const program = await loadProgramPublishContext(programId);
  const readiness = buildProgramPublishReadiness({
    daysCount: program.days.length,
    modality: program.modality,
    days: program.days
  });

  if (!readiness.ready) {
    throw httpError(409, readiness.issues.join(" "));
  }

  return program;
}

async function assignProgramToActiveStudents(
  programId: string,
  currentDay = 1,
  totalWorkouts?: number,
  userIds?: string[],
  targetGenderOverride?: "ALL" | "MALE" | "FEMALE",
  resetProgress = false,
  reactivateCanceled = false
) {
  const program = await prisma.program.findUniqueOrThrow({
    where: { id: programId },
    select: {
      targetGender: true,
      totalWorkouts: true,
      durationYears: true,
      durationMonths: true,
      durationWeeks: true,
      durationExtraDays: true
    }
  });
  const workoutGoal = totalWorkouts ?? program.totalWorkouts;
  const activeStudentIds = await getActiveStudentIds(userIds, targetGenderOverride ?? program.targetGender);

  if (activeStudentIds.length === 0) {
    return [];
  }

  const existingAssignments = await prisma.userProgram.findMany({
    where: {
      programId,
      userId: { in: activeStudentIds }
    }
  });
  const existingByUserId = new Map(existingAssignments.map((assignment) => [assignment.userId, assignment]));
  const startedAt = new Date();
  const plannedEndsAt = calculateProgramEndDate(startedAt, {
    years: program.durationYears,
    months: program.durationMonths,
    weeks: program.durationWeeks,
    days: program.durationExtraDays
  });

  return prisma.$transaction(
    activeStudentIds.map((userId) => {
      const existing = existingByUserId.get(userId);

      if (!existing) {
        return prisma.userProgram.create({
          data: {
            userId,
            programId,
            currentDay,
            totalWorkouts: workoutGoal,
            completedWorkouts: 0,
            status: "ACTIVE",
            startedAt,
            plannedEndsAt
          }
        });
      }

      const shouldReactivateCanceled = reactivateCanceled && existing.status === "CANCELED";
      return prisma.userProgram.update({
        where: { id: existing.id },
        data: {
          totalWorkouts: workoutGoal,
          completedWorkouts: resetProgress ? 0 : existing.completedWorkouts,
          currentDay: resetProgress ? currentDay : existing.currentDay,
          startedAt: resetProgress ? startedAt : existing.startedAt,
          plannedEndsAt: resetProgress || !existing.plannedEndsAt ? plannedEndsAt : existing.plannedEndsAt,
          status: resetProgress || shouldReactivateCanceled ? "ACTIVE" : existing.status,
          completedAt: resetProgress || shouldReactivateCanceled ? null : existing.completedAt
        }
      });
    })
  );
}

async function cancelMismatchedProgramAssignments(programId: string, targetGender: "ALL" | "MALE" | "FEMALE") {
  if (targetGender === "ALL") {
    return 0;
  }

  const activeAssignments = await prisma.userProgram.findMany({
    where: {
      programId,
      status: "ACTIVE"
    },
    include: {
      user: {
        include: {
          profile: {
            select: { gender: true }
          }
        }
      }
    }
  });

  const mismatchedIds = activeAssignments
    .filter((assignment) => !studentMatchesProgramTargetGender(targetGender, assignment.user.profile?.gender))
    .map((assignment) => assignment.id);

  if (mismatchedIds.length === 0) {
    return 0;
  }

  await prisma.userProgram.updateMany({
    where: { id: { in: mismatchedIds } },
    data: { status: "CANCELED" }
  });

  return mismatchedIds.length;
}

/** Mantém atribuições alinhadas ao público por sexo (e reatribui alunos ativos elegíveis quando ALL_ACTIVE). */
async function reconcileProgramAudienceAssignments(programId: string) {
  const program = await prisma.program.findUniqueOrThrow({
    where: { id: programId },
    select: {
      status: true,
      isActive: true,
      audienceMode: true,
      targetGender: true,
      plannedSessions: true
    }
  });

  const canceledCount = await cancelMismatchedProgramAssignments(programId, program.targetGender);

  if (program.status !== "PUBLISHED" || !program.isActive) {
    return { assigned: [] as Awaited<ReturnType<typeof assignProgramToActiveStudents>>, canceledCount };
  }

  if (program.audienceMode === "ALL_ACTIVE") {
    const assigned = await assignProgramToActiveStudents(programId, 1, program.plannedSessions);
    return { assigned, canceledCount };
  }

  return { assigned: [] as Awaited<ReturnType<typeof assignProgramToActiveStudents>>, canceledCount };
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
    await requirePathRole(app, request, "/admin", "ADMIN");
  });

  const adminMeSchema = z.object({
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional().or(z.literal("")),
    document: z.string().optional().or(z.literal("")),
    birthDate: z.string().optional().or(z.literal("")),
    gender: z.enum(["MALE", "FEMALE"]).optional().or(z.literal("")),
    city: z.string().optional().or(z.literal("")),
    state: z.string().optional().or(z.literal("")),
    password: z.string().min(6).optional().or(z.literal("")),
    avatarUrl: z.string().optional().or(z.literal(""))
  });

  function toAdminMeProfile(user: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    role: string;
    status: string;
    provider: string | null;
    createdAt: Date;
    profile: {
      phone: string | null;
      document: string | null;
      birthDate: Date | null;
      gender: "MALE" | "FEMALE" | null;
      city: string | null;
      state: string | null;
      avatarUrl: string | null;
    } | null;
  }) {
    return {
      id: user.id,
      name: user.name,
      email: user.email ?? "",
      phone: user.phone ?? user.profile?.phone ?? null,
      document: user.profile?.document ?? null,
      birthDate: user.profile?.birthDate ? user.profile.birthDate.toISOString().slice(0, 10) : null,
      gender: user.profile?.gender ?? null,
      city: user.profile?.city ?? null,
      state: user.profile?.state ?? null,
      role: user.role,
      status: user.status,
      provider: user.provider ?? "EMAIL",
      avatarUrl: user.profile?.avatarUrl ?? null,
      createdAt: user.createdAt
    };
  }

  app.get("/admin/me", async (request) => {
    requireDatabase();
    const authUser = await requireRole(app, request, "ADMIN");
    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      include: { profile: true }
    });

    if (!user || user.deletedAt || user.status !== "ACTIVE") {
      throw httpError(404, "Administrador não encontrado.");
    }

    return { profile: toAdminMeProfile(user) };
  });

  app.put("/admin/me", async (request) => {
    requireDatabase();
    const authUser = await requireRole(app, request, "ADMIN");
    const body = adminMeSchema.parse(request.body);
    const password = body.password?.trim() || undefined;
    const birthDate =
      body.birthDate === undefined
        ? undefined
        : body.birthDate
          ? new Date(`${body.birthDate.slice(0, 10)}T12:00:00.000Z`)
          : null;
    const gender =
      body.gender === undefined ? undefined : body.gender === "" ? null : body.gender;

    const user = await prisma.user.update({
      where: { id: authUser.id },
      data: {
        name: body.name,
        email: body.email?.toLowerCase(),
        phone: body.phone === undefined ? undefined : body.phone || null,
        passwordHash: password ? await hashPassword(password) : undefined,
        profile: {
          upsert: {
            create: {
              phone: body.phone || null,
              document: body.document || null,
              birthDate: birthDate ?? null,
              gender: gender ?? null,
              city: body.city || null,
              state: body.state || null,
              avatarUrl: body.avatarUrl === undefined ? undefined : body.avatarUrl || null
            },
            update: {
              phone: body.phone === undefined ? undefined : body.phone || null,
              document: body.document === undefined ? undefined : body.document || null,
              birthDate,
              gender,
              city: body.city === undefined ? undefined : body.city || null,
              state: body.state === undefined ? undefined : body.state || null,
              avatarUrl: body.avatarUrl === undefined ? undefined : body.avatarUrl || null
            }
          }
        }
      },
      include: { profile: true }
    });

    return { profile: toAdminMeProfile(user) };
  });

  app.post(
    "/admin/uploads",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
    const { group } = uploadSchema.parse(request.query);
    const file = await request.file();

    if (!file) {
      throw httpError(400, "Selecione um arquivo para enviar.");
    }

    const targetDir = resolve(uploadsDir, group);
    mkdirSync(targetDir, { recursive: true });

    const baseFilename = `${Date.now()}-${randomUUID()}`;
    const targetPath = resolve(targetDir, baseFilename);
    const extension = await saveValidatedUpload(
      file.file,
      targetPath,
      group as UploadGroup,
      file.mimetype,
      file.filename
    );

    if (!extension) {
      request.log.warn(
        {
          group,
          filename: file.filename,
          mimetype: file.mimetype
        },
        "upload rejected by type validation"
      );
      throw httpError(
        400,
        group === "audio"
          ? "Formato de áudio não permitido. Use MP3, WAV, OGG, M4A, AAC ou FLAC."
          : "Tipo de arquivo não permitido para o CMS Fitness."
      );
    }

    let storedFilename = `${baseFilename}.${extension}`;
    let mimeType = file.mimetype;
    let relativePath = `${group}/${storedFilename}`;

    if ((group === "images" || group === "lessons") && isImageUploadExtension(extension)) {
      const optimized = await optimizeUploadedImage({
        absolutePath: targetPath,
        group,
        baseFilename,
        extension,
        maxEdge: 1600,
        quality: 78
      });
      storedFilename = optimized.filename;
      mimeType = optimized.mimeType;
      relativePath = optimized.relativePath;
    } else {
      const { rename } = await import("node:fs/promises");
      await rename(targetPath, resolve(targetDir, storedFilename));
    }

    return reply.code(201).send({
      file: {
        originalName: file.filename,
        filename: storedFilename,
        mimeType,
        url: buildPublicUploadUrl(relativePath),
        path: relativePath
      }
    });
    }
  );

  app.get("/admin/summary", async () => {
    requireDatabase();
    const today = toDateOnly();
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const [users, activeMemberships, pendingPayments, todayAttendance] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.membership.count({ where: validActiveMembershipWhere() }),
      prisma.payment.count({ where: { status: "PENDING", deletedAt: null } }),
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

  app.get("/admin/users", async (request) => {
    requireDatabase();
    const { page, perPage, skip, take } = parsePagination(request.query as Record<string, unknown>);
    const where = { deletedAt: null };
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          profile: true,
          memberships: {
            where: { deletedAt: null },
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
        },
        skip,
        take
      }),
      prisma.user.count({ where })
    ]);

    return { users, meta: buildPaginationMeta(total, page, perPage) };
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
            where: { deletedAt: null },
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
    const now = new Date();
    const activeMembership =
      student.memberships.find((membership) => {
        if (membership.status !== "ACTIVE" || membership.deletedAt) return false;
        if (membership.startsAt > now) return false;
        if (membership.endsAt && membership.endsAt < now) return false;
        return true;
      }) ?? null;

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
            level: body.level,
            city: body.city,
            state: body.state,
            avatarUrl: body.avatarUrl || null,
            locationId: body.locationId || null
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
    const { password, phone, document, gender, objective, level, city, state, avatarUrl, locationId, ...userData } = body;

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...userData,
        email: userData.email?.toLowerCase(),
        phone,
        passwordHash: password ? await hashPassword(password) : undefined,
        profile: {
          upsert: {
            create: {
              phone,
              document,
              gender: gender || null,
              objective,
              level,
              city,
              state,
              avatarUrl: avatarUrl === undefined ? undefined : avatarUrl || null,
              locationId: locationId || null
            },
            update: {
              phone,
              document,
              gender: gender || null,
              objective,
              level,
              city,
              state,
              avatarUrl: avatarUrl === undefined ? undefined : avatarUrl || null,
              locationId: locationId || null
            }
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
    await prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: "INACTIVE" }
    });

    return { ok: true };
  });

  app.get("/admin/workouts", async () => {
    requireDatabase();
    const workouts = await prisma.workout.findMany({
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
    await prisma.workout.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
    return { ok: true };
  });

  app.get("/admin/cms/modalities", async () => {
    requireDatabase();
    await ensureDefaultModalities();
    const modalities = await prisma.modality.findMany({
      where: { deletedAt: null },
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

  app.post("/admin/cms/modalities/reorder", async (request, reply) => {
    requireDatabase();
    const body = z
      .object({
        ids: z.array(z.string().min(1)).min(1)
      })
      .parse(request.body);
    if (new Set(body.ids).size !== body.ids.length) {
      return reply.code(400).send({ error: "Lista de reordenação contém duplicados." });
    }
    await prisma.$transaction(
      body.ids.map((id, index) =>
        prisma.modality.update({
          where: { id },
          data: { sortOrder: index + 1 }
        })
      )
    );
    const modalities = await prisma.modality.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    });

    return { modalities };
  });

  app.delete("/admin/cms/modalities/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.modality.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date()
      }
    });

    return { ok: true };
  });

  app.post("/admin/cms/modalities/:id/restore", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const modality = await prisma.modality.update({
      where: { id },
      data: {
        isActive: true,
        deletedAt: null
      }
    });

    return { ok: true, modality };
  });

  app.delete("/admin/cms/modalities/:id/permanent", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.$transaction([
      prisma.exerciseModality.deleteMany({ where: { modalityId: id } }),
      prisma.workoutBlock.updateMany({ where: { modalityId: id }, data: { modalityId: null } }),
      prisma.program.updateMany({ where: { modalityId: id }, data: { modalityId: null } }),
      prisma.modality.delete({ where: { id } })
    ]);

    return { ok: true };
  });

  app.get("/admin/cms/locations", async () => {
    requireDatabase();
    const locations = await prisma.location.findMany({
      where: { deletedAt: null },
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
        type: body.type ?? "ACADEMY",
        description: body.description,
        address: body.address,
        city: body.city,
        state: body.state,
        phone: body.phone,
        imageUrl: body.imageUrl || null,
        isActive: body.isActive ?? true,
        sortOrder
      }
    });

    if (location.isActive) {
      await fanOutStudentNotifications({
        type: "LOCATION",
        title: "Nova unidade cadastrada",
        message: location.name,
        targetSection: "locations",
        sourceType: "location",
        sourceId: location.id
      });
    }

    return reply.code(201).send({ location });
  });

  app.put("/admin/cms/locations/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const body = cmsLocationSchema.partial().parse(request.body);

    if (body.slug) {
      await assertLocationSlugAvailable(slugify(body.slug), id);
    }

    const current = await prisma.location.findUniqueOrThrow({ where: { id } });
    const location = await prisma.location.update({
      where: { id },
      data: {
        name: body.name,
        slug: body.slug ? slugify(body.slug) : undefined,
        ...(body.type !== undefined ? { type: body.type } : {}),
        description: body.description,
        address: body.address,
        city: body.city,
        state: body.state,
        phone: body.phone,
        imageUrl: body.imageUrl === undefined ? undefined : body.imageUrl || null,
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        sortOrder: body.sortOrder
      }
    });

    if (location.isActive && !current.isActive) {
      await fanOutStudentNotifications({
        type: "LOCATION",
        title: "Nova unidade cadastrada",
        message: location.name,
        targetSection: "locations",
        sourceType: "location",
        sourceId: location.id
      });
    }

    return { location };
  });

  app.delete("/admin/cms/locations/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.location.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date()
      }
    });

    return { ok: true };
  });

  app.post("/admin/cms/locations/:id/restore", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const location = await prisma.location.update({
      where: { id },
      data: {
        isActive: true,
        deletedAt: null
      }
    });

    return { ok: true, location };
  });

  app.delete("/admin/cms/locations/:id/permanent", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.location.delete({ where: { id } });

    return { ok: true };
  });

  app.get("/admin/cms/announcements", async () => {
    requireDatabase();
    const announcements = await prisma.announcement.findMany({
      where: { deletedAt: null },
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

    if (announcement.status === "PUBLISHED") {
      await fanOutStudentNotifications({
        type: "ANNOUNCEMENT",
        title: announcement.title,
        message: announcement.body,
        sourceType: "announcement",
        sourceId: announcement.id
      });
    }

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

    if (nextStatus === "PUBLISHED" && current.status !== "PUBLISHED") {
      await fanOutStudentNotifications({
        type: "ANNOUNCEMENT",
        title: announcement.title,
        message: announcement.body,
        sourceType: "announcement",
        sourceId: announcement.id
      });
    }

    return { announcement };
  });

  app.delete("/admin/cms/announcements/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.announcement.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    return { ok: true };
  });

  app.get("/admin/cms/exercises", async () => {
    requireDatabase();
    const exercises = await prisma.exercise.findMany({
      where: {
        workoutDayId: null,
        deletedAt: null
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
    await prisma.exercise.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    return { ok: true };
  });

  app.post("/admin/cms/exercises/:id/restore", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const exercise = await prisma.exercise.update({
      where: { id },
      data: { deletedAt: null }
    });

    return { ok: true, exercise };
  });

  app.delete("/admin/cms/exercises/:id/permanent", async (request) => {
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
      where: { deletedAt: null },
      include: {
        modality: true,
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
    await assertModalitiesExist([body.modalityId]);
    await assertExercisesMatchModality(body.exercises.map((exercise) => exercise.exerciseId), body.modalityId);
    const workoutBlock = await prisma.workoutBlock.create({
      data: {
        title: body.title,
        identifier: body.identifier || null,
        focus: body.focus || null,
        weeklyFrequency: body.weeklyFrequency,
        structureType: body.structureType,
        restTime: body.restTime,
        protocolRounds: body.protocolRounds ?? null,
        workSeconds: body.workSeconds ?? null,
        timeCapSeconds: body.timeCapSeconds ?? null,
        instructions: body.instructions || null,
        modalityId: body.modalityId,
        exercises: {
          create: body.exercises.map(buildWorkoutExerciseData)
        }
      },
      include: {
        modality: true,
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
      }
    });

    return reply.code(201).send({ workoutBlock });
  });

  app.post("/admin/cms/workout-blocks/:id/publish", async (request, reply) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const body = cmsPublishBlockSchema.parse(request.body ?? {});

    const workoutBlock = await prisma.workoutBlock.findFirst({
      where: { id, deletedAt: null },
      include: {
        modality: true,
        exercises: {
          where: { exercise: { deletedAt: null } },
          include: { exercise: true },
          orderBy: { order: "asc" }
        }
      }
    });

    if (!workoutBlock) {
      throw httpError(404, "Divisão não encontrada.");
    }
    if (!workoutBlock.modalityId || !workoutBlock.modality || workoutBlock.modality.deletedAt) {
      throw httpError(409, "Vincule uma modalidade ativa à divisão antes de publicar para os alunos.");
    }
    if (!workoutBlock.modality.isActive) {
      throw httpError(409, `A modalidade "${workoutBlock.modality.name}" está inativa.`);
    }
    if (workoutBlock.exercises.length === 0) {
      throw httpError(409, "Cadastre ao menos um exercício ativo na divisão antes de publicar.");
    }

    await assertExercisesMatchModality(
      workoutBlock.exercises.map((entry) => entry.exerciseId),
      workoutBlock.modalityId
    );

    const programTitle = (body.title ?? workoutBlock.identifier ?? workoutBlock.title).trim();
    const plannedSessions = body.plannedSessions ?? Math.max(1, workoutBlock.weeklyFrequency * body.durationWeeks);

    // Reutiliza programa single-day já gerado a partir desta divisão (não altera ciclos multi-dia).
    const linkedDays = await prisma.programDayWorkout.findMany({
      where: { workoutBlockId: id },
      include: {
        program: {
          include: {
            days: true,
            modality: true
          }
        }
      }
    });
    const existingSingleDayProgram =
      linkedDays.find(
        (day) =>
          !day.program.deletedAt &&
          day.program.days.length === 1 &&
          day.program.days[0]?.workoutBlockId === id
      )?.program ?? null;
    const nextTargetGender = body.targetGender ?? existingSingleDayProgram?.targetGender ?? "ALL";

    const maxSortOrder = await prisma.program.aggregate({
      where: { deletedAt: null },
      _max: { sortOrder: true }
    });

    let program;
    if (existingSingleDayProgram) {
      program = await prisma.program.update({
        where: { id: existingSingleDayProgram.id },
        data: {
          modalityId: workoutBlock.modalityId,
          title: programTitle,
          description: buildProgramDescription(
            workoutBlock.focus
              ? `${workoutBlock.focus}. Publicado a partir da divisão.`
              : "Publicado a partir da divisão do estúdio.",
            workoutBlock.modality.name
          ),
          durationYears: 0,
          durationMonths: 0,
          durationWeeks: body.durationWeeks,
          durationExtraDays: 0,
          durationDays: body.durationWeeks * 7,
          plannedSessions,
          totalWorkouts: plannedSessions,
          completionMode: "BY_SESSIONS",
          scheduleType: "ROTATING_CYCLE",
          audienceMode: body.audienceMode,
          cycleLengthDays: 1,
          targetGender: nextTargetGender,
          status: "PUBLISHED",
          isActive: true,
          publishedAt: existingSingleDayProgram.publishedAt ?? new Date(),
          sortOrder:
            existingSingleDayProgram.status === "PUBLISHED"
              ? existingSingleDayProgram.sortOrder
              : (maxSortOrder._max.sortOrder ?? 0) + 1
        },
        include: {
          modality: true,
          days: {
            include: { workoutBlock: true },
            orderBy: [{ dayNumber: "asc" }, { order: "asc" }]
          },
          assignedUsers: {
            include: { user: true }
          }
        }
      });
    } else {
      program = await prisma.program.create({
        data: {
          modalityId: workoutBlock.modalityId,
          title: programTitle,
          description: buildProgramDescription(
            workoutBlock.focus
              ? `${workoutBlock.focus}. Publicado a partir da divisão.`
              : "Publicado a partir da divisão do estúdio.",
            workoutBlock.modality.name
          ),
          durationYears: 0,
          durationMonths: 0,
          durationWeeks: body.durationWeeks,
          durationExtraDays: 0,
          durationDays: body.durationWeeks * 7,
          plannedSessions,
          totalWorkouts: plannedSessions,
          completionMode: "BY_SESSIONS",
          scheduleType: "ROTATING_CYCLE",
          audienceMode: body.audienceMode,
          cycleLengthDays: 1,
          targetGender: nextTargetGender,
          status: "PUBLISHED",
          isActive: true,
          publishedAt: new Date(),
          sortOrder: (maxSortOrder._max.sortOrder ?? 0) + 1,
          days: {
            create: [
              {
                workoutBlockId: id,
                dayNumber: 1,
                order: 1
              }
            ]
          }
        },
        include: {
          modality: true,
          days: {
            include: { workoutBlock: true },
            orderBy: [{ dayNumber: "asc" }, { order: "asc" }]
          },
          assignedUsers: {
            include: { user: true }
          }
        }
      });
    }

    const reconciled = await reconcileProgramAudienceAssignments(program.id);
    const assignedCount = reconciled.assigned.length;
    const recipientIds = reconciled.assigned.map((item) => item.userId).filter(Boolean);

    await fanOutStudentNotifications({
      type: "WORKOUT_PROGRAM",
      title: "Novo programa de treino",
      message: program.title,
      targetSection: "training",
      sourceType: "program",
      sourceId: program.id,
      ...(recipientIds.length ? { userIds: recipientIds } : {})
    });

    return reply.code(existingSingleDayProgram ? 200 : 201).send({
      program,
      assignedCount,
      sourceWorkoutBlockId: id
    });
  });

  app.put("/admin/cms/workout-blocks/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const body = cmsWorkoutBlockUpdateSchema.parse(request.body);
    const currentWorkoutBlock = await prisma.workoutBlock.findUniqueOrThrow({
      where: { id },
      include: {
        exercises: {
          select: { exerciseId: true }
        }
      }
    });

    if (body.exercises !== undefined) {
      await assertCmsExercisesExist(body.exercises.map((exercise) => exercise.exerciseId));
    }
    if (body.modalityId !== undefined) {
      await assertModalitiesExist([body.modalityId]);
    }
    const nextBlockModalityId = body.modalityId === undefined ? currentWorkoutBlock.modalityId : body.modalityId;
    if ((body.exercises !== undefined || body.modalityId !== undefined) && !nextBlockModalityId) {
      throw httpError(409, "Vincule uma modalidade à divisão antes de salvar.");
    }
    if (nextBlockModalityId && (body.exercises !== undefined || body.modalityId !== undefined)) {
      await assertExercisesMatchModality(
        body.exercises?.map((exercise) => exercise.exerciseId) ?? currentWorkoutBlock.exercises.map((exercise) => exercise.exerciseId),
        nextBlockModalityId
      );
    }

    await prisma.$transaction([
      ...(body.exercises !== undefined
        ? [prisma.workoutBlockExercise.deleteMany({ where: { workoutBlockId: id } })]
        : []),
      prisma.workoutBlock.update({
        where: { id },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.identifier !== undefined ? { identifier: body.identifier || null } : {}),
          ...(body.focus !== undefined ? { focus: body.focus || null } : {}),
          ...(body.weeklyFrequency !== undefined ? { weeklyFrequency: body.weeklyFrequency } : {}),
          ...(body.structureType !== undefined ? { structureType: body.structureType } : {}),
          ...(body.restTime !== undefined ? { restTime: body.restTime } : {}),
          ...(body.protocolRounds !== undefined ? { protocolRounds: body.protocolRounds } : {}),
          ...(body.workSeconds !== undefined ? { workSeconds: body.workSeconds } : {}),
          ...(body.timeCapSeconds !== undefined ? { timeCapSeconds: body.timeCapSeconds } : {}),
          ...(body.instructions !== undefined ? { instructions: body.instructions || null } : {}),
          ...(body.modalityId !== undefined ? { modalityId: body.modalityId } : {}),
          ...(body.exercises !== undefined
            ? {
                exercises: {
                  create: body.exercises.map(buildWorkoutExerciseData)
                }
              }
            : {})
        }
      })
    ]);

    const workoutBlock = await prisma.workoutBlock.findUniqueOrThrow({
      where: { id },
      include: {
        modality: true,
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
      }
    });

    return { workoutBlock };
  });

  app.delete("/admin/cms/workout-blocks/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.workoutBlock.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    return { ok: true };
  });

  app.post("/admin/cms/workout-blocks/:id/restore", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const workoutBlock = await prisma.workoutBlock.update({
      where: { id },
      data: { deletedAt: null }
    });

    return { ok: true, workoutBlock };
  });

  app.delete("/admin/cms/workout-blocks/:id/permanent", async (request) => {
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
      where: { deletedAt: null },
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
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    });

    return { programs };
  });

  app.get("/admin/cms/workflow-summary", async () => {
    requireDatabase();

    const [modalities, exercises, workoutBlocks, programs] = await Promise.all([
      prisma.modality.findMany({
        where: { deletedAt: null },
        select: { id: true, isActive: true }
      }),
      prisma.exercise.findMany({
        where: {
          workoutDayId: null,
          deletedAt: null
        },
        select: {
          id: true,
          modalityLinks: {
            select: { id: true }
          }
        }
      }),
      prisma.workoutBlock.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          modalityId: true,
          exercises: {
            where: {
              exercise: {
                deletedAt: null
              }
            },
            select: { id: true }
          },
          programDays: {
            where: {
              program: {
                deletedAt: null,
                status: "PUBLISHED",
                isActive: true
              }
            },
            select: { id: true }
          }
        }
      }),
      prisma.program.findMany({
        where: { deletedAt: null },
        include: {
          modality: true,
          days: {
            include: {
              workoutBlock: {
                include: {
                  exercises: {
                    include: {
                      exercise: true
                    }
                  }
                }
              }
            }
          }
        }
      })
    ]);

    const draftPrograms = programs.filter((program) => program.status !== "PUBLISHED" || !program.isActive);
    const readyDraftCount = draftPrograms.filter((program) => {
      const readiness = buildProgramPublishReadiness({
        daysCount: program.days.length,
        modality: program.modality,
        days: program.days
      });
      return readiness.ready;
    }).length;

    return {
      modalities: {
        total: modalities.length,
        active: modalities.filter((item) => item.isActive).length
      },
      exercises: {
        total: exercises.length,
        withoutModality: exercises.filter((item) => item.modalityLinks.length === 0).length
      },
      workoutBlocks: {
        total: workoutBlocks.length,
        withoutExercises: workoutBlocks.filter((item) => item.exercises.length === 0).length,
        withoutModality: workoutBlocks.filter((item) => !item.modalityId).length,
        unpublished:
          workoutBlocks.filter(
            (item) => item.exercises.length > 0 && item.modalityId && item.programDays.length === 0
          ).length
      },
      programs: {
        total: programs.length,
        published: programs.filter((item) => item.status === "PUBLISHED" && item.isActive).length,
        draftsReady: readyDraftCount
      }
    };
  });

  app.get("/admin/cms/programs/:id/publish-preview", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const preview = await getProgramPublishPreview(id);
    return { preview };
  });

  app.post("/admin/cms/programs", async (request, reply) => {
    requireDatabase();
    const body = cmsProgramSchema.parse(request.body);
    await assertModalitiesExist([body.modalityId]);
    const modality = await prisma.modality.findUniqueOrThrow({ where: { id: body.modalityId } });
    await assertWorkoutBlocksExist(body.days.map((day) => day.workoutBlockId));
    await assertWorkoutBlocksMatchModality(body.days.map((day) => day.workoutBlockId), body.modalityId);
    const { estimatedDays } = programDurationFields(body);
    const plannedSessions =
      body.plannedSessions ??
      body.totalWorkouts ??
      Math.max(1, body.days.length * Math.ceil(estimatedDays / body.cycleLengthDays));
    const maxSortOrder = await prisma.program.aggregate({
      where: { deletedAt: null },
      _max: {
        sortOrder: true
      }
    });

    if (body.status === "PUBLISHED") {
      const workoutBlocks = await prisma.workoutBlock.findMany({
        where: {
          id: {
            in: body.days.map((day) => day.workoutBlockId)
          }
        },
        include: {
          exercises: {
            include: {
              exercise: true
            }
          }
        }
      });
      const blocksById = new Map(workoutBlocks.map((block) => [block.id, block]));
      const readiness = buildProgramPublishReadiness({
        daysCount: body.days.length,
        modality,
        days: body.days.map((day) => ({
          dayNumber: day.dayNumber,
          workoutBlock: blocksById.get(day.workoutBlockId) ?? null
        }))
      });

      if (!readiness.ready) {
        throw httpError(409, readiness.issues.join(" "));
      }
    }

    const program = await prisma.program.create({
      data: {
        modalityId: body.modalityId,
        title: body.title,
        description: buildProgramDescription(body.description, modality.name),
        durationYears: body.durationYears,
        durationMonths: body.durationMonths,
        durationWeeks: body.durationWeeks,
        durationDays: estimatedDays,
        durationExtraDays: body.durationExtraDays,
        plannedSessions,
        completionMode: body.completionMode,
        scheduleType: body.scheduleType,
        audienceMode: body.audienceMode,
        cycleLengthDays: body.cycleLengthDays,
        targetGender: body.targetGender,
        totalWorkouts: plannedSessions,
        sortOrder: body.sortOrder ?? (maxSortOrder._max.sortOrder ?? 0) + 1,
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

    if (program.status === "PUBLISHED" && program.isActive && program.audienceMode === "ALL_ACTIVE") {
      await reconcileProgramAudienceAssignments(program.id);
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
        modality: true,
        days: true
      }
    });
    const nextModalityId = body.modalityId ?? currentProgram.modalityId;
    const modality = nextModalityId ? await prisma.modality.findUniqueOrThrow({ where: { id: nextModalityId } }) : null;

    if (body.modalityId) {
      await assertModalitiesExist([body.modalityId]);
    }

    const nextProgramDays = body.days ?? currentProgram.days;
    const nextCycleLengthDays = body.cycleLengthDays ?? currentProgram.cycleLengthDays;
    if (nextProgramDays.some((day) => day.dayNumber > nextCycleLengthDays)) {
      throw httpError(400, "Existe uma sessão fora do tamanho do ciclo configurado.");
    }
    if (nextProgramDays.length > 0 && !nextProgramDays.some((day) => day.dayNumber === 1)) {
      throw httpError(400, "A posição 1 do ciclo é obrigatória.");
    }
    if (nextProgramDays.length > 0) {
      const seenDays = new Set<number>();
      for (const day of nextProgramDays) {
        if (seenDays.has(day.dayNumber)) {
          throw httpError(400, `Existem sessões duplicadas na posição ${day.dayNumber}.`);
        }
        seenDays.add(day.dayNumber);
      }
    }
    if ((body.scheduleType ?? currentProgram.scheduleType) === "WEEKLY" && nextCycleLengthDays !== 7) {
      throw httpError(400, "A grade semanal deve ter exatamente 7 posições.");
    }
    if (body.days) {
      await assertWorkoutBlocksExist(body.days.map((day) => day.workoutBlockId));
    }
    const modalityChanged =
      body.modalityId != null && body.modalityId !== currentProgram.modalityId;

    // Troca rápida de modalidade no card: alinha as fichas do ciclo à nova modalidade.
    if (modalityChanged && !body.days && nextModalityId) {
      const linkedBlockIds = uniqueValues(currentProgram.days.map((day) => day.workoutBlockId));
      if (linkedBlockIds.length > 0) {
        await prisma.workoutBlock.updateMany({
          where: { id: { in: linkedBlockIds }, deletedAt: null },
          data: { modalityId: nextModalityId }
        });
      }
    } else if (nextModalityId && (body.days || body.modalityId)) {
      await assertWorkoutBlocksMatchModality(nextProgramDays.map((day) => day.workoutBlockId), nextModalityId);
    }

    const nextDuration = {
      durationYears: body.durationYears ?? currentProgram.durationYears,
      durationMonths: body.durationMonths ?? currentProgram.durationMonths,
      durationWeeks: body.durationWeeks ?? currentProgram.durationWeeks,
      durationExtraDays: body.durationExtraDays ?? currentProgram.durationExtraDays
    };
    const { estimatedDays } = programDurationFields(nextDuration);
    if (estimatedDays < 1) {
      throw httpError(400, "Informe uma duração maior que zero.");
    }
    const plannedSessions = body.plannedSessions ?? body.totalWorkouts ?? currentProgram.plannedSessions;

    const currentMetadata = parseProgramMetadata(currentProgram.description);
    const nextModalityName = modality?.name ?? currentMetadata.modality;
    const descriptionText =
      body.description != null
        ? buildProgramDescription(body.description, nextModalityName)
        : modalityChanged
        ? buildProgramDescription(currentMetadata.description, nextModalityName)
        : currentProgram.description;
    const publishedAt =
      body.status === "PUBLISHED" ? new Date() : body.status === "DRAFT" || body.status === "ARCHIVED" ? null : currentProgram.publishedAt;
    const nextStatus = body.status ?? currentProgram.status;
    const nextIsActive = body.isActive ?? currentProgram.isActive;

    if (nextStatus === "PUBLISHED" && nextIsActive) {
      const workoutBlockIds = nextProgramDays.map((day) => day.workoutBlockId);
      const workoutBlocks = await prisma.workoutBlock.findMany({
        where: {
          id: {
            in: workoutBlockIds
          }
        },
        include: {
          exercises: {
            include: {
              exercise: true
            }
          }
        }
      });
      const blocksById = new Map(workoutBlocks.map((block) => [block.id, block]));
      const readiness = buildProgramPublishReadiness({
        daysCount: nextProgramDays.length,
        modality,
        days: nextProgramDays.map((day) => ({
          dayNumber: day.dayNumber,
          workoutBlock: blocksById.get(day.workoutBlockId) ?? null
        }))
      });

      if (!readiness.ready) {
        throw httpError(409, readiness.issues.join(" "));
      }
    }

    const nextPublishedSortOrder =
      body.status === "PUBLISHED" && currentProgram.status !== "PUBLISHED" && body.sortOrder == null
        ? ((await prisma.program.aggregate({
            where: {
              status: "PUBLISHED",
              isActive: true,
              deletedAt: null
            },
            _max: {
              sortOrder: true
            }
          }))._max.sortOrder ?? 0) + 1
        : null;

    await prisma.$transaction([
      ...(body.days ? [prisma.programDayWorkout.deleteMany({ where: { programId: id } })] : []),
      prisma.program.update({
        where: { id },
        data: {
          modalityId: nextModalityId,
          title: body.title ?? currentProgram.title,
          description: descriptionText,
          durationYears: body.durationYears ?? currentProgram.durationYears,
          durationMonths: body.durationMonths ?? currentProgram.durationMonths,
          durationWeeks: body.durationWeeks ?? currentProgram.durationWeeks,
          durationDays: estimatedDays,
          durationExtraDays: nextDuration.durationExtraDays,
          plannedSessions,
          completionMode: body.completionMode ?? currentProgram.completionMode,
          scheduleType: body.scheduleType ?? currentProgram.scheduleType,
          audienceMode: body.audienceMode ?? currentProgram.audienceMode,
          cycleLengthDays: body.cycleLengthDays ?? currentProgram.cycleLengthDays,
          targetGender: body.targetGender ?? currentProgram.targetGender,
          totalWorkouts: plannedSessions,
          sortOrder: body.sortOrder ?? nextPublishedSortOrder ?? currentProgram.sortOrder,
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
      if (program.audienceMode === "ALL_ACTIVE") {
        await reconcileProgramAudienceAssignments(program.id);
      } else {
        await cancelMismatchedProgramAssignments(program.id, program.targetGender);
      }
    }

    const refreshedProgram = await prisma.program.findUniqueOrThrow({
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

    return { program: refreshedProgram };
  });

  app.post("/admin/cms/programs/reorder", async (request, reply) => {
    requireDatabase();
    const body = z
      .object({
        ids: z.array(z.string().min(1)).min(1)
      })
      .parse(request.body);

    if (new Set(body.ids).size !== body.ids.length) {
      return reply.code(400).send({ error: "Lista de reordenação contém duplicados." });
    }

    const publishedPrograms = await prisma.program.findMany({
      where: {
        status: "PUBLISHED",
        isActive: true,
        deletedAt: null
      },
      select: {
        id: true
      }
    });
    const publishedIds = new Set(publishedPrograms.map((program) => program.id));
    const containsOnlyPublished = body.ids.every((id) => publishedIds.has(id));

    if (!containsOnlyPublished || publishedIds.size !== body.ids.length) {
      return reply.code(400).send({ error: "Envie todos e apenas os programas publicados para reordenar." });
    }

    await prisma.$transaction(
      body.ids.map((id, index) =>
        prisma.program.update({
          where: { id },
          data: { sortOrder: index + 1 }
        })
      )
    );

    const programs = await prisma.program.findMany({
      where: { deletedAt: null },
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
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    });

    return { programs };
  });

  app.post("/admin/cms/programs/:id/publish", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const currentProgram = await assertProgramReadyForPublish(id);

    const maxPublishedSortOrder = await prisma.program.aggregate({
      where: {
        status: "PUBLISHED",
        isActive: true,
        deletedAt: null,
        id: {
          not: id
        }
      },
      _max: {
        sortOrder: true
      }
    });

    const program = await prisma.program.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        isActive: true,
        sortOrder: currentProgram.status === "PUBLISHED" ? currentProgram.sortOrder : (maxPublishedSortOrder._max.sortOrder ?? 0) + 1,
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
    if (program.audienceMode === "ALL_ACTIVE") {
      const reconciled = await reconcileProgramAudienceAssignments(program.id);
      const recipientIds = reconciled.assigned.map((item) => item.userId).filter(Boolean);
      await fanOutStudentNotifications({
        type: "WORKOUT_PROGRAM",
        title: "Novo programa de treino",
        message: program.title,
        targetSection: "training",
        sourceType: "program",
        sourceId: program.id,
        ...(recipientIds.length ? { userIds: recipientIds } : {})
      });
    } else {
      await cancelMismatchedProgramAssignments(program.id, program.targetGender);
      const assignedIds = program.assignedUsers
        .filter((item) => item.status === "ACTIVE")
        .map((item) => item.userId);
      if (assignedIds.length) {
        await fanOutStudentNotifications({
          type: "WORKOUT_PROGRAM",
          title: "Novo programa de treino",
          message: program.title,
          targetSection: "training",
          sourceType: "program",
          sourceId: program.id,
          userIds: assignedIds
        });
      }
    }

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

    const assignments = await assignProgramToActiveStudents(
      id,
      body.currentDay,
      body.totalWorkouts ?? program.plannedSessions,
      body.userIds,
      program.targetGender,
      body.resetProgress,
      true
    );

    await cancelMismatchedProgramAssignments(id, program.targetGender);

    if (assignments.length === 0) {
      const genderHint =
        program.targetGender === "FEMALE"
          ? " Este treino é destinado ao público feminino."
          : program.targetGender === "MALE"
            ? " Este treino é destinado ao público masculino."
            : "";
      return reply.code(409).send({
        message: `Nenhum aluno ativo elegível foi encontrado para receber este programa.${genderHint}`
      });
    }

    return reply.code(201).send({ assignments });
  });

  app.delete("/admin/cms/programs/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.program.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date()
      }
    });

    return { ok: true };
  });

  app.post("/admin/cms/programs/:id/restore", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const program = await prisma.program.update({
      where: { id },
      data: {
        isActive: true,
        deletedAt: null
      }
    });

    return { ok: true, program };
  });

  app.delete("/admin/cms/programs/:id/permanent", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.$transaction([
      prisma.programDayWorkout.deleteMany({ where: { programId: id } }),
      prisma.program.delete({ where: { id } })
    ]);

    return { ok: true };
  });

  const trashKindSchema = z.enum([
    "users",
    "workouts",
    "announcements",
    "plans",
    "memberships",
    "payments",
    "assessments",
    "events",
    "tickets",
    "aiPlans",
    "products",
    "purchases",
    "cards",
    "favorites",
    "ratings",
    "contactMessages",
    "modalities",
    "locations",
    "exercises",
    "workoutBlocks",
    "programs"
  ]);

  const trashParamsSchema = z.object({
    kind: trashKindSchema,
    id: z.string().min(1)
  });

  function formatBRL(cents: number): string {
    return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
  }

  function formatDate(value: Date | string | null | undefined): string {
    if (!value) return "—";
    return new Date(value).toLocaleDateString("pt-BR");
  }

  app.get("/admin/trash", async () => {
    requireDatabase();
    const [
      users,
      workouts,
      announcements,
      plans,
      memberships,
      payments,
      assessments,
      events,
      tickets,
      aiPlans,
      products,
      purchases,
      cards,
      favorites,
      ratings,
      contactMessages,
      modalities,
      locations,
      exercises,
      workoutBlocks,
      programs
    ] = await Promise.all([
      prisma.user.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, name: true, email: true, phone: true },
        orderBy: { deletedAt: "desc" }
      }),
      prisma.workout.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, title: true, objective: true },
        orderBy: { deletedAt: "desc" }
      }),
      prisma.announcement.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, title: true, status: true },
        orderBy: { deletedAt: "desc" }
      }),
      prisma.plan.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, name: true, code: true, priceInCents: true },
        orderBy: { deletedAt: "desc" }
      }),
      prisma.membership.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, status: true, user: { select: { name: true } }, plan: { select: { name: true } } },
        orderBy: { deletedAt: "desc" }
      }),
      prisma.payment.findMany({
        where: { deletedAt: { not: null } },
        select: {
          id: true,
          amountInCents: true,
          status: true,
          dueDate: true,
          membership: { select: { user: { select: { name: true } }, plan: { select: { name: true } } } }
        },
        orderBy: { deletedAt: "desc" }
      }),
      prisma.physicalAssessment.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, assessedAt: true, user: { select: { name: true } } },
        orderBy: { deletedAt: "desc" }
      }),
      prisma.event.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, title: true, startsAt: true, status: true },
        orderBy: { deletedAt: "desc" }
      }),
      prisma.supportTicket.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, subject: true, status: true, user: { select: { name: true } } },
        orderBy: { deletedAt: "desc" }
      }),
      prisma.aiWorkoutPlan.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, objective: true, level: true, user: { select: { name: true } } },
        orderBy: { deletedAt: "desc" }
      }),
      prisma.product.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, name: true, priceInCents: true, category: true },
        orderBy: { deletedAt: "desc" }
      }),
      prisma.purchase.findMany({
        where: { deletedAt: { not: null } },
        select: {
          id: true,
          amountInCents: true,
          status: true,
          user: { select: { name: true } },
          product: { select: { name: true } }
        },
        orderBy: { deletedAt: "desc" }
      }),
      prisma.paymentCard.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, brand: true, lastFour: true, holderName: true, user: { select: { name: true } } },
        orderBy: { deletedAt: "desc" }
      }),
      prisma.favorite.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, user: { select: { name: true } }, product: { select: { name: true } } },
        orderBy: { deletedAt: "desc" }
      }),
      prisma.rating.findMany({
        where: { deletedAt: { not: null } },
        select: {
          id: true,
          score: true,
          comment: true,
          user: { select: { name: true } },
          product: { select: { name: true } }
        },
        orderBy: { deletedAt: "desc" }
      }),
      prisma.contactMessage.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, name: true, subject: true, email: true },
        orderBy: { deletedAt: "desc" }
      }),
      prisma.modality.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, name: true, description: true },
        orderBy: { deletedAt: "desc" }
      }),
      prisma.location.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, name: true, city: true, address: true },
        orderBy: { deletedAt: "desc" }
      }),
      prisma.exercise.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, title: true, name: true, equipmentTags: true },
        orderBy: { deletedAt: "desc" }
      }),
      prisma.workoutBlock.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, title: true, structureType: true },
        orderBy: { deletedAt: "desc" }
      }),
      prisma.program.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, title: true, status: true },
        orderBy: { deletedAt: "desc" }
      })
    ]);

    return {
      trash: {
        users: users.map((item) => ({ id: item.id, name: item.name, sub: item.email ?? item.phone ?? "Sem e-mail" })),
        workouts: workouts.map((item) => ({ id: item.id, name: item.title, sub: item.objective ?? "Treino" })),
        announcements: announcements.map((item) => ({ id: item.id, name: item.title, sub: item.status })),
        plans: plans.map((item) => ({ id: item.id, name: item.name, sub: `${item.code} · ${formatBRL(item.priceInCents)}` })),
        memberships: memberships.map((item) => ({
          id: item.id,
          name: item.user.name,
          sub: `${item.plan.name} · ${item.status}`
        })),
        payments: payments.map((item) => ({
          id: item.id,
          name: item.membership.user.name,
          sub: `${item.membership.plan.name} · ${formatBRL(item.amountInCents)} · ${item.status}`
        })),
        assessments: assessments.map((item) => ({ id: item.id, name: item.user.name, sub: formatDate(item.assessedAt) })),
        events: events.map((item) => ({ id: item.id, name: item.title, sub: `${formatDate(item.startsAt)} · ${item.status}` })),
        tickets: tickets.map((item) => ({ id: item.id, name: item.subject, sub: `${item.user.name} · ${item.status}` })),
        aiPlans: aiPlans.map((item) => ({ id: item.id, name: item.objective, sub: `${item.user.name} · ${item.level}` })),
        products: products.map((item) => ({
          id: item.id,
          name: item.name,
          sub: `${formatBRL(item.priceInCents)}${item.category ? ` · ${item.category}` : ""}`
        })),
        purchases: purchases.map((item) => ({
          id: item.id,
          name: item.product.name,
          sub: `${item.user.name} · ${formatBRL(item.amountInCents)} · ${item.status}`
        })),
        cards: cards.map((item) => ({
          id: item.id,
          name: item.brand ? `${item.brand} •••• ${item.lastFour}` : `•••• ${item.lastFour}`,
          sub: item.holderName ?? item.user.name
        })),
        favorites: favorites.map((item) => ({ id: item.id, name: item.product.name, sub: item.user.name })),
        ratings: ratings.map((item) => ({
          id: item.id,
          name: item.product?.name ?? "Produto removido",
          sub: `${item.user.name} · ${item.score}★${item.comment ? ` · ${item.comment}` : ""}`
        })),
        contactMessages: contactMessages.map((item) => ({
          id: item.id,
          name: item.name,
          sub: `${item.email}${item.subject ? ` · ${item.subject}` : ""}`
        })),
        modalities: modalities.map((item) => ({ id: item.id, name: item.name, sub: item.description ?? "Modalidade" })),
        locations: locations.map((item) => ({ id: item.id, name: item.name, sub: item.city ?? item.address ?? "Localidade" })),
        exercises: exercises.map((item) => ({
          id: item.id,
          name: item.title ?? item.name ?? "Aula",
          sub: item.equipmentTags.join(", ") || "Aula"
        })),
        workoutBlocks: workoutBlocks.map((item) => ({ id: item.id, name: item.title, sub: item.structureType })),
        programs: programs.map((item) => ({ id: item.id, name: item.title, sub: item.status }))
      }
    };
  });

  app.post("/admin/trash/:kind/:id/restore", async (request) => {
    requireDatabase();
    const { kind, id } = trashParamsSchema.parse(request.params);

    switch (kind) {
      case "users":
        await prisma.user.update({ where: { id }, data: { deletedAt: null, status: "ACTIVE" } });
        break;
      case "workouts":
        await prisma.workout.update({ where: { id }, data: { deletedAt: null } });
        break;
      case "announcements": {
        const announcement = await prisma.announcement.update({ where: { id }, data: { deletedAt: null } });
        if (announcement.status === "PUBLISHED") {
          await fanOutStudentNotifications({
            type: "ANNOUNCEMENT",
            title: announcement.title,
            message: announcement.body,
            sourceType: "announcement",
            sourceId: announcement.id
          });
        }
        break;
      }
      case "plans":
        await prisma.plan.update({ where: { id }, data: { deletedAt: null } });
        break;
      case "memberships":
        await prisma.membership.update({ where: { id }, data: { deletedAt: null } });
        break;
      case "payments":
        await prisma.payment.update({ where: { id }, data: { deletedAt: null } });
        break;
      case "assessments":
        await prisma.physicalAssessment.update({ where: { id }, data: { deletedAt: null } });
        break;
      case "events":
        await prisma.event.update({ where: { id }, data: { deletedAt: null } });
        break;
      case "tickets":
        await prisma.supportTicket.update({ where: { id }, data: { deletedAt: null } });
        break;
      case "aiPlans":
        await prisma.aiWorkoutPlan.update({ where: { id }, data: { deletedAt: null } });
        break;
      case "products": {
        const product = await prisma.product.update({ where: { id }, data: { deletedAt: null, isActive: true } });
        await fanOutStudentNotifications({
          type: "PRODUCT",
          title: "Novo produto na vitrine",
          message: product.name,
          targetSection: "products",
          sourceType: "product",
          sourceId: product.id
        });
        break;
      }
      case "purchases":
        await prisma.purchase.update({ where: { id }, data: { deletedAt: null } });
        break;
      case "cards":
        await prisma.paymentCard.update({ where: { id }, data: { deletedAt: null } });
        break;
      case "favorites":
        await prisma.favorite.update({ where: { id }, data: { deletedAt: null } });
        break;
      case "ratings":
        await prisma.rating.update({ where: { id }, data: { deletedAt: null } });
        break;
      case "contactMessages":
        await prisma.contactMessage.update({ where: { id }, data: { deletedAt: null } });
        break;
      case "modalities":
        await prisma.modality.update({ where: { id }, data: { deletedAt: null, isActive: true } });
        break;
      case "locations": {
        const location = await prisma.location.update({ where: { id }, data: { deletedAt: null, isActive: true } });
        await fanOutStudentNotifications({
          type: "LOCATION",
          title: "Nova unidade cadastrada",
          message: location.name,
          targetSection: "locations",
          sourceType: "location",
          sourceId: location.id
        });
        break;
      }
      case "exercises":
        await prisma.exercise.update({ where: { id }, data: { deletedAt: null } });
        break;
      case "workoutBlocks":
        await prisma.workoutBlock.update({ where: { id }, data: { deletedAt: null } });
        break;
      case "programs":
        await prisma.program.update({ where: { id }, data: { deletedAt: null, isActive: true } });
        break;
    }

    return { ok: true };
  });

  app.delete("/admin/trash/:kind/:id/permanent", async (request) => {
    requireDatabase();
    const { kind, id } = trashParamsSchema.parse(request.params);

    switch (kind) {
      case "users": {
        const memberships = await prisma.membership.findMany({ where: { userId: id }, select: { id: true } });
        const membershipIds = memberships.map((membership) => membership.id);
        await prisma.$transaction([
          prisma.payment.deleteMany({ where: { membershipId: { in: membershipIds } } }),
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
        break;
      }
      case "workouts": {
        await prisma.$transaction([
          prisma.exercise.deleteMany({ where: { workoutDay: { workoutId: id } } }),
          prisma.workoutDay.deleteMany({ where: { workoutId: id } }),
          prisma.workout.delete({ where: { id } })
        ]);
        break;
      }
      case "announcements":
        await prisma.announcement.delete({ where: { id } });
        break;
      case "plans": {
        const memberships = await prisma.membership.findMany({ where: { planId: id }, select: { id: true } });
        const membershipIds = memberships.map((membership) => membership.id);
        await prisma.$transaction([
          prisma.payment.deleteMany({ where: { membershipId: { in: membershipIds } } }),
          prisma.membership.deleteMany({ where: { planId: id } }),
          prisma.plan.delete({ where: { id } })
        ]);
        break;
      }
      case "memberships":
        await prisma.$transaction([
          prisma.payment.deleteMany({ where: { membershipId: id } }),
          prisma.membership.delete({ where: { id } })
        ]);
        break;
      case "payments":
        await prisma.payment.delete({ where: { id } });
        break;
      case "assessments":
        await prisma.physicalAssessment.delete({ where: { id } });
        break;
      case "events":
        await prisma.$transaction([
          prisma.eventRegistration.deleteMany({ where: { eventId: id } }),
          prisma.event.delete({ where: { id } })
        ]);
        break;
      case "tickets":
        await prisma.supportTicket.delete({ where: { id } });
        break;
      case "aiPlans":
        await prisma.aiWorkoutPlan.delete({ where: { id } });
        break;
      case "products":
        await prisma.$transaction([
          prisma.favorite.deleteMany({ where: { productId: id } }),
          prisma.rating.deleteMany({ where: { productId: id } }),
          prisma.product.delete({ where: { id } })
        ]);
        break;
      case "purchases":
        await prisma.purchase.delete({ where: { id } });
        break;
      case "cards":
        await prisma.paymentCard.delete({ where: { id } });
        break;
      case "favorites":
        await prisma.favorite.delete({ where: { id } });
        break;
      case "ratings":
        await prisma.rating.delete({ where: { id } });
        break;
      case "contactMessages":
        await prisma.contactMessage.delete({ where: { id } });
        break;
      case "modalities":
        await prisma.$transaction([
          prisma.exerciseModality.deleteMany({ where: { modalityId: id } }),
          prisma.workoutBlock.updateMany({ where: { modalityId: id }, data: { modalityId: null } }),
          prisma.program.updateMany({ where: { modalityId: id }, data: { modalityId: null } }),
          prisma.modality.delete({ where: { id } })
        ]);
        break;
      case "locations":
        await prisma.location.delete({ where: { id } });
        break;
      case "exercises":
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
        break;
      case "workoutBlocks":
        await prisma.$transaction([
          prisma.programDayWorkout.deleteMany({ where: { workoutBlockId: id } }),
          prisma.workoutBlockExercise.deleteMany({ where: { workoutBlockId: id } }),
          prisma.workoutBlock.delete({ where: { id } })
        ]);
        break;
      case "programs":
        await prisma.$transaction([
          prisma.programDayWorkout.deleteMany({ where: { programId: id } }),
          prisma.program.delete({ where: { id } })
        ]);
        break;
    }

    return { ok: true };
  });


  app.get("/admin/plans", async () => {
    requireDatabase();
    const plans = await prisma.plan.findMany({ where: { deletedAt: null }, orderBy: { priceInCents: "asc" } });
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
    await prisma.plan.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
    return { ok: true };
  });

  app.get("/admin/memberships", async (request) => {
    requireDatabase();
    const { page, perPage, skip, take } = parsePagination(request.query as Record<string, unknown>);
    const where = { deletedAt: null };
    const [memberships, total] = await Promise.all([
      prisma.membership.findMany({
        where,
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
        },
        skip,
        take
      }),
      prisma.membership.count({ where })
    ]);
    return { memberships, meta: buildPaginationMeta(total, page, perPage) };
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

    await syncUserEnrollmentFromMemberships(prisma, membership.userId);

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

    await syncUserEnrollmentFromMemberships(prisma, membership.userId);

    return { membership };
  });

  app.delete("/admin/memberships/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const membership = await prisma.membership.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { userId: true }
    });
    await syncUserEnrollmentFromMemberships(prisma, membership.userId);
    return { ok: true };
  });

  app.get("/admin/payments", async (request) => {
    requireDatabase();
    const { page, perPage, skip, take } = parsePagination(request.query as Record<string, unknown>);
    const where = { deletedAt: null };
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
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
        },
        skip,
        take
      }),
      prisma.payment.count({ where })
    ]);
    return { payments, meta: buildPaginationMeta(total, page, perPage) };
  });

  app.post("/admin/payments", async (request, reply) => {
    requireDatabase();
    const body = paymentSchema.parse(request.body);
    const membership = await prisma.membership.findUniqueOrThrow({
      where: { id: body.membershipId },
      include: {
        user: true,
        plan: true
      }
    });

    const payment = await prisma.payment.create({
      data: {
        membershipId: body.membershipId,
        amountInCents: body.amountInCents,
        dueDate: body.dueDate
      }
    });

    const asaasPayment = await createAsaasCheckout({
      externalReference: payment.id,
      itemName: `App Treino - ${membership.plan?.name ?? "Assinatura"}`,
      itemDescription: `Assinatura App Treino - ${membership.user.name}`,
      amountInCents: body.amountInCents,
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
    await prisma.payment.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    return { ok: true };
  });

  app.get("/admin/physical-assessments", async (request) => {
    requireDatabase();
    const { page, perPage, skip, take } = parsePagination(request.query as Record<string, unknown>);
    const where = { deletedAt: null };
    const [assessments, total] = await Promise.all([
      prisma.physicalAssessment.findMany({
        where,
        include: {
          user: {
            include: {
              profile: true
            }
          }
        },
        orderBy: {
          assessedAt: "desc"
        },
        skip,
        take
      }),
      prisma.physicalAssessment.count({ where })
    ]);

    return { assessments, meta: buildPaginationMeta(total, page, perPage) };
  });

  app.post("/admin/physical-assessments", async (request, reply) => {
    requireDatabase();
    const body = physicalAssessmentFormWithUserSchema.parse(request.body);
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
        userId: body.userId,
        source: "ADMIN",
        assessedAt: body.assessedAt ?? new Date(),
        weightKg: form.composicao_corporal_basica.peso_atual_kg,
        heightCm: form.composicao_corporal_basica.altura_cm,
        bodyFatPct,
        waistCm: form.perimetros_corporais_cm.cintura.valor,
        chestCm: form.perimetros_corporais_cm.torax.valor,
        hipCm: form.perimetros_corporais_cm.quadril.valor,
        details: body
      },
      include: {
        user: {
          include: {
            profile: true
          }
        }
      }
    });

    return reply.code(201).send({ assessment });
  });

  app.put("/admin/physical-assessments/:id", async (request, reply) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    const body = physicalAssessmentFormWithUserSchema.parse(request.body);
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
        userId: body.userId,
        source: "ADMIN",
        assessedAt: body.assessedAt ?? new Date(),
        weightKg: form.composicao_corporal_basica.peso_atual_kg,
        heightCm: form.composicao_corporal_basica.altura_cm,
        bodyFatPct,
        waistCm: form.perimetros_corporais_cm.cintura.valor,
        chestCm: form.perimetros_corporais_cm.torax.valor,
        hipCm: form.perimetros_corporais_cm.quadril.valor,
        details: body
      },
      include: {
        user: {
          include: {
            profile: true
          }
        }
      }
    });

    return { assessment };
  });

  app.delete("/admin/physical-assessments/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.physicalAssessment.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
    return { ok: true };
  });

  app.get("/admin/events", async (request) => {
    requireDatabase();
    const { page, perPage, skip, take } = parsePagination(request.query as Record<string, unknown>);
    const where = { deletedAt: null };
    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
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
        },
        skip,
        take
      }),
      prisma.event.count({ where })
    ]);

    return { events, meta: buildPaginationMeta(total, page, perPage) };
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

    if (event.status === "SCHEDULED") {
      await fanOutStudentNotifications({
        type: "EVENT",
        title: "Evento publicado",
        message: event.title,
        targetSection: "events",
        sourceType: "event",
        sourceId: event.id
      });
    }

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
    await prisma.event.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
    return { ok: true };
  });

  app.get("/admin/support-tickets", async (request) => {
    requireDatabase();
    const { page, perPage, skip, take } = parsePagination(request.query as Record<string, unknown>);
    const where = { deletedAt: null };
    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        include: ticketInclude,
        orderBy: {
          updatedAt: "desc"
        },
        skip,
        take
      }),
      prisma.supportTicket.count({ where })
    ]);

    await autoCloseStaleTickets(prisma, tickets.map((ticket) => ticket.id));

    if (
      tickets.some(
        (ticket) => ticket.status === "OPEN" || ticket.status === "IN_PROGRESS" || ticket.status === "WAITING_STUDENT"
      )
    ) {
      const refreshed = await prisma.supportTicket.findMany({
        where,
        include: ticketInclude,
        orderBy: {
          updatedAt: "desc"
        },
        skip,
        take
      });
      return { tickets: refreshed, meta: buildPaginationMeta(total, page, perPage) };
    }

    return { tickets, meta: buildPaginationMeta(total, page, perPage) };
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

    await notifyStudent(ticket.userId, {
      type: "SUPPORT",
      title: "Nova resposta no seu atendimento",
      message: ticket.subject,
      targetSection: "support",
      sourceType: "support_ticket",
      sourceId: ticket.id
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

    await notifyStudent(ticket.userId, {
      type: "SUPPORT",
      title: "Nova resposta no seu atendimento",
      message: ticket.subject,
      targetSection: "support",
      sourceType: "support_ticket",
      sourceId: ticket.id
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

    await notifyStudent(ticket.userId, {
      type: "SUPPORT",
      title: "Atendimento encerrado",
      message: ticket.subject,
      targetSection: "support",
      sourceType: "support_ticket_closed",
      sourceId: ticket.id
    });

    return { ticket };
  });

  app.delete("/admin/support-tickets/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.supportTicket.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    return { ok: true };
  });

  app.get("/admin/ai-workout-plans", async (request) => {
    requireDatabase();
    const { page, perPage, skip, take } = parsePagination(request.query as Record<string, unknown>);
    const where = { deletedAt: null };
    const [plans, total] = await Promise.all([
      prisma.aiWorkoutPlan.findMany({
        where,
        include: {
          user: true
        },
        orderBy: {
          createdAt: "desc"
        },
        skip,
        take
      }),
      prisma.aiWorkoutPlan.count({ where })
    ]);

    return { plans, meta: buildPaginationMeta(total, page, perPage) };
  });

  app.delete("/admin/ai-workout-plans/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.aiWorkoutPlan.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    return { ok: true };
  });

  // ===== Módulos: Produtos, Compras, Cartões, Favoritos, Avaliações, Contato e Configurações =====

  const productSchema = z.object({
    name: z.string().min(2),
    description: z.string().optional(),
    priceInCents: z.number().int().min(0).default(0),
    imageUrl: z.string().optional().or(z.literal("")),
    category: z.string().optional(),
    kind: z.enum(["PHYSICAL", "DIGITAL"]).default("PHYSICAL"),
    shippingMethod: z.enum(["PICKUP", "DELIVERY", "DIGITAL"]).optional(),
    stock: z.number().int().min(0).nullable().optional(),
    isActive: z.boolean().default(true)
  });

  const purchaseSchema = z.object({
    userId: z.string().min(1),
    productId: z.string().min(1),
    amountInCents: z.number().int().min(0),
    quantity: z.number().int().min(1).default(1),
    status: z.enum(["PENDING", "CONFIRMED", "READY", "DELIVERED", "CANCELED", "REFUNDED"]).default("PENDING"),
    paymentMethod: z.string().optional(),
    notes: z.string().optional()
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

  app.get("/admin/products", async (request) => {
    requireDatabase();
    await assertModuleEnabled("module_products");
    const { page, perPage, skip, take } = parsePagination(request.query as Record<string, unknown>);
    const where = { deletedAt: null };
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          _count: { select: { purchases: true, favorites: true, ratings: true } }
        },
        orderBy: { createdAt: "desc" },
        skip,
        take
      }),
      prisma.product.count({ where })
    ]);

    return { products, meta: buildPaginationMeta(total, page, perPage) };
  });

  app.post("/admin/products", async (request, reply) => {
    requireDatabase();
    await assertModuleEnabled("module_products");
    const body = productSchema.parse(request.body);
    const shippingMethod = normalizeProductShippingMethod(body.kind, body.shippingMethod ?? null);
    const product = await prisma.product.create({
      data: {
        ...body,
        shippingMethod,
        imageUrl: body.imageUrl || null,
        stock: body.stock ?? null
      }
    });

    if (product.isActive) {
      await fanOutStudentNotifications({
        type: "PRODUCT",
        title: "Novo produto na vitrine",
        message: product.name,
        targetSection: "products",
        sourceType: "product",
        sourceId: product.id
      });
    }

    return reply.code(201).send({ product });
  });

  app.put("/admin/products/:id", async (request) => {
    requireDatabase();
    await assertModuleEnabled("module_products");
    const { id } = idParamSchema.parse(request.params);
    const body = productSchema.partial().parse(request.body);
    const current = await prisma.product.findUniqueOrThrow({ where: { id } });
    const nextKind = body.kind ?? current.kind;
    const shouldNormalizeShipping =
      body.kind !== undefined || body.shippingMethod !== undefined;
    const product = await prisma.product.update({
      where: { id },
      data: {
        ...body,
        ...(shouldNormalizeShipping
          ? {
              shippingMethod: normalizeProductShippingMethod(
                nextKind,
                body.shippingMethod ?? current.shippingMethod
              )
            }
          : {}),
        ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl || null } : {})
      }
    });

    if (product.isActive && (!current.isActive || current.deletedAt)) {
      await fanOutStudentNotifications({
        type: "PRODUCT",
        title: "Novo produto na vitrine",
        message: product.name,
        targetSection: "products",
        sourceType: "product",
        sourceId: product.id
      });
    }

    return { product };
  });

  app.delete("/admin/products/:id", async (request) => {
    requireDatabase();
    await assertModuleEnabled("module_products");
    const { id } = idParamSchema.parse(request.params);
    await prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false }
    });

    return { ok: true };
  });

  app.get("/admin/purchases", async (request) => {
    requireDatabase();
    await assertModuleEnabled("module_purchases");
    const { page, perPage, skip, take } = parsePagination(request.query as Record<string, unknown>);
    const where = { deletedAt: null };
    const [purchases, total] = await Promise.all([
      prisma.purchase.findMany({
        where,
        include: { user: true, product: true },
        orderBy: { createdAt: "desc" },
        skip,
        take
      }),
      prisma.purchase.count({ where })
    ]);

    return { purchases, meta: buildPaginationMeta(total, page, perPage) };
  });

  app.post("/admin/purchases", async (request, reply) => {
    requireDatabase();
    await assertModuleEnabled("module_purchases");
    const body = purchaseSchema.parse(request.body);
    const product = await prisma.product.findFirstOrThrow({
      where: { id: body.productId, deletedAt: null }
    });
    const quantity = body.quantity ?? 1;
    if (product.stock != null && product.stock < quantity) {
      const error = new Error("Estoque insuficiente para este produto.") as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    }

    const timestamps = resolvePurchaseTimestamps(body.status);
    const purchase = await prisma.purchase.create({
      data: {
        userId: body.userId,
        productId: body.productId,
        amountInCents: body.amountInCents,
        quantity,
        status: body.status,
        paymentMethod: body.paymentMethod,
        notes: body.notes,
        ...timestamps
      },
      include: { user: true, product: true }
    });

    if (body.status && PURCHASE_PAID_STATUSES.includes(body.status)) {
      await decrementProductStock(body.productId, quantity);
    }

    return reply.code(201).send({ purchase });
  });

  app.put("/admin/purchases/:id", async (request) => {
    requireDatabase();
    await assertModuleEnabled("module_purchases");
    const { id } = idParamSchema.parse(request.params);
    const body = purchaseSchema.partial().parse(request.body);
    const current = await prisma.purchase.findUniqueOrThrow({
      where: { id },
      select: { paidAt: true, fulfilledAt: true, status: true, productId: true, quantity: true }
    });
    const timestamps = resolvePurchaseTimestamps(body.status, current);
    const purchase = await prisma.purchase.update({
      where: { id },
      data: {
        ...body,
        ...timestamps
      },
      include: { user: true, product: true }
    });

    if (
      body.status &&
      PURCHASE_PAID_STATUSES.includes(body.status) &&
      !PURCHASE_PAID_STATUSES.includes(current.status)
    ) {
      await decrementProductStock(current.productId, current.quantity);
    }

    return { purchase };
  });

  app.delete("/admin/purchases/:id", async (request) => {
    requireDatabase();
    await assertModuleEnabled("module_purchases");
    const { id } = idParamSchema.parse(request.params);
    await prisma.purchase.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    return { ok: true };
  });

  app.get("/admin/payment-cards", async (request) => {
    requireDatabase();
    const { page, perPage, skip, take } = parsePagination(request.query as Record<string, unknown>);
    const where = { deletedAt: null };
    const [paymentCards, total] = await Promise.all([
      prisma.paymentCard.findMany({
        where,
        include: { user: true },
        orderBy: { createdAt: "desc" },
        skip,
        take
      }),
      prisma.paymentCard.count({ where })
    ]);

    return { paymentCards, meta: buildPaginationMeta(total, page, perPage) };
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
    await prisma.paymentCard.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    return { ok: true };
  });

  app.get("/admin/favorites", async (request) => {
    requireDatabase();
    const { page, perPage, skip, take } = parsePagination(request.query as Record<string, unknown>);
    const where = { deletedAt: null };
    const [favorites, total] = await Promise.all([
      prisma.favorite.findMany({
        where,
        include: { user: true, product: true },
        orderBy: { createdAt: "desc" },
        skip,
        take
      }),
      prisma.favorite.count({ where })
    ]);

    return { favorites, meta: buildPaginationMeta(total, page, perPage) };
  });

  app.delete("/admin/favorites/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.favorite.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    return { ok: true };
  });

  app.get("/admin/ratings", async (request) => {
    requireDatabase();
    const { page, perPage, skip, take } = parsePagination(request.query as Record<string, unknown>);
    const where = { deletedAt: null };
    const [ratings, total] = await Promise.all([
      prisma.rating.findMany({
        where,
        include: { user: true, product: true },
        orderBy: { createdAt: "desc" },
        skip,
        take
      }),
      prisma.rating.count({ where })
    ]);

    return { ratings, meta: buildPaginationMeta(total, page, perPage) };
  });

  app.delete("/admin/ratings/:id", async (request) => {
    requireDatabase();
    const { id } = idParamSchema.parse(request.params);
    await prisma.rating.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    return { ok: true };
  });

  app.get("/admin/contact-messages", async (request) => {
    requireDatabase();
    const { page, perPage, skip, take } = parsePagination(request.query as Record<string, unknown>);
    const where = { deletedAt: null };
    const [contactMessages, total] = await Promise.all([
      prisma.contactMessage.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take
      }),
      prisma.contactMessage.count({ where })
    ]);

    return { contactMessages, meta: buildPaginationMeta(total, page, perPage) };
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
    await prisma.contactMessage.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    return { ok: true };
  });

  app.get("/admin/settings", async () => {
    requireDatabase();
    await ensureDefaultSystemSettings();
    const records = await prisma.systemSetting.findMany();
    const settings = { ...DEFAULT_SYSTEM_SETTINGS };
    for (const record of records) {
      settings[record.key] = record.value;
    }

    return { settings };
  });

  app.post("/admin/settings/activate-modules", async () => {
    requireDatabase();
    await activateSystemModules();
    const records = await prisma.systemSetting.findMany();
    const settings = records.reduce<Record<string, string>>((acc, record) => {
      acc[record.key] = record.value;
      return acc;
    }, {});
    return { ok: true, settings };
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

  app.get("/admin/outdoor-activities/flagged", async (request) => {
    requireDatabase();
    const query = z
      .object({
        status: z.enum(["OPEN", "CLEARED", "REJECTED", "ALL"]).default("OPEN"),
        limit: z.coerce.number().int().min(1).max(100).default(40)
      })
      .parse(request.query);

    const rows = await prisma.outdoorActivity.findMany({
      where: {
        status: "COMPLETED",
        ...(query.status === "ALL"
          ? { OR: [{ flagged: true }, { moderationStatus: { in: ["OPEN", "CLEARED", "REJECTED"] } }] }
          : { moderationStatus: query.status })
      },
      include: {
        user: { select: { id: true, name: true, email: true, profile: { select: { avatarUrl: true } } } },
        post: { select: { id: true, body: true, createdAt: true } }
      },
      orderBy: { finishedAt: "desc" },
      take: query.limit
    });

    return {
      activities: rows.map((row) => {
        const flagsRaw = row.antiCheatFlags;
        const flagsObj =
          flagsRaw && typeof flagsRaw === "object" && !Array.isArray(flagsRaw)
            ? (flagsRaw as { flags?: string[]; score?: number })
            : { flags: Array.isArray(flagsRaw) ? flagsRaw : [], score: row.antiCheatScore };
        return {
          id: row.id,
          sport: row.sport,
          distanceMeters: row.distanceMeters,
          elapsedSeconds: row.elapsedSeconds,
          finishedAt: row.finishedAt?.toISOString() ?? null,
          caption: row.caption,
          flagged: row.flagged,
          moderationStatus: row.moderationStatus,
          antiCheatFlags: flagsObj.flags ?? [],
          antiCheatScore: flagsObj.score ?? row.antiCheatScore ?? 0,
          quarantineUntil: row.quarantineUntil?.toISOString() ?? null,
          moderationNote: row.moderationNote,
          moderatedAt: row.moderatedAt?.toISOString() ?? null,
          pointCount: Array.isArray(row.polyline) ? row.polyline.length : 0,
          hasPost: Boolean(row.post),
          postId: row.post?.id ?? null,
          user: {
            id: row.user.id,
            name: row.user.name,
            email: row.user.email,
            avatarUrl: row.user.profile?.avatarUrl ?? null
          }
        };
      })
    };
  });

  /** Replay GPS do admin — polyline + flags (fatia F). */
  app.get("/admin/outdoor-activities/:id/replay", async (request) => {
    requireDatabase();
    await requireRole(app, request, "ADMIN");
    const { id } = idParamSchema.parse(request.params);
    const row = await prisma.outdoorActivity.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true } } }
    });
    if (!row) throw httpError(404, "Atividade não encontrada.");
    const flagsRaw = row.antiCheatFlags;
    const flagsObj =
      flagsRaw && typeof flagsRaw === "object" && !Array.isArray(flagsRaw)
        ? (flagsRaw as { flags?: string[]; score?: number })
        : { flags: Array.isArray(flagsRaw) ? (flagsRaw as string[]) : [], score: row.antiCheatScore };
    return {
      id: row.id,
      sport: row.sport,
      user: row.user,
      distanceMeters: row.distanceMeters,
      elevationGainMeters: row.elevationGainMeters,
      elevationLossMeters: row.elevationLossMeters,
      antiCheatScore: flagsObj.score ?? row.antiCheatScore ?? 0,
      antiCheatFlags: flagsObj.flags ?? [],
      quarantineUntil: row.quarantineUntil?.toISOString() ?? null,
      pointCount: Array.isArray(row.polyline) ? row.polyline.length : 0,
      polyline: Array.isArray(row.polyline) ? row.polyline : [],
      summary: row.summary
    };
  });

  app.post("/admin/outdoor-activities/:id/moderate", async (request) => {
    requireDatabase();
    const admin = await requireRole(app, request, "ADMIN");
    const { id } = idParamSchema.parse(request.params);
    const body = z
      .object({
        action: z.enum(["clear", "reject", "publish"]),
        note: z.string().max(2000).optional()
      })
      .parse(request.body ?? {});

    const activity = await prisma.outdoorActivity.findUnique({
      where: { id },
      include: { post: true, user: { select: { id: true, name: true } } }
    });
    if (!activity || activity.status !== "COMPLETED") {
      throw httpError(404, "Atividade não encontrada.");
    }

    if (body.action === "reject") {
      const updated = await prisma.$transaction(async (tx) => {
        if (activity.post) {
          await tx.socialPost.update({
            where: { id: activity.post.id },
            data: { hidden: true }
          });
        }
        return tx.outdoorActivity.update({
          where: { id },
          data: {
            flagged: false,
            moderationStatus: "REJECTED",
            moderationNote: body.note?.trim() || "Rejeitada pela moderação.",
            moderatedAt: new Date(),
            caption: null,
            photoUrl: null,
            videoUrl: null
          }
        });
      });
      return { ok: true, activityId: updated.id, moderationStatus: updated.moderationStatus };
    }

    if (body.action === "clear") {
      const updated = await prisma.outdoorActivity.update({
        where: { id },
        data: {
          flagged: false,
          moderationStatus: "CLEARED",
          moderationNote: body.note?.trim() || "Liberada pela moderação.",
          moderatedAt: new Date()
        }
      });
      return { ok: true, activityId: updated.id, moderationStatus: updated.moderationStatus };
    }

    const caption =
      activity.caption?.trim() ||
      `${activity.user.name} · ${(activity.distanceMeters / 1000).toFixed(2)} km · ${activity.sport}`;

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.outdoorActivity.update({
        where: { id },
        data: {
          flagged: false,
          moderationStatus: "CLEARED",
          moderationNote: body.note?.trim() || `Publicada por ${admin.name}.`,
          moderatedAt: new Date(),
          caption
        }
      });

      if (!activity.post) {
        await tx.socialPost.create({
          data: {
            authorId: activity.userId,
            kind: "ACTIVITY",
            body: caption,
            mediaUrl: activity.photoUrl || activity.videoUrl || null,
            mediaType: activity.videoUrl ? "VIDEO" : activity.photoUrl ? "IMAGE" : null,
            activityId: activity.id
          }
        });
      } else if (activity.post.hidden) {
        await tx.socialPost.update({
          where: { id: activity.post.id },
          data: { hidden: false, body: caption }
        });
      }

      return next;
    });

    return { ok: true, activityId: updated.id, moderationStatus: updated.moderationStatus };
  });
}
