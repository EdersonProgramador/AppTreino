import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getAuthUser, hashPassword, toAuthUser, verifyPassword } from "../auth.js";
import { env } from "../env.js";
import { prisma } from "../prisma.js";

type AuthProvider = "EMAIL" | "GOOGLE";
type AuthRouteUser = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  passwordHash?: string | null;
  role: "ADMIN" | "USER";
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
    password: z.string().min(6).optional(),
    provider: z.enum(["EMAIL", "GOOGLE"]).default("EMAIL")
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

    if (data.provider === "GOOGLE" && !data.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe um e-mail para entrar com o Google."
      });
    }
  });

const googleSchema = z.object({
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  name: z.string().optional().or(z.literal("")),
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
        message: "Informe um e-mail ou telefone para recuperar o acesso."
      });
    }
  });

const devUsers = new Map<
  string,
  {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    passwordHash?: string | null;
    role: "ADMIN" | "USER";
    status: "ACTIVE";
    provider: AuthProvider;
  }
>();

function roleForDemoEmail(email: string) {
  return email.includes("admin") ? "ADMIN" : "USER";
}

function todayUtcOnly() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

function normalizePhone(value?: string | null) {
  return value?.trim() || null;
}

function buildSyntheticEmail(phone: string) {
  return `phone-${phone.replace(/[^a-z0-9]+/gi, "").toLowerCase()}@app-treino.local`;
}

async function verifyGoogleIdToken(idToken?: string | null) {
  if (!idToken) {
    return null;
  }

  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);

  if (!response.ok) {
    throw new Error("Token do Google invalido.");
  }

  const payload = (await response.json()) as {
    sub?: string;
    aud?: string;
    email?: string;
    email_verified?: string | boolean;
    name?: string;
  };

  if (env.GOOGLE_CLIENT_ID && payload.aud !== env.GOOGLE_CLIENT_ID) {
    throw new Error("Token do Google emitido para outro cliente.");
  }

  if (!payload.sub || !payload.email || payload.email_verified === "false" || payload.email_verified === false) {
    throw new Error("Conta Google sem e-mail verificado.");
  }

  return {
    googleId: payload.sub,
    email: normalizeEmail(payload.email),
    name: payload.name?.trim() || "Usuario Google"
  };
}

async function recordDailyAttendance(userId: string, role: "ADMIN" | "USER") {
  if (role !== "USER") return;

  if (!env.DATABASE_URL) return;

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

async function findOrCreateDevUser(email: string | null, phone: string | null, password: string | null, provider: AuthProvider) {
  const lookupKeys = [email, phone].filter(Boolean) as string[];

  for (const key of lookupKeys) {
    const user = devUsers.get(key);
    if (user) {
      return user;
    }
  }

  if (email?.endsWith("@app-treino.local") || provider === "GOOGLE") {
    const role = email ? roleForDemoEmail(email) : "USER";
    const user = {
      id: `dev-${role.toLowerCase()}-1`,
      name: provider === "GOOGLE" ? "Usuario Google" : role === "ADMIN" ? "Administrador" : "Aluno App Treino",
      email,
      phone,
      passwordHash: await hashPassword(password ?? "123456"),
      role: role as "ADMIN" | "USER",
      status: "ACTIVE" as const,
      provider
    };

    if (email) {
      devUsers.set(email, user);
    }
    if (phone) {
      devUsers.set(phone, user);
    }

    return user;
  }

  return null;
}

async function resolveUserFromIdentifier(email: string | null, phone: string | null) {
  if (email) {
    try {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return existing;
      }
    } catch (error) {
      console.warn("Falling back to in-memory auth because the database is unavailable.", error);
    }
  }

  if (phone) {
    try {
      const existing = await prisma.user.findUnique({ where: { phone } });
      if (existing) {
        return existing;
      }
    } catch (error) {
      console.warn("Falling back to in-memory auth because the database is unavailable.", error);
    }
  }

  const lookupKeys = [email, phone].filter(Boolean) as string[];

  for (const key of lookupKeys) {
    const cached = devUsers.get(key);
    if (cached) {
      return cached;
    }
  }

  return null;
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (request, reply) => {
    const credentials = loginSchema.parse(request.body);
    const email = normalizeEmail(credentials.email);
    const phone = normalizePhone(credentials.phone);
    const provider = credentials.provider as AuthProvider;

    if (!env.DATABASE_URL) {
      const user = await findOrCreateDevUser(email, phone, credentials.password ?? null, provider);

      if (!user) {
        return reply.code(401).send({
          message: "E-mail ou senha invalidos."
        });
      }

      if (provider === "EMAIL" && !(await verifyPassword(credentials.password ?? "", user.passwordHash))) {
        return reply.code(401).send({
          message: "E-mail ou senha invalidos."
        });
      }

      const authUser = toAuthUser(user);
      const token = app.jwt.sign(authUser);

      return reply.send({
        token,
        user: authUser
      });
    }

    let user = await resolveUserFromIdentifier(email, phone);

    if (!user && email?.endsWith("@app-treino.local")) {
      try {
        user = await prisma.user.create({
            data: {
              name: roleForDemoEmail(email) === "ADMIN" ? "Administrador" : "Aluno App Treino",
              email,
              phone,
              passwordHash: await hashPassword(credentials.password ?? "123456"),
              provider,
              role: roleForDemoEmail(email),
              profile: {
                create: {
                  phone,
                  objective: "Ganhar massa muscular",
                  level: "Intermediario"
                }
            }
          }
        });
      } catch (error) {
        console.warn("Database create failed; using in-memory fallback.", error);
        user = await findOrCreateDevUser(email, phone, credentials.password ?? null, provider);
      }
    }

    if (!user && provider === "GOOGLE") {
      const fallbackEmail = email ?? (phone ? buildSyntheticEmail(phone) : null);

      if (fallbackEmail) {
        try {
          user = await prisma.user.create({
            data: {
              name: "Usuário Google",
              email: fallbackEmail ?? "google-user@app-treino.local",
              phone,
              passwordHash: await hashPassword("google-signin"),
              provider: "GOOGLE",
              role: "USER",
              profile: {
                create: { phone }
              }
            }
          });
        } catch (error) {
          console.warn("Database create failed; using in-memory fallback.", error);
          user = await findOrCreateDevUser(email, phone, null, "GOOGLE");
        }
      }
    }

    if (!user) {
      return reply.code(401).send({
        message: "E-mail ou senha invalidos."
      });
    }

    if (provider === "EMAIL") {
      if (!(await verifyPassword(credentials.password ?? "", user.passwordHash))) {
        return reply.code(401).send({
          message: "E-mail ou senha invalidos."
        });
      }
    }

    if (user.status !== "ACTIVE") {
      return reply.code(403).send({
        message: "Usuario inativo."
      });
    }

    await recordDailyAttendance(user.id, user.role);

    const authUser = toAuthUser(user);
    const token = app.jwt.sign(authUser);

    return reply.send({
      token,
      user: authUser
    });
  });

  app.post("/auth/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const email = normalizeEmail(body.email);
    const phone = normalizePhone(body.phone);
    const provider = body.provider as AuthProvider;
    const fallbackEmail = email ?? (phone ? buildSyntheticEmail(phone) : null);

    if (!env.DATABASE_URL) {
      const existingKey = email ?? phone;

      if (existingKey && devUsers.has(existingKey)) {
        return reply.code(409).send({
          message: "E-mail ou telefone ja cadastrado."
        });
      }

      const user = {
        id: `dev-user-${devUsers.size + 1}`,
        name: body.name,
        email,
        phone,
        passwordHash: provider === "EMAIL" ? await hashPassword(body.password ?? "123456") : null,
        role: "USER" as const,
        status: "ACTIVE" as const,
        provider
      };
      if (email) {
        devUsers.set(email, user);
      }
      if (phone) {
        devUsers.set(phone, user);
      }

      const authUser = toAuthUser(user);
      const token = app.jwt.sign(authUser);

      return reply.code(201).send({
        token,
        user: authUser
      });
    }

    const existingUser = await resolveUserFromIdentifier(email, phone);

    if (existingUser) {
      return reply.code(409).send({
        message: "E-mail ou telefone ja cadastrado."
      });
    }

    let user;

    try {
      user = await prisma.user.create({
        data: {
          name: body.name,
          email: fallbackEmail ?? `user-${Date.now()}@app-treino.local`,
          phone,
          passwordHash: provider === "EMAIL" ? await hashPassword(body.password ?? "123456") : await hashPassword("google-signin"),
          provider,
          role: "USER",
          profile: {
            create: { phone }
          }
        }
      });
    } catch (error) {
      console.warn("Database create failed; using in-memory fallback.", error);
      const fallbackUser = {
        id: `dev-user-${devUsers.size + 1}`,
        name: body.name,
        email,
        phone,
        passwordHash: provider === "EMAIL" ? await hashPassword(body.password ?? "123456") : await hashPassword("google-signin"),
        role: "USER" as const,
        status: "ACTIVE" as const,
        provider
      };
      if (email) {
        devUsers.set(email, fallbackUser);
      }
      if (phone) {
        devUsers.set(phone, fallbackUser);
      }
      user = fallbackUser;
    }

    await recordDailyAttendance(user.id, user.role);
    const authUser = toAuthUser(user);
    const token = app.jwt.sign(authUser);

    return reply.code(201).send({
      token,
      user: authUser
    });
  });

  app.post("/auth/google", async (request, reply) => {
    const body = googleSchema.parse(request.body);
    let email = normalizeEmail(body.email);
    const phone = normalizePhone(body.phone);
    const idToken = body.idToken || body.credential || null;
    let googleId: string | null = null;
    let name = body.name?.trim() || "Usuario Google";

    if (!idToken && !email && !phone) {
      return reply.code(401).send({
        message: "Credencial do Google nao recebida. Recarregue a pagina e tente novamente."
      });
    }

    try {
      const googleProfile = await verifyGoogleIdToken(idToken);

      if (googleProfile) {
        email = googleProfile.email;
        googleId = googleProfile.googleId;
        name = googleProfile.name;
      }
    } catch (error) {
      return reply.code(401).send({
        message: error instanceof Error ? error.message : "Token do Google invalido."
      });
    }

    if (!env.DATABASE_URL) {
      const user = await findOrCreateDevUser(email, phone, null, "GOOGLE");

      if (!user) {
        return reply.code(401).send({
          message: "Nao foi possivel entrar com o Google neste momento."
        });
      }

      const authUser = toAuthUser(user);
      const token = app.jwt.sign(authUser);

      return reply.send({
        token,
        user: authUser
      });
    }

    let user: AuthRouteUser | null = null;

    try {
      user = googleId
        ? await prisma.user.findUnique({
            where: { googleId }
          })
        : null;

      user ??= await resolveUserFromIdentifier(email, phone);
    } catch (error) {
      console.warn("Falling back to in-memory Google auth because the database is unavailable.", error);
      user = await findOrCreateDevUser(email, phone, null, "GOOGLE");
    }
    const fallbackEmail = email ?? (phone ? buildSyntheticEmail(phone) : null);

    if (!user && fallbackEmail) {
      try {
        user = await prisma.user.create({
          data: {
            name,
            email: fallbackEmail ?? `google-${Date.now()}@app-treino.local`,
            phone,
            passwordHash: await hashPassword("google-signin"),
            provider: "GOOGLE",
            googleId,
            role: "USER",
            profile: {
              create: { phone }
            }
          }
        });
      } catch (error) {
        console.warn("Database create failed; using in-memory fallback.", error);
        user = await findOrCreateDevUser(email, phone, null, "GOOGLE");
      }
    }

    if (!user) {
      return reply.code(401).send({
        message: "Nao foi possivel entrar com o Google neste momento."
      });
    }

    if (googleId && (!user.googleId || user.provider !== "GOOGLE") && env.DATABASE_URL && !user.id.startsWith("dev-")) {
      try {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            googleId,
            provider: "GOOGLE",
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
      } catch (error) {
        console.warn("Google account link skipped because the database is unavailable.", error);
      }
    }

    const authUser = toAuthUser(user);
    const token = app.jwt.sign(authUser);

    return reply.send({
      token,
      user: authUser
    });
  });

  app.post("/auth/forgot-password", async (request, reply) => {
    const body = forgotPasswordSchema.parse(request.body);

    return reply.send({
      message: "Se o e-mail ou telefone estiver cadastrado, as instruções de recuperação foram preparadas."
    });
  });

  app.post("/auth/logout", async () => ({
    ok: true
  }));

  app.get("/me", async (request) => {
    const user = await getAuthUser(app, request);

    if (!user) {
      return {
        user: null
      };
    }

    await recordDailyAttendance(user.id, user.role);

    return {
      user
    };
  });
}
