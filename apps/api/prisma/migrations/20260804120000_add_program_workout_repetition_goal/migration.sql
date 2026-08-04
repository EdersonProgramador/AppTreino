ALTER TABLE "programs" ADD COLUMN IF NOT EXISTS "total_workouts" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "user_programs" ADD COLUMN IF NOT EXISTS "total_workouts" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "user_programs" ADD COLUMN IF NOT EXISTS "completed_workouts" INTEGER NOT NULL DEFAULT 0;

UPDATE "user_programs" AS up
SET "completed_workouts" = LEAST(
  COALESCE((
    SELECT COUNT(*)
    FROM "workout_sessions" AS ws
    WHERE ws."assignment_id" = up."id"
      AND ws."status" = 'COMPLETED'
  ), 0),
  up."total_workouts"
);
