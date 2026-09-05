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

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "coupons" ADD COLUMN IF NOT EXISTS "plan_id" TEXT;
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE "coupons" AS c
    SET "plan_id" = p."id"
    FROM "plans" AS p
    WHERE p."coupon_id" = c."id" AND c."plan_id" IS NULL;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "coupons_plan_id_idx" ON "coupons"("plan_id");
  `);
}
