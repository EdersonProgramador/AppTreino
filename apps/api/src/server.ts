import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import staticFiles from "@fastify/static";
import Fastify from "fastify";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { env } from "./env.js";
import { registerAdminRoutes } from "./modules/admin.routes.js";
import { registerAsaasRoutes } from "./modules/asaas.routes.js";
import { registerAuthRoutes } from "./modules/auth.routes.js";
import { registerCheckoutRoutes } from "./modules/checkout.routes.js";
import { registerPublicRoutes } from "./modules/public.routes.js";
import { registerStudentRoutes } from "./modules/student.routes.js";
import { registerUserRoutes } from "./modules/user.routes.js";

const app = Fastify({
  logger: true
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

  const statusCode = "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500;

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

await app.register(jwt, {
  secret: env.JWT_SECRET
});

await app.register(multipart, {
  limits: {
    fileSize: 250 * 1024 * 1024,
    files: 1
  }
});

await app.register(staticFiles, {
  root: uploadsDir,
  prefix: "/uploads/"
});

app.get("/health", async () => ({
  status: "ok",
  service: "app-treino-api"
}));

await registerPublicRoutes(app);
await registerAuthRoutes(app);
await registerCheckoutRoutes(app);
await registerAdminRoutes(app);
await registerUserRoutes(app);
await registerStudentRoutes(app);
await registerAsaasRoutes(app);

try {
  await app.listen({
    port: env.API_PORT,
    host: "0.0.0.0"
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
