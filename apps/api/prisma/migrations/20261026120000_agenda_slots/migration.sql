DO $$ BEGIN
  CREATE TYPE "agenda_slot_status" AS ENUM ('SCHEDULED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "agenda_booking_status" AS ENUM ('CONFIRMED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "agenda_slots" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "unit_id" TEXT,
  "coach_id" TEXT NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "training_type" TEXT NOT NULL,
  "location_name" TEXT NOT NULL,
  "starts_at" TIMESTAMP(3) NOT NULL,
  "ends_at" TIMESTAMP(3) NOT NULL,
  "capacity" INTEGER NOT NULL DEFAULT 15,
  "status" "agenda_slot_status" NOT NULL DEFAULT 'SCHEDULED',
  "modality_id" TEXT,
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agenda_slots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "agenda_bookings" (
  "id" TEXT NOT NULL,
  "slot_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "status" "agenda_booking_status" NOT NULL DEFAULT 'CONFIRMED',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agenda_bookings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "agenda_bookings_slot_id_user_id_key" ON "agenda_bookings"("slot_id", "user_id");
CREATE INDEX IF NOT EXISTS "agenda_slots_organization_id_starts_at_status_idx" ON "agenda_slots"("organization_id", "starts_at", "status");
CREATE INDEX IF NOT EXISTS "agenda_slots_coach_id_starts_at_idx" ON "agenda_slots"("coach_id", "starts_at");
CREATE INDEX IF NOT EXISTS "agenda_bookings_user_id_status_idx" ON "agenda_bookings"("user_id", "status");
