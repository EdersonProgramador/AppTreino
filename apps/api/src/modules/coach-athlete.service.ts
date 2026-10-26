import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { hashPassword } from "../auth.js";
import { prisma } from "../prisma.js";
import { hasActiveStudentSubscription } from "./coach-eligibility.js";
import { userHasCoachProAnnualPlan } from "./coach-pro-plan.service.js";
import { httpOrgError } from "./org-auth/scope.js";
import { env } from "../env.js";
import { loadOrgAuthContext } from "./org-auth/context.js";
import type { OrgAuthContext } from "./org-auth/authorize.js";
import type { AuthTokenPayload } from "../auth.js";

export const COACH_ATHLETE_INVITE_PURPOSE = "coach_athlete_invite";
const INVITE_TTL = "90d";

export type CoachAthleteInvitePayload = {
  purpose: typeof COACH_ATHLETE_INVITE_PURPOSE;
  coachId: string;
  organizationId: string;
  unitId: string;
};

export async function coachCanRegisterAthletes(coachUserId: string) {
  return (await userHasCoachProAnnualPlan(coachUserId)) || (await hasActiveStudentSubscription(coachUserId));
}

export async function assertCoachCanRegisterAthletes(coachUserId: string) {
  const ok = await coachCanRegisterAthletes(coachUserId);
  if (!ok) {
    throw httpOrgError(402, "Assine o plano Coach ATLLY Profissional (R$ 1.300/ano) para cadastrar alunos.");
  }
}

export async function assertCoachManagedAthleteAccess(
  coachUserId: string,
  ctx: OrgAuthContext,
  organizationId: string
) {
  if (ctx.isPlatformAdmin || ctx.isPlatformOperator) {
    return;
  }

  const activeInOrg = ctx.memberships.some(
    (member) => member.organizationId === organizationId && member.status === "ACTIVE"
  );
  if (!activeInOrg) {
    throw httpOrgError(403, "Sem permissão para cadastrar alunos nesta organização.");
  }

  if (await coachCanRegisterAthletes(coachUserId)) {
    return;
  }

  const isCoachInOrg = ctx.memberships.some(
    (member) =>
      member.organizationId === organizationId && member.role === "COACH" && member.status === "ACTIVE"
  );
  if (env.NODE_ENV === "development" && isCoachInOrg) {
    return;
  }

  throw httpOrgError(402, "Assine o plano Coach ATLLY Profissional (R$ 1.300/ano) para cadastrar alunos.");
}

export function signCoachAthleteInvite(app: FastifyInstance, payload: Omit<CoachAthleteInvitePayload, "purpose">) {
  return app.jwt.sign(
    {
      purpose: COACH_ATHLETE_INVITE_PURPOSE,
      coachId: payload.coachId,
      organizationId: payload.organizationId,
      unitId: payload.unitId
    },
    { expiresIn: INVITE_TTL }
  );
}

export function verifyCoachAthleteInvite(app: FastifyInstance, token: string): CoachAthleteInvitePayload {
  let decoded: CoachAthleteInvitePayload;
  try {
    decoded = app.jwt.verify<CoachAthleteInvitePayload>(token);
  } catch {
    throw httpOrgError(400, "Convite inválido ou expirado.");
  }
  if (decoded.purpose !== COACH_ATHLETE_INVITE_PURPOSE) {
    throw httpOrgError(400, "Convite inválido.");
  }
  if (!decoded.coachId || !decoded.organizationId || !decoded.unitId) {
    throw httpOrgError(400, "Convite incompleto.");
  }
  return decoded;
}

export async function loadCoachAthleteInviteContext(app: FastifyInstance, token: string) {
  const payload = verifyCoachAthleteInvite(app, token);
  const [coach, organization, unit] = await Promise.all([
    prisma.user.findFirst({
      where: { id: payload.coachId, deletedAt: null, status: "ACTIVE" },
      select: { id: true, name: true }
    }),
    prisma.organization.findFirst({
      where: { id: payload.organizationId, deletedAt: null },
      select: { id: true, name: true }
    }),
    prisma.unit.findFirst({
      where: { id: payload.unitId, deletedAt: null, organizationId: payload.organizationId },
      select: { id: true, name: true }
    })
  ]);

  if (!coach || !organization || !unit) {
    throw httpOrgError(404, "Convite expirado ou organização indisponível.");
  }

  const coachCanInvite = await coachCanRegisterAthletes(coach.id);
  if (!coachCanInvite) {
    throw httpOrgError(403, "Este convite não está mais ativo.");
  }

  return { payload, coach, organization, unit };
}

export async function linkAthleteToCoachOperation(input: {
  coachUserId: string;
  athleteId: string;
  organizationId: string;
  unitId: string;
  ctx: OrgAuthContext;
}) {
  const link = await prisma.athleteOrganizationLink.upsert({
    where: {
      athleteId_organizationId_unitId: {
        athleteId: input.athleteId,
        organizationId: input.organizationId,
        unitId: input.unitId
      }
    },
    create: {
      athleteId: input.athleteId,
      organizationId: input.organizationId,
      unitId: input.unitId,
      status: "ACTIVE"
    },
    update: { status: "ACTIVE", deletedAt: null, endedAt: null }
  });

  const coachMember = input.ctx.memberships.find(
    (item) => item.organizationId === input.organizationId && item.role === "COACH" && item.status === "ACTIVE"
  );
  if (coachMember) {
    const existingAssignment = await prisma.professionalAssignment.findFirst({
      where: {
        organizationId: input.organizationId,
        unitId: input.unitId,
        professionalId: input.coachUserId,
        athleteId: input.athleteId,
        professionalType: "COACH",
        deletedAt: null
      },
      select: { id: true }
    });
    if (existingAssignment) {
      await prisma.professionalAssignment.update({
        where: { id: existingAssignment.id },
        data: { status: "ACTIVE", deletedAt: null, isPrimary: true }
      });
    } else {
      await prisma.professionalAssignment.create({
        data: {
          organizationId: input.organizationId,
          unitId: input.unitId,
          professionalId: input.coachUserId,
          athleteId: input.athleteId,
          professionalType: "COACH",
          status: "ACTIVE",
          isPrimary: true
        }
      });
    }
  }

  return link;
}

export async function registerCoachManagedAthlete(input: {
  coachUserId: string;
  ctx: OrgAuthContext;
  organizationId: string;
  unitId: string;
  name: string;
  gender: "MALE" | "FEMALE";
  email?: string;
  phone?: string;
  password?: string;
}) {
  const gender = input.gender;
  await assertCoachManagedAthleteAccess(input.coachUserId, input.ctx, input.organizationId);

  const email = input.email?.toLowerCase();
  let athlete = email
    ? await prisma.user.findUnique({ where: { email } })
    : input.phone
      ? await prisma.user.findUnique({ where: { phone: input.phone } })
      : null;

  let createdUser = false;
  if (!athlete) {
    if (!email && !input.phone) {
      throw httpOrgError(400, "Informe e-mail ou telefone para cadastrar o aluno.");
    }
    const password = input.password?.trim();
    if (!password || password.length < 6) {
      throw httpOrgError(400, "Defina uma senha inicial com pelo menos 6 caracteres.");
    }
    athlete = await prisma.user.create({
      data: {
        name: input.name,
        email: email ?? null,
        phone: input.phone ?? null,
        passwordHash: await hashPassword(password),
        provider: "EMAIL",
        role: "USER",
        status: "ACTIVE",
        enrollmentStatus: "ACTIVE",
        studentAccessProfile: "COACH_MANAGED",
        profile: {
          create: {
            phone: input.phone ?? null,
            gender
          }
        }
      }
    });
    createdUser = true;
  } else if (athlete.role !== "USER") {
    throw httpOrgError(400, "Este e-mail/telefone pertence a uma conta que não é de aluno.");
  } else {
    const password = input.password?.trim();
    athlete = await prisma.user.update({
      where: { id: athlete.id },
      data: {
        name: input.name,
        enrollmentStatus: "ACTIVE",
        studentAccessProfile: "COACH_MANAGED",
        ...(password && password.length >= 6 ? { passwordHash: await hashPassword(password) } : {}),
        profile: {
          upsert: {
            create: { phone: input.phone ?? null, gender },
            update: { gender, ...(input.phone ? { phone: input.phone } : {}) }
          }
        }
      }
    });
  }

  const link = await linkAthleteToCoachOperation({
    coachUserId: input.coachUserId,
    athleteId: athlete.id,
    organizationId: input.organizationId,
    unitId: input.unitId,
    ctx: input.ctx
  });

  return { athlete, link, createdUser };
}

export async function registerCoachAthleteViaInvite(input: {
  app: FastifyInstance;
  inviteToken: string;
  name: string;
  gender: "MALE" | "FEMALE";
  email?: string;
  phone?: string;
  password: string;
  consentAt: Date;
}) {
  const invite = await loadCoachAthleteInviteContext(input.app, input.inviteToken);
  const coachAccount = await prisma.user.findUniqueOrThrow({
    where: { id: invite.payload.coachId },
    select: { id: true, name: true, email: true, role: true, phone: true, provider: true }
  });
  const ctx = await loadOrgAuthContext(coachAccount as AuthTokenPayload);

  const email = input.email?.toLowerCase();
  const existing = email
    ? await prisma.user.findUnique({ where: { email } })
    : input.phone
      ? await prisma.user.findUnique({ where: { phone: input.phone } })
      : null;

  if (existing) {
    throw httpOrgError(409, "E-mail ou telefone já cadastrado. Entre com sua senha ou use outro contato.");
  }

  if (!email && !input.phone) {
    throw httpOrgError(400, "Informe e-mail ou telefone.");
  }

  const athlete = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email: email ?? null,
      phone: input.phone ?? null,
      passwordHash: await hashPassword(input.password),
      provider: "EMAIL",
      role: "USER",
      status: "ACTIVE",
      enrollmentStatus: "ACTIVE",
      studentAccessProfile: "COACH_MANAGED",
      profile: {
        create: {
          phone: input.phone ?? null,
          gender: input.gender,
          termsAcceptedAt: input.consentAt,
          privacyAcceptedAt: input.consentAt
        }
      }
    }
  });

  await linkAthleteToCoachOperation({
    coachUserId: invite.payload.coachId,
    athleteId: athlete.id,
    organizationId: invite.payload.organizationId,
    unitId: invite.payload.unitId,
    ctx
  });

  return { athlete, coach: invite.coach, organization: invite.organization };
}
