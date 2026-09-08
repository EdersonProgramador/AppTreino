import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { prisma } from "../prisma.js";
import { authorize } from "./org-auth/authorize.js";
import { loadOrgAuthContext, writeAuditLog } from "./org-auth/context.js";
import { canAccessOrgPlatform, hasActiveOrgStaffMembership } from "./org-auth/staff.js";
import { authorizeOrg, httpOrgError } from "./org-auth/scope.js";
import {
  createOrgTrainingExercise,
  createOrgTrainingWorkoutBlock,
  deleteOrgTrainingExercise,
  deleteOrgTrainingWorkoutBlock,
  distributeProgramToCoachBase,
  listOrgModalities,
  listOrgTrainingExercises,
  listOrgTrainingWorkoutBlocks,
  orgExerciseSchema,
  orgExerciseUpdateSchema,
  orgWorkoutBlockSchema,
  orgWorkoutBlockUpdateSchema,
  updateOrgProgram,
  updateOrgTrainingExercise,
  updateOrgTrainingWorkoutBlock
} from "./org-training.service.js";

function denyUnlessAllowed(result: ReturnType<typeof authorize>) {
  if (result === "DENY") {
    const error = new Error("Acesso negado ao recurso organizacional.") as Error & { statusCode: number };
    error.statusCode = 403;
    throw error;
  }
}

export async function registerOrgTrainingRoutes(app: FastifyInstance) {
  app.get("/org/modalities", async (request, reply) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const query = z.object({ organizationId: z.string().min(1).optional() }).parse(request.query);

    const allowed =
      canAccessOrgPlatform(ctx) || hasActiveOrgStaffMembership(ctx, query.organizationId ?? null);

    if (!allowed) {
      return reply.code(403).send({ message: "Acesso negado ao recurso organizacional." });
    }

    const modalities = await listOrgModalities();
    return { modalities };
  });

  app.get("/org/organizations/:organizationId/training/exercises", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { organizationId } = z.object({ organizationId: z.string().min(1) }).parse(request.params);
    denyUnlessAllowed(authorize({ ctx, permission: "training.view", organizationId }));
    const exercises = await listOrgTrainingExercises(organizationId, user.id);
    return { exercises };
  });

  app.post("/org/training/exercises", async (request, reply) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const body = orgExerciseSchema.parse(request.body);
    denyUnlessAllowed(
      authorize({
        ctx,
        permission: "training.create",
        organizationId: body.organizationId,
        unitId: body.unitId ?? null
      })
    );

    const exercise = await createOrgTrainingExercise(user.id, body);
    await writeAuditLog({
      userId: user.id,
      organizationId: body.organizationId,
      unitId: body.unitId ?? null,
      action: "training.exercise.create",
      resourceType: "exercise",
      resourceId: exercise.id,
      newValues: { title: exercise.title },
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
    return reply.code(201).send({ exercise });
  });

  app.put("/org/training/exercises/:exerciseId", async (request, reply) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { exerciseId } = z.object({ exerciseId: z.string().min(1) }).parse(request.params);
    const body = orgExerciseUpdateSchema.parse(request.body);
    const organizationId = body.organizationId;
    if (!organizationId) {
      return reply.code(400).send({ message: "organizationId é obrigatório." });
    }
    denyUnlessAllowed(
      authorize({
        ctx,
        permission: "training.update",
        organizationId,
        unitId: body.unitId ?? null
      })
    );

    try {
      const exercise = await updateOrgTrainingExercise(exerciseId, user.id, organizationId, body);
      return { exercise };
    } catch (error) {
      const statusCode =
        error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : 400;
      return reply.code(statusCode).send({
        message: error instanceof Error ? error.message : "Falha ao atualizar exercício."
      });
    }
  });

  app.delete("/org/training/exercises/:exerciseId", async (request, reply) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { exerciseId } = z.object({ exerciseId: z.string().min(1) }).parse(request.params);
    const { organizationId } = z.object({ organizationId: z.string().min(1) }).parse(request.query);
    denyUnlessAllowed(
      authorize({ ctx, permission: "training.delete", organizationId })
    );

    try {
      return await deleteOrgTrainingExercise(exerciseId, user.id, organizationId);
    } catch (error) {
      const statusCode =
        error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : 400;
      return reply.code(statusCode).send({
        message: error instanceof Error ? error.message : "Falha ao remover exercício."
      });
    }
  });

  app.get("/org/organizations/:organizationId/training/workout-blocks", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { organizationId } = z.object({ organizationId: z.string().min(1) }).parse(request.params);
    denyUnlessAllowed(authorize({ ctx, permission: "training.view", organizationId }));
    const blocks = await listOrgTrainingWorkoutBlocks(organizationId, user.id);
    return { blocks };
  });

  app.post("/org/training/workout-blocks", async (request, reply) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const body = orgWorkoutBlockSchema.parse(request.body);
    denyUnlessAllowed(
      authorize({
        ctx,
        permission: "training.create",
        organizationId: body.organizationId,
        unitId: body.unitId ?? null
      })
    );

    try {
      const workoutBlock = await createOrgTrainingWorkoutBlock(user.id, body);
      await writeAuditLog({
        userId: user.id,
        organizationId: body.organizationId,
        unitId: body.unitId ?? null,
        action: "training.block.create",
        resourceType: "workout_block",
        resourceId: workoutBlock.id,
        newValues: { title: workoutBlock.title },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"]
      });
      return reply.code(201).send({ workoutBlock });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "Falha ao criar divisão."
      });
    }
  });

  app.put("/org/training/workout-blocks/:blockId", async (request, reply) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { blockId } = z.object({ blockId: z.string().min(1) }).parse(request.params);
    const body = orgWorkoutBlockUpdateSchema.parse(request.body);
    const organizationId = body.organizationId;
    if (!organizationId) {
      return reply.code(400).send({ message: "organizationId é obrigatório." });
    }
    denyUnlessAllowed(
      authorize({
        ctx,
        permission: "training.update",
        organizationId,
        unitId: body.unitId ?? null
      })
    );

    try {
      const workoutBlock = await updateOrgTrainingWorkoutBlock(blockId, user.id, organizationId, body);
      return { workoutBlock };
    } catch (error) {
      const statusCode =
        error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : 400;
      return reply.code(statusCode).send({
        message: error instanceof Error ? error.message : "Falha ao atualizar divisão."
      });
    }
  });

  app.delete("/org/training/workout-blocks/:blockId", async (request, reply) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { blockId } = z.object({ blockId: z.string().min(1) }).parse(request.params);
    const { organizationId } = z.object({ organizationId: z.string().min(1) }).parse(request.query);
    denyUnlessAllowed(
      authorize({ ctx, permission: "training.delete", organizationId })
    );

    try {
      return await deleteOrgTrainingWorkoutBlock(blockId, user.id, organizationId);
    } catch (error) {
      const statusCode =
        error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : 400;
      return reply.code(statusCode).send({
        message: error instanceof Error ? error.message : "Falha ao remover divisão."
      });
    }
  });

  app.put("/org/programs/:programId", async (request, reply) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { programId } = z.object({ programId: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        title: z.string().trim().min(2).max(160).optional(),
        description: z.string().trim().max(2000).optional(),
        modalityId: z.string().min(1).optional(),
        unitId: z.string().nullable().optional(),
        targetGender: z.enum(["ALL", "MALE", "FEMALE"]).optional(),
        days: z
          .array(
            z.object({
              workoutBlockId: z.string().min(1),
              dayNumber: z.number().int().positive().max(365),
              order: z.number().int().positive().max(50).default(1)
            })
          )
          .min(1)
          .max(60)
          .optional()
      })
      .parse(request.body);

    const existing = await prisma.program.findFirst({
      where: { id: programId, deletedAt: null, sourceType: { in: ["ORGANIZATION", "COACH"] } }
    });
    if (!existing?.organizationId) throw httpOrgError(404, "Programa não encontrado.");
    denyUnlessAllowed(
      authorize({
        ctx,
        permission: "training.update",
        organizationId: existing.organizationId,
        unitId: existing.unitId
      })
    );

    try {
      const program = await updateOrgProgram(programId, user.id, body);
      return { program };
    } catch (error) {
      const statusCode =
        error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : 400;
      return reply.code(statusCode).send({
        message: error instanceof Error ? error.message : "Falha ao atualizar programa."
      });
    }
  });

  app.post("/org/programs/:programId/distribute-base", async (request, reply) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { programId } = z.object({ programId: z.string().min(1) }).parse(request.params);
    const { organizationId } = z.object({ organizationId: z.string().min(1) }).parse(request.body);

    denyUnlessAllowed(
      authorize({ ctx, permission: "training.assign", organizationId })
    );

    try {
      const result = await distributeProgramToCoachBase(programId, user.id, organizationId);
      await writeAuditLog({
        userId: user.id,
        organizationId,
        action: "program.distribute_base",
        resourceType: "program",
        resourceId: programId,
        newValues: { assignedCount: result.assignedCount },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"]
      });
      return reply.code(201).send(result);
    } catch (error) {
      const statusCode =
        error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : 400;
      return reply.code(statusCode).send({
        message: error instanceof Error ? error.message : "Falha ao distribuir programa."
      });
    }
  });
}
