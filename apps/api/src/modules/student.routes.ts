import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { env } from "../env.js";
import { prisma } from "../prisma.js";
import { calculateProgramEndDate, isProgramComplete } from "./workout-program.utils.js";

const substituteSchema = z.object({
  exerciseId: z.string().min(1)
});

const completeWorkoutSchema = z.object({
  assignmentId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional()
});

const startWorkoutSessionSchema = z.object({
  assignmentId: z.string().min(1),
  dayNumber: z.coerce.number().int().min(1).optional()
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
        status: "ACTIVE",
        deletedAt: null
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

function parseProgramMetadata(description: string) {
  try {
    const parsed = JSON.parse(description) as { description?: string; modality?: string };

    return {
      description: parsed.description || description,
      modality: parsed.modality || "Hipertrofia"
    };
  } catch {
    return {
      description,
      modality: "Hipertrofia"
    };
  }
}

export async function getTodayWorkout(userId: string, dayNumber: number) {
  const status = await getEnrollmentStatus(userId);

  if (status !== "ACTIVE") {
    return null;
  }

  const workouts = await getPublishedWorkouts(userId, dayNumber);

  return workouts[0] ?? null;
}

export async function getPublishedWorkouts(userId: string, dayNumber: number) {
  const status = await getEnrollmentStatus(userId);

  if (status !== "ACTIVE") {
    return [];
  }

  const publishedPrograms = await prisma.program.findMany({
    where: {
      status: "PUBLISHED",
      isActive: true,
      deletedAt: null,
      days: {
        some: {}
      },
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
    },
    include: {
      days: true
    },
    orderBy: [{ sortOrder: "asc" }, { publishedAt: "desc" }, { createdAt: "asc" }]
  });

  const assignedPrograms = await prisma.userProgram.findMany({
    where: {
      userId,
      status: "ACTIVE",
      program: {
        status: "PUBLISHED",
        isActive: true
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
    if (program.days.length > 0 && !publishedPrograms.some((publishedProgram) => publishedProgram.id === program.id)) {
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

      if (assignment.status === "COMPLETED" && assignment.completedWorkouts >= assignment.totalWorkouts) {
        return null;
      }

      if (assignment.status !== "ACTIVE") {
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

      if (isProgramComplete({
        completionMode: assignment.program.completionMode,
        completedSessions: assignment.completedWorkouts,
        plannedSessions: assignment.totalWorkouts,
        plannedEndsAt: assignment.plannedEndsAt
      })) {
        await prisma.userProgram.update({
          where: { id: assignment.id },
          data: { status: "COMPLETED", completedAt: new Date() }
        });
        return null;
      }

      if (!assignment.program.days.some((day) => day.dayNumber === assignment.currentDay)) {
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

      const currentDay = assignment.currentDay;
      const programDays = await prisma.programDayWorkout.findMany({
        where: {
          programId: assignment.programId
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
                include: {
                  exercise: {
                    include: {
                      alternatives: true
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
      const programDay = programDays.find((day) => day.dayNumber === currentDay) ?? programDays[0] ?? null;

      if (!programDay) {
        return null;
      }

      const allExerciseIds = Array.from(
        new Set(programDays.flatMap((day) => day.workoutBlock.exercises.map((workoutExercise) => workoutExercise.exerciseId)))
      );
      const latestProgressEntries = await Promise.all(
        allExerciseIds.map(async (exerciseId) => {
          const latestProgress = await prisma.userProgress.findFirst({
            where: {
              userId,
              exerciseId
            },
            orderBy: {
              completedAt: "desc"
            }
          });

          return [exerciseId, latestProgress?.weightUsed ?? 0] as const;
        })
      );
      const latestWeightByExercise = new Map(latestProgressEntries);
      const completedSessions = await prisma.workoutSession.findMany({
        where: {
          userId,
          assignmentId: assignment.id,
          programId: assignment.programId,
          status: "COMPLETED"
        },
        select: {
          dayNumber: true
        }
      });
      const completedWorkoutCount = Math.max(assignment.completedWorkouts, completedSessions.length);
      const completedInCurrentCycle =
        assignment.program.completionMode === "BY_SESSIONS" && completedWorkoutCount >= assignment.totalWorkouts
          ? programDays.length
          : completedWorkoutCount % programDays.length;
      const metadata = parseProgramMetadata(programDay.program.description);
      const modalityName = programDay.program.modality?.name ?? metadata.modality;
      const sequence = programDays.map((day, index) => ({
        programId: day.program.id,
        programTitle: day.program.title,
        assignmentId: assignment.id,
        dayNumber: day.dayNumber,
        totalDays: assignment.program.days.length,
        totalWorkouts: assignment.totalWorkouts,
        completedWorkouts: completedWorkoutCount,
        completed: index < completedInCurrentCycle,
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
          exercises: day.workoutBlock.exercises.map((exercise) =>
            mapWorkoutExercise(exercise, latestWeightByExercise.get(exercise.exerciseId) ?? 0, day.workoutBlock.restTime)
          )
        }
      }));

      return {
        programId: programDay.program.id,
        programTitle: programDay.program.title,
        assignmentId: assignment.id,
        dayNumber: currentDay,
        totalDays: assignment.program.days.length,
        totalWorkouts: assignment.totalWorkouts,
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
          exercises: programDay.workoutBlock.exercises.map((exercise) =>
            mapWorkoutExercise(exercise, latestWeightByExercise.get(exercise.exerciseId) ?? 0, programDay.workoutBlock.restTime)
          )
        }
      };
    })
  );

  return workouts.filter((workout): workout is NonNullable<typeof workout> => Boolean(workout));
}

export async function registerStudentRoutes(app: FastifyInstance) {
  app.get("/student/workout/programs", async (request) => {
    requireDatabase();
    const authUser = await requireActiveEnrollment(app, request);
    const workouts = await getPublishedWorkouts(authUser.id, 1);
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
    const workouts = await getPublishedWorkouts(authUser.id, 1).catch(() => []);
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
    const workout = await getTodayWorkout(authUser.id, 1);

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

    const programDay = await prisma.programDayWorkout.findFirstOrThrow({
      where: {
        programId: assignment.programId,
        dayNumber: body.dayNumber ?? assignment.currentDay
      },
      orderBy: {
        order: "asc"
      }
    });

    const activeSession = await prisma.workoutSession.findFirst({
      where: {
        userId: authUser.id,
        assignmentId: assignment.id,
        status: "IN_PROGRESS"
      },
      orderBy: {
        startedAt: "desc"
      }
    });

    const session =
      activeSession ??
      (await prisma.workoutSession.create({
        data: {
          userId: authUser.id,
          assignmentId: assignment.id,
          programId: assignment.programId,
          workoutBlockId: programDay.workoutBlockId,
          dayNumber: programDay.dayNumber
        }
      }));

    return { session };
  });

  app.post("/student/workout/cancel-session", async (request) => {
    requireDatabase();
    const authUser = await requireActiveEnrollment(app, request);
    const body = cancelWorkoutSessionSchema.parse(request.body);

    const currentSession = await prisma.workoutSession.findFirstOrThrow({
      where: {
        id: body.sessionId,
        userId: authUser.id
      }
    });
    const session = await prisma.workoutSession.update({
      where: {
        id: currentSession.id
      },
      data: {
        status: "CANCELED",
        finishedAt: new Date()
      }
    });

    return { session };
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
        id: body.assignmentId ?? undefined,
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

    const finishedAt = new Date();
    const session = body.sessionId
      ? await prisma.workoutSession.findFirst({
          where: {
            id: body.sessionId,
            userId: authUser.id,
            status: "IN_PROGRESS"
          }
        })
      : null;
    const completedDayNumber = session?.dayNumber ?? assignment.currentDay;
    const programDays = [...assignment.program.days].sort((first, second) => first.dayNumber - second.dayNumber || first.order - second.order);
    const totalDays = programDays.length;
    const currentIndex = Math.max(
      0,
      programDays.findIndex((day) => day.dayNumber === completedDayNumber)
    );
    const nextDayNumber = programDays[(currentIndex + 1) % totalDays]?.dayNumber ?? completedDayNumber;
    const countCanExceedTarget = assignment.program.completionMode === "BY_DATE" || assignment.program.completionMode === "MANUAL";
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
    const updatedAssignment = await prisma.userProgram.update({
      where: {
        id: assignment.id
      },
      data: {
        currentDay: isLastWorkout ? completedDayNumber : nextDayNumber,
        completedWorkouts,
        status: isLastWorkout ? "COMPLETED" : "ACTIVE",
        completedAt: isLastWorkout ? new Date() : null
      }
    });

    const completedSession = session
      ? await prisma.workoutSession.update({
          where: {
            id: session.id
          },
          data: {
            status: "COMPLETED",
            finishedAt,
            durationSeconds: Math.max(1, Math.round((finishedAt.getTime() - session.startedAt.getTime()) / 1000))
          }
        })
      : await prisma.workoutSession.create({
          data: {
            userId: authUser.id,
            assignmentId: assignment.id,
            programId: assignment.programId,
            dayNumber: completedDayNumber,
            startedAt: finishedAt,
            finishedAt,
            durationSeconds: 1,
            status: "COMPLETED"
          }
        });

    await prisma.attendanceRecord.upsert({
      where: {
        userId_date: {
          userId: authUser.id,
          date: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()))
        }
      },
      create: {
        userId: authUser.id,
        date: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()))
      },
      update: {}
    });

    return {
      assignment: updatedAssignment,
      session: completedSession,
      completed: isLastWorkout
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
    productId: z.string().min(1)
  });

  app.get("/student/products", async (request) => {
    requireDatabase();
    const authUser = await requireAuth(app, request);
    const [products, purchasedProductIds, favoritedProductIds, ratedProductIds] = await Promise.all([
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
          status: { in: ["PENDING", "CONFIRMED"] }
        },
        select: {
          productId: true
        }
      }),
      prisma.favorite.findMany({
        where: {
          userId: authUser.id
        },
        select: {
          productId: true
        }
      }),
      prisma.rating.findMany({
        where: {
          userId: authUser.id,
          targetType: "PRODUCT",
          productId: { not: null }
        },
        select: {
          productId: true
        }
      })
    ]);

    return {
      products: products.map((product) => ({
        ...product,
        purchasedByMe: purchasedProductIds.some((item) => item.productId === product.id),
        favoritedByMe: favoritedProductIds.some((item) => item.productId === product.id),
        ratedByMe: ratedProductIds.some((item) => item.productId === product.id)
      }))
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
    const authUser = await requireAuth(app, request);
    const body = studentPurchaseSchema.parse(request.body);
    const product = await prisma.product.findFirstOrThrow({
      where: {
        id: body.productId,
        isActive: true
      }
    });
    const purchase = await prisma.purchase.create({
      data: {
        userId: authUser.id,
        productId: product.id,
        amountInCents: product.priceInCents,
        status: "PENDING"
      },
      include: {
        product: true
      }
    });

    return reply.code(201).send({ purchase });
  });

  app.get("/student/purchases", async (request) => {
    requireDatabase();
    const authUser = await requireAuth(app, request);
    const purchases = await prisma.purchase.findMany({
      where: {
        userId: authUser.id
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
