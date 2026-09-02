ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "asaas_customer_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "users_asaas_customer_id_key" ON "users"("asaas_customer_id");
