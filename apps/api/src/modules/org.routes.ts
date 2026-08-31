import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { prisma } from "../prisma.js";
import { authorize } from "./org-auth/authorize.js";
import { loadOrgAuthContext, writeAuditLog } from "./org-auth/context.js";
import { authorizeOrg, httpOrgError } from "./org-auth/scope.js";

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

  const STAFF_ROLES = new Set([
    "PLATFORM_OWNER",
    "ORGANIZATION_ADMIN",
    "UNIT_MANAGER",
    "COACH",
    "NUTRITIONIST"
  ]);

  app.get("/org/me/workspace", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const staffMemberships = ctx.memberships.filter((member) => STAFF_ROLES.has(member.role));
    const isStaff = ctx.isPlatformOperator || ctx.isPlatformAdmin || staffMemberships.length > 0;

    if (!isStaff) {
      return {
        isStaff: false,
        userId: ctx.userId,
        memberships: [],
        organizations: [],
        assignedAthletes: [],
        classes: [],
        programs: [],
        nutritionPlans: [],
        athleteLinks: []
      };
    }

    const orgIds =
      ctx.isPlatformOperator || ctx.isPlatformAdmin
        ? undefined
        : [...new Set(staffMemberships.map((member) => member.organizationId))];

    const orgWhere = {
      deletedAt: null,
      ...(orgIds ? { id: { in: orgIds } } : {})
    };

    const isCoachOnly =
      !ctx.isPlatformOperator &&
      !ctx.isPlatformAdmin &&
      staffMemberships.every((member) => member.role === "COACH" || member.role === "NUTRITIONIST");

    const [organizations, assignments, classes, programs, nutritionPlans, athleteLinks] = await Promise.all([
      prisma.organization.findMany({
        where: orgWhere,
        orderBy: { name: "asc" },
        include: {
          units: { where: { deletedAt: null }, orderBy: { name: "asc" } }
        }
      }),
      prisma.professionalAssignment.findMany({
        where: {
          deletedAt: null,
          status: "ACTIVE",
          ...(isCoachOnly
            ? { professionalId: user.id }
            : orgIds
              ? { organizationId: { in: orgIds } }
              : {})
        },
        include: {
          athlete: { select: { id: true, name: true, email: true } },
          professional: { select: { id: true, name: true, email: true } },
          unit: { select: { id: true, name: true } },
          organization: { select: { id: true, name: true } },
          modality: { select: { id: true, name: true } }
        },
        orderBy: { createdAt: "desc" },
        take: 200
      }),
      prisma.trainingClass.findMany({
        where: {
          deletedAt: null,
          ...(isCoachOnly
            ? { coachId: user.id }
            : orgIds
              ? { organizationId: { in: orgIds } }
              : {})
        },
        include: {
          coach: { select: { id: true, name: true, email: true } },
          unit: { select: { id: true, name: true } },
          organization: { select: { id: true, name: true } },
          modality: { select: { id: true, name: true } },
          members: {
            where: { status: "ACTIVE" },
            select: { id: true, athleteId: true }
          }
        },
        orderBy: { name: "asc" },
        take: 100
      }),
      prisma.program.findMany({
        where: {
          deletedAt: null,
          sourceType: { in: ["ORGANIZATION", "COACH"] },
          ...(isCoachOnly
            ? {
                OR: [
                  { coachUserId: user.id },
                  ...(orgIds ? [{ organizationId: { in: orgIds } }] : [])
                ]
              }
            : orgIds
              ? { organizationId: { in: orgIds } }
              : {})
        },
        include: {
          modality: { select: { id: true, name: true } },
          unit: { select: { id: true, name: true } },
          organization: { select: { id: true, name: true } },
          days: { select: { id: true, dayNumber: true }, orderBy: { dayNumber: "asc" } },
          assignedUsers: { where: { status: "ACTIVE" }, select: { id: true, userId: true } }
        },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        take: 100
      }),
      prisma.nutritionPlan.findMany({
        where: {
          deletedAt: null,
          ...(staffMemberships.some((m) => m.role === "NUTRITIONIST") && isCoachOnly
            ? { nutritionistId: user.id }
            : isCoachOnly
              ? { id: { in: [] } }
              : orgIds
                ? { organizationId: { in: orgIds } }
                : {})
        },
        include: {
          nutritionist: { select: { id: true, name: true, email: true } },
          unit: { select: { id: true, name: true } },
          organization: { select: { id: true, name: true } },
          assignments: {
            where: { status: "ACTIVE" },
            select: { id: true, athleteId: true, startDate: true }
          }
        },
        orderBy: { updatedAt: "desc" },
        take: 100
      }),
      prisma.athleteOrganizationLink.findMany({
        where: {
          deletedAt: null,
          status: { in: ["PENDING", "ACTIVE"] },
          ...(orgIds ? { organizationId: { in: orgIds } } : {})
        },
        include: {
          athlete: { select: { id: true, name: true, email: true } },
          unit: { select: { id: true, name: true } },
          organization: { select: { id: true, name: true } }
        },
        orderBy: { joinedAt: "desc" },
        take: 200
      })
    ]);

    const assignedAthletes =
      isCoachOnly
        ? assignments.map((item) => item.athlete)
        : [
            ...new Map(
              [...assignments.map((item) => item.athlete), ...athleteLinks.map((item) => item.athlete)].map(
                (athlete) => [athlete.id, athlete]
              )
            ).values()
          ];

    return {
      isStaff: true,
      userId: ctx.userId,
      isPlatformOperator: ctx.isPlatformOperator,
      isPlatformAdmin: ctx.isPlatformAdmin,
      memberships: staffMemberships,
      organizations,
      assignedAthletes,
      assignments,
      classes,
      programs,
      nutritionPlans,
      athleteLinks: isCoachOnly ? [] : athleteLinks
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

  // ─── Ciclo de vida (update / soft-delete) ───

  app.put("/org/organizations/:organizationId", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { organizationId } = z.object({ organizationId: z.string().min(1) }).parse(request.params);
    denyUnlessAllowed(authorize({ ctx, permission: "organizations.update", organizationId }));
    const body = organizationBodySchema.partial().extend({
      status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional()
    }).parse(request.body);

    const organization = await prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.slug !== undefined ? { slug: body.slug } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.status !== undefined ? { status: body.status } : {})
      }
    });

    await writeAuditLog({
      userId: user.id,
      organizationId,
      action: "organization.update",
      resourceType: "organization",
      resourceId: organizationId,
      newValues: organization,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });

    return { organization };
  });

  app.delete("/org/organizations/:organizationId", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { organizationId } = z.object({ organizationId: z.string().min(1) }).parse(request.params);
    denyUnlessAllowed(authorize({ ctx, permission: "organizations.delete", organizationId }));

    await prisma.organization.update({
      where: { id: organizationId },
      data: { deletedAt: new Date(), status: "INACTIVE" }
    });

    await writeAuditLog({
      userId: user.id,
      organizationId,
      action: "organization.delete",
      resourceType: "organization",
      resourceId: organizationId,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });

    return { ok: true };
  });

  app.put("/org/units/:unitId", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { unitId } = z.object({ unitId: z.string().min(1) }).parse(request.params);
    const unit = await prisma.unit.findFirst({ where: { id: unitId, deletedAt: null } });
    if (!unit) throw httpOrgError(404, "Unidade não encontrada.");
    denyUnlessAllowed(
      authorize({ ctx, permission: "units.update", organizationId: unit.organizationId, unitId })
    );
    const body = unitBodySchema.partial().extend({
      status: z.enum(["ACTIVE", "INACTIVE"]).optional()
    }).parse(request.body);

    const updated = await prisma.unit.update({
      where: { id: unitId },
      data: body
    });

    await writeAuditLog({
      userId: user.id,
      organizationId: unit.organizationId,
      unitId,
      action: "unit.update",
      resourceType: "unit",
      resourceId: unitId,
      newValues: updated,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });

    return { unit: updated };
  });

  app.delete("/org/units/:unitId", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { unitId } = z.object({ unitId: z.string().min(1) }).parse(request.params);
    const unit = await prisma.unit.findFirst({ where: { id: unitId, deletedAt: null } });
    if (!unit) throw httpOrgError(404, "Unidade não encontrada.");
    denyUnlessAllowed(
      authorize({ ctx, permission: "units.delete", organizationId: unit.organizationId, unitId })
    );

    await prisma.unit.update({
      where: { id: unitId },
      data: { deletedAt: new Date(), status: "INACTIVE" }
    });

    await writeAuditLog({
      userId: user.id,
      organizationId: unit.organizationId,
      unitId,
      action: "unit.delete",
      resourceType: "unit",
      resourceId: unitId,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });

    return { ok: true };
  });

  app.patch("/org/members/:memberId", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { memberId } = z.object({ memberId: z.string().min(1) }).parse(request.params);
    const member = await prisma.organizationMember.findUnique({ where: { id: memberId } });
    if (!member) throw httpOrgError(404, "Membro não encontrado.");
    denyUnlessAllowed(
      authorize({
        ctx,
        permission: "roles.manage",
        organizationId: member.organizationId,
        unitId: member.unitId
      })
    );
    const body = z
      .object({
        role: z.enum(["ORGANIZATION_ADMIN", "UNIT_MANAGER", "COACH", "NUTRITIONIST", "ATHLETE"]).optional(),
        unitId: z.string().nullable().optional(),
        status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional()
      })
      .parse(request.body);

    const updated = await prisma.organizationMember.update({
      where: { id: memberId },
      data: {
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...(body.unitId !== undefined ? { unitId: body.unitId } : {}),
        ...(body.status !== undefined ? { status: body.status } : {})
      }
    });

    await writeAuditLog({
      userId: user.id,
      organizationId: member.organizationId,
      unitId: updated.unitId,
      action: "organization_member.update",
      resourceType: "organization_member",
      resourceId: memberId,
      newValues: updated,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });

    return { member: updated };
  });

  app.delete("/org/members/:memberId", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { memberId } = z.object({ memberId: z.string().min(1) }).parse(request.params);
    const member = await prisma.organizationMember.findUnique({ where: { id: memberId } });
    if (!member) throw httpOrgError(404, "Membro não encontrado.");
    denyUnlessAllowed(
      authorize({ ctx, permission: "roles.manage", organizationId: member.organizationId, unitId: member.unitId })
    );

    await prisma.organizationMember.update({
      where: { id: memberId },
      data: { status: "INACTIVE" }
    });

    await writeAuditLog({
      userId: user.id,
      organizationId: member.organizationId,
      unitId: member.unitId,
      action: "organization_member.deactivate",
      resourceType: "organization_member",
      resourceId: memberId,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });

    return { ok: true };
  });

  app.patch("/org/athlete-links/:linkId", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { linkId } = z.object({ linkId: z.string().min(1) }).parse(request.params);
    const link = await prisma.athleteOrganizationLink.findFirst({
      where: { id: linkId, deletedAt: null }
    });
    if (!link) throw httpOrgError(404, "Vínculo não encontrado.");
    denyUnlessAllowed(
      await authorizeOrg({
        ctx,
        permission: "athletes.unlink",
        organizationId: link.organizationId,
        unitId: link.unitId,
        athleteId: link.athleteId
      })
    );
    const body = z
      .object({
        status: z.enum(["PENDING", "ACTIVE", "SUSPENDED", "CANCELLED"])
      })
      .parse(request.body);

    const updated = await prisma.athleteOrganizationLink.update({
      where: { id: linkId },
      data: {
        status: body.status,
        endedAt: body.status === "CANCELLED" || body.status === "SUSPENDED" ? new Date() : null,
        deletedAt: body.status === "CANCELLED" ? new Date() : null
      }
    });

    await writeAuditLog({
      userId: user.id,
      organizationId: link.organizationId,
      unitId: link.unitId,
      action: "athlete.link.update",
      resourceType: "athlete_organization_link",
      resourceId: linkId,
      newValues: updated,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });

    return { link: updated };
  });

  app.patch("/org/professional-assignments/:assignmentId", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { assignmentId } = z.object({ assignmentId: z.string().min(1) }).parse(request.params);
    const assignment = await prisma.professionalAssignment.findFirst({
      where: { id: assignmentId, deletedAt: null }
    });
    if (!assignment) throw httpOrgError(404, "Atribuição não encontrada.");
    const permission =
      assignment.professionalType === "COACH" ? ("coaches.update" as const) : ("nutritionists.update" as const);
    denyUnlessAllowed(
      await authorizeOrg({
        ctx,
        permission,
        organizationId: assignment.organizationId,
        unitId: assignment.unitId,
        athleteId: assignment.athleteId
      })
    );
    const body = z
      .object({
        status: z.enum(["ACTIVE", "INACTIVE", "ENDED"]),
        isPrimary: z.boolean().optional()
      })
      .parse(request.body);

    const updated = await prisma.professionalAssignment.update({
      where: { id: assignmentId },
      data: {
        status: body.status,
        isPrimary: body.isPrimary,
        deletedAt: body.status === "ENDED" ? new Date() : null
      }
    });

    await writeAuditLog({
      userId: user.id,
      organizationId: assignment.organizationId,
      unitId: assignment.unitId,
      action: "professional_assignment.update",
      resourceType: "professional_assignment",
      resourceId: assignmentId,
      newValues: updated,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });

    return { assignment: updated };
  });

  app.put("/org/classes/:classId", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { classId } = z.object({ classId: z.string().min(1) }).parse(request.params);
    const trainingClass = await prisma.trainingClass.findFirst({
      where: { id: classId, deletedAt: null }
    });
    if (!trainingClass) throw httpOrgError(404, "Turma não encontrada.");
    denyUnlessAllowed(
      authorize({
        ctx,
        permission: "classes.update",
        organizationId: trainingClass.organizationId,
        unitId: trainingClass.unitId
      })
    );
    const body = z
      .object({
        name: z.string().trim().min(2).max(120).optional(),
        description: z.string().trim().max(500).nullable().optional(),
        coachId: z.string().min(1).optional(),
        modalityId: z.string().nullable().optional(),
        capacity: z.number().int().positive().max(500).nullable().optional(),
        status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
        scheduleData: z.record(z.unknown()).optional()
      })
      .parse(request.body);

    const updated = await prisma.trainingClass.update({
      where: { id: classId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.coachId !== undefined ? { coachId: body.coachId } : {}),
        ...(body.modalityId !== undefined ? { modalityId: body.modalityId } : {}),
        ...(body.capacity !== undefined ? { capacity: body.capacity } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.scheduleData !== undefined
          ? { scheduleData: body.scheduleData as Prisma.InputJsonValue }
          : {})
      }
    });

    await writeAuditLog({
      userId: user.id,
      organizationId: trainingClass.organizationId,
      unitId: trainingClass.unitId,
      action: "training_class.update",
      resourceType: "training_class",
      resourceId: classId,
      newValues: updated,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });

    return { trainingClass: updated };
  });

  app.delete("/org/classes/:classId", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { classId } = z.object({ classId: z.string().min(1) }).parse(request.params);
    const trainingClass = await prisma.trainingClass.findFirst({
      where: { id: classId, deletedAt: null }
    });
    if (!trainingClass) throw httpOrgError(404, "Turma não encontrada.");
    denyUnlessAllowed(
      authorize({
        ctx,
        permission: "classes.delete",
        organizationId: trainingClass.organizationId,
        unitId: trainingClass.unitId
      })
    );

    await prisma.trainingClass.update({
      where: { id: classId },
      data: { deletedAt: new Date(), status: "ARCHIVED" }
    });

    await writeAuditLog({
      userId: user.id,
      organizationId: trainingClass.organizationId,
      unitId: trainingClass.unitId,
      action: "training_class.delete",
      resourceType: "training_class",
      resourceId: classId,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });

    return { ok: true };
  });

  app.patch("/org/class-members/:memberId", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { memberId } = z.object({ memberId: z.string().min(1) }).parse(request.params);
    const member = await prisma.trainingClassMember.findUnique({
      where: { id: memberId },
      include: { class: { select: { organizationId: true, unitId: true } } }
    });
    if (!member) throw httpOrgError(404, "Membro da turma não encontrado.");
    denyUnlessAllowed(
      await authorizeOrg({
        ctx,
        permission: "classes.assign_athletes",
        organizationId: member.class.organizationId,
        unitId: member.class.unitId,
        athleteId: member.athleteId
      })
    );
    const body = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) }).parse(request.body);
    const updated = await prisma.trainingClassMember.update({
      where: { id: memberId },
      data: { status: body.status }
    });
    return { member: updated };
  });

  app.put("/org/nutrition-plans/:planId", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { planId } = z.object({ planId: z.string().min(1) }).parse(request.params);
    const plan = await prisma.nutritionPlan.findFirst({ where: { id: planId, deletedAt: null } });
    if (!plan) throw httpOrgError(404, "Plano nutricional não encontrado.");
    denyUnlessAllowed(
      authorize({
        ctx,
        permission: "nutrition.update",
        organizationId: plan.organizationId,
        unitId: plan.unitId
      })
    );
    const body = z
      .object({
        title: z.string().trim().min(2).max(120).optional(),
        description: z.string().trim().max(2000).nullable().optional(),
        status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional()
      })
      .parse(request.body);

    const updated = await prisma.nutritionPlan.update({
      where: { id: planId },
      data: body
    });

    await writeAuditLog({
      userId: user.id,
      organizationId: plan.organizationId,
      unitId: plan.unitId,
      action: "nutrition_plan.update",
      resourceType: "nutrition_plan",
      resourceId: planId,
      newValues: updated,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });

    return { plan: updated };
  });

  app.delete("/org/nutrition-plans/:planId", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { planId } = z.object({ planId: z.string().min(1) }).parse(request.params);
    const plan = await prisma.nutritionPlan.findFirst({ where: { id: planId, deletedAt: null } });
    if (!plan) throw httpOrgError(404, "Plano nutricional não encontrado.");
    denyUnlessAllowed(
      authorize({
        ctx,
        permission: "nutrition.update",
        organizationId: plan.organizationId,
        unitId: plan.unitId
      })
    );

    await prisma.nutritionPlan.update({
      where: { id: planId },
      data: { deletedAt: new Date(), status: "ARCHIVED" }
    });

    return { ok: true };
  });

  // ─── Programas ORGANIZATION / COACH ───

  app.get("/org/workout-blocks", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    denyUnlessAllowed(authorize({ ctx, permission: "training.view" }));

    const blocks = await prisma.workoutBlock.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        title: true,
        modalityId: true,
        modality: { select: { id: true, name: true } }
      },
      orderBy: { title: "asc" },
      take: 300
    });

    return { blocks };
  });

  app.get("/org/organizations/:organizationId/programs", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { organizationId } = z.object({ organizationId: z.string().min(1) }).parse(request.params);
    denyUnlessAllowed(authorize({ ctx, permission: "training.view", organizationId }));

    const programs = await prisma.program.findMany({
      where: {
        organizationId,
        deletedAt: null,
        sourceType: { in: ["ORGANIZATION", "COACH"] }
      },
      include: {
        modality: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true } },
        days: {
          select: { id: true, dayNumber: true, order: true, workoutBlockId: true },
          orderBy: [{ dayNumber: "asc" }, { order: "asc" }]
        },
        assignedUsers: {
          where: { status: "ACTIVE" },
          select: { id: true, userId: true }
        }
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }]
    });

    return { programs };
  });

  const orgProgramSchema = z.object({
    organizationId: z.string().min(1),
    unitId: z.string().optional(),
    modalityId: z.string().min(1),
    title: z.string().trim().min(2).max(160),
    description: z.string().trim().max(2000).optional(),
    sourceType: z.enum(["ORGANIZATION", "COACH"]).default("ORGANIZATION"),
    coachUserId: z.string().optional(),
    targetGender: z.enum(["ALL", "MALE", "FEMALE"]).default("ALL"),
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
  });

  app.post("/org/programs", async (request, reply) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const body = orgProgramSchema.parse(request.body);
    denyUnlessAllowed(
      authorize({
        ctx,
        permission: "training.create",
        organizationId: body.organizationId,
        unitId: body.unitId ?? null
      })
    );

    const modality = await prisma.modality.findFirst({
      where: { id: body.modalityId, deletedAt: null, isActive: true }
    });
    if (!modality) throw httpOrgError(404, "Modalidade não encontrada.");

    const blockIds = [...new Set(body.days.map((day) => day.workoutBlockId))];
    const blocks = await prisma.workoutBlock.findMany({
      where: { id: { in: blockIds }, deletedAt: null },
      select: { id: true }
    });
    if (blocks.length !== blockIds.length) {
      throw httpOrgError(400, "Uma ou mais fichas (blocos) são inválidas.");
    }

    const coachUserId =
      body.sourceType === "COACH" ? body.coachUserId ?? user.id : body.coachUserId ?? null;

    const program = await prisma.program.create({
      data: {
        title: body.title,
        description: body.description?.trim() || `Programa ${body.sourceType.toLowerCase()} — ${modality.name}`,
        modalityId: body.modalityId,
        sourceType: body.sourceType,
        organizationId: body.organizationId,
        unitId: body.unitId ?? null,
        coachUserId,
        visibility: "ORGANIZATION",
        audienceMode: "SELECTED",
        targetGender: body.targetGender,
        status: "DRAFT",
        isActive: true,
        plannedSessions: body.days.length,
        totalWorkouts: body.days.length,
        cycleLengthDays: Math.max(1, body.days.length),
        days: {
          create: body.days.map((day) => ({
            workoutBlockId: day.workoutBlockId,
            dayNumber: day.dayNumber,
            order: day.order
          }))
        }
      },
      include: {
        modality: { select: { id: true, name: true } },
        days: true
      }
    });

    await writeAuditLog({
      userId: user.id,
      organizationId: body.organizationId,
      unitId: body.unitId ?? null,
      action: "program.create",
      resourceType: "program",
      resourceId: program.id,
      newValues: { id: program.id, title: program.title, sourceType: program.sourceType },
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });

    return reply.code(201).send({ program });
  });

  app.post("/org/programs/:programId/publish", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { programId } = z.object({ programId: z.string().min(1) }).parse(request.params);
    const program = await prisma.program.findFirst({
      where: {
        id: programId,
        deletedAt: null,
        sourceType: { in: ["ORGANIZATION", "COACH"] }
      },
      include: { days: true }
    });
    if (!program?.organizationId) throw httpOrgError(404, "Programa organizacional não encontrado.");
    denyUnlessAllowed(
      authorize({
        ctx,
        permission: "training.publish",
        organizationId: program.organizationId,
        unitId: program.unitId
      })
    );
    if (!program.days.length) throw httpOrgError(409, "Programa sem dias/fichas para publicar.");

    const updated = await prisma.program.update({
      where: { id: programId },
      data: {
        status: "PUBLISHED",
        isActive: true,
        publishedAt: new Date()
      }
    });

    await writeAuditLog({
      userId: user.id,
      organizationId: program.organizationId,
      unitId: program.unitId,
      action: "program.publish",
      resourceType: "program",
      resourceId: programId,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });

    return { program: updated };
  });

  app.post("/org/programs/:programId/archive", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { programId } = z.object({ programId: z.string().min(1) }).parse(request.params);
    const program = await prisma.program.findFirst({
      where: {
        id: programId,
        deletedAt: null,
        sourceType: { in: ["ORGANIZATION", "COACH"] }
      }
    });
    if (!program?.organizationId) throw httpOrgError(404, "Programa organizacional não encontrado.");
    denyUnlessAllowed(
      authorize({
        ctx,
        permission: "training.update",
        organizationId: program.organizationId,
        unitId: program.unitId
      })
    );

    const updated = await prisma.program.update({
      where: { id: programId },
      data: { status: "ARCHIVED", isActive: false }
    });

    return { program: updated };
  });

  app.post("/org/programs/:programId/assign", async (request, reply) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { programId } = z.object({ programId: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        athleteIds: z.array(z.string().min(1)).min(1).max(100),
        trainingClassId: z.string().optional()
      })
      .parse(request.body);

    const program = await prisma.program.findFirst({
      where: {
        id: programId,
        deletedAt: null,
        sourceType: { in: ["ORGANIZATION", "COACH"] }
      }
    });
    if (!program?.organizationId) throw httpOrgError(404, "Programa organizacional não encontrado.");

    for (const athleteId of body.athleteIds) {
      denyUnlessAllowed(
        await authorizeOrg({
          ctx,
          permission: "training.assign",
          organizationId: program.organizationId,
          unitId: program.unitId,
          athleteId
        })
      );
    }

    const created = [];
    for (const athleteId of body.athleteIds) {
      const row = await prisma.userProgram.upsert({
        where: { userId_programId: { userId: athleteId, programId } },
        create: {
          userId: athleteId,
          programId,
          status: "ACTIVE",
          organizationId: program.organizationId,
          unitId: program.unitId,
          assignedByUserId: user.id,
          trainingClassId: body.trainingClassId ?? null,
          assignmentSource: body.trainingClassId
            ? "CLASS"
            : program.sourceType === "COACH"
              ? "COACH"
              : "ORGANIZATION",
          totalWorkouts: program.totalWorkouts
        },
        update: {
          status: "ACTIVE",
          organizationId: program.organizationId,
          unitId: program.unitId,
          assignedByUserId: user.id,
          trainingClassId: body.trainingClassId ?? null,
          assignmentSource: body.trainingClassId
            ? "CLASS"
            : program.sourceType === "COACH"
              ? "COACH"
              : "ORGANIZATION"
        }
      });
      created.push(row);
    }

    await writeAuditLog({
      userId: user.id,
      organizationId: program.organizationId,
      unitId: program.unitId,
      action: "program.assign",
      resourceType: "program",
      resourceId: programId,
      newValues: { athleteIds: body.athleteIds, count: created.length },
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });

    return reply.code(201).send({ assignments: created });
  });

  app.delete("/org/programs/:programId", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { programId } = z.object({ programId: z.string().min(1) }).parse(request.params);
    const program = await prisma.program.findFirst({
      where: {
        id: programId,
        deletedAt: null,
        sourceType: { in: ["ORGANIZATION", "COACH"] }
      }
    });
    if (!program?.organizationId) throw httpOrgError(404, "Programa organizacional não encontrado.");
    denyUnlessAllowed(
      authorize({
        ctx,
        permission: "training.delete",
        organizationId: program.organizationId,
        unitId: program.unitId
      })
    );

    await prisma.program.update({
      where: { id: programId },
      data: { deletedAt: new Date(), isActive: false, status: "ARCHIVED" }
    });

    return { ok: true };
  });
}
