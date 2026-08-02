import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { env } from "../env.js";
import { prisma } from "../prisma.js";

const substituteSchema = z.object({
  exerciseId: z.string().min(1)
});

const completeWorkoutSchema = z.object({
  assignmentId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional()
});

const startWorkoutSessionSchema = z.object({
  assignmentId: z.string().min(1)
});

const cancelWorkoutSessionSchema = z.object({
  sessionId: z.string().min(1)
});

const exerciseProgressSchema = z.object({
  sessionId: z.string().min(1).optional(),
  exerciseId: z.string().min(1),
  completed: z.coerce.boolean(),
  weightUsed: z.coerce.number().min(0).default(0),
  repsCompleted: z.coerce.number().int().min(0).default(0),
  sets: z.coerce.number().int().min(1).default(1)
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
        status: "ACTIVE"
      },
      select: { id: true }
    })
  ]);

  return activeMembership || user?.enrollmentStatus === "ACTIVE" ? "ACTIVE" : user?.enrollmentStatus ?? "PENDING";
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
  sets: number;
  repsRange: string;
  order: number;
  exercise: {
    id: string;
    title: string | null;
    name: string | null;
    videoUrl: string | null;
    targetMuscles: string[];
    equipmentTags: string[];
    alternatives: Array<{
      id: string;
      title: string | null;
      name: string | null;
      videoUrl: string | null;
    }>;
  };
}, latestWeightUsed = 0, restSeconds = 0) {
  return {
    id: item.exercise.id,
    title: item.exercise.title ?? item.exercise.name ?? "Exercício",
    videoUrl: item.exercise.videoUrl ?? "",
    targetMuscles: item.exercise.targetMuscles,
    equipmentTags: item.exercise.equipmentTags,
    sets: item.sets,
    repsRange: item.repsRange,
    restSeconds,
    latestWeightUsed,
    order: item.order,
    alternatives: item.exercise.alternatives.map((alternative) => ({
      id: alternative.id,
      title: alternative.title ?? alternative.name ?? "Alternativa",
      videoUrl: alternative.videoUrl ?? ""
    }))
  };
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
      days: {
        some: {}
      }
    },
    include: {
      days: true
    },
    orderBy: {
      publishedAt: "desc"
    }
  });

  if (publishedPrograms.length === 0) {
    return [];
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
          status: "ACTIVE"
        },
        update: {
          status: "ACTIVE",
          completedAt: null
        },
        include: {
          program: {
            include: {
              days: true
            }
          }
        }
      });

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
                days: true
              }
            }
          }
        });
      }

      const currentDay = assignment.currentDay;
      const programDay = await prisma.programDayWorkout.findFirst({
        where: {
          dayNumber: currentDay,
          programId: assignment.programId
        },
        include: {
          program: true,
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
          order: "asc"
        }
      });

      if (!programDay) {
        return null;
      }

      const latestProgressEntries = await Promise.all(
        programDay.workoutBlock.exercises.map(async (workoutExercise) => {
          const latestProgress = await prisma.userProgress.findFirst({
            where: {
              userId,
              exerciseId: workoutExercise.exerciseId
            },
            orderBy: {
              completedAt: "desc"
            }
          });

          return [workoutExercise.exerciseId, latestProgress?.weightUsed ?? 0] as const;
        })
      );
      const latestWeightByExercise = new Map(latestProgressEntries);

      return {
        programId: programDay.program.id,
        programTitle: programDay.program.title,
        assignmentId: assignment.id,
        dayNumber: currentDay,
        totalDays: assignment.program.days.length,
        block: {
          title: programDay.workoutBlock.title,
          structureType: programDay.workoutBlock.structureType,
          restTime: programDay.workoutBlock.restTime,
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

    return { workouts };
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
        dayNumber: assignment.currentDay
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
          dayNumber: assignment.currentDay
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
    const session = body.sessionId
      ? await prisma.workoutSession.findFirst({
          where: {
            id: body.sessionId,
            userId: authUser.id
          }
        })
      : null;

    await prisma.userProgress.deleteMany({
      where: {
        userId: authUser.id,
        exerciseId: body.exerciseId,
        ...(session
          ? {
              completedAt: {
                gte: session.startedAt
              }
            }
          : {})
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
            weightUsed: body.weightUsed,
            repsCompleted: body.repsCompleted,
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

    const [sessions, attendanceRecords, historySessions, historyAttendanceRecords, completedWorkoutCount, userPrograms] = await Promise.all([
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
      prisma.attendanceRecord.findMany({
        where: {
          userId: authUser.id,
          date: {
            gte: startsAt,
            lt: endsAt
          }
        },
        orderBy: {
          date: "asc"
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
      prisma.attendanceRecord.findMany({
        where: {
          userId: authUser.id,
          date: {
            gte: historyStartsAt,
            lt: endsAt
          }
        },
        select: {
          date: true
        },
        orderBy: {
          date: "asc"
        }
      }),
      prisma.workoutSession.count({
        where: {
          userId: authUser.id,
          status: "COMPLETED"
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
    attendanceRecords.forEach((record) => completedDateSet.add(record.date.toISOString().slice(0, 10)));
    const historyDateSet = new Set<string>();
    historySessions.forEach((session) => {
      if (session.finishedAt) {
        historyDateSet.add(session.finishedAt.toISOString().slice(0, 10));
      }
    });
    historyAttendanceRecords.forEach((record) => historyDateSet.add(record.date.toISOString().slice(0, 10)));

    return {
      year,
      month,
      completedWorkoutCount,
      totalWorkoutDays: userPrograms.reduce((total, assignment) => total + assignment.program.days.length, 0),
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
      where: { id: body.exerciseId },
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

    const totalDays = assignment.program.days.length;
    const isLastDay = assignment.currentDay >= totalDays;
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
    const updatedAssignment = await prisma.userProgram.update({
      where: {
        id: assignment.id
      },
      data: {
        currentDay: isLastDay ? assignment.currentDay : assignment.currentDay + 1,
        status: isLastDay ? "COMPLETED" : "ACTIVE",
        completedAt: isLastDay ? new Date() : null
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
            dayNumber: assignment.currentDay,
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
      completed: isLastDay
    };
  });
}
