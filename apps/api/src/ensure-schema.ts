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

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "referral_attribution_status" AS ENUM ('ACTIVE', 'INACTIVE');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "coach_commission_status" AS ENUM ('PENDING', 'AVAILABLE', 'LOCKED', 'PAID', 'REVERSED');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "coach_withdrawal_status" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'REJECTED', 'CANCELED');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "coach_referral_links" (
      "id" TEXT NOT NULL,
      "coach_user_id" TEXT NOT NULL,
      "organization_id" TEXT,
      "slug" TEXT NOT NULL,
      "is_active" BOOLEAN NOT NULL DEFAULT true,
      "click_count" INTEGER NOT NULL DEFAULT 0,
      "signup_count" INTEGER NOT NULL DEFAULT 0,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "coach_referral_links_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "coach_referral_links_slug_key" ON "coach_referral_links"("slug");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "coach_referral_links_coach_user_id_is_active_idx"
      ON "coach_referral_links"("coach_user_id", "is_active");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "user_referral_attributions" (
      "id" TEXT NOT NULL,
      "athlete_user_id" TEXT NOT NULL,
      "coach_user_id" TEXT NOT NULL,
      "referral_link_id" TEXT,
      "organization_id" TEXT,
      "status" "referral_attribution_status" NOT NULL DEFAULT 'ACTIVE',
      "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "user_referral_attributions_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "user_referral_attributions_athlete_user_id_key"
      ON "user_referral_attributions"("athlete_user_id");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "user_referral_attributions_coach_user_id_status_idx"
      ON "user_referral_attributions"("coach_user_id", "status");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "coach_commission_entries" (
      "id" TEXT NOT NULL,
      "coach_user_id" TEXT NOT NULL,
      "athlete_user_id" TEXT NOT NULL,
      "payment_id" TEXT NOT NULL,
      "referral_link_id" TEXT,
      "amount_in_cents" INTEGER NOT NULL,
      "commission_rate" DOUBLE PRECISION NOT NULL,
      "status" "coach_commission_status" NOT NULL DEFAULT 'PENDING',
      "available_at" TIMESTAMP(3),
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "coach_commission_entries_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "coach_commission_entries_payment_id_key"
      ON "coach_commission_entries"("payment_id");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "coach_commission_entries_coach_user_id_status_idx"
      ON "coach_commission_entries"("coach_user_id", "status");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "coach_wallets" (
      "coach_user_id" TEXT NOT NULL,
      "available_in_cents" INTEGER NOT NULL DEFAULT 0,
      "pending_in_cents" INTEGER NOT NULL DEFAULT 0,
      "locked_in_cents" INTEGER NOT NULL DEFAULT 0,
      "withdrawn_in_cents" INTEGER NOT NULL DEFAULT 0,
      "pix_key" TEXT,
      "pix_key_type" TEXT,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "coach_wallets_pkey" PRIMARY KEY ("coach_user_id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "coach_withdrawal_requests" (
      "id" TEXT NOT NULL,
      "coach_user_id" TEXT NOT NULL,
      "amount_in_cents" INTEGER NOT NULL,
      "pix_key" TEXT NOT NULL,
      "pix_key_type" TEXT,
      "status" "coach_withdrawal_status" NOT NULL DEFAULT 'PENDING',
      "admin_note" TEXT,
      "approved_by_id" TEXT,
      "paid_at" TIMESTAMP(3),
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "coach_withdrawal_requests_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "coach_withdrawal_requests_coach_user_id_status_idx"
      ON "coach_withdrawal_requests"("coach_user_id", "status");
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "source_type" "ProgramSourceType" NOT NULL DEFAULT 'PLATFORM';
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "unit_id" TEXT;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "coach_user_id" TEXT;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "created_by_user_id" TEXT;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "workout_blocks" ADD COLUMN IF NOT EXISTS "source_type" "ProgramSourceType" NOT NULL DEFAULT 'PLATFORM';
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "workout_blocks" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "workout_blocks" ADD COLUMN IF NOT EXISTS "unit_id" TEXT;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "workout_blocks" ADD COLUMN IF NOT EXISTS "coach_user_id" TEXT;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "workout_blocks" ADD COLUMN IF NOT EXISTS "created_by_user_id" TEXT;
  `);
}
