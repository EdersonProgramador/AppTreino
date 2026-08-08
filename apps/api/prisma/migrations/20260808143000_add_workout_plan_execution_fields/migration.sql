ALTER TABLE "programs"
  ADD COLUMN "duration_years" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "duration_months" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "duration_weeks" INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN "duration_days" INTEGER NOT NULL DEFAULT 28;

ALTER TABLE "workout_blocks"
  ADD COLUMN "identifier" TEXT,
  ADD COLUMN "focus" TEXT,
  ADD COLUMN "weekly_frequency" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "workout_block_exercises"
  ADD COLUMN "initial_load" TEXT,
  ADD COLUMN "rest_seconds" INTEGER,
  ADD COLUMN "support_material_url" TEXT;
