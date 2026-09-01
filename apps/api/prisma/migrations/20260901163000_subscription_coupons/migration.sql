-- Subscription coupon support
CREATE TYPE "coupon_scope" AS ENUM ('STORE', 'SUBSCRIPTION', 'ALL');

ALTER TABLE "coupons" ADD COLUMN "scope" "coupon_scope" NOT NULL DEFAULT 'STORE';

ALTER TABLE "plans" ADD COLUMN "coupon_id" TEXT;
ALTER TABLE "plans" ADD CONSTRAINT "plans_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payments" ADD COLUMN "original_amount_in_cents" INTEGER;
ALTER TABLE "payments" ADD COLUMN "discount_in_cents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payments" ADD COLUMN "coupon_id" TEXT;
ALTER TABLE "payments" ADD COLUMN "coupon_code" TEXT;
ALTER TABLE "payments" ADD CONSTRAINT "payments_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
