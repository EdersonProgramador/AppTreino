import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { prisma } from "../prisma.js";
import { authorize } from "./org-auth/authorize.js";
import { loadOrgAuthContext, writeAuditLog } from "./org-auth/context.js";

function denyUnlessAllowed(result: ReturnType<typeof authorize>) {
  if (result === "DENY") {
    const error = new Error("Acesso negado ao recurso organizacional.") as Error & { statusCode: number };
    error.statusCode = 403;
    throw error;
  }
}

function dayBoundsUtc(dateKey: string) {
  const start = new Date(`${dateKey}T00:00:00.000Z`);
  const end = new Date(`${dateKey}T23:59:59.999Z`);
  return { start, end };
}

function serializeSlot(
  slot: {
    id: string;
    trainingType: string;
    locationName: string;
    startsAt: Date;
    endsAt: Date;
    capacity: number;
    status: string;
    organization: { id: string; name: string };
    unit: { id: string; name: string } | null;
    coach: { id: string; name: string };
    modality: { id: string; name: string } | null;
    bookings: Array<{ id: string; userId: string; status: string }>;
  },
  viewerUserId: string
) {
  const confirmed = slot.bookings.filter((b) => b.status === "CONFIRMED");
  const mine = confirmed.find((b) => b.userId === viewerUserId);
  return {
    id: slot.id,
    trainingType: slot.trainingType,
    locationName: slot.locationName,
    startsAt: slot.startsAt.toISOString(),
    endsAt: slot.endsAt.toISOString(),
    capacity: slot.capacity,
    status: slot.status,
    organization: slot.organization,
    unit: slot.unit,
    coach: slot.coach,
    modality: slot.modality,
    bookingCount: confirmed.length,
    booked: Boolean(mine),
    bookingId: mine?.id ?? null,
    isFull: confirmed.length >= slot.capacity
  };
}

const slotInclude = {
  organization: { select: { id: true, name: true } },
  unit: { select: { id: true, name: true } },
  coach: { select: { id: true, name: true } },
  modality: { select: { id: true, name: true } },
  bookings: { where: { status: "CONFIRMED" as const }, select: { id: true, userId: true, status: true } }
} as const;

const agendaSlotBodySchema = z.object({
  organizationId: z.string().min(1),
  unitId: z.string().optional(),
  coachId: z.string().min(1),
  trainingType: z.string().trim().min(2).max(120),
  locationName: z.string().trim().min(2).max(160),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  capacity: z.number().int().positive().max(500).default(15),
  modalityId: z.string().optional()
});

export async function registerAgendaRoutes(app: FastifyInstance) {
  app.get("/user/agenda/slots", async (request) => {
    const user = await requireAuth(app, request);
    const { date, organizationId } = z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        organizationId: z.string().optional()
      })
      .parse(request.query);

    const { start, end } = dayBoundsUtc(date);

    const links = await prisma.athleteOrganizationLink.findMany({
      where: { athleteId: user.id, status: "ACTIVE", deletedAt: null },
      select: { organizationId: true }
    });
    const orgIds = links.map((l) => l.organizationId);
    const orgFilter =
      organizationId && orgIds.includes(organizationId)
        ? [organizationId]
        : orgIds.length
          ? orgIds
          : undefined;

    const slots = await prisma.agendaSlot.findMany({
      where: {
        deletedAt: null,
        status: "SCHEDULED",
        startsAt: { gte: start, lte: end },
        ...(orgFilter ? { organizationId: { in: orgFilter } } : {})
      },
      include: slotInclude,
      orderBy: { startsAt: "asc" }
    });

    return {
      date,
      slots: slots.map((slot) => serializeSlot(slot, user.id))
    };
  });

  app.get("/user/agenda/my-bookings", async (request) => {
    const user = await requireAuth(app, request);
    const bookings = await prisma.agendaBooking.findMany({
      where: { userId: user.id, status: "CONFIRMED", slot: { deletedAt: null, status: "SCHEDULED" } },
      include: { slot: { include: slotInclude } },
      orderBy: { slot: { startsAt: "asc" } },
      take: 40
    });

    return {
      bookings: bookings.map((row) => ({
        id: row.id,
        slot: serializeSlot(row.slot, user.id)
      }))
    };
  });

  app.post("/user/agenda/bookings", async (request, reply) => {
    const user = await requireAuth(app, request);
    const body = z.object({ slotId: z.string().min(1) }).parse(request.body);

    const slot = await prisma.agendaSlot.findFirst({
      where: { id: body.slotId, deletedAt: null, status: "SCHEDULED" },
      include: {
        bookings: { where: { status: "CONFIRMED" } },
        organization: { select: { name: true } }
      }
    });

    if (!slot) {
      return reply.code(404).send({ message: "Horário não encontrado." });
    }

    if (slot.startsAt.getTime() <= Date.now()) {
      return reply.code(400).send({ message: "Este agendamento já encerrou." });
    }

    const confirmedCount = slot.bookings.length;
    if (confirmedCount >= slot.capacity) {
      return reply.code(409).send({ message: "Capacidade esgotada para este horário." });
    }

    const booking = await prisma.agendaBooking.upsert({
      where: { slotId_userId: { slotId: slot.id, userId: user.id } },
      create: { slotId: slot.id, userId: user.id, status: "CONFIRMED" },
      update: { status: "CONFIRMED" }
    });

    return reply.code(201).send({
      booking,
      confirmation: {
        trainingType: slot.trainingType,
        locationName: slot.locationName,
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
        organizationName: slot.organization.name
      }
    });
  });

  app.delete("/user/agenda/bookings/:bookingId", async (request, reply) => {
    const user = await requireAuth(app, request);
    const { bookingId } = z.object({ bookingId: z.string().min(1) }).parse(request.params);

    const booking = await prisma.agendaBooking.findFirst({
      where: { id: bookingId, userId: user.id, status: "CONFIRMED" }
    });
    if (!booking) {
      return reply.code(404).send({ message: "Reserva não encontrada." });
    }

    await prisma.agendaBooking.update({
      where: { id: booking.id },
      data: { status: "CANCELLED" }
    });

    return reply.code(200).send({ ok: true });
  });

  app.get("/org/organizations/:organizationId/agenda/slots", async (request) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { organizationId } = z.object({ organizationId: z.string().min(1) }).parse(request.params);
    const { date } = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(request.query);
    denyUnlessAllowed(authorize({ ctx, permission: "classes.view", organizationId }));

    const { start, end } = dayBoundsUtc(date);
    const slots = await prisma.agendaSlot.findMany({
      where: {
        organizationId,
        deletedAt: null,
        startsAt: { gte: start, lte: end }
      },
      include: {
        ...slotInclude,
        bookings: {
          where: { status: "CONFIRMED" },
          select: {
            id: true,
            userId: true,
            status: true,
            user: { select: { id: true, name: true, email: true } }
          }
        }
      },
      orderBy: { startsAt: "asc" }
    });

    return { date, slots };
  });

  app.post("/org/agenda/slots", async (request, reply) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const body = agendaSlotBodySchema.parse(request.body);
    denyUnlessAllowed(
      authorize({
        ctx,
        permission: "classes.create",
        organizationId: body.organizationId,
        unitId: body.unitId
      })
    );

    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    if (endsAt <= startsAt) {
      return reply.code(400).send({ message: "Horário final deve ser após o início." });
    }

    const slot = await prisma.agendaSlot.create({
      data: {
        organizationId: body.organizationId,
        unitId: body.unitId,
        coachId: body.coachId,
        createdById: user.id,
        trainingType: body.trainingType,
        locationName: body.locationName,
        startsAt,
        endsAt,
        capacity: body.capacity,
        modalityId: body.modalityId
      },
      include: slotInclude
    });

    await writeAuditLog({
      userId: user.id,
      organizationId: body.organizationId,
      unitId: body.unitId,
      action: "agenda_slot.create",
      resourceType: "agenda_slot",
      resourceId: slot.id,
      newValues: slot,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });

    return reply.code(201).send({ slot });
  });

  app.put("/org/agenda/slots/:slotId", async (request, reply) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { slotId } = z.object({ slotId: z.string().min(1) }).parse(request.params);
    const body = agendaSlotBodySchema.partial().parse(request.body);

    const existing = await prisma.agendaSlot.findFirst({
      where: { id: slotId, deletedAt: null }
    });
    if (!existing) {
      return reply.code(404).send({ message: "Horário não encontrado." });
    }

    denyUnlessAllowed(
      authorize({
        ctx,
        permission: "classes.create",
        organizationId: existing.organizationId,
        unitId: existing.unitId ?? undefined
      })
    );

    const startsAt = body.startsAt ? new Date(body.startsAt) : existing.startsAt;
    const endsAt = body.endsAt ? new Date(body.endsAt) : existing.endsAt;
    if (endsAt <= startsAt) {
      return reply.code(400).send({ message: "Horário final deve ser após o início." });
    }

    const slot = await prisma.agendaSlot.update({
      where: { id: slotId },
      data: {
        unitId: body.unitId ?? existing.unitId,
        coachId: body.coachId ?? existing.coachId,
        trainingType: body.trainingType ?? existing.trainingType,
        locationName: body.locationName ?? existing.locationName,
        startsAt,
        endsAt,
        capacity: body.capacity ?? existing.capacity,
        modalityId: body.modalityId ?? existing.modalityId
      },
      include: slotInclude
    });

    return reply.send({ slot });
  });

  app.delete("/org/agenda/slots/:slotId", async (request, reply) => {
    const user = await requireAuth(app, request);
    const ctx = await loadOrgAuthContext(user);
    const { slotId } = z.object({ slotId: z.string().min(1) }).parse(request.params);

    const existing = await prisma.agendaSlot.findFirst({
      where: { id: slotId, deletedAt: null }
    });
    if (!existing) {
      return reply.code(404).send({ message: "Horário não encontrado." });
    }

    denyUnlessAllowed(
      authorize({
        ctx,
        permission: "classes.create",
        organizationId: existing.organizationId,
        unitId: existing.unitId ?? undefined
      })
    );

    await prisma.agendaSlot.update({
      where: { id: slotId },
      data: { deletedAt: new Date(), status: "CANCELLED" }
    });

    return reply.send({ ok: true });
  });
}
