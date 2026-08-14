-- CreateEnum
CREATE TYPE "product_kind" AS ENUM ('PHYSICAL', 'DIGITAL');

-- AlterEnum
ALTER TYPE "purchase_status" ADD VALUE IF NOT EXISTS 'READY';
ALTER TYPE "purchase_status" ADD VALUE IF NOT EXISTS 'DELIVERED';

-- AlterTable products
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "kind" "product_kind" NOT NULL DEFAULT 'PHYSICAL';
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "stock" INTEGER;

-- AlterTable purchases
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "quantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "fulfilled_at" TIMESTAMP(3);

-- Indexes for order ops
CREATE INDEX IF NOT EXISTS "purchases_user_id_status_idx" ON "purchases"("user_id", "status");
CREATE INDEX IF NOT EXISTS "purchases_product_id_status_idx" ON "purchases"("product_id", "status");
