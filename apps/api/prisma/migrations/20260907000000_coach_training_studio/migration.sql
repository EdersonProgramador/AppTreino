-- Coach training studio: org-scoped exercises and workout blocks

ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "source_type" "ProgramSourceType" NOT NULL DEFAULT 'PLATFORM';
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "unit_id" TEXT;
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "coach_user_id" TEXT;
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "created_by_user_id" TEXT;

ALTER TABLE "workout_blocks" ADD COLUMN IF NOT EXISTS "source_type" "ProgramSourceType" NOT NULL DEFAULT 'PLATFORM';
ALTER TABLE "workout_blocks" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "workout_blocks" ADD COLUMN IF NOT EXISTS "unit_id" TEXT;
ALTER TABLE "workout_blocks" ADD COLUMN IF NOT EXISTS "coach_user_id" TEXT;
ALTER TABLE "workout_blocks" ADD COLUMN IF NOT EXISTS "created_by_user_id" TEXT;

CREATE INDEX IF NOT EXISTS "exercises_source_type_organization_id_coach_user_id_idx"
  ON "exercises"("source_type", "organization_id", "coach_user_id");
CREATE INDEX IF NOT EXISTS "workout_blocks_source_type_organization_id_coach_user_id_idx"
  ON "workout_blocks"("source_type", "organization_id", "coach_user_id");

DO $$ BEGIN
  ALTER TABLE "exercises" ADD CONSTRAINT "exercises_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "exercises" ADD CONSTRAINT "exercises_unit_id_fkey"
    FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "workout_blocks" ADD CONSTRAINT "workout_blocks_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "workout_blocks" ADD CONSTRAINT "workout_blocks_unit_id_fkey"
    FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
