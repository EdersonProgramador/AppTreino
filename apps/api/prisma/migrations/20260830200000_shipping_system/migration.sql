-- Shipping system: zones, per-item freight, structured addresses, Melhor Envio metadata

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "allows_pickup" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "allows_delivery" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "shipping_fee_in_cents" INTEGER;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "weight_grams" INTEGER NOT NULL DEFAULT 300;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "length_cm" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "width_cm" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "height_cm" INTEGER NOT NULL DEFAULT 10;

UPDATE "products"
SET
  "allows_pickup" = CASE WHEN "shipping_method" = 'DELIVERY' THEN false ELSE true END,
  "allows_delivery" = CASE WHEN "shipping_method" = 'PICKUP' THEN false WHEN "shipping_method" = 'DIGITAL' THEN false ELSE true END
WHERE "kind" = 'PHYSICAL';

UPDATE "products"
SET "allows_pickup" = false, "allows_delivery" = false
WHERE "kind" = 'DIGITAL';

CREATE TABLE IF NOT EXISTS "shipping_zones" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "state_code" TEXT,
  "postal_from" TEXT,
  "postal_to" TEXT,
  "fee_in_cents" INTEGER NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shipping_zones_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "shipping_zones_is_active_priority_idx" ON "shipping_zones"("is_active", "priority");

ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "fulfillment_method" "shipping_method";
ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "destination_postal_code" TEXT;
ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "destination_street" TEXT;
ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "destination_number" TEXT;
ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "destination_complement" TEXT;
ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "destination_neighborhood" TEXT;
ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "destination_city" TEXT;
ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "destination_state" TEXT;
ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "shipping_carrier" TEXT;
ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "shipping_service_id" TEXT;
ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "shipping_service_name" TEXT;

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "destination_postal_code" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "destination_street" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "destination_number" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "destination_complement" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "destination_neighborhood" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "destination_city" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "destination_state" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_carrier" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_service_id" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_service_name" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_quote_source" TEXT;

ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "shipping_in_cents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "shipping_method" "shipping_method" NOT NULL DEFAULT 'PICKUP';
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "shipping_carrier" TEXT;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "shipping_service_id" TEXT;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "shipping_service_name" TEXT;

ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "shipping_in_cents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "shipping_method" "shipping_method" NOT NULL DEFAULT 'PICKUP';
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "shipping_address" TEXT;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "destination_postal_code" TEXT;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "destination_street" TEXT;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "destination_number" TEXT;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "destination_complement" TEXT;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "destination_neighborhood" TEXT;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "destination_city" TEXT;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "destination_state" TEXT;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "shipping_carrier" TEXT;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "shipping_service_id" TEXT;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "shipping_service_name" TEXT;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "shipping_quote_source" TEXT;
