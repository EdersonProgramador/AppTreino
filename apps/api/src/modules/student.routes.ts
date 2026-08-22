import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth, requirePathRole, isAdminStudentPreview } from "../auth.js";
import type { AuthTokenPayload } from "../auth.js";
import { env } from "../env.js";
import { prisma } from "../prisma.js";
import { calculateProgramEndDate, isProgramComplete, parseProgramMetadata } from "./workout-program.utils.js";
import {
  filterActiveBlockExercises,
  studentMatchesProgramTargetGender
} from "./cms-publication.utils.js";
import { validActiveMembershipWhere } from "./membership.utils.js";
import {
  assertModuleEnabled,
  blockingPurchaseStatusesForProduct,
  PURCHASE_PAID_STATUSES
} from "./commerce.utils.js";
import { createAsaasCheckout, purchaseExternalReference, type AsaasBillingType } from "./asaas.client.js";
import { ensureProgramCycleRecorded, recordProgramCycleCompletion } from "./program-completion.utils.js";

const substituteSchema = z.object({
  exerciseId: z.string().min(1)
});

const completeWorkoutSchema = z.object({
  assignmentId: z.string().min(1),
  sessionId: z.string().min(1)
});

const startWorkoutSessionSchema = z.object({
  assignmentId: z.string().min(1),
  dayNumber: z.coerce.number().int().min(1).optional()
});

const repeatWorkoutSchema = z.object({
  assignmentId: z.string().min(1)
});

const cancelWorkoutSessionSchema = z.object({
  sessionId: z.string().min(1)
});

const exerciseProgressSchema = z.object({
  sessionId: z.string().min(1),
  exerciseId: z.string().min(1),
  prescriptionId: z.string().min(1).optional(),
  completed: z.coerce.boolean(),
  weightUsed: z.coerce.number().min(0).default(0),
  repsCompleted: z.coerce.number().int().min(0).default(0),
  sets: z.coerce.number().int().min(1).default(1),
  durationSeconds: z.coerce.number().int().min(0).optional(),
  distanceMeters: z.coerce.number().min(0).optional(),
  roundsCompleted: z.coerce.number().int().min(0).optional(),
  perceivedExertion: z.coerce.number().min(0).max(10).optional(),
  notes: z.string().max(1000).optional()
});

async function resetAbandonedSessionsForUser(userId: string, assignmentId?: string) {
  const actives = await prisma.workoutSession.findMany({
    where: {
      userId,
      status: "IN_PROGRESS",
      ...(assignmentId ? { assignmentId } : {})
    },
    select: { id: true }
  });

  for (const active of actives) {
    await prisma.$transaction(async (tx) => {
      await tx.userProgress.deleteMany({ where: { sessionId: active.id, userId } });
      await tx.workoutSession.update({
        where: { id: active.id },
        data: { status: "CANCELED", finishedAt: new Date() }
      });
    });
  }

  return actives.length;
}

async function assertSessionProgressComplete(sessionId: string, workoutBlockId: string | null) {
  if (!workoutBlockId) {
    throw httpError(400, "Sessão sem bloco de treino vinculado.");
  }

  const block = await prisma.workoutBlock.findFirst({
    where: { id: workoutBlockId },
    include: {
      exercises: {
        include: { exercise: { select: { deletedAt: true } } },
        orderBy: { order: "asc" }
      }
    }
  });
  if (!block) {
    throw httpError(400, "Bloco de treino não encontrado.");
  }

  const prescriptions = filterActiveBlockExercises(block.exercises);
  if (prescriptions.length === 0) {
    throw httpError(400, "Não há exercícios ativos neste treino.");
  }

  const progressRows = await prisma.userProgress.findMany({
    where: { sessionId },
    select: { workoutBlockExerciseId: true, seriesIndex: true }
  });

  const seriesByPrescription = new Map<string, Set<number>>();
  for (const row of progressRows) {
    if (!row.workoutBlockExerciseId) continue;
    const bucket = seriesByPrescription.get(row.workoutBlockExerciseId) ?? new Set<number>();
    bucket.add(row.seriesIndex);
    seriesByPrescription.set(row.workoutBlockExerciseId, bucket);
  }

  for (const prescription of prescriptions) {
    const requiredSets = Math.max(1, prescription.sets);
    const done = seriesByPrescription.get(prescription.id)?.size ?? 0;
    if (done < requiredSets) {
      throw httpError(
        400,
        "Conclua todas as séries de cada exercício antes de finalizar o treino."
      );
    }
  }
}

const consistencyQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional()
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

function httpError(statusCode: number, message: string) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;

  return error;
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

export function verifyEnrollmentGating(status: string, pathname: string) {
  const protectedRoutes = ["/student/workout"];
  const isProtected = protectedRoutes.some((route) => pathname.startsWith(route));

  if (isProtected && status !== "ACTIVE") {
    return {
      allowed: false,
      redirectUrl: "/student/dashboard/checkout?status=blocked",
      jsonResponse: {
        error: "Acesso bloqueado. Matrícula inativa.",
        code: "ENROLLMENT_INACTIVE"
      }
    };
  }

  return { allowed: true };
}

async function getEnrollmentStatus(userId: string) {
  const [user, activeMembership] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { enrollmentStatus: true }
    }),
    prisma.membership.findFirst({
      where: {
        userId,
        ...validActiveMembershipWhere()
      },
      select: { id: true }
    })
  ]);

  return activeMembership || user?.enrollmentStatus === "ACTIVE" ? "ACTIVE" : user?.enrollmentStatus ?? "PENDING";
}

async function getCurrentStudentMembership(userId: string) {
  const now = new Date();
  const currentMembership = await prisma.membership.findFirst({
    where: {
      userId,
      ...validActiveMembershipWhere(now)
    },
    include: {
      plan: true,
      payments: true
    },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }]
  });

  if (currentMembership) {
    return currentMembership;
  }

  return prisma.membership.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      deletedAt: null
    },
    include: {
      plan: true,
      payments: true
    },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }]
  });
}

async function requireActiveEnrollment(app: FastifyInstance, request: FastifyRequest) {
  const authUser = await requireAuth(app, request);

  if (isAdminStudentPreview(authUser)) {
    return authUser;
  }

  const status = await getEnrollmentStatus(authUser.id);
  const gating = verifyEnrollmentGating(status, request.url);

  if (!gating.allowed) {
    const jsonResponse = gating.jsonResponse ?? {
      error: "Acesso bloqueado. Matrícula inativa.",
      code: "ENROLLMENT_INACTIVE"
    };
    const error = new Error(jsonResponse.error) as Error & { statusCode: number; code: string };
    error.statusCode = 402;
    error.code = jsonResponse.code;
    throw error;
  }

  return authUser;
}

/** Bloqueia cobranças / mutações financeiras no modo preview. */
function assertNotAdminPreview(authUser: AuthTokenPayload) {
  if (isAdminStudentPreview(authUser)) {
    const error = new Error("Ação indisponível no modo preview do administrador.") as Error & {
      statusCode: number;
      code: string;
    };
    error.statusCode = 403;
    error.code = "ADMIN_PREVIEW_READONLY";
    throw error;
  }
}

function mapWorkoutExercise(item: {
  id: string;
  sets: number;
  repsRange: string;
  prescriptionType: "REPETITIONS" | "DURATION" | "DISTANCE" | "INTERVAL" | "ROUNDS" | "HOLD" | "FREE";
  repsMin: number | null;
  repsMax: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  rounds: number | null;
  workSeconds: number | null;
  intensityType: "NONE" | "LOAD" | "RPE" | "RIR" | "PERCENT_1RM" | "HEART_RATE_ZONE" | "PACE" | "SPEED";
  intensityValue: string | null;
  tempo: string | null;
  side: string | null;
  executionNotes: string | null;
  initialLoad: string | null;
  restSeconds: number | null;
  supportMaterialUrl: string | null;
  order: number;
  exercise: {
    id: string;
    title: string | null;
    name: string | null;
    videoUrl: string | null;
    audioUrl: string | null;
    materialUrl: string | null;
    notes: string | null;
    targetMuscles: string[];
    equipmentTags: string[];
    alternatives: Array<{
      id: string;
      title: string | null;
      name: string | null;
      videoUrl: string | null;
      audioUrl: string | null;
      materialUrl: string | null;
    }>;
  };
}, latestWeightUsed = 0, restSeconds = 0) {
  return {
    prescriptionId: item.id,
    id: item.exercise.id,
    title: item.exercise.title ?? item.exercise.name ?? "Exercício",
    videoUrl: item.exercise.videoUrl ?? "",
    audioUrl: item.exercise.audioUrl ?? "",
    materialUrl: item.supportMaterialUrl ?? item.exercise.materialUrl ?? "",
    description: item.exercise.notes ?? "",
    targetMuscles: item.exercise.targetMuscles,
    equipmentTags: item.exercise.equipmentTags,
    sets: item.sets,
    repsRange: item.repsRange,
    prescriptionType: item.prescriptionType,
    repsMin: item.repsMin,
    repsMax: item.repsMax,
    durationSeconds: item.durationSeconds,
    distanceMeters: item.distanceMeters,
    rounds: item.rounds,
    workSeconds: item.workSeconds,
    intensityType: item.intensityType,
    intensityValue: item.intensityValue ?? "",
    tempo: item.tempo ?? "",
    side: item.side ?? "",
    executionNotes: item.executionNotes ?? "",
    initialLoad: item.initialLoad ?? "",
    restSeconds: item.restSeconds ?? restSeconds,
    latestWeightUsed,
    order: item.order,
    alternatives: item.exercise.alternatives.map((alternative) => ({
      id: alternative.id,
      title: alternative.title ?? alternative.name ?? "Alternativa",
      videoUrl: alternative.videoUrl ?? "",
      audioUrl: alternative.audioUrl ?? "",
      materialUrl: alternative.materialUrl ?? ""
    }))
  };
}

export async function getTodayWorkout(
  userId: string,
  dayNumber: number,
  options?: { bypassEnrollment?: boolean }
) {
  if (!options?.bypassEnrollment) {
    const status = await getEnrollmentStatus(userId);
    if (status !== "ACTIVE") {
      return null;
    }
  }

  const workouts = await getPublishedWorkouts(userId, dayNumber, options);

  return workouts[0] ?? null;
}

export async function getPublishedWorkouts(
  userId: string,
  dayNumber: number,
  options?: { bypassEnrollment?: boolean }
) {
  if (!options?.bypassEnrollment) {
    const status = await getEnrollmentStatus(userId);
    if (status !== "ACTIVE") {
      return [];
    }
  }

  const student = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      profile: {
        select: {
          gender: true
        }
      }
    }
  });
  const studentGender = student?.profile?.gender ?? null;

  let publishedPrograms = await prisma.program.findMany({
    where: {
      status: "PUBLISHED",
      isActive: true,
      deletedAt: null,
      modality: {
        isActive: true,
        deletedAt: null
      },
      days: {
        some: {
          workoutBlock: {
            deletedAt: null
          }
        }
      },
      ...(studentGender
        ? {
            OR: [{ targetGender: "ALL" as const }, { targetGender: studentGender }]
          }
        : {
            targetGender: "ALL"
          }),
      AND: [
        {
          OR: [
            { audienceMode: "ALL_ACTIVE" },
            {
              assignedUsers: {
                some: {
                  userId,
                  status: "ACTIVE"
                }
              }
            }
          ]
        }
      ]
    },
    include: {
      days: true
    },
    orderBy: [{ sortOrder: "asc" }, { publishedAt: "desc" }, { createdAt: "asc" }]
  });

  publishedPrograms = publishedPrograms.filter((program) =>
    studentMatchesProgramTargetGender(program.targetGender, studentGender)
  );

  const assignedPrograms = await prisma.userProgram.findMany({
    where: {
      userId,
      status: "ACTIVE",
      program: {
        status: "PUBLISHED",
        isActive: true,
        deletedAt: null,
        modality: {
          isActive: true,
          deletedAt: null
        }
      }
    },
    select: {
      program: {
        include: {
          days: true
        }
      }
    }
  });

  for (const { program } of assignedPrograms) {
    if (
      program.days.length > 0 &&
      studentMatchesProgramTargetGender(program.targetGender, studentGender) &&
      !publishedPrograms.some((publishedProgram) => publishedProgram.id === program.id)
    ) {
      publishedPrograms.push(program);
    }
  }

  publishedPrograms.sort(
    (first, second) =>
      first.sortOrder - second.sortOrder ||
      (second.publishedAt?.getTime() ?? 0) - (first.publishedAt?.getTime() ?? 0) ||
      first.createdAt.getTime() - second.createdAt.getTime()
  );

  if (publishedPrograms.length === 0) {
    return [];
  }

  const [membership, teachers, studentLocation] = await Promise.all([
    getCurrentStudentMembership(userId),
    prisma.user.findMany({
      where: {
        role: "ADMIN",
        status: "ACTIVE"
      },
      select: {
        name: true
      },
      take: 3
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        profile: {
          select: {
            location: {
              select: { name: true }
            }
          }
        }
      }
    })
  ]);

  const allProgramIds = publishedPrograms.map((program) => program.id);

  const programDaysByProgram = await prisma.programDayWorkout.findMany({
    where: {
      programId: {
        in: allProgramIds
      },
      workoutBlock: {
        deletedAt: null
      }
    },
    include: {
      program: {
        include: {
          modality: true
        }
      },
      workoutBlock: {
        include: {
          exercises: {
            where: {
              exercise: {
                deletedAt: null
              }
            },
            include: {
              exercise: {
                include: {
                  alternatives: {
                    where: {
                      deletedAt: null
                    }
                  }
                }
              }
            },
            orderBy: {
              order: "asc"
            }
          }
        }
      }
    },
    orderBy: {
      dayNumber: "asc"
    }
  });

  const allExerciseIds = Array.from(
    new Set(programDaysByProgram.flatMap((day) => day.workoutBlock.exercises.map((exercise) => exercise.exerciseId)))
  );

  const [completedSessionsByProgram, latestProgressByExercise, cycleCompletionGroups] = await Promise.all([
    prisma.workoutSession.findMany({
      where: {
        userId,
        programId: {
          in: allProgramIds
        },
        status: "COMPLETED"
      },
      select: {
        programId: true,
        dayNumber: true,
        finishedAt: true
      }
    }),
    prisma.userProgress.findMany({
      where: {
        userId,
        exerciseId: {
          in: allExerciseIds
        }
      },
      orderBy: {
        completedAt: "desc"
      }
    }),
    prisma.programCycleCompletion.groupBy({
      by: ["programId"],
      where: {
        userId,
        programId: {
          in: allProgramIds
        }
      },
      _count: {
        _all: true
      }
    })
  ]);

  const cycleCountByProgramId = new Map(
    cycleCompletionGroups.map((group) => [group.programId, group._count._all])
  );

  const latestWeightByExercise = new Map<string, number>();

  for (const progress of latestProgressByExercise) {
    if (!latestWeightByExercise.has(progress.exerciseId)) {
      latestWeightByExercise.set(progress.exerciseId, progress.weightUsed);
    }
  }

  const programDaysByProgramId = new Map<string, typeof programDaysByProgram>();

  for (const day of programDaysByProgram) {
    const existing = programDaysByProgramId.get(day.programId);

    if (existing) {
      existing.push(day);
    } else {
      programDaysByProgramId.set(day.programId, [day]);
    }
  }

  const workouts = await Promise.all(
    publishedPrograms.map(async (publishedProgram) => {
      let assignment = await prisma.userProgram.upsert({
        where: {
          userId_programId: {
            userId,
            programId: publishedProgram.id
          }
        },
        create: {
          userId,
          programId: publishedProgram.id,
          currentDay: dayNumber,
          totalWorkouts: publishedProgram.plannedSessions,
          completedWorkouts: 0,
          status: "ACTIVE",
          plannedEndsAt: calculateProgramEndDate(new Date(), {
            years: publishedProgram.durationYears,
            months: publishedProgram.durationMonths,
            weeks: publishedProgram.durationWeeks,
            days: publishedProgram.durationExtraDays
          })
        },
        update: {
          totalWorkouts: publishedProgram.plannedSessions
        },
        include: {
          program: {
            include: {
              days: true,
              modality: true
            }
          }
        }
      });

      if (assignment.status === "CANCELED") {
        return null;
      }

      if (!assignment.plannedEndsAt) {
        assignment = await prisma.userProgram.update({
          where: { id: assignment.id },
          data: {
            plannedEndsAt: calculateProgramEndDate(assignment.startedAt, {
              years: assignment.program.durationYears,
              months: assignment.program.durationMonths,
              weeks: assignment.program.durationWeeks,
              days: assignment.program.durationExtraDays
            })
          },
          include: {
            program: {
              include: {
                days: true,
                modality: true
              }
            }
          }
        });
      }

      if (
        assignment.status === "ACTIVE" &&
        !assignment.program.days.some((day) => day.dayNumber === assignment.currentDay)
      ) {
        assignment = await prisma.userProgram.update({
          where: {
            id: assignment.id
          },
          data: {
            currentDay: dayNumber,
            status: "ACTIVE",
            completedAt: null
          },
          include: {
            program: {
              include: {
                days: true,
                modality: true
              }
            }
          }
        });
      }

      const cycleCompleted = assignment.status === "COMPLETED";
      const metadataPreview = parseProgramMetadata(assignment.program.description);
      const modalityNamePreview = assignment.program.modality?.name ?? metadataPreview.modality;
      let completionCount = cycleCountByProgramId.get(assignment.programId) ?? 0;
      const historicalCompletedSessions = completedSessionsByProgram.filter(
        (session) => session.programId === assignment.programId
      ).length;

      if (completionCount === 0 && (cycleCompleted || historicalCompletedSessions >= assignment.totalWorkouts)) {
        const recorded = await ensureProgramCycleRecorded({
          userId,
          programId: assignment.programId,
          programTitle: assignment.program.title,
          modalityId: assignment.program.modalityId ?? null,
          modalityName: modalityNamePreview,
          completedAt: assignment.completedAt ?? new Date()
        });
        completionCount = recorded.cycleNumber;
        cycleCountByProgramId.set(assignment.programId, completionCount);
      }

      const currentDay = assignment.currentDay;
      const programDays = (programDaysByProgramId.get(assignment.programId) ?? []).filter(
        (day) => day.workoutBlock.exercises.length > 0
      );
      const programDay = programDays.find((day) => day.dayNumber === currentDay) ?? programDays[0] ?? null;

      if (!programDay) {
        return null;
      }

      const mapBlockExercises = (block: typeof programDay.workoutBlock) =>
        filterActiveBlockExercises(block.exercises).map((exercise) =>
          mapWorkoutExercise(exercise, latestWeightByExercise.get(exercise.exerciseId) ?? 0, block.restTime)
        );

      const completedDayNumbers = new Set(
        completedSessionsByProgram
          .filter(
            (session) =>
              session.programId === assignment.programId &&
              Boolean(session.finishedAt) &&
              session.finishedAt! >= assignment.startedAt
          )
          .map((session) => session.dayNumber)
      );
      if (cycleCompleted) {
        for (const day of programDays) {
          completedDayNumbers.add(day.dayNumber);
        }
      }
      const completedWorkoutCount = cycleCompleted
        ? Math.max(assignment.completedWorkouts, assignment.totalWorkouts, completedDayNumbers.size)
        : Math.max(assignment.completedWorkouts, completedDayNumbers.size);
      const metadata = parseProgramMetadata(programDay.program.description);
      const modalityName = programDay.program.modality?.name ?? metadata.modality;
      const sequence = programDays.map((day) => ({
        programId: day.program.id,
        programTitle: day.program.title,
        assignmentId: assignment.id,
        dayNumber: day.dayNumber,
        totalDays: assignment.program.days.length,
        totalWorkouts: assignment.totalWorkouts,
        completedWorkouts: completedWorkoutCount,
        completed: completedDayNumbers.has(day.dayNumber),
        cycleCompleted,
        completionCount,
        block: {
          title: day.workoutBlock.title,
          identifier: day.workoutBlock.identifier,
          focus: day.workoutBlock.focus,
          weeklyFrequency: day.workoutBlock.weeklyFrequency,
          structureType: day.workoutBlock.structureType,
          restTime: day.workoutBlock.restTime,
          protocolRounds: day.workoutBlock.protocolRounds,
          workSeconds: day.workoutBlock.workSeconds,
          timeCapSeconds: day.workoutBlock.timeCapSeconds,
          instructions: day.workoutBlock.instructions,
          exercises: mapBlockExercises(day.workoutBlock)
        }
      }));

      return {
        programId: programDay.program.id,
        programTitle: programDay.program.title,
        assignmentId: assignment.id,
        dayNumber: currentDay,
        totalDays: assignment.program.days.length,
        totalWorkouts: assignment.totalWorkouts,
        cycleCompleted,
        completionCount,
        modality: modalityName,
        modalityImageUrl: programDay.program.modality?.imageUrl ?? null,
        description: metadata.description,
        completedWorkouts: completedWorkoutCount,
        duration: {
          years: assignment.program.durationYears,
          months: assignment.program.durationMonths,
          weeks: assignment.program.durationWeeks,
          days: assignment.program.durationExtraDays,
          estimatedCalendarDays: assignment.program.durationDays,
          plannedSessions: assignment.totalWorkouts,
          completionMode: assignment.program.completionMode,
          scheduleType: assignment.program.scheduleType,
          cycleLengthDays: assignment.program.cycleLengthDays,
          startedAt: assignment.startedAt,
          plannedEndsAt: assignment.plannedEndsAt
        },
        teacherNames: teachers.map((teacher) => teacher.name),
        unitName: studentLocation?.profile?.location?.name ?? "Não informada",
        membershipStartsAt: membership ? resolveMembershipStartsAt(membership) : null,
        membershipEndsAt: membership ? resolveMembershipEndsAt(membership) : null,
        sequence,
        block: {
          title: programDay.workoutBlock.title,
          identifier: programDay.workoutBlock.identifier,
          focus: programDay.workoutBlock.focus,
          weeklyFrequency: programDay.workoutBlock.weeklyFrequency,
          structureType: programDay.workoutBlock.structureType,
          restTime: programDay.workoutBlock.restTime,
          protocolRounds: programDay.workoutBlock.protocolRounds,
          workSeconds: programDay.workoutBlock.workSeconds,
          timeCapSeconds: programDay.workoutBlock.timeCapSeconds,
          instructions: programDay.workoutBlock.instructions,
          exercises: mapBlockExercises(programDay.workoutBlock)
        }
      };
    })
  );

  return workouts.filter((workout): workout is NonNullable<typeof workout> => Boolean(workout));
}

export async function registerStudentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (request) => {
    await requirePathRole(app, request, "/student", "USER");
  });

  /** Catálogo visual para aluno sem assinatura ativa (primeira experiência). */
  app.get("/student/catalog/modalities", async (request) => {
    requireDatabase();
    const authUser = await requireAuth(app, request);
    const student = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        profile: {
          select: { gender: true }
        }
      }
    });
    const studentGender = student?.profile?.gender ?? null;

    const modalities = await prisma.modality.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        programs: {
          some: {
            status: "PUBLISHED",
            isActive: true,
            deletedAt: null,
            ...(studentGender
              ? {
                  OR: [{ targetGender: "ALL" as const }, { targetGender: studentGender }]
                }
              : {
                  targetGender: "ALL"
                })
          }
        }
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        imageUrl: true
      }
    });

    return {
      modalities: modalities.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        locked: true
      }))
    };
  });

  app.get("/student/workout/programs", async (request) => {
    requireDatabase();
    const authUser = await requireActiveEnrollment(app, request);
    const workouts = await getPublishedWorkouts(authUser.id, 1, {
      bypassEnrollment: isAdminStudentPreview(authUser)
    });
    const [favoritedProgramIds, ratedAssignmentIds] = await Promise.all([
      prisma.workoutFavorite.findMany({
        where: {
          userId: authUser.id
        },
        select: {
          programId: true
        }
      }),
      prisma.rating.findMany({
        where: {
          userId: authUser.id,
          targetType: "WORKOUT"
        },
        select: {
          targetId: true
        }
      })
    ]);

    const favoritedSet = new Set(favoritedProgramIds.map((item) => item.programId));
    const ratedSet = new Set(ratedAssignmentIds.map((item) => item.targetId));
    const ratedButNotFavorited = workouts.filter(
      (workout) =>
        workout.assignmentId &&
        ratedSet.has(workout.assignmentId) &&
        !favoritedSet.has(workout.programId)
    );

    if (ratedButNotFavorited.length > 0) {
      await prisma.workoutFavorite.createMany({
        data: ratedButNotFavorited.map((workout) => ({
          userId: authUser.id,
          programId: workout.programId
        })),
        skipDuplicates: true
      });
      ratedButNotFavorited.forEach((workout) => favoritedSet.add(workout.programId));
    }

    return {
      workouts: workouts.map((workout) => ({
        ...workout,
        favoritedByMe: favoritedSet.has(workout.programId),
        ratedByMe: Boolean(workout.assignmentId && ratedSet.has(workout.assignmentId))
      }))
    };
  });

  app.get("/student/workout/favorites", async (request) => {
    requireDatabase();
    const authUser = await requireAuth(app, request);
    const [favoritedProgramIds, ratedAssignmentIds] = await Promise.all([
      prisma.workoutFavorite.findMany({
        where: {
          userId: authUser.id
        },
        select: {
          programId: true
        }
      }),
      prisma.rating.findMany({
        where: {
          userId: authUser.id,
          targetType: "WORKOUT"
        },
        select: {
          targetId: true
        }
      })
    ]);

    const favoritedSet = new Set(favoritedProgramIds.map((item) => item.programId));
    const ratedAssignmentIdsSet = new Set(ratedAssignmentIds.map((item) => item.targetId).filter(Boolean) as string[]);

    if (ratedAssignmentIdsSet.size > 0) {
      const ratedAssignments = await prisma.userProgram.findMany({
        where: {
          id: {
            in: Array.from(ratedAssignmentIdsSet)
          },
          userId: authUser.id
        },
        select: {
          id: true,
          programId: true
        }
      });

      const ratedButNotFavorited = ratedAssignments
        .filter((assignment) => !favoritedSet.has(assignment.programId))
        .map((assignment) => assignment.programId);

      if (ratedButNotFavorited.length > 0) {
        await prisma.workoutFavorite.createMany({
          data: ratedButNotFavorited.map((programId) => ({
            userId: authUser.id,
            programId
          })),
          skipDuplicates: true
        });
        ratedButNotFavorited.forEach((programId) => favoritedSet.add(programId));
      }
    }

    const favorites = await prisma.workoutFavorite.findMany({
      where: {
        userId: authUser.id
      },
      include: {
        program: {
          include: {
            modality: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return {
      favorites: favorites.map((favorite) => ({
        id: favorite.id,
        createdAt: favorite.createdAt,
        program: {
          id: favorite.program.id,
          title: favorite.program.title,
          description: favorite.program.description,
          modality: favorite.program.modality?.name ?? null,
          modalityImageUrl: favorite.program.modality?.imageUrl ?? null,
          totalWorkouts: favorite.program.totalWorkouts
        }
      }))
    };
  });

  app.post("/student/workout/favorites/:programId", async (request, reply) => {
    requireDatabase();
    const authUser = await requireAuth(app, request);
    const { programId } = z.object({ programId: z.string().min(1) }).parse(request.params);
    const existing = await prisma.workoutFavorite.findUnique({
      where: {
        userId_programId: {
          userId: authUser.id,
          programId
        }
      }
    });

    if (existing) {
      await prisma.workoutFavorite.delete({ where: { id: existing.id } });
      return { favorited: false };
    }

    await prisma.workoutFavorite.create({
      data: {
        userId: authUser.id,
        programId
      }
    });

    return reply.code(201).send({ favorited: true });
  });

  app.get("/student/workout/today", async (request, reply) => {
    requireDatabase();
    const authUser = await requireActiveEnrollment(app, request);
    const workout = await getTodayWorkout(authUser.id, 1, {
      bypassEnrollment: isAdminStudentPreview(authUser)
    });

    if (!workout) {
      return reply.code(404).send({
        message: "Treino de hoje não encontrado."
      });
    }

    return { workout };
  });

  app.post("/student/workout/start-session", async (request) => {
    requireDatabase();
    const authUser = await requireActiveEnrollment(app, request);
    const body = startWorkoutSessionSchema.parse(request.body);

    const assignment = await prisma.userProgram.findFirstOrThrow({
      where: {
        id: body.assignmentId,
        userId: authUser.id,
        status: "ACTIVE",
        program: {
          status: "PUBLISHED",
          isActive: true
        }
      },
      include: {
        program: {
          include: {
            days: true
          }
        }
      }
    });

    const requestedDay = body.dayNumber ?? assignment.currentDay;
    if (requestedDay !== assignment.currentDay) {
      throw httpError(400, "Conclua o dia atual antes de iniciar outro treino.");
    }

    const programDay = await prisma.programDayWorkout.findFirstOrThrow({
      where: {
        programId: assignment.programId,
        dayNumber: requestedDay
      },
      orderBy: {
        order: "asc"
      }
    });

    // Sem resume: qualquer IN_PROGRESS anterior é resetado; sempre começa limpo.
    await resetAbandonedSessionsForUser(authUser.id, assignment.id);

    const session = await prisma.workoutSession.create({
      data: {
        userId: authUser.id,
        assignmentId: assignment.id,
        programId: assignment.programId,
        workoutBlockId: programDay.workoutBlockId,
        dayNumber: programDay.dayNumber
      }
    });

    return { session };
  });

  app.post("/student/workout/cancel-session", async (request) => {
    requireDatabase();
    const authUser = await requireActiveEnrollment(app, request);
    const body = cancelWorkoutSessionSchema.parse(request.body);

    const currentSession = await prisma.workoutSession.findFirst({
      where: {
        id: body.sessionId,
        userId: authUser.id,
        status: "IN_PROGRESS"
      }
    });

    if (!currentSession) {
      return { session: null, reset: false };
    }

    await prisma.userProgress.deleteMany({
      where: { sessionId: currentSession.id, userId: authUser.id }
    });

    const session = await prisma.workoutSession.update({
      where: { id: currentSession.id },
      data: {
        status: "CANCELED",
        finishedAt: new Date()
      }
    });

    return { session, reset: true };
  });

  app.post("/student/workout/reset-abandoned", async (request) => {
    requireDatabase();
    const authUser = await requireActiveEnrollment(app, request);
    const resetCount = await resetAbandonedSessionsForUser(authUser.id);
    return { ok: true, resetCount };
  });

  app.post("/student/workout/exercise-progress", async (request) => {
    requireDatabase();
    const authUser = await requireActiveEnrollment(app, request);
    const body = exerciseProgressSchema.parse(request.body);
    const session = await prisma.workoutSession.findFirst({
      where: {
        id: body.sessionId,
        userId: authUser.id,
        status: "IN_PROGRESS"
      },
      include: {
        workoutBlock: {
          include: {
            exercises: {
              select: {
                id: true,
                exerciseId: true
              }
            }
          }
        }
      }
    });

    if (!session) {
      throw httpError(409, "Inicie o treino antes de registrar exercícios concluídos.");
    }

    const workoutExercise = session.workoutBlock?.exercises.find(
      (item) => item.exerciseId === body.exerciseId && (!body.prescriptionId || item.id === body.prescriptionId)
    );

    if (!workoutExercise) {
      throw httpError(400, "Este exercício não pertence ao bloco de treino iniciado.");
    }

    await prisma.userProgress.deleteMany({
      where: {
        userId: authUser.id,
        sessionId: session.id,
        workoutBlockExerciseId: workoutExercise.id
      }
    });

    if (!body.completed) {
      return {
        completed: false,
        progress: []
      };
    }

    const progress = await prisma.$transaction(
      Array.from({ length: body.sets }).map((_, index) =>
        prisma.userProgress.create({
          data: {
            userId: authUser.id,
            exerciseId: body.exerciseId,
            sessionId: session.id,
            workoutBlockExerciseId: workoutExercise.id,
            weightUsed: body.weightUsed,
            repsCompleted: body.repsCompleted,
            durationSeconds: body.durationSeconds,
            distanceMeters: body.distanceMeters,
            roundsCompleted: body.roundsCompleted,
            perceivedExertion: body.perceivedExertion,
            notes: body.notes,
            seriesIndex: index + 1
          }
        })
      )
    );

    return {
      completed: true,
      progress
    };
  });

  app.get("/student/workout/consistency", async (request) => {
    requireDatabase();
    const authUser = await requireActiveEnrollment(app, request);
    const query = consistencyQuerySchema.parse(request.query);
    const now = new Date();
    const year = query.year ?? now.getUTCFullYear();
    const month = query.month ?? now.getUTCMonth() + 1;
    const startsAt = new Date(Date.UTC(year, month - 1, 1));
    const endsAt = new Date(Date.UTC(year, month, 1));
    const historyStartsAt = new Date(Date.UTC(year - 1, month - 1, 1));

    const [sessions, historySessions, userPrograms] = await Promise.all([
      prisma.workoutSession.findMany({
        where: {
          userId: authUser.id,
          status: "COMPLETED",
          finishedAt: {
            gte: startsAt,
            lt: endsAt
          }
        },
        orderBy: {
          finishedAt: "asc"
        }
      }),
      prisma.workoutSession.findMany({
        where: {
          userId: authUser.id,
          status: "COMPLETED",
          finishedAt: {
            gte: historyStartsAt,
            lt: endsAt
          }
        },
        select: {
          finishedAt: true
        },
        orderBy: {
          finishedAt: "asc"
        }
      }),
      prisma.userProgram.findMany({
        where: {
          userId: authUser.id,
          status: {
            in: ["ACTIVE", "COMPLETED"]
          },
          program: {
            days: {
              some: {}
            }
          }
        },
        include: {
          program: {
            include: {
              days: true
            }
          }
        }
      })
    ]);

    const completedDateSet = new Set<string>();
    sessions.forEach((session) => {
      if (session.finishedAt) {
        completedDateSet.add(session.finishedAt.toISOString().slice(0, 10));
      }
    });
    const historyDateSet = new Set<string>();
    historySessions.forEach((session) => {
      if (session.finishedAt) {
        historyDateSet.add(session.finishedAt.toISOString().slice(0, 10));
      }
    });
    const totalWorkoutDays = userPrograms.reduce((total, assignment) => total + assignment.totalWorkouts, 0);
    const completedWorkoutCount = userPrograms.reduce(
      (total, assignment) => total + Math.min(assignment.completedWorkouts, assignment.totalWorkouts),
      0
    );

    return {
      year,
      month,
      completedWorkoutCount,
      totalWorkoutDays,
      completedDates: Array.from(completedDateSet).sort(),
      historyDates: Array.from(historyDateSet).sort(),
      sessions: sessions.map((session) => ({
        id: session.id,
        dayNumber: session.dayNumber,
        startedAt: session.startedAt,
        finishedAt: session.finishedAt,
        durationSeconds: session.durationSeconds
      }))
    };
  });

  app.post("/student/workout/substitute", async (request) => {
    requireDatabase();
    await requireActiveEnrollment(app, request);
    const body = substituteSchema.parse(request.body);

    const current = await prisma.exercise.findUniqueOrThrow({
      where: { id: body.exerciseId, deletedAt: null },
      include: {
        alternatives: true
      }
    });

    const directAlternatives = current.alternatives;
    const tagAlternatives =
      directAlternatives.length > 0
        ? []
        : await prisma.exercise.findMany({
            where: {
              id: {
                not: current.id
              },
              workoutDayId: null,
              deletedAt: null,
              targetMuscles: {
                hasSome: current.targetMuscles
              },
              NOT: current.equipmentTags.map((tag) => ({
                equipmentTags: {
                  has: tag
                }
              }))
            },
            take: 8
          });

    return {
      alternatives: [...directAlternatives, ...tagAlternatives].map((exercise) => ({
        id: exercise.id,
        title: exercise.title ?? exercise.name ?? "Alternativa",
        videoUrl: exercise.videoUrl ?? "",
        audioUrl: exercise.audioUrl ?? "",
        materialUrl: exercise.materialUrl ?? "",
        targetMuscles: exercise.targetMuscles,
        equipmentTags: exercise.equipmentTags
      }))
    };
  });

  app.post("/student/workout/complete-day", async (request) => {
    requireDatabase();
    const authUser = await requireActiveEnrollment(app, request);
    const body = completeWorkoutSchema.parse(request.body);

    const assignment = await prisma.userProgram.findFirstOrThrow({
      where: {
        id: body.assignmentId,
        userId: authUser.id,
        status: "ACTIVE",
        program: {
          status: "PUBLISHED",
          isActive: true
        }
      },
      include: {
        program: {
          include: {
            days: true,
            modality: true
          }
        }
      }
    });

    const session = await prisma.workoutSession.findFirst({
      where: {
        id: body.sessionId,
        userId: authUser.id,
        assignmentId: assignment.id,
        status: "IN_PROGRESS"
      }
    });

    if (!session) {
      throw httpError(409, "Nenhum treino em andamento para concluir.");
    }

    if (session.dayNumber !== assignment.currentDay) {
      throw httpError(400, "Esta sessão não corresponde ao dia atual do programa.");
    }

    await assertSessionProgressComplete(session.id, session.workoutBlockId);

    const finishedAt = new Date();
    const completedDayNumber = session.dayNumber;
    const programDays = [...assignment.program.days].sort(
      (first, second) => first.dayNumber - second.dayNumber || first.order - second.order
    );
    const totalDays = programDays.length;
    const currentIndex = Math.max(
      0,
      programDays.findIndex((day) => day.dayNumber === completedDayNumber)
    );
    const nextDayNumber =
      totalDays > 0
        ? programDays[(currentIndex + 1) % totalDays]?.dayNumber ?? completedDayNumber
        : completedDayNumber;
    const countCanExceedTarget =
      assignment.program.completionMode === "BY_DATE" || assignment.program.completionMode === "MANUAL";
    const completedWorkouts = countCanExceedTarget
      ? assignment.completedWorkouts + 1
      : Math.min(assignment.completedWorkouts + 1, assignment.totalWorkouts);
    const isLastWorkout = isProgramComplete({
      completionMode: assignment.program.completionMode,
      completedSessions: completedWorkouts,
      plannedSessions: assignment.totalWorkouts,
      plannedEndsAt: assignment.plannedEndsAt,
      now: finishedAt
    });

    const [updatedAssignment, completedSession] = await prisma.$transaction([
      prisma.userProgram.update({
        where: { id: assignment.id },
        data: {
          currentDay: isLastWorkout ? completedDayNumber : nextDayNumber,
          completedWorkouts,
          status: isLastWorkout ? "COMPLETED" : "ACTIVE",
          completedAt: isLastWorkout ? finishedAt : null
        }
      }),
      prisma.workoutSession.update({
        where: { id: session.id },
        data: {
          status: "COMPLETED",
          finishedAt,
          durationSeconds: Math.max(
            1,
            Math.round((finishedAt.getTime() - session.startedAt.getTime()) / 1000)
          )
        }
      })
    ]);

    try {
      const today = new Date(
        Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())
      );
      await prisma.attendanceRecord.upsert({
        where: {
          userId_date: {
            userId: authUser.id,
            date: today
          }
        },
        create: {
          userId: authUser.id,
          date: today
        },
        update: {}
      });
    } catch (attendanceError) {
      request.log.warn({ err: attendanceError }, "Falha ao registrar presença após concluir treino.");
    }

    if (isLastWorkout) {
      const metadata = parseProgramMetadata(assignment.program.description);
      try {
        await recordProgramCycleCompletion({
          userId: authUser.id,
          programId: assignment.programId,
          programTitle: assignment.program.title,
          modalityId: assignment.program.modalityId ?? null,
          modalityName: assignment.program.modality?.name ?? metadata.modality,
          completedAt: finishedAt
        });
      } catch (completionError) {
        request.log.warn({ err: completionError }, "Falha ao registrar selo de conclusão do programa.");
      }
    }

    return {
      assignment: updatedAssignment,
      session: completedSession,
      completed: isLastWorkout,
      nextDayNumber: isLastWorkout ? null : nextDayNumber
    };
  });

  app.post("/student/workout/repeat", async (request) => {
    requireDatabase();
    const authUser = await requireActiveEnrollment(app, request);
    const body = repeatWorkoutSchema.parse(request.body);

    const assignment = await prisma.userProgram.findFirstOrThrow({
      where: {
        id: body.assignmentId,
        userId: authUser.id,
        status: "COMPLETED",
        program: {
          status: "PUBLISHED",
          isActive: true
        }
      },
      include: {
        program: {
          include: {
            days: true
          }
        }
      }
    });

    const startedAt = new Date();
    const firstDay =
      [...assignment.program.days].sort((first, second) => first.dayNumber - second.dayNumber)[0]?.dayNumber ?? 1;

    const updated = await prisma.userProgram.update({
      where: { id: assignment.id },
      data: {
        status: "ACTIVE",
        currentDay: firstDay,
        completedWorkouts: 0,
        completedAt: null,
        startedAt,
        plannedEndsAt: calculateProgramEndDate(startedAt, {
          years: assignment.program.durationYears,
          months: assignment.program.durationMonths,
          weeks: assignment.program.durationWeeks,
          days: assignment.program.durationExtraDays
        })
      }
    });

    return {
      assignment: updated,
      repeated: true
    };
  });

  const studentPaymentCardSchema = z.object({
    brand: z.string().optional(),
    lastFour: z.string().length(4),
    holderName: z.string().optional(),
    isDefault: z.boolean().default(false)
  });

  const studentRatingSchema = z.object({
    score: z.number().int().min(1).max(5),
    comment: z.string().max(500).optional(),
    targetType: z.string().min(1).default("WORKOUT"),
    targetId: z.string().optional(),
    productId: z.string().optional()
  });

  app.get("/student/payment-cards", async (request) => {
    requireDatabase();
    const authUser = await requireAuth(app, request);
    const paymentCards = await prisma.paymentCard.findMany({
      where: { userId: authUser.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }]
    });

    return { paymentCards };
  });

  app.post("/student/payment-cards", async (request, reply) => {
    requireDatabase();
    const authUser = await requireAuth(app, request);
    assertNotAdminPreview(authUser);
    const body = studentPaymentCardSchema.parse(request.body);
    if (body.isDefault) {
      await prisma.paymentCard.updateMany({
        where: { userId: authUser.id },
        data: { isDefault: false }
      });
    }
    const paymentCard = await prisma.paymentCard.create({
      data: { ...body, userId: authUser.id }
    });

    return reply.code(201).send({ paymentCard });
  });

  app.delete("/student/payment-cards/:id", async (request) => {
    requireDatabase();
    const authUser = await requireAuth(app, request);
    assertNotAdminPreview(authUser);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    await prisma.paymentCard.deleteMany({ where: { id, userId: authUser.id } });

    return { ok: true };
  });

  app.post("/student/ratings", async (request, reply) => {
    requireDatabase();
    const authUser = await requireAuth(app, request);
    const body = studentRatingSchema.parse(request.body);
    const rating = await prisma.rating.create({
      data: {
        userId: authUser.id,
        score: body.score,
        comment: body.comment,
        targetType: body.targetType,
        targetId: body.targetId,
        productId: body.productId || null
      }
    });

    return reply.code(201).send({ rating });
  });

  const studentPurchaseSchema = z.object({
    productId: z.string().min(1),
    billingType: z.enum(["BOLETO", "CREDIT_CARD", "PIX", "UNDEFINED"]).default("UNDEFINED")
  });

  const studentPurchaseCheckoutSchema = z.object({
    billingType: z.enum(["BOLETO", "CREDIT_CARD", "PIX", "UNDEFINED"]).default("UNDEFINED")
  });

  app.get("/student/products", async (request) => {
    requireDatabase();
    await assertModuleEnabled("module_products");
    const authUser = await requireAuth(app, request);
    const [products, openPurchases, favoritedProductIds, ratedProductIds] = await Promise.all([
      prisma.product.findMany({
        where: {
          isActive: true,
          deletedAt: null
        },
        include: {
          _count: {
            select: { purchases: true, favorites: true, ratings: true }
          }
        },
        orderBy: {
          createdAt: "desc"
        }
      }),
      prisma.purchase.findMany({
        where: {
          userId: authUser.id,
          deletedAt: null,
          status: { in: ["PENDING", "CONFIRMED", "READY", "DELIVERED"] }
        },
        select: {
          productId: true,
          status: true
        }
      }),
      prisma.favorite.findMany({
        where: {
          userId: authUser.id,
          deletedAt: null
        },
        select: {
          productId: true
        }
      }),
      prisma.rating.findMany({
        where: {
          userId: authUser.id,
          targetType: "PRODUCT",
          productId: { not: null },
          deletedAt: null
        },
        select: {
          productId: true
        }
      })
    ]);

    return {
      products: products.map((product) => {
        const blocking = blockingPurchaseStatusesForProduct(product.kind);
        const purchasedByMe = openPurchases.some(
          (item) => item.productId === product.id && blocking.includes(item.status)
        );
        return {
          ...product,
          purchasedByMe,
          favoritedByMe: favoritedProductIds.some((item) => item.productId === product.id),
          ratedByMe: ratedProductIds.some((item) => item.productId === product.id),
          outOfStock: product.stock != null && product.stock <= 0
        };
      })
    };
  });

  app.get("/student/favorites", async (request) => {
    requireDatabase();
    const authUser = await requireAuth(app, request);
    const favorites = await prisma.favorite.findMany({
      where: {
        userId: authUser.id
      },
      include: {
        product: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return { favorites };
  });

  app.post("/student/favorites/:productId", async (request, reply) => {
    requireDatabase();
    const authUser = await requireAuth(app, request);
    const { productId } = z.object({ productId: z.string().min(1) }).parse(request.params);
    const existing = await prisma.favorite.findFirst({
      where: {
        userId: authUser.id,
        productId
      }
    });

    if (existing) {
      await prisma.favorite.delete({ where: { id: existing.id } });
      return { favorited: false };
    }

    await prisma.favorite.create({
      data: {
        userId: authUser.id,
        productId
      }
    });

    return reply.code(201).send({ favorited: true });
  });

  app.get("/student/ratings", async (request) => {
    requireDatabase();
    const authUser = await requireAuth(app, request);
    const ratings = await prisma.rating.findMany({
      where: {
        userId: authUser.id,
        targetType: "PRODUCT",
        productId: { not: null }
      },
      include: {
        product: true
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 50
    });

    return { ratings };
  });

  app.post("/student/purchases", async (request, reply) => {
    requireDatabase();
    await assertModuleEnabled("module_purchases");
    const authUser = await requireAuth(app, request);
    assertNotAdminPreview(authUser);
    const body = studentPurchaseSchema.parse(request.body);
    const product = await prisma.product.findFirstOrThrow({
      where: {
        id: body.productId,
        isActive: true,
        deletedAt: null
      }
    });

    if (product.stock != null && product.stock <= 0) {
      const error = new Error("Produto sem estoque no momento.") as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    }

    const blockingStatuses = blockingPurchaseStatusesForProduct(product.kind);
    const existingOpen = await prisma.purchase.findFirst({
      where: {
        userId: authUser.id,
        productId: product.id,
        deletedAt: null,
        status: { in: blockingStatuses }
      },
      select: { id: true }
    });
    if (existingOpen) {
      const error = new Error(
        product.kind === "DIGITAL"
          ? "Você já possui este produto digital."
          : "Você já tem um pedido em andamento para este produto."
      ) as Error & { statusCode: number };
      error.statusCode = 409;
      throw error;
    }

    const purchase = await prisma.purchase.create({
      data: {
        userId: authUser.id,
        productId: product.id,
        amountInCents: product.priceInCents,
        quantity: 1,
        status: "PENDING",
        paymentMethod: body.billingType === "UNDEFINED" ? null : body.billingType
      },
      include: {
        product: true
      }
    });

    const asaasCheckout = await createAsaasCheckout({
      externalReference: purchaseExternalReference(purchase.id),
      itemName: `App Treino - ${product.name}`,
      itemDescription: `Pedido vitrine - ${authUser.name}`,
      amountInCents: purchase.amountInCents,
      billingType: body.billingType as AsaasBillingType
    });

    const updatedPurchase = asaasCheckout
      ? await prisma.purchase.update({
          where: { id: purchase.id },
          data: {
            asaasPaymentId: asaasCheckout.id,
            paymentUrl: asaasCheckout.url
          },
          include: { product: true }
        })
      : purchase;

    return reply.code(201).send({ purchase: updatedPurchase });
  });

  app.post("/student/purchases/:id/checkout", async (request, reply) => {
    requireDatabase();
    await assertModuleEnabled("module_purchases");
    const authUser = await requireAuth(app, request);
    assertNotAdminPreview(authUser);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = studentPurchaseCheckoutSchema.parse(request.body ?? {});

    const purchase = await prisma.purchase.findFirst({
      where: {
        id,
        userId: authUser.id,
        deletedAt: null
      },
      include: { product: true }
    });

    if (!purchase) {
      const error = new Error("Pedido não encontrado.") as Error & { statusCode: number };
      error.statusCode = 404;
      throw error;
    }

    if (PURCHASE_PAID_STATUSES.includes(purchase.status)) {
      return { purchase, alreadyPaid: true };
    }

    if (purchase.status !== "PENDING") {
      const error = new Error("Este pedido não pode mais ser pago.") as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    }

    if (purchase.paymentUrl) {
      return { purchase, alreadyPaid: false };
    }

    const asaasCheckout = await createAsaasCheckout({
      externalReference: purchaseExternalReference(purchase.id),
      itemName: `App Treino - ${purchase.product.name}`,
      itemDescription: `Pedido vitrine - ${authUser.name}`,
      amountInCents: purchase.amountInCents,
      billingType: body.billingType as AsaasBillingType
    });

    if (!asaasCheckout) {
      const error = new Error(
        "Pagamento online indisponível no momento. A academia confirmará seu pedido manualmente."
      ) as Error & { statusCode: number };
      error.statusCode = 503;
      throw error;
    }

    const updatedPurchase = await prisma.purchase.update({
      where: { id: purchase.id },
      data: {
        asaasPaymentId: asaasCheckout.id,
        paymentUrl: asaasCheckout.url,
        paymentMethod: body.billingType === "UNDEFINED" ? purchase.paymentMethod : body.billingType
      },
      include: { product: true }
    });

    return reply.send({ purchase: updatedPurchase, alreadyPaid: false });
  });

  app.get("/student/purchases", async (request) => {
    requireDatabase();
    await assertModuleEnabled("module_purchases");
    const authUser = await requireAuth(app, request);
    const purchases = await prisma.purchase.findMany({
      where: {
        userId: authUser.id,
        deletedAt: null
      },
      include: {
        product: true
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 50
    });

    return { purchases };
  });

  app.get("/student/locations", async (request) => {
    requireDatabase();
    await requireAuth(app, request);
    const locations = await prisma.location.findMany({
      where: {
        isActive: true,
        deletedAt: null
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    });

    return { locations };
  });
}
