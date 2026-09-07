import type { Prisma, ProgramSourceType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { parseRepetitionRange } from "./workout-program.utils.js";

const urlOrRelative = z.union([z.string().url(), z.literal(""), z.string().startsWith("/")]);

export const orgExerciseSchema = z.object({
  organizationId: z.string().min(1),
  unitId: z.string().optional(),
  title: z.string().trim().min(2).max(160),
  videoUrl: urlOrRelative.optional().default(""),
  notes: z.string().trim().max(2000).optional(),
  targetMuscles: z.array(z.string().trim().min(1)).default([]),
  equipmentTags: z.array(z.string().trim().min(1)).default([]),
  modalityIds: z.array(z.string().min(1)).min(1)
});

export const orgExerciseUpdateSchema = orgExerciseSchema
  .omit({ organizationId: true })
  .partial()
  .extend({
    organizationId: z.string().min(1).optional()
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

const orgWorkoutExerciseSchema = z.object({
  exerciseId: z.string().min(1),
  sets: z.coerce.number().int().min(1).default(3),
  repsRange: z.string().min(1).default("8-12"),
  prescriptionType: z.enum(prescriptionTypes).default("REPETITIONS"),
  restSeconds: z.coerce.number().int().min(0).optional(),
  executionNotes: z.string().max(1000).optional(),
  order: z.coerce.number().int().min(1)
});

export const orgWorkoutBlockSchema = z.object({
  organizationId: z.string().min(1),
  unitId: z.string().optional(),
  title: z.string().trim().min(2).max(160),
  focus: z.string().trim().max(500).optional(),
  structureType: z.enum(workoutStructureTypes).default("NORMAL"),
  restTime: z.coerce.number().int().min(0).default(60),
  instructions: z.string().trim().max(2000).optional(),
  modalityId: z.string().min(1),
  exercises: z.array(orgWorkoutExerciseSchema).min(1)
});

export const orgWorkoutBlockUpdateSchema = orgWorkoutBlockSchema
  .omit({ organizationId: true })
  .partial()
  .extend({
    organizationId: z.string().min(1).optional()
  });

type OrgWorkoutExerciseInput = z.infer<typeof orgWorkoutExerciseSchema>;

function buildWorkoutExerciseData(exercise: OrgWorkoutExerciseInput) {
  const parsedRange = parseRepetitionRange(exercise.repsRange);
  return {
    exerciseId: exercise.exerciseId,
    sets: exercise.sets,
    repsRange: exercise.repsRange,
    prescriptionType: exercise.prescriptionType,
    repsMin: parsedRange.min,
    repsMax: parsedRange.max,
    restSeconds: exercise.restSeconds ?? null,
    executionNotes: exercise.executionNotes || null,
    order: exercise.order
  };
}

export function orgTrainingContentWhere(organizationId: string, coachUserId?: string | null): Prisma.ExerciseWhereInput {
  return {
    deletedAt: null,
    workoutDayId: null,
    OR: [
      { sourceType: "PLATFORM", organizationId: null },
      { sourceType: "ORGANIZATION", organizationId },
      ...(coachUserId
        ? [{ sourceType: "COACH" as ProgramSourceType, organizationId, coachUserId }]
        : [{ sourceType: "COACH" as ProgramSourceType, organizationId }])
    ]
  };
}

export function orgWorkoutBlockWhere(organizationId: string, coachUserId?: string | null): Prisma.WorkoutBlockWhereInput {
  return {
    deletedAt: null,
    OR: [
      { sourceType: "PLATFORM", organizationId: null },
      { sourceType: "ORGANIZATION", organizationId },
      ...(coachUserId
        ? [{ sourceType: "COACH" as ProgramSourceType, organizationId, coachUserId }]
        : [{ sourceType: "COACH" as ProgramSourceType, organizationId }])
    ]
  };
}

async function assertModalitiesExist(modalityIds: string[]) {
  if (!modalityIds.length) return;
  const count = await prisma.modality.count({
    where: { id: { in: modalityIds }, deletedAt: null, isActive: true }
  });
  if (count !== modalityIds.length) {
    throw new Error("Modalidade inválida ou inativa.");
  }
}

async function assertExercisesAccessible(
  exerciseIds: string[],
  organizationId: string,
  coachUserId: string
) {
  if (!exerciseIds.length) return;
  const exercises = await prisma.exercise.findMany({
    where: {
      id: { in: exerciseIds },
      deletedAt: null,
      workoutDayId: null,
      OR: [
        { sourceType: "PLATFORM", organizationId: null },
        { sourceType: "ORGANIZATION", organizationId },
        { sourceType: "COACH", organizationId, coachUserId }
      ]
    },
    select: { id: true }
  });
  if (exercises.length !== exerciseIds.length) {
    throw new Error("Um ou mais exercícios são inválidos ou inacessíveis.");
  }
}

async function getCoachOwnedExercise(exerciseId: string, organizationId: string, coachUserId: string) {
  const exercise = await prisma.exercise.findFirst({
    where: {
      id: exerciseId,
      deletedAt: null,
      sourceType: "COACH",
      organizationId,
      coachUserId
    }
  });
  if (!exercise) {
    const error = new Error("Exercício não encontrado ou sem permissão de edição.") as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }
  return exercise;
}

async function getCoachOwnedBlock(blockId: string, organizationId: string, coachUserId: string) {
  const block = await prisma.workoutBlock.findFirst({
    where: {
      id: blockId,
      deletedAt: null,
      sourceType: "COACH",
      organizationId,
      coachUserId
    }
  });
  if (!block) {
    const error = new Error("Divisão não encontrada ou sem permissão de edição.") as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }
  return block;
}

export async function listOrgModalities() {
  return prisma.modality.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true, isActive: true }
  });
}

export async function listOrgTrainingExercises(organizationId: string, coachUserId: string) {
  return prisma.exercise.findMany({
    where: orgTrainingContentWhere(organizationId, coachUserId),
    include: {
      modalityLinks: {
        include: { modality: { select: { id: true, name: true } } }
      }
    },
    orderBy: [{ sourceType: "asc" }, { createdAt: "desc" }],
    take: 500
  });
}

export async function createOrgTrainingExercise(
  coachUserId: string,
  input: z.infer<typeof orgExerciseSchema>
) {
  await assertModalitiesExist(input.modalityIds);
  return prisma.exercise.create({
    data: {
      title: input.title,
      videoUrl: input.videoUrl || null,
      notes: input.notes || null,
      targetMuscles: input.targetMuscles,
      equipmentTags: input.equipmentTags,
      sourceType: "COACH",
      organizationId: input.organizationId,
      unitId: input.unitId ?? null,
      coachUserId,
      createdByUserId: coachUserId,
      modalityLinks: {
        create: input.modalityIds.map((modalityId, index) => ({
          modalityId,
          principal: index === 0
        }))
      }
    },
    include: {
      modalityLinks: { include: { modality: { select: { id: true, name: true } } } }
    }
  });
}

export async function updateOrgTrainingExercise(
  exerciseId: string,
  coachUserId: string,
  organizationId: string,
  input: z.infer<typeof orgExerciseUpdateSchema>
) {
  await getCoachOwnedExercise(exerciseId, organizationId, coachUserId);
  if (input.modalityIds) await assertModalitiesExist(input.modalityIds);

  await prisma.$transaction(async (tx) => {
    if (input.modalityIds) {
      await tx.exerciseModality.deleteMany({ where: { exerciseId } });
    }
    await tx.exercise.update({
      where: { id: exerciseId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.videoUrl !== undefined ? { videoUrl: input.videoUrl || null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
        ...(input.targetMuscles !== undefined ? { targetMuscles: input.targetMuscles } : {}),
        ...(input.equipmentTags !== undefined ? { equipmentTags: input.equipmentTags } : {}),
        ...(input.unitId !== undefined ? { unitId: input.unitId ?? null } : {}),
        ...(input.modalityIds
          ? {
              modalityLinks: {
                create: input.modalityIds.map((modalityId, index) => ({
                  modalityId,
                  principal: index === 0
                }))
              }
            }
          : {})
      }
    });
  });

  return prisma.exercise.findUniqueOrThrow({
    where: { id: exerciseId },
    include: { modalityLinks: { include: { modality: { select: { id: true, name: true } } } } }
  });
}

export async function deleteOrgTrainingExercise(
  exerciseId: string,
  coachUserId: string,
  organizationId: string
) {
  await getCoachOwnedExercise(exerciseId, organizationId, coachUserId);
  await prisma.exercise.update({
    where: { id: exerciseId },
    data: { deletedAt: new Date() }
  });
  return { ok: true };
}

export async function listOrgTrainingWorkoutBlocks(organizationId: string, coachUserId: string) {
  return prisma.workoutBlock.findMany({
    where: orgWorkoutBlockWhere(organizationId, coachUserId),
    include: {
      modality: { select: { id: true, name: true } },
      exercises: {
        include: { exercise: { select: { id: true, title: true } } },
        orderBy: { order: "asc" }
      }
    },
    orderBy: [{ sourceType: "asc" }, { createdAt: "desc" }],
    take: 300
  });
}

export async function createOrgTrainingWorkoutBlock(
  coachUserId: string,
  input: z.infer<typeof orgWorkoutBlockSchema>
) {
  await assertModalitiesExist([input.modalityId]);
  await assertExercisesAccessible(
    input.exercises.map((item) => item.exerciseId),
    input.organizationId,
    coachUserId
  );

  return prisma.workoutBlock.create({
    data: {
      title: input.title,
      focus: input.focus || null,
      structureType: input.structureType,
      restTime: input.restTime,
      instructions: input.instructions || null,
      modalityId: input.modalityId,
      sourceType: "COACH",
      organizationId: input.organizationId,
      unitId: input.unitId ?? null,
      coachUserId,
      createdByUserId: coachUserId,
      exercises: {
        create: input.exercises.map(buildWorkoutExerciseData)
      }
    },
    include: {
      modality: { select: { id: true, name: true } },
      exercises: {
        include: { exercise: { select: { id: true, title: true } } },
        orderBy: { order: "asc" }
      }
    }
  });
}

export async function updateOrgTrainingWorkoutBlock(
  blockId: string,
  coachUserId: string,
  organizationId: string,
  input: z.infer<typeof orgWorkoutBlockUpdateSchema>
) {
  await getCoachOwnedBlock(blockId, organizationId, coachUserId);
  if (input.modalityId) await assertModalitiesExist([input.modalityId]);
  if (input.exercises) {
    await assertExercisesAccessible(
      input.exercises.map((item) => item.exerciseId),
      organizationId,
      coachUserId
    );
  }

  return prisma.$transaction(async (tx) => {
    if (input.exercises) {
      await tx.workoutBlockExercise.deleteMany({ where: { workoutBlockId: blockId } });
    }
    return tx.workoutBlock.update({
      where: { id: blockId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.focus !== undefined ? { focus: input.focus || null } : {}),
        ...(input.structureType !== undefined ? { structureType: input.structureType } : {}),
        ...(input.restTime !== undefined ? { restTime: input.restTime } : {}),
        ...(input.instructions !== undefined ? { instructions: input.instructions || null } : {}),
        ...(input.modalityId !== undefined ? { modalityId: input.modalityId } : {}),
        ...(input.unitId !== undefined ? { unitId: input.unitId ?? null } : {}),
        ...(input.exercises
          ? { exercises: { create: input.exercises.map(buildWorkoutExerciseData) } }
          : {})
      },
      include: {
        modality: { select: { id: true, name: true } },
        exercises: {
          include: { exercise: { select: { id: true, title: true } } },
          orderBy: { order: "asc" }
        }
      }
    });
  });
}

export async function deleteOrgTrainingWorkoutBlock(
  blockId: string,
  coachUserId: string,
  organizationId: string
) {
  await getCoachOwnedBlock(blockId, organizationId, coachUserId);
  await prisma.workoutBlock.update({
    where: { id: blockId },
    data: { deletedAt: new Date() }
  });
  return { ok: true };
}

export async function updateOrgProgram(
  programId: string,
  coachUserId: string,
  input: {
    title?: string;
    description?: string;
    modalityId?: string;
    unitId?: string | null;
    targetGender?: "ALL" | "MALE" | "FEMALE";
    days?: Array<{ workoutBlockId: string; dayNumber: number; order: number }>;
  }
) {
  const program = await prisma.program.findFirst({
    where: {
      id: programId,
      deletedAt: null,
      sourceType: { in: ["ORGANIZATION", "COACH"] },
      status: "DRAFT"
    }
  });
  if (!program?.organizationId) {
    const error = new Error("Programa não encontrado ou já publicado.") as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  if (input.modalityId) await assertModalitiesExist([input.modalityId]);
  if (input.days?.length) {
    const blockIds = [...new Set(input.days.map((day) => day.workoutBlockId))];
    const blocks = await prisma.workoutBlock.findMany({
      where: {
        AND: [
          { id: { in: blockIds }, deletedAt: null },
          orgWorkoutBlockWhere(program.organizationId, program.coachUserId ?? coachUserId)
        ]
      },
      select: { id: true }
    });
    if (blocks.length !== blockIds.length) {
      throw new Error("Uma ou mais divisões são inválidas.");
    }
  }

  return prisma.$transaction(async (tx) => {
    if (input.days) {
      await tx.programDayWorkout.deleteMany({ where: { programId } });
    }
    return tx.program.update({
      where: { id: programId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.modalityId !== undefined ? { modalityId: input.modalityId } : {}),
        ...(input.unitId !== undefined ? { unitId: input.unitId } : {}),
        ...(input.targetGender !== undefined ? { targetGender: input.targetGender } : {}),
        ...(input.days
          ? {
              plannedSessions: input.days.length,
              totalWorkouts: input.days.length,
              cycleLengthDays: Math.max(1, input.days.length),
              days: {
                create: input.days.map((day) => ({
                  workoutBlockId: day.workoutBlockId,
                  dayNumber: day.dayNumber,
                  order: day.order
                }))
              }
            }
          : {})
      },
      include: {
        modality: { select: { id: true, name: true } },
        days: { orderBy: [{ dayNumber: "asc" }, { order: "asc" }] },
        assignedUsers: { where: { status: "ACTIVE" }, select: { id: true, userId: true } }
      }
    });
  });
}

export async function distributeProgramToCoachBase(
  programId: string,
  coachUserId: string,
  organizationId: string
) {
  const program = await prisma.program.findFirst({
    where: {
      id: programId,
      deletedAt: null,
      organizationId,
      sourceType: { in: ["ORGANIZATION", "COACH"] },
      status: "PUBLISHED"
    }
  });
  if (!program) {
    const error = new Error("Programa publicado não encontrado.") as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  const assignments = await prisma.professionalAssignment.findMany({
    where: {
      organizationId,
      professionalId: coachUserId,
      professionalType: "COACH",
      status: "ACTIVE",
      deletedAt: null,
      ...(program.unitId ? { unitId: program.unitId } : {})
    },
    select: { athleteId: true }
  });

  const athleteIds = [...new Set(assignments.map((item) => item.athleteId))];
  if (!athleteIds.length) {
    throw new Error("Nenhum aluno vinculado ao coach nesta organização.");
  }

  const created = [];
  for (const athleteId of athleteIds) {
    const row = await prisma.userProgram.upsert({
      where: { userId_programId: { userId: athleteId, programId } },
      create: {
        userId: athleteId,
        programId,
        status: "ACTIVE",
        organizationId: program.organizationId,
        unitId: program.unitId,
        assignedByUserId: coachUserId,
        assignmentSource: "COACH",
        totalWorkouts: program.totalWorkouts
      },
      update: {
        status: "ACTIVE",
        organizationId: program.organizationId,
        unitId: program.unitId,
        assignedByUserId: coachUserId,
        assignmentSource: "COACH"
      }
    });
    created.push(row);
  }

  return { assignedCount: created.length, athleteIds };
}
