import type { FastifyInstance } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { homePathForRole, isValidCpf, normalizeCpfDigits, permissionsFor, type UserRole } from "@app-treino/shared";
import { getAuthUser, hashPassword, isAdminStudentPreview, toAuthUser, verifyPassword } from "../auth.js";
import { buildPasswordResetUrl, isDeliverableEmail, sendPasswordResetEmail } from "../email.js";
import { env } from "../env.js";
import { prisma } from "../prisma.js";
import {
  findUserByPhone,
  loginAccountNotFoundMessage,
  loginInvalidPasswordMessage,
  normalizeEmail,
  normalizePhone,
  resolveLoginIdentifierKind
} from "./auth.utils.js";

type AuthProvider = "EMAIL" | "GOOGLE";
type AuthRouteUser = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  passwordHash?: string | null;
  role: UserRole;
  status: "ACTIVE" | "INACTIVE";
  provider?: string | null;
  googleId?: string | null;
};

const loginSchema = z
  .object({
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().min(8).optional().or(z.literal("")),
    password: z.string().min(6).optional(),
    provider: z.enum(["EMAIL", "GOOGLE"]).default("EMAIL")
  })
  .superRefine((data, ctx) => {
    const hasIdentifier = Boolean(data.email || data.phone);

    if (!hasIdentifier) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe um e-mail ou telefone."
      });
    }

    if (data.provider === "EMAIL" && !data.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe uma senha para continuar."
      });
    }
  });

const registerSchema = z
  .object({
    name: z.string().min(2),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().min(8).optional().or(z.literal("")),
    document: z
      .string()
      .trim()
      .min(11, "Informe um CPF valido.")
      .refine((value) => isValidCpf(value), "Informe um CPF valido."),
    password: z.string().min(6).optional(),
    gender: z.enum(["MALE", "FEMALE"], {
      required_error: "Selecione o sexo para continuar."
    }),
    birthDate: z.string().optional().or(z.literal("")),
    objective: z.string().min(3).optional(),
    level: z.string().min(3).optional(),
    daysPerWeek: z.coerce.number().int().min(2).max(7).optional(),
    equipmentTags: z.array(z.string().min(1)).optional(),
    provider: z.enum(["EMAIL", "GOOGLE"]).default("EMAIL"),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: "Aceite os Termos de Uso para continuar." })
    }),
    acceptPrivacy: z.literal(true, {
      errorMap: () => ({ message: "Aceite a Política de Privacidade para continuar." })
    })
  })
  .superRefine((data, ctx) => {
    const hasIdentifier = Boolean(data.email || data.phone);

    if (!hasIdentifier) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe um e-mail ou telefone para criar a conta."
      });
    }

    if (data.provider === "EMAIL" && !data.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe uma senha para continuar."
      });
    }
  });

const googleSchema = z.object({
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  name: z.string().optional().or(z.literal("")),
  gender: z.enum(["MALE", "FEMALE"]).optional().or(z.literal("")),
  idToken: z.string().optional().or(z.literal("")),
  credential: z.string().optional().or(z.literal(""))
});

const forgotPasswordSchema = z
  .object({
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().min(8).optional().or(z.literal(""))
  })
  .superRefine((data, ctx) => {
    if (!data.email && !data.phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe um e-mail ou telefone para recuperação de acesso."
      });
    }
  });

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token de redefinição inválido."),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres.")
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

function todayUtcOnly() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function buildSyntheticEmail(phone: string) {
  return `phone-${phone.replace(/[^a-z0-9]+/gi, "").toLowerCase()}@app-treino.local`;
}

function createPasswordResetToken() {
  const raw = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(raw).digest("hex");

  return { raw, hash };
}

function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function verifyGoogleIdToken(idToken?: string | null) {
  if (!idToken) {
    throw new Error("Credencial do Google não recebida.");
  }

  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, {
    signal: AbortSignal.timeout(5000)
  });

  if (!response.ok) {
    throw new Error("Token do Google inválido.");
  }

  const payload = (await response.json()) as {
    sub?: string;
    aud?: string;
    email?: string;
    email_verified?: string | boolean;
    name?: string;
  };

  if (!env.GOOGLE_CLIENT_ID) {
    throw new Error("GOOGLE_CLIENT_ID não configurado.");
  }

  if (payload.aud !== env.GOOGLE_CLIENT_ID) {
    throw new Error("Token do Google emitido para outro cliente.");
  }

  if (!payload.sub || !payload.email || payload.email_verified === "false" || payload.email_verified === false) {
    throw new Error("Conta Google sem e-mail verificado.");
  }

  return {
    googleId: payload.sub,
    email: normalizeEmail(payload.email),
    name: payload.name?.trim() || "Usuário Google"
  };
}

async function recordDailyAttendance(userId: string, role: UserRole) {
  if (role !== "USER") return;

  try {
    await prisma.attendanceRecord.upsert({
      where: {
        userId_date: {
          userId,
          date: todayUtcOnly()
        }
      },
      create: {
        userId,
        date: todayUtcOnly()
      },
      update: {}
    });
  } catch (error) {
    console.warn("Attendance tracking skipped because the database is unavailable.", error);
  }
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post(
    "/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
    requireDatabase();
    const credentials = loginSchema.parse(request.body);
    const email = normalizeEmail(credentials.email);
    const phone = normalizePhone(credentials.phone);
    const identifierKind = resolveLoginIdentifierKind(email, phone);

    if (credentials.provider !== "EMAIL") {
      return reply.code(400).send({
        message: "Para entrar com o Google, utilize o botão de login do Google."
      });
    }

    const user = email
      ? await prisma.user.findUnique({
          where: { email },
          omit: { passwordHash: false }
        })
      : phone
        ? await findUserByPhone(prisma, phone)
        : null;

    if (!user) {
      return reply.code(401).send({
        message: loginAccountNotFoundMessage(identifierKind)
      });
    }

    if (!user.passwordHash || !(await verifyPassword(credentials.password ?? "", user.passwordHash))) {
      return reply.code(401).send({
        message: loginInvalidPasswordMessage(identifierKind)
      });
    }

    if (user.provider === "GOOGLE") {
      return reply.code(400).send({
        message: "Esta conta usa login com Google. Entre pelo botão do Google."
      });
    }

    if (user.status !== "ACTIVE") {
      return reply.code(403).send({
        message: "Usuário inativo."
      });
    }

    // Heal legacy formatted phones to digits-only after successful login
    if (phone && user.phone && user.phone !== phone) {
      await prisma.user.update({
        where: { id: user.id },
        data: { phone }
      });
    }

    await recordDailyAttendance(user.id, user.role);

    const authUser = toAuthUser(user);
    const token = app.jwt.sign(authUser);

    return reply.send({
      token,
      user: authUser
    });
    }
  );

  app.post(
    "/auth/register",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
    requireDatabase();
    const body = registerSchema.parse(request.body);
    const email = normalizeEmail(body.email);
    const phone = normalizePhone(body.phone);

    if (body.provider !== "EMAIL") {
      return reply.code(400).send({
        message: "Crie a conta do Google pelo botão de login do Google."
      });
    }

    const existingUser = email
      ? await prisma.user.findUnique({ where: { email } })
      : phone
        ? await findUserByPhone(prisma, phone)
        : null;

    if (existingUser) {
      return reply.code(409).send({
        message: "E-mail ou telefone já cadastrado."
      });
    }

    const fallbackEmail = email ?? (phone ? buildSyntheticEmail(phone) : null);

    const birthDate = body.birthDate ? new Date(body.birthDate) : null;
    const consentAt = new Date();

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: fallbackEmail ?? `user-${Date.now()}@app-treino.local`,
        phone,
        passwordHash: await hashPassword(body.password!),
        provider: "EMAIL",
        role: "USER",
        profile: {
          create: {
            phone,
            document: normalizeCpfDigits(body.document),
            gender: body.gender,
            birthDate: birthDate && !Number.isNaN(birthDate.getTime()) ? birthDate : null,
            objective: body.objective ?? null,
            level: body.level ?? null,
            daysPerWeek: body.daysPerWeek ?? null,
            equipmentTags: body.equipmentTags ?? [],
            termsAcceptedAt: consentAt,
            privacyAcceptedAt: consentAt
          }
        }
      }
    });

    await recordDailyAttendance(user.id, user.role);
    const authUser = toAuthUser(user);
    const token = app.jwt.sign(authUser);

    return reply.code(201).send({
      token,
      user: authUser
    });
    }
  );

  app.post(
    "/auth/google",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
    requireDatabase();
    const body = googleSchema.parse(request.body);
    const idToken = body.idToken || body.credential || null;

    if (!idToken) {
      return reply.code(401).send({
        message: "Credencial do Google não recebida. Recarregue a página e tente novamente."
      });
    }

    let googleProfile: { googleId: string; email: string | null; name: string };

    try {
      const profile = await verifyGoogleIdToken(idToken);

      if (!profile) {
        return reply.code(401).send({
          message: "Token do Google inválido."
        });
      }

      googleProfile = profile;
    } catch (error) {
      return reply.code(401).send({
        message: error instanceof Error ? error.message : "Token do Google inválido."
      });
    }

    const email = googleProfile.email;
    const googleId = googleProfile.googleId;
    const phone = normalizePhone(body.phone);

    let user: AuthRouteUser | null =
      (await prisma.user.findUnique({ where: { googleId } })) ??
      (email ? await prisma.user.findUnique({ where: { email } }) : null);

    if (!user) {
      user = await prisma.user.create({
        data: {
          name: googleProfile.name,
          email: email ?? `google-${Date.now()}@app-treino.local`,
          phone,
          passwordHash: null,
          provider: "GOOGLE",
          googleId,
          role: "USER",
          profile: {
            create: {
              phone
            }
          }
        }
      });
    } else if (!user.googleId) {
      // Vincula Google a conta existente sem remover a senha de e-mail.
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          googleId,
          phone: user.phone ?? phone ?? undefined,
          profile: phone
            ? {
                upsert: {
                  create: { phone },
                  update: { phone }
                }
              }
            : undefined
        }
      });
    } else if (user.provider === "GOOGLE") {
      // Remove senhas residuais (ex.: hash legado "google-signin").
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: null,
          phone: user.phone ?? phone ?? undefined
        }
      });
    }

    const authUser = toAuthUser(user);
    const token = app.jwt.sign(authUser);

    return reply.send({
      token,
      user: authUser
    });
    }
  );

  app.post(
    "/auth/forgot-password",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      requireDatabase();
      const body = forgotPasswordSchema.parse(request.body);
      const email = normalizeEmail(body.email);
      const phone = normalizePhone(body.phone);

      const user = email
        ? await prisma.user.findUnique({
            where: { email },
            omit: { passwordHash: false }
          })
        : phone
          ? await findUserByPhone(prisma, phone)
          : null;

      if (
        user &&
        user.status === "ACTIVE" &&
        !user.deletedAt &&
        user.passwordHash &&
        isDeliverableEmail(user.email)
      ) {
        const { raw, hash } = createPasswordResetToken();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

        await prisma.passwordResetToken.deleteMany({
          where: {
            userId: user.id,
            usedAt: null
          }
        });

        await prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hash,
            expiresAt
          }
        });

        try {
          await sendPasswordResetEmail(user.email!, buildPasswordResetUrl(raw), user.name);
        } catch (error) {
          console.error("Failed to send password reset email.", error);
        }
      }

      return reply.send({
        message:
          "Se o e-mail ou telefone estiver cadastrado, você receberá instruções para redefinir sua senha."
      });
    }
  );

  app.post(
    "/auth/reset-password",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      requireDatabase();
      const body = resetPasswordSchema.parse(request.body);
      const tokenHash = hashPasswordResetToken(body.token);

      const resetToken = await prisma.passwordResetToken.findUnique({
        where: { tokenHash },
        include: { user: true }
      });

      if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
        return reply.code(400).send({
          message: "Link de redefinição inválido ou expirado."
        });
      }

      if (resetToken.user.status !== "ACTIVE" || resetToken.user.deletedAt) {
        return reply.code(400).send({
          message: "Link de redefinição inválido ou expirado."
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: resetToken.userId },
          data: {
            passwordHash: await hashPassword(body.password)
          }
        });

        await tx.passwordResetToken.update({
          where: { id: resetToken.id },
          data: {
            usedAt: new Date()
          }
        });

        await tx.passwordResetToken.deleteMany({
          where: {
            userId: resetToken.userId,
            usedAt: null,
            id: {
              not: resetToken.id
            }
          }
        });
      });

      return reply.send({
        message: "Senha redefinida com sucesso. Você já pode entrar com a nova senha."
      });
    }
  );

  app.post("/auth/logout", async () => ({
    ok: true
  }));

  /**
   * ADMIN → sessão temporária como aluno (mesmo userId).
   * Token curto; claims só válidos se o usuário continuar ADMIN no banco.
   */
  app.post(
    "/auth/admin-preview/enter",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      requireDatabase();
      const session = await getAuthUser(app, request);

      if (!session) {
        return reply.code(401).send({ message: "Autenticação obrigatória." });
      }

      if (isAdminStudentPreview(session)) {
        return reply.code(403).send({
          message: "Você já está no modo preview do aluno.",
          code: "ADMIN_PREVIEW_ACTIVE"
        });
      }

      if (session.role !== "ADMIN") {
        return reply.code(403).send({
          message: "Somente administradores podem entrar no modo preview.",
          code: "ADMIN_PREVIEW_FORBIDDEN"
        });
      }

      const dbUser = await prisma.user.findUnique({
        where: { id: session.id },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          deletedAt: true,
          provider: true
        }
      });

      if (!dbUser || dbUser.deletedAt || dbUser.status !== "ACTIVE" || dbUser.role !== "ADMIN") {
        return reply.code(403).send({
          message: "Conta administrativa inválida para preview.",
          code: "ADMIN_PREVIEW_FORBIDDEN"
        });
      }

      const previewUser = {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email ?? dbUser.phone ?? "",
        role: "USER" as const,
        phone: dbUser.phone ?? null,
        provider: dbUser.provider ?? "EMAIL",
        previewMode: true,
        adminId: dbUser.id,
        canReturnToAdmin: true
      };

      const token = app.jwt.sign(previewUser, { expiresIn: "2h" });

      return reply.send({
        token,
        user: previewUser
      });
    }
  );

  /**
   * Sai do preview e restaura sessão ADMIN (mesmo userId).
   * Só aceita token com claims de preview validados em getAuthUser.
   */
  app.post(
    "/auth/admin-preview/exit",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      requireDatabase();
      const session = await getAuthUser(app, request);

      if (!session) {
        return reply.code(401).send({ message: "Autenticação obrigatória." });
      }

      if (!isAdminStudentPreview(session)) {
        return reply.code(403).send({
          message: "Sessão de preview inválida ou expirada.",
          code: "ADMIN_PREVIEW_INVALID"
        });
      }

      const dbUser = await prisma.user.findUnique({
        where: { id: session.adminId ?? session.id },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          deletedAt: true,
          provider: true
        }
      });

      if (!dbUser || dbUser.deletedAt || dbUser.status !== "ACTIVE" || dbUser.role !== "ADMIN") {
        return reply.code(403).send({
          message: "Não foi possível restaurar o painel administrativo.",
          code: "ADMIN_PREVIEW_RESTORE_FAILED"
        });
      }

      if (dbUser.id !== session.id || dbUser.id !== session.adminId) {
        return reply.code(403).send({
          message: "Sessão de preview inconsistente.",
          code: "ADMIN_PREVIEW_INVALID"
        });
      }

      const authUser = toAuthUser(dbUser);
      const token = app.jwt.sign(authUser);

      return reply.send({
        token,
        user: authUser
      });
    }
  );

  app.get("/me", async (request) => {
    const user = await getAuthUser(app, request);

    if (!user) {
      return {
        user: null,
        rbac: null
      };
    }

    await recordDailyAttendance(user.id, user.role);

    return {
      user,
      rbac: {
        role: user.role,
        permissions: permissionsFor(user.role),
        homePath: homePathForRole(user.role),
        previewMode: Boolean(user.previewMode),
        canReturnToAdmin: Boolean(user.canReturnToAdmin)
      }
    };
  });
}
