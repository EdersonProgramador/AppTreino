ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "net_amount_in_cents" INTEGER;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "provider_fee_in_cents" INTEGER;
