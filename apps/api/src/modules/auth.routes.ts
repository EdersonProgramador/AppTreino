import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getAuthUser, hashPassword, toAuthUser, verifyPassword } from "../auth.js";
import { env } from "../env.js";
import { prisma } from "../prisma.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const registerSchema = loginSchema.extend({
  name: z.string().min(2)
});

const devUsers = new Map<
  string,
  {
    id: string;
    name: string;
    email: string;
    passwordHash: string;
    role: "ADMIN" | "USER";
    status: "ACTIVE";
  }
>();

function roleForDemoEmail(email: string) {
  return email.includes("admin") ? "ADMIN" : "USER";
}

function todayUtcOnly() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function recordDailyAttendance(userId: string, role: "ADMIN" | "USER") {
  if (!env.DATABASE_URL || role !== "USER") return;

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
}

async function findOrCreateDevUser(email: string, password: string) {
  let user = devUsers.get(email);

  if (!user && email.endsWith("@app-treino.local")) {
    const role = roleForDemoEmail(email);
    user = {
      id: `dev-${role.toLowerCase()}-1`,
      name: role === "ADMIN" ? "Administrador" : "Aluno App Treino",
      email,
      passwordHash: await hashPassword(password),
      role,
      status: "ACTIVE"
    };
    devUsers.set(email, user);
  }

  return user;
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (request, reply) => {
    const credentials = loginSchema.parse(request.body);
    const email = credentials.email.toLowerCase();

    if (!env.DATABASE_URL) {
      const user = await findOrCreateDevUser(email, credentials.password);

      if (!user || !(await verifyPassword(credentials.password, user.passwordHash))) {
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

    let user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user && email.endsWith("@app-treino.local")) {
      user = await prisma.user.create({
        data: {
          name: roleForDemoEmail(email) === "ADMIN" ? "Administrador" : "Aluno App Treino",
          email,
          passwordHash: await hashPassword(credentials.password),
          role: roleForDemoEmail(email),
          profile: {
            create: {
              objective: "Ganhar massa muscular",
              level: "Intermediario"
            }
          }
        }
      });
    }

    if (!user || !(await verifyPassword(credentials.password, user.passwordHash))) {
      return reply.code(401).send({
        message: "E-mail ou senha invalidos."
      });
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
    const email = body.email.toLowerCase();

    if (!env.DATABASE_URL) {
      if (devUsers.has(email)) {
        return reply.code(409).send({
          message: "E-mail ja cadastrado."
        });
      }

      const user = {
        id: `dev-user-${devUsers.size + 1}`,
        name: body.name,
        email,
        passwordHash: await hashPassword(body.password),
        role: "USER" as const,
        status: "ACTIVE" as const
      };
      devUsers.set(email, user);

      const authUser = toAuthUser(user);
      const token = app.jwt.sign(authUser);

      return reply.code(201).send({
        token,
        user: authUser
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return reply.code(409).send({
        message: "E-mail ja cadastrado."
      });
    }

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email,
        passwordHash: await hashPassword(body.password),
        role: "USER",
        profile: {
          create: {}
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
