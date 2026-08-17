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
import { mediaCacheControl } from "./media-optimize.js";
import { registerAdminRoutes } from "./modules/admin.routes.js";
import { registerAsaasRoutes } from "./modules/asaas.routes.js";
import { registerAuthRoutes } from "./modules/auth.routes.js";
import { registerCheckoutRoutes } from "./modules/checkout.routes.js";
import { registerMediaRoutes } from "./modules/media.routes.js";
import { registerPublicRoutes } from "./modules/public.routes.js";
import { registerStudentRoutes } from "./modules/student.routes.js";
import { registerCommerceRoutes } from "./modules/commerce.routes.js";
import { registerMusicRoutes } from "./modules/music.routes.js";
import { registerUserRoutes } from "./modules/user.routes.js";

const app = Fastify({
  logger: true,
  trustProxy: true,
  bodyLimit: 250 * 1024 * 1024
});

console.log("[Env Check] ASAAS_API_KEY present:", Boolean(env.ASAAS_API_KEY));
console.log("[Env Check] ASAAS_API_URL:", env.ASAAS_API_URL);
console.log("[Env Check] WEB_ORIGIN:", env.WEB_ORIGIN);

const uploadsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../uploads");
const allowedOrigins = env.WEB_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function isDevLanOrigin(origin: string) {
  if (env.NODE_ENV === "production") return false;
  try {
    const url = new URL(origin);
    const lan = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(url.hostname);
    const vitePort = url.port === "5173" || url.port === "5174";
    return lan && url.protocol === "http:" && vitePort;
  } catch {
    return false;
  }
}

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
  const isCorsOriginError =
    typeof error.message === "string" && error.message.includes("Origem nao permitida pelo CORS");

  app.log.error({ err: error }, "request error");

  if (isCorsOriginError) {
    return reply.code(403).send({
      message: "Origem nao permitida pelo CORS. Atualize WEB_ORIGIN e reinicie a API."
    });
  }

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
    if (!origin || allowedOrigins.includes(origin) || isDevLanOrigin(origin)) {
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
  // Filenames já são únicos (timestamp + uuid) → cache longo seguro.
  setHeaders: (response, filePath) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    response.setHeader("Cache-Control", mediaCacheControl(true));
    if (/\.(mp4|webm|ogv|mov|mp3|m4a|aac|ogg|wav|flac|opus)$/i.test(filePath)) {
      response.setHeader("Accept-Ranges", "bytes");
    }
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
await registerMediaRoutes(app);
await registerAuthRoutes(app);
await registerCheckoutRoutes(app);
await registerAdminRoutes(app);
await registerUserRoutes(app);
await registerStudentRoutes(app);
await registerMusicRoutes(app);
await registerCommerceRoutes(app);
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
