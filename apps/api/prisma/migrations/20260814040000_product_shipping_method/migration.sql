-- AlterTable
ALTER TABLE "products" ADD COLUMN "shipping_method" "shipping_method" NOT NULL DEFAULT 'PICKUP';

-- Backfill: produtos digitais sempre DIGITAL
UPDATE "products"
SET "shipping_method" = 'DIGITAL'
WHERE "kind" = 'DIGITAL';
