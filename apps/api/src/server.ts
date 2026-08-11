import { Prisma } from "@prisma/client";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import Fastify from "fastify";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { env } from "./env.js";
import { prisma } from "./prisma.js";
import { registerAdminRoutes } from "./modules/admin.routes.js";
import { registerAsaasRoutes } from "./modules/asaas.routes.js";
import { registerAuthRoutes } from "./modules/auth.routes.js";
import { registerCheckoutRoutes } from "./modules/checkout.routes.js";
import { registerPublicRoutes } from "./modules/public.routes.js";
import { registerStudentRoutes } from "./modules/student.routes.js";
import { registerUserRoutes } from "./modules/user.routes.js";

const app = Fastify({
  logger: true,
  trustProxy: true
});

console.log("[Env Check] ASAAS_API_KEY present:", Boolean(env.ASAAS_API_KEY));
console.log("[Env Check] ASAAS_API_URL:", env.ASAAS_API_URL);
console.log("[Env Check] WEB_ORIGIN:", env.WEB_ORIGIN);

const uploadsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../uploads");
const allowedOrigins = env.WEB_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

mkdirSync(uploadsDir, { recursive: true });

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.code(400).send({
      message: "Dados invalidos.",
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") {
      return reply.code(404).send({
        message: "Registro não encontrado."
      });
    }

    if (error.code === "P2003") {
      return reply.code(400).send({
        message: "Registro referenciado não existe."
      });
    }

    if (error.code === "P2002") {
      return reply.code(409).send({
        message: "Registro já cadastrado."
      });
    }
  }

  const statusCode = "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500;

  app.log.error({ err: error }, "request error");

  if (statusCode >= 500) {
    return reply.code(statusCode).send({
      message: "Erro interno do servidor."
    });
  }

  return reply.code(statusCode).send({
    message: error.message || "Erro interno do servidor."
  });
});

await app.register(cors, {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Origem nao permitida pelo CORS."), false);
  },
  credentials: true
});

await app.register(rateLimit, {
  max: 300,
  timeWindow: "1 minute",
  errorResponseBuilder: (_request, context) => ({
    statusCode: 429,
    error: "Too Many Requests",
    message: `Muitas requisições. Tente novamente em ${context.after}.`
  })
});

await app.register(jwt, {
  secret: env.JWT_SECRET,
  sign: {
    expiresIn: "7d"
  }
});

await app.register(multipart, {
  limits: {
    fileSize: 250 * 1024 * 1024,
    files: 1
  }
});

await app.register(staticFiles, {
  root: uploadsDir,
  prefix: "/uploads/",
  setHeaders: (response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  }
});

app.get("/health", async (request, reply) => {
  if (!env.DATABASE_URL) {
    return reply.code(200).send({
      status: "ok",
      service: "app-treino-api",
      database: "not_configured"
    });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return reply.code(503).send({
      status: "error",
      service: "app-treino-api",
      database: "unreachable"
    });
  }

  return reply.code(200).send({
    status: "ok",
    service: "app-treino-api",
    database: "ok"
  });
});

await registerPublicRoutes(app);
await registerAuthRoutes(app);
await registerCheckoutRoutes(app);
await registerAdminRoutes(app);
await registerUserRoutes(app);
await registerStudentRoutes(app);
await registerAsaasRoutes(app);

async function shutdown(signal: string) {
  app.log.info({ signal }, "shutting down");
  try {
    await app.close();
    await prisma.$disconnect();
  } catch (error) {
    app.log.error(error);
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.on("unhandledRejection", (reason) => {
  app.log.error({ err: reason }, "unhandledRejection");
});
process.on("uncaughtException", (error) => {
  app.log.error({ err: error }, "uncaughtException");
  void shutdown("uncaughtException");
});

try {
  await app.listen({
    port: env.API_PORT,
    host: "0.0.0.0"
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
