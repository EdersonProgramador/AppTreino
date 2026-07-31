import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import Fastify from "fastify";
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
  origin: env.WEB_ORIGIN,
  credentials: true
});

await app.register(jwt, {
  secret: env.JWT_SECRET
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
