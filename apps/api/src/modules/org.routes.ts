import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { prisma } from "../prisma.js";
import { authorize } from "./org-auth/authorize.js";
import { loadOrgAuthContext, writeAuditLog } from "./org-auth/context.js";

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug inválido.");

const organizationBodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugSchema,
  type: z.enum(["ACADEMY", "BOX", "STUDIO", "RUNNING_TEAM", "OTHER"]).default("OTHER")
});

const unitBodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(2).optional(),
  neighborhood: z.string().trim().max(80).optional(),
  address: z.string().trim().max(200).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional()
});

const athleteLinkSchema = z.object({
  athleteId: z.string().min(1),
  organizationId: z.string().min(1),
  unitId: z.string().min(1),
  status: z.enum(["PENDING", "ACTIVE", "SUSPENDED", "CANCELLED"]).default("ACTIVE")
});

const professionalAssignmentSchema = z.object({
  organizationId: z.string().min(1),
  unitId: z.string().min(1),
  professionalId: z.string().min(1),
  athleteId: z.string().min(1),
  professionalType: z.enum(["COACH", "NUTRITIONIST"]),
  modalityId: z.string().optional(),
  isPrimary: z.boolean().optional()
});

function denyUnlessAllowed(result: ReturnType<typeof authorize>) {
  if (result === "DENY") {
    const error = new Error("Acesso negado ao recurso organizacional.") as Error & { statusCode: number };
    error.statusCode = 403;
    throw error;
  }
}

export async function registerOrgRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (request) => {
    if (!request.url.startsWith("/org")) return;
    await requireAuth(app, request);
  });

  app.get("/org/me/context", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    return {
      userId: ctx.userId,
      isPlatformOperator: ctx.isPlatformOperator,
      isPlatformAdmin: ctx.isPlatformAdmin,
      memberships: ctx.memberships
    };
  });

  app.get("/org/organizations", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    denyUnlessAllowed(authorize({ ctx, permission: "organizations.view" }));

    const where =
      ctx.isPlatformOperator || ctx.isPlatformAdmin
        ? { deletedAt: null }
        : {
            deletedAt: null,
            id: { in: [...new Set(ctx.memberships.map((member) => member.organizationId))] }
          };

    const organizations = await prisma.organization.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        units: {
          where: { deletedAt: null },
          orderBy: { name: "asc" }
        }
      }
    });

    return { organizations };
  });

  app.post("/org/organizations", async (request, reply) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    denyUnlessAllowed(authorize({ ctx, permission: "organizations.create" }));
    const body = organizationBodySchema.parse(request.body);

    const organization = await prisma.organization.create({
      data: {
        name: body.name,
        slug: body.slug,
        type: body.type
      }
    });

    await writeAuditLog({
      userId: user.id,
      organizationId: organization.id,
      action: "organization.create",
      resourceType: "organization",
      resourceId: organization.id,
      newValues: organization,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });

    return reply.code(201).send({ organization });
  });

  app.post("/org/organizations/:organizationId/units", async (request, reply) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { organizationId } = z.object({ organizationId: z.string().min(1) }).parse(request.params);
    denyUnlessAllowed(
      authorize({ ctx, permission: "units.create", organizationId })
    );
    const body = unitBodySchema.parse(request.body);

    const unit = await prisma.unit.create({
      data: {
        organizationId,
        ...body
      }
    });

    await writeAuditLog({
      userId: user.id,
      organizationId,
      unitId: unit.id,
      action: "unit.create",
      resourceType: "unit",
      resourceId: unit.id,
      newValues: unit,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });

    return reply.code(201).send({ unit });
  });

  app.post("/org/athlete-links", async (request, reply) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const body = athleteLinkSchema.parse(request.body);
    denyUnlessAllowed(
      authorize({
        ctx,
        permission: "athletes.link",
        organizationId: body.organizationId,
        unitId: body.unitId
      })
    );

    const link = await prisma.athleteOrganizationLink.upsert({
      where: {
        athleteId_organizationId_unitId: {
          athleteId: body.athleteId,
          organizationId: body.organizationId,
          unitId: body.unitId
        }
      },
      create: {
        athleteId: body.athleteId,
        organizationId: body.organizationId,
        unitId: body.unitId,
        status: body.status
      },
      update: {
        status: body.status,
        endedAt: body.status === "CANCELLED" ? new Date() : null,
        deletedAt: null
      }
    });

    await writeAuditLog({
      userId: user.id,
      organizationId: body.organizationId,
      unitId: body.unitId,
      action: "athlete.link",
      resourceType: "athlete_organization_link",
      resourceId: link.id,
      newValues: link,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });

    return reply.code(201).send({ link });
  });

  app.post("/org/professional-assignments", async (request, reply) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const body = professionalAssignmentSchema.parse(request.body);
    denyUnlessAllowed(
      authorize({
        ctx,
        permission: body.professionalType === "COACH" ? "coaches.create" : "nutritionists.create",
        organizationId: body.organizationId,
        unitId: body.unitId
      })
    );

    const assignment = await prisma.professionalAssignment.create({
      data: {
        organizationId: body.organizationId,
        unitId: body.unitId,
        professionalId: body.professionalId,
        athleteId: body.athleteId,
        professionalType: body.professionalType,
        modalityId: body.modalityId,
        isPrimary: body.isPrimary ?? false
      }
    });

    await writeAuditLog({
      userId: user.id,
      organizationId: body.organizationId,
      unitId: body.unitId,
      action: body.professionalType === "COACH" ? "coach.assign" : "nutritionist.assign",
      resourceType: "professional_assignment",
      resourceId: assignment.id,
      newValues: assignment,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });

    return reply.code(201).send({ assignment });
  });

  app.get("/org/athletes/:athleteId/org-resources", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { athleteId } = z.object({ athleteId: z.string().min(1) }).parse(request.params);

    const isSelf = athleteId === user.id;
    if (!isSelf) {
      denyUnlessAllowed(
        authorize({
          ctx,
          permission: "athletes.view",
          athleteId
        })
      );
    }

    const [links, assignments, classMembers] = await Promise.all([
      prisma.athleteOrganizationLink.findMany({
        where: { athleteId, deletedAt: null, status: { in: ["PENDING", "ACTIVE"] } },
        include: { organization: true, unit: true }
      }),
      prisma.professionalAssignment.findMany({
        where: { athleteId, deletedAt: null, status: "ACTIVE" },
        include: { professional: { select: { id: true, name: true, email: true } }, modality: true }
      }),
      prisma.trainingClassMember.findMany({
        where: { athleteId, status: "ACTIVE" },
        include: { class: { include: { modality: true, coach: { select: { id: true, name: true } } } } }
      })
    ]);

    return { links, assignments, classMembers };
  });

  app.get("/org/users", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    denyUnlessAllowed(authorize({ ctx, permission: "athletes.view" }));

    const query = z
      .object({
        q: z.string().trim().min(1).max(120),
        limit: z.coerce.number().int().min(1).max(30).default(15)
      })
      .parse(request.query);

    const users = await prisma.user.findMany({
      where: {
        role: "USER",
        status: "ACTIVE",
        OR: [
          { email: { contains: query.q, mode: "insensitive" } },
          { name: { contains: query.q, mode: "insensitive" } }
        ]
      },
      select: { id: true, name: true, email: true, profile: { select: { avatarUrl: true } } },
      orderBy: { name: "asc" },
      take: query.limit
    });

    return { users };
  });

  app.get("/org/audit-logs", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const query = z
      .object({
        organizationId: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(40)
      })
      .parse(request.query);

    denyUnlessAllowed(
      authorize({
        ctx,
        permission: "audit_logs.view",
        organizationId: query.organizationId ?? null
      })
    );

    const where =
      ctx.isPlatformOperator || ctx.isPlatformAdmin
        ? {
            ...(query.organizationId ? { organizationId: query.organizationId } : {})
          }
        : {
            organizationId: {
              in: [...new Set(ctx.memberships.map((member) => member.organizationId))]
            },
            ...(query.organizationId ? { organizationId: query.organizationId } : {})
          };

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: query.limit,
      include: {
        user: { select: { id: true, name: true, email: true } },
        organization: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true } }
      }
    });

    return { logs };
  });

  const memberBodySchema = z.object({
    organizationId: z.string().min(1),
    userId: z.string().min(1),
    role: z.enum(["ORGANIZATION_ADMIN", "UNIT_MANAGER", "COACH", "NUTRITIONIST", "ATHLETE"]),
    unitId: z.string().optional(),
    status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).default("ACTIVE")
  });

  app.post("/org/members", async (request, reply) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const body = memberBodySchema.parse(request.body);
    denyUnlessAllowed(
      authorize({
        ctx,
        permission: "roles.manage",
        organizationId: body.organizationId,
        unitId: body.unitId ?? null
      })
    );

    const member = await prisma.organizationMember.upsert({
      where: {
        organizationId_userId_role: {
          organizationId: body.organizationId,
          userId: body.userId,
          role: body.role
        }
      },
      create: {
        organizationId: body.organizationId,
        userId: body.userId,
        role: body.role,
        unitId: body.unitId ?? null,
        status: body.status
      },
      update: {
        unitId: body.unitId ?? null,
        status: body.status
      }
    });

    await writeAuditLog({
      userId: user.id,
      organizationId: body.organizationId,
      unitId: body.unitId ?? null,
      action: "organization_member.upsert",
      resourceType: "organization_member",
      resourceId: member.id,
      newValues: member,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });

    return reply.code(201).send({ member });
  });

  app.get("/org/organizations/:organizationId/members", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { organizationId } = z.object({ organizationId: z.string().min(1) }).parse(request.params);
    denyUnlessAllowed(authorize({ ctx, permission: "roles.view", organizationId }));

    const members = await prisma.organizationMember.findMany({
      where: { organizationId },
      include: {
        user: { select: { id: true, name: true, email: true, profile: { select: { avatarUrl: true } } } },
        unit: { select: { id: true, name: true } }
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }]
    });

    return { members };
  });

  app.get("/org/organizations/:organizationId/athlete-links", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { organizationId } = z.object({ organizationId: z.string().min(1) }).parse(request.params);
    denyUnlessAllowed(authorize({ ctx, permission: "athletes.view", organizationId }));

    const links = await prisma.athleteOrganizationLink.findMany({
      where: { organizationId, deletedAt: null },
      include: {
        athlete: { select: { id: true, name: true, email: true } },
        unit: { select: { id: true, name: true } }
      },
      orderBy: { joinedAt: "desc" }
    });

    return { links };
  });

  app.get("/org/organizations/:organizationId/professional-assignments", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { organizationId } = z.object({ organizationId: z.string().min(1) }).parse(request.params);
    denyUnlessAllowed(authorize({ ctx, permission: "coaches.view", organizationId }));

    const assignments = await prisma.professionalAssignment.findMany({
      where: { organizationId, deletedAt: null },
      include: {
        professional: { select: { id: true, name: true, email: true } },
        athlete: { select: { id: true, name: true, email: true } },
        unit: { select: { id: true, name: true } },
        modality: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: "desc" }
    });

    return { assignments };
  });

  const unitModalitySchema = z.object({
    unitId: z.string().min(1),
    modalityId: z.string().min(1),
    enabled: z.boolean().default(true)
  });

  app.post("/org/unit-modalities", async (request, reply) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const body = unitModalitySchema.parse(request.body);
    const unit = await prisma.unit.findUnique({ where: { id: body.unitId }, select: { organizationId: true } });
    if (!unit) {
      const error = new Error("Unidade não encontrada.") as Error & { statusCode: number };
      error.statusCode = 404;
      throw error;
    }

    denyUnlessAllowed(
      authorize({ ctx, permission: "units.update", organizationId: unit.organizationId, unitId: body.unitId })
    );

    const item = await prisma.unitModality.upsert({
      where: { unitId_modalityId: { unitId: body.unitId, modalityId: body.modalityId } },
      create: { unitId: body.unitId, modalityId: body.modalityId, enabled: body.enabled },
      update: { enabled: body.enabled }
    });

    await writeAuditLog({
      userId: user.id,
      organizationId: unit.organizationId,
      unitId: body.unitId,
      action: "unit_modality.upsert",
      resourceType: "unit_modality",
      resourceId: item.id,
      newValues: item,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });

    return reply.code(201).send({ unitModality: item });
  });

  app.get("/org/units/:unitId/modalities", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { unitId } = z.object({ unitId: z.string().min(1) }).parse(request.params);
    const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { organizationId: true } });
    if (!unit) {
      const error = new Error("Unidade não encontrada.") as Error & { statusCode: number };
      error.statusCode = 404;
      throw error;
    }

    denyUnlessAllowed(
      authorize({ ctx, permission: "units.view", organizationId: unit.organizationId, unitId })
    );

    const modalities = await prisma.unitModality.findMany({
      where: { unitId },
      include: { modality: { select: { id: true, name: true, slug: true, isActive: true } } },
      orderBy: { createdAt: "asc" }
    });

    return { modalities };
  });

  const trainingClassSchema = z.object({
    organizationId: z.string().min(1),
    unitId: z.string().min(1),
    coachId: z.string().min(1),
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(500).optional(),
    modalityId: z.string().optional(),
    capacity: z.number().int().positive().max(500).optional(),
    scheduleData: z.record(z.unknown()).optional()
  });

  app.get("/org/organizations/:organizationId/classes", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { organizationId } = z.object({ organizationId: z.string().min(1) }).parse(request.params);
    denyUnlessAllowed(authorize({ ctx, permission: "classes.view", organizationId }));

    const classes = await prisma.trainingClass.findMany({
      where: { organizationId, deletedAt: null },
      include: {
        coach: { select: { id: true, name: true, email: true } },
        modality: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true } },
        members: {
          where: { status: "ACTIVE" },
          select: { id: true, athleteId: true, joinedAt: true }
        }
      },
      orderBy: { name: "asc" }
    });

    return { classes };
  });

  app.post("/org/classes", async (request, reply) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const body = trainingClassSchema.parse(request.body);
    denyUnlessAllowed(
      authorize({
        ctx,
        permission: "classes.create",
        organizationId: body.organizationId,
        unitId: body.unitId
      })
    );

    const trainingClass = await prisma.trainingClass.create({
      data: {
        organizationId: body.organizationId,
        unitId: body.unitId,
        coachId: body.coachId,
        name: body.name,
        description: body.description,
        modalityId: body.modalityId,
        capacity: body.capacity,
        scheduleData: (body.scheduleData ?? undefined) as Prisma.InputJsonValue | undefined
      }
    });

    await writeAuditLog({
      userId: user.id,
      organizationId: body.organizationId,
      unitId: body.unitId,
      action: "training_class.create",
      resourceType: "training_class",
      resourceId: trainingClass.id,
      newValues: trainingClass,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });

    return reply.code(201).send({ trainingClass });
  });

  const classMemberSchema = z.object({
    classId: z.string().min(1),
    athleteId: z.string().min(1),
    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE")
  });

  app.post("/org/class-members", async (request, reply) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const body = classMemberSchema.parse(request.body);
    const trainingClass = await prisma.trainingClass.findFirst({
      where: { id: body.classId, deletedAt: null },
      select: { organizationId: true, unitId: true }
    });
    if (!trainingClass) {
      const error = new Error("Turma não encontrada.") as Error & { statusCode: number };
      error.statusCode = 404;
      throw error;
    }

    denyUnlessAllowed(
      authorize({
        ctx,
        permission: "classes.assign_athletes",
        organizationId: trainingClass.organizationId,
        unitId: trainingClass.unitId
      })
    );

    const member = await prisma.trainingClassMember.upsert({
      where: { classId_athleteId: { classId: body.classId, athleteId: body.athleteId } },
      create: { classId: body.classId, athleteId: body.athleteId, status: body.status },
      update: { status: body.status }
    });

    await writeAuditLog({
      userId: user.id,
      organizationId: trainingClass.organizationId,
      unitId: trainingClass.unitId,
      action: "training_class_member.upsert",
      resourceType: "training_class_member",
      resourceId: member.id,
      newValues: member,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });

    return reply.code(201).send({ member });
  });

  const nutritionPlanSchema = z.object({
    organizationId: z.string().min(1),
    unitId: z.string().min(1),
    nutritionistId: z.string().min(1),
    title: z.string().trim().min(2).max(120),
    description: z.string().trim().max(500).optional(),
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).default("DRAFT")
  });

  app.get("/org/organizations/:organizationId/nutrition-plans", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { organizationId } = z.object({ organizationId: z.string().min(1) }).parse(request.params);
    denyUnlessAllowed(authorize({ ctx, permission: "nutrition.view", organizationId }));

    const plans = await prisma.nutritionPlan.findMany({
      where: { organizationId, deletedAt: null },
      include: {
        nutritionist: { select: { id: true, name: true, email: true } },
        unit: { select: { id: true, name: true } },
        assignments: {
          where: { status: "ACTIVE" },
          select: { id: true, athleteId: true, startDate: true, endDate: true }
        }
      },
      orderBy: { updatedAt: "desc" }
    });

    return { plans };
  });

  app.post("/org/nutrition-plans", async (request, reply) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const body = nutritionPlanSchema.parse(request.body);
    denyUnlessAllowed(
      authorize({
        ctx,
        permission: "nutrition.create",
        organizationId: body.organizationId,
        unitId: body.unitId
      })
    );

    const plan = await prisma.nutritionPlan.create({
      data: {
        organizationId: body.organizationId,
        unitId: body.unitId,
        nutritionistId: body.nutritionistId,
        title: body.title,
        description: body.description,
        status: body.status
      }
    });

    await writeAuditLog({
      userId: user.id,
      organizationId: body.organizationId,
      unitId: body.unitId,
      action: "nutrition_plan.create",
      resourceType: "nutrition_plan",
      resourceId: plan.id,
      newValues: plan,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });

    return reply.code(201).send({ plan });
  });

  const nutritionAssignmentSchema = z.object({
    nutritionPlanId: z.string().min(1),
    athleteId: z.string().min(1),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional(),
    status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]).default("ACTIVE")
  });

  app.post("/org/nutrition-assignments", async (request, reply) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const body = nutritionAssignmentSchema.parse(request.body);
    const plan = await prisma.nutritionPlan.findFirst({
      where: { id: body.nutritionPlanId, deletedAt: null },
      select: { organizationId: true, unitId: true }
    });
    if (!plan) {
      const error = new Error("Plano nutricional não encontrado.") as Error & { statusCode: number };
      error.statusCode = 404;
      throw error;
    }

    denyUnlessAllowed(
      authorize({
        ctx,
        permission: "nutrition.assign",
        organizationId: plan.organizationId,
        unitId: plan.unitId
      })
    );

    const assignment = await prisma.nutritionAssignment.create({
      data: {
        nutritionPlanId: body.nutritionPlanId,
        athleteId: body.athleteId,
        assignedByUserId: user.id,
        startDate: body.startDate,
        endDate: body.endDate,
        status: body.status
      }
    });

    await writeAuditLog({
      userId: user.id,
      organizationId: plan.organizationId,
      unitId: plan.unitId,
      action: "nutrition_assignment.create",
      resourceType: "nutrition_assignment",
      resourceId: assignment.id,
      newValues: assignment,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });

    return reply.code(201).send({ assignment });
  });
}
