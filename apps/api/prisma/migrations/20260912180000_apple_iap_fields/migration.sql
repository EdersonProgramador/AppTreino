-- Apple IAP / App Store compliance fields
DO $$ BEGIN
  CREATE TYPE "payment_provider" AS ENUM ('ASAAS', 'APPLE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "apple_product_id" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "plans_apple_product_id_key" ON "plans"("apple_product_id");

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "payment_provider" "payment_provider" NOT NULL DEFAULT 'ASAAS';
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "apple_transaction_id" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "apple_original_transaction_id" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "payments_apple_transaction_id_key" ON "payments"("apple_transaction_id");
