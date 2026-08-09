ALTER TYPE "structure_type" ADD VALUE IF NOT EXISTS 'CIRCUIT';
ALTER TYPE "structure_type" ADD VALUE IF NOT EXISTS 'AMRAP';
ALTER TYPE "structure_type" ADD VALUE IF NOT EXISTS 'EMOM';
ALTER TYPE "structure_type" ADD VALUE IF NOT EXISTS 'FOR_TIME';
ALTER TYPE "structure_type" ADD VALUE IF NOT EXISTS 'TABATA';
ALTER TYPE "structure_type" ADD VALUE IF NOT EXISTS 'INTERVAL';
ALTER TYPE "structure_type" ADD VALUE IF NOT EXISTS 'CLASS';

CREATE TYPE "prescription_type" AS ENUM ('REPETITIONS', 'DURATION', 'DISTANCE', 'INTERVAL', 'ROUNDS', 'HOLD', 'FREE');
CREATE TYPE "intensity_type" AS ENUM ('NONE', 'LOAD', 'RPE', 'RIR', 'PERCENT_1RM', 'HEART_RATE_ZONE', 'PACE', 'SPEED');
CREATE TYPE "program_completion_mode" AS ENUM ('BY_SESSIONS', 'BY_DATE', 'BOTH', 'MANUAL');
CREATE TYPE "program_schedule_type" AS ENUM ('ROTATING_CYCLE', 'WEEKLY', 'ON_DEMAND');
CREATE TYPE "program_audience_mode" AS ENUM ('ALL_ACTIVE', 'SELECTED');

ALTER TABLE "workout_blocks"
  ADD COLUMN "protocol_rounds" INTEGER,
  ADD COLUMN "work_seconds" INTEGER,
  ADD COLUMN "time_cap_seconds" INTEGER,
  ADD COLUMN "instructions" TEXT;

ALTER TABLE "workout_block_exercises"
  ADD COLUMN "prescription_type" "prescription_type" NOT NULL DEFAULT 'REPETITIONS',
  ADD COLUMN "reps_min" INTEGER,
  ADD COLUMN "reps_max" INTEGER,
  ADD COLUMN "duration_seconds" INTEGER,
  ADD COLUMN "distance_meters" DOUBLE PRECISION,
  ADD COLUMN "rounds" INTEGER,
  ADD COLUMN "work_seconds" INTEGER,
  ADD COLUMN "intensity_type" "intensity_type" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "intensity_value" TEXT,
  ADD COLUMN "tempo" TEXT,
  ADD COLUMN "side" TEXT,
  ADD COLUMN "execution_notes" TEXT;

UPDATE "workout_block_exercises"
SET
  "reps_min" = CASE WHEN "reps_range" ~ '^[0-9]+' THEN substring("reps_range" from '^[0-9]+')::INTEGER ELSE NULL END,
  "reps_max" = CASE
    WHEN "reps_range" ~ '^[0-9]+[[:space:]]*-[[:space:]]*[0-9]+' THEN substring("reps_range" from '[0-9]+$')::INTEGER
    WHEN "reps_range" ~ '^[0-9]+$' THEN "reps_range"::INTEGER
    ELSE NULL
  END;

ALTER TABLE "programs"
  ADD COLUMN "duration_extra_days" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "planned_sessions" INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN "completion_mode" "program_completion_mode" NOT NULL DEFAULT 'BY_SESSIONS',
  ADD COLUMN "schedule_type" "program_schedule_type" NOT NULL DEFAULT 'ROTATING_CYCLE',
  ADD COLUMN "audience_mode" "program_audience_mode" NOT NULL DEFAULT 'ALL_ACTIVE',
  ADD COLUMN "cycle_length_days" INTEGER NOT NULL DEFAULT 7;

UPDATE "programs"
SET "planned_sessions" = GREATEST(1, "total_workouts");

ALTER TABLE "user_programs"
  ADD COLUMN "planned_ends_at" TIMESTAMP(3);

ALTER TABLE "user_progress"
  ADD COLUMN "session_id" TEXT,
  ADD COLUMN "workout_block_exercise_id" TEXT,
  ADD COLUMN "duration_seconds" INTEGER,
  ADD COLUMN "distance_meters" DOUBLE PRECISION,
  ADD COLUMN "rounds_completed" INTEGER,
  ADD COLUMN "perceived_exertion" DOUBLE PRECISION,
  ADD COLUMN "notes" TEXT;

CREATE INDEX "user_progress_session_id_workout_block_exercise_id_idx"
  ON "user_progress"("session_id", "workout_block_exercise_id");

ALTER TABLE "user_progress"
  ADD CONSTRAINT "user_progress_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "workout_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_progress"
  ADD CONSTRAINT "user_progress_workout_block_exercise_id_fkey"
  FOREIGN KEY ("workout_block_exercise_id") REFERENCES "workout_block_exercises"("id") ON DELETE SET NULL ON UPDATE CASCADE;
