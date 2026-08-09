WITH program_frequency AS (
  SELECT
    links."program_id",
    SUM(links."weekly_frequency")::INTEGER AS "sessions_per_week"
  FROM (
    SELECT DISTINCT
      pdw."program_id",
      wb."id" AS "workout_block_id",
      wb."weekly_frequency"
    FROM "program_day_workouts" pdw
    INNER JOIN "workout_blocks" wb ON wb."id" = pdw."workout_block_id"
  ) links
  GROUP BY links."program_id"
), normalized_programs AS (
  SELECT
    p."id",
    p."total_workouts" AS "legacy_total_workouts",
    GREATEST(
      1,
      p."duration_years" * 365 +
      p."duration_months" * 30 +
      p."duration_weeks" * 7 +
      p."duration_extra_days"
    ) AS "estimated_days",
    GREATEST(
      1,
      ROUND(
        (
          p."duration_years" * 365 +
          p."duration_months" * 30 +
          p."duration_weeks" * 7 +
          p."duration_extra_days"
        ) / 7.0 * COALESCE(pf."sessions_per_week", 1)
      )::INTEGER
    ) AS "suggested_sessions"
  FROM "programs" p
  LEFT JOIN program_frequency pf ON pf."program_id" = p."id"
), updated_programs AS (
  UPDATE "programs" p
  SET
    "duration_days" = np."estimated_days",
    "planned_sessions" = CASE
      WHEN np."legacy_total_workouts" = p."duration_days" THEN np."suggested_sessions"
      ELSE GREATEST(1, np."legacy_total_workouts")
    END,
    "total_workouts" = CASE
      WHEN np."legacy_total_workouts" = p."duration_days" THEN np."suggested_sessions"
      ELSE GREATEST(1, np."legacy_total_workouts")
    END
  FROM normalized_programs np
  WHERE p."id" = np."id"
  RETURNING p."id", p."planned_sessions"
)
UPDATE "user_programs" up
SET "total_workouts" = updated."planned_sessions"
FROM updated_programs updated
WHERE up."program_id" = updated."id" AND up."status" = 'ACTIVE';

UPDATE "user_programs" up
SET "planned_ends_at" =
  up."started_at" + make_interval(
    years => p."duration_years",
    months => p."duration_months",
    weeks => p."duration_weeks",
    days => p."duration_extra_days"
  )
FROM "programs" p
WHERE up."program_id" = p."id" AND up."planned_ends_at" IS NULL;
