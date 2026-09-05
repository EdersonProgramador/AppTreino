-- Allow multiple subscription coupons per plan
ALTER TABLE "coupons" ADD COLUMN "plan_id" TEXT;

UPDATE "coupons" AS c
SET "plan_id" = p."id"
FROM "plans" AS p
WHERE p."coupon_id" = c."id";

ALTER TABLE "coupons"
  ADD CONSTRAINT "coupons_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "plans"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "coupons_plan_id_idx" ON "coupons"("plan_id");
