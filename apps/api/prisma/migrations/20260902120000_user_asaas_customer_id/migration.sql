ALTER TABLE "users" ADD COLUMN "asaas_customer_id" TEXT;

CREATE UNIQUE INDEX "users_asaas_customer_id_key" ON "users"("asaas_customer_id");
