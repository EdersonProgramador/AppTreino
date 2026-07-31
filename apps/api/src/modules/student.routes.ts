import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { env } from "../env.js";
import { prisma } from "../prisma.js";

const substituteSchema = z.object({
  exerciseId: z.string().min(1)
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

export function verifyEnrollmentGating(status: string, pathname: string) {
  const protectedRoutes = ["/student/workout"];
  const isProtected = protectedRoutes.some((route) => pathname.startsWith(route));

  if (isProtected && status !== "ACTIVE") {
    return {
      allowed: false,
      redirectUrl: "/student/dashboard/checkout?status=blocked",
      jsonResponse: {
        error: "Acesso bloqueado. Matricula inativa.",
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
      error: "Acesso bloqueado. Matricula inativa.",
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
}) {
  return {
    id: item.exercise.id,
    title: item.exercise.title ?? item.exercise.name ?? "Exercicio",
    videoUrl: item.exercise.videoUrl ?? "",
    targetMuscles: item.exercise.targetMuscles,
    equipmentTags: item.exercise.equipmentTags,
    sets: item.sets,
    repsRange: item.repsRange,
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

  const programDay = await prisma.programDayWorkout.findFirst({
    where: {
      dayNumber,
      program: {
        isActive: true
      }
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

  return {
    programTitle: programDay.program.title,
    dayNumber,
    block: {
      title: programDay.workoutBlock.title,
      structureType: programDay.workoutBlock.structureType,
      restTime: programDay.workoutBlock.restTime,
      exercises: programDay.workoutBlock.exercises.map(mapWorkoutExercise)
    }
  };
}

export async function registerStudentRoutes(app: FastifyInstance) {
  app.get("/student/workout/today", async (request, reply) => {
    requireDatabase();
    const authUser = await requireActiveEnrollment(app, request);
    const workout = await getTodayWorkout(authUser.id, 1);

    if (!workout) {
      return reply.code(404).send({
        message: "Treino de hoje nao encontrado."
      });
    }

    return { workout };
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
}
