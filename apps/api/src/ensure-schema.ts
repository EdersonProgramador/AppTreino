import { env } from "./env.js";
import { prisma } from "./prisma.js";

/** Garante colunas exigidas pelo Prisma Client quando migrate deploy não rodou no deploy. */
export async function ensureSchemaCompatibility() {
  if (!env.DATABASE_URL) return;

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "asaas_customer_id" TEXT;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "users_asaas_customer_id_key" ON "users"("asaas_customer_id");
  `);
}
