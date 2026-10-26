import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { webAppOrigin } from "../web-app-origin.js";
import { authorize } from "./org-auth/authorize.js";
import { loadOrgAuthContext, writeAuditLog } from "./org-auth/context.js";
import { httpOrgError } from "./org-auth/scope.js";
import {
  assertCoachManagedAthleteAccess,
  registerCoachManagedAthlete,
  signCoachAthleteInvite
} from "./coach-athlete.service.js";

function denyUnlessAllowed(result: ReturnType<typeof authorize>) {
  if (result === "DENY") {
    throw httpOrgError(403, "Acesso negado ao recurso organizacional.");
  }
}

const inviteBodySchema = z.object({
  organizationId: z.string().min(1),
  unitId: z.string().min(1)
});

const registerBodySchema = z.object({
  organizationId: z.string().min(1),
  unitId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  gender: z.enum(["MALE", "FEMALE"]),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().min(8).max(20).optional(),
  initialPassword: z.string().min(6).max(72).optional()
});

async function handleCoachAthleteInviteLink(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const user = await requireAuth(app, request);
  const ctx = await loadOrgAuthContext(user);
  const body = inviteBodySchema.parse(request.body);

  denyUnlessAllowed(
    authorize({
      ctx,
      permission: "athletes.create",
      organizationId: body.organizationId,
      unitId: body.unitId
    })
  );

  await assertCoachManagedAthleteAccess(user.id, ctx, body.organizationId);

  const token = signCoachAthleteInvite(app, {
    coachId: user.id,
    organizationId: body.organizationId,
    unitId: body.unitId
  });
  const origin = webAppOrigin();
  const inviteUrl = `${origin}/convite-coach?token=${encodeURIComponent(token)}`;

  return reply.send({
    inviteToken: token,
    inviteUrl,
    expiresInDays: 90
  });
}

async function handleCoachAthleteRegister(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const user = await requireAuth(app, request);
  const ctx = await loadOrgAuthContext(user);
  const body = registerBodySchema.parse(request.body);

  denyUnlessAllowed(
    authorize({
      ctx,
      permission: "athletes.create",
      organizationId: body.organizationId,
      unitId: body.unitId
    })
  );

  const { athlete, link, createdUser } = await registerCoachManagedAthlete({
    coachUserId: user.id,
    ctx,
    organizationId: body.organizationId,
    unitId: body.unitId,
    name: body.name,
    gender: body.gender,
    email: body.email,
    phone: body.phone,
    password: body.initialPassword
  });

  await writeAuditLog({
    userId: user.id,
    organizationId: body.organizationId,
    unitId: body.unitId,
    action: "coach_athlete.register",
    resourceType: "user",
    resourceId: athlete.id,
    newValues: { createdUser, studentAccessProfile: "COACH_MANAGED", linkId: link.id },
    ipAddress: request.ip,
    userAgent: request.headers["user-agent"]
  });

  return reply.code(201).send({
    athlete: {
      id: athlete.id,
      name: athlete.name,
      email: athlete.email,
      phone: athlete.phone,
      studentAccessProfile: "COACH_MANAGED"
    },
    link,
    createdUser,
    managedAccess: true
  });
}

export async function registerCoachAthleteRoutes(app: FastifyInstance) {
  const invitePaths = ["/org/coach-athletes/invite-link", "/coach/managed-athletes/invite-link"] as const;
  for (const path of invitePaths) {
    app.post(path, (request, reply) => handleCoachAthleteInviteLink(app, request, reply));
  }

  const registerPaths = ["/org/coach-athletes/register", "/coach/managed-athletes/register"] as const;
  for (const path of registerPaths) {
    app.post(path, (request, reply) => handleCoachAthleteRegister(app, request, reply));
  }
}
