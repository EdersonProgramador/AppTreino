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
  assignmentId: z.string().min(1),
  dayNumber: z.coerce.number().int().min(1).optional()
});

const cancelWorkoutSessionSchema = z.object({
  sessionId: z.string().min(1)
});

const exerciseProgressSchema = z.object({
  sessionId: z.string().min(1),
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

async function getCurrentStudentMembership(userId: string) {
  const now = new Date();
  const currentMembership = await prisma.membership.findFirst({
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

  if (currentMembership) {
    return currentMembership;
  }

  return prisma.membership.findFirst({
    where: {
      userId,
      status: "ACTIVE"
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

  const [membership, profile, teachers] = await Promise.all([
    getCurrentStudentMembership(userId),
    prisma.profile.findUnique({
      where: {
        userId
      }
    }),
    prisma.user.findMany({
      where: {
        role: "ADMIN",
        status: "ACTIVE"
      },
      select: {
        name: true
      },
      take: 3
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
          status: "ACTIVE"
        },
        update: {
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
          programId: assignment.programId,
          status: "COMPLETED"
        },
        select: {
          dayNumber: true
        }
      });
      const completedDaySet = new Set(completedSessions.map((session) => session.dayNumber));
      const metadata = parseProgramMetadata(programDay.program.description);
      const modalityName = programDay.program.modality?.name ?? metadata.modality;
      const sequence = programDays.map((day) => ({
        programId: day.program.id,
        programTitle: day.program.title,
        assignmentId: assignment.id,
        dayNumber: day.dayNumber,
        totalDays: assignment.program.days.length,
        completed: completedDaySet.has(day.dayNumber),
        block: {
          title: day.workoutBlock.title,
          structureType: day.workoutBlock.structureType,
          restTime: day.workoutBlock.restTime,
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
        modality: modalityName,
        description: metadata.description,
        completedWorkouts: completedDaySet.size,
        teacherNames: teachers.map((teacher) => teacher.name),
        unitName: "Unidade não informada",
        membershipStartsAt: membership?.startsAt ?? null,
        membershipEndsAt: membership ? resolveMembershipEndsAt(membership) : null,
        sequence,
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

    const exerciseBelongsToWorkout = session.workoutBlock?.exercises.some(
      (workoutExercise) => workoutExercise.exerciseId === body.exerciseId
    );

    if (!exerciseBelongsToWorkout) {
      throw httpError(400, "Este exercício não pertence ao bloco de treino iniciado.");
    }

    await prisma.userProgress.deleteMany({
      where: {
        userId: authUser.id,
        exerciseId: body.exerciseId,
        completedAt: {
          gte: session.startedAt
        }
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

    const [sessions, attendanceRecords, historySessions, historyAttendanceRecords, completedSessions, userPrograms] = await Promise.all([
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
      prisma.workoutSession.findMany({
        where: {
          userId: authUser.id,
          status: "COMPLETED",
          programId: {
            not: null
          },
          dayNumber: {
            gt: 0
          }
        },
        select: {
          programId: true,
          dayNumber: true
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
    const activeProgramIds = new Set(userPrograms.map((assignment) => assignment.programId));
    const completedProgramDaySet = new Set(
      completedSessions
        .filter((session) => session.programId && activeProgramIds.has(session.programId))
        .map((session) => `${session.programId}:${session.dayNumber}`)
    );
    const totalWorkoutDays = userPrograms.reduce((total, assignment) => total + assignment.program.days.length, 0);
    const completedWorkoutCount = Math.min(completedProgramDaySet.size, totalWorkoutDays);

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
    const totalDays = assignment.program.days.length;
    const isLastDay = completedDayNumber >= totalDays;
    const updatedAssignment = await prisma.userProgram.update({
      where: {
        id: assignment.id
      },
      data: {
        currentDay: isLastDay ? completedDayNumber : completedDayNumber + 1,
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
      completed: isLastDay
    };
  });
}
