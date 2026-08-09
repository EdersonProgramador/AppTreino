import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { z } from "zod";

for (const envPath of [resolve(process.cwd(), "../../.env"), resolve(process.cwd(), ".env")]) {
  if (existsSync(envPath)) {
    config({ path: envPath, override: false });
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.preprocess((value) => value ?? process.env.PORT, z.coerce.number().default(3333)),
  DATABASE_URL: z.string().optional(),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  JWT_SECRET: z.string().min(16).default("change-me-in-local-development"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  ASAAS_API_KEY: z.string().optional(),
  ASAAS_API_URL: z.string().url().default("https://api-sandbox.asaas.com/v3"),
  ASAAS_WEBHOOK_TOKEN: z.string().optional(),
  ASAAS_CALLBACK_URL: z.string().url().optional(),
  ALLOW_MANUAL_PAYMENT_CONFIRMATION: z.enum(["true", "false"]).default("false")
});

export const env = envSchema.parse(process.env);

if (env.NODE_ENV === "production") {
  if (env.JWT_SECRET === "change-me-in-local-development") {
    throw new Error("JWT_SECRET must be configured in production.");
  }

  if (!env.GOOGLE_CLIENT_ID) {
    throw new Error("GOOGLE_CLIENT_ID must be configured in production.");
  }

  if (env.ASAAS_API_KEY) {
    if (!env.ASAAS_WEBHOOK_TOKEN) {
      throw new Error("ASAAS_WEBHOOK_TOKEN must be configured in production when Asaas is enabled.");
    }

    if (env.ASAAS_API_URL.includes("sandbox")) {
      throw new Error("ASAAS_API_URL must point to the production Asaas API in production.");
    }
  }
}
