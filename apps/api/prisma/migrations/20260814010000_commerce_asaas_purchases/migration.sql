-- AlterTable purchases: Asaas checkout fields for product sales
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "asaas_payment_id" TEXT;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "payment_url" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "purchases_asaas_payment_id_key" ON "purchases"("asaas_payment_id");
