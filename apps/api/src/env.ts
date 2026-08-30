import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { z } from "zod";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const envCandidates = [
  resolve(moduleDir, "../../../../.env"),
  resolve(moduleDir, "../../../.env"),
  resolve(process.cwd(), "../../.env"),
  resolve(process.cwd(), "../.env"),
  resolve(process.cwd(), ".env")
];

for (const envPath of [...new Set(envCandidates)]) {
  if (existsSync(envPath)) {
    // Carrega todos os .env: o da raiz entra primeiro, o mais próximo (apps/api) sobrescreve chaves repetidas.
    config({ path: envPath, override: true });
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.preprocess((value) => value ?? process.env.PORT, z.coerce.number().default(3333)),
  DATABASE_URL: z.string().optional(),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  PUBLIC_BASE_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(16).default("change-me-in-local-development"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  ASAAS_API_KEY: z.string().optional(),
  ASAAS_API_URL: z.string().url().default("https://api-sandbox.asaas.com/v3"),
  ASAAS_WEBHOOK_TOKEN: z.string().optional(),
  ASAAS_CALLBACK_URL: z.string().url().optional(),
  ALLOW_MANUAL_PAYMENT_CONFIRMATION: z.enum(["true", "false"]).default("false"),
  ENABLE_SANDBOX_CONFIRM: z
    .preprocess((value) => value === "true" || value === "1", z.boolean())
    .default(false),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_PUBLIC_URL: z.string().url().optional(),
  OPENAI_API_KEY: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  LLM_PROVIDER: z.enum(["auto", "openai", "ollama"]).default("auto"),
  OLLAMA_API_KEY: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  OLLAMA_BASE_URL: z.preprocess((value) => (value === "" ? undefined : value), z.string().url().optional()),
  OLLAMA_HOST: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  OLLAMA_MODEL: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  OLLAMA_EMBEDDING_MODEL: z.string().default("nomic-embed-text"),
  MAPBOX_ACCESS_TOKEN: z.preprocess((value) => {
    const direct = typeof value === "string" ? value.trim() : "";
    const fromVite = String(process.env.VITE_MAPBOX_ACCESS_TOKEN ?? "").trim();
    const token = direct || fromVite;
    return token.length ? token : undefined;
  }, z.string().optional()),
  MELHOR_ENVIO_TOKEN: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  MELHOR_ENVIO_SANDBOX: z
    .preprocess((value) => value === "true" || value === "1", z.boolean())
    .default(true)
});

export const env = envSchema.parse(process.env);

const r2Keys = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "R2_PUBLIC_URL"] as const;
const configuredR2 = r2Keys.filter((key) => Boolean(env[key]));
if (configuredR2.length > 0 && configuredR2.length < r2Keys.length) {
  throw new Error(`R2 storage requires all of: ${r2Keys.join(", ")}`);
}

if (env.NODE_ENV === "production") {
  if (env.JWT_SECRET === "change-me-in-local-development") {
    throw new Error("JWT_SECRET must be configured in production.");
  }

  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be configured in production.");
  }

  const origins = env.WEB_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const publicOrigins = origins.filter(
    (origin) => !origin.includes("localhost") && !origin.includes("127.0.0.1")
  );

  if (publicOrigins.length === 0) {
    throw new Error(
      "WEB_ORIGIN must include at least one non-localhost origin in production (e.g. https://edersonprogramador.com)."
    );
  }

  if (!env.PUBLIC_BASE_URL || env.PUBLIC_BASE_URL.includes("localhost")) {
    throw new Error("PUBLIC_BASE_URL must be configured in production (cannot be localhost).");
  }

  if (!env.GOOGLE_CLIENT_ID) {
    throw new Error("GOOGLE_CLIENT_ID must be configured in production.");
  }

  if (env.ASAAS_API_KEY) {
    if (!env.ASAAS_WEBHOOK_TOKEN) {
      throw new Error("ASAAS_WEBHOOK_TOKEN must be configured in production when Asaas is enabled.");
    }

    if (env.ASAAS_API_URL.includes("sandbox") && !env.ENABLE_SANDBOX_CONFIRM) {
      throw new Error(
        "ASAAS_API_URL must point to the production Asaas API in production (or set ENABLE_SANDBOX_CONFIRM=true for staging)."
      );
    }
  } else {
    throw new Error("ASAAS_API_KEY must be configured in production.");
  }
}
