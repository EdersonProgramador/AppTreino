-- Fatia B/C/F/D/E: métricas, anti-cheat score, segmentos, challenge H3
ALTER TABLE "outdoor_activities"
  ADD COLUMN IF NOT EXISTS "elevation_loss_meters" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "steps_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "avg_cadence_spm" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "avg_heart_rate_bpm" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "max_heart_rate_bpm" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "estimated_power_watts" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "anti_cheat_score" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "quarantine_until" TIMESTAMP(3);

ALTER TABLE "club_challenges"
  ADD COLUMN IF NOT EXISTS "cell_h3" TEXT;

CREATE TABLE IF NOT EXISTS "outdoor_segments" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sport" "OutdoorSport" NOT NULL,
  "description" TEXT,
  "polyline" JSONB NOT NULL,
  "distance_meters" DOUBLE PRECISION NOT NULL,
  "start_lat" DOUBLE PRECISION NOT NULL,
  "start_lng" DOUBLE PRECISION NOT NULL,
  "end_lat" DOUBLE PRECISION NOT NULL,
  "end_lng" DOUBLE PRECISION NOT NULL,
  "cell_h3" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outdoor_segments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "outdoor_segments_slug_key" ON "outdoor_segments"("slug");
CREATE INDEX IF NOT EXISTS "outdoor_segments_sport_cell_h3_is_active_idx" ON "outdoor_segments"("sport", "cell_h3", "is_active");

CREATE TABLE IF NOT EXISTS "outdoor_segment_efforts" (
  "id" TEXT NOT NULL,
  "segment_id" TEXT NOT NULL,
  "activity_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "elapsed_seconds" INTEGER NOT NULL,
  "pace_sec_per_km" DOUBLE PRECISION,
  "is_pr" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outdoor_segment_efforts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "outdoor_segment_efforts_activity_id_segment_id_key"
  ON "outdoor_segment_efforts"("activity_id", "segment_id");
CREATE INDEX IF NOT EXISTS "outdoor_segment_efforts_segment_id_elapsed_seconds_idx"
  ON "outdoor_segment_efforts"("segment_id", "elapsed_seconds");
CREATE INDEX IF NOT EXISTS "outdoor_segment_efforts_user_id_segment_id_idx"
  ON "outdoor_segment_efforts"("user_id", "segment_id");

DO $$ BEGIN
  ALTER TABLE "outdoor_segment_efforts"
    ADD CONSTRAINT "outdoor_segment_efforts_segment_id_fkey"
    FOREIGN KEY ("segment_id") REFERENCES "outdoor_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "outdoor_segment_efforts"
    ADD CONSTRAINT "outdoor_segment_efforts_activity_id_fkey"
    FOREIGN KEY ("activity_id") REFERENCES "outdoor_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "outdoor_segment_efforts"
    ADD CONSTRAINT "outdoor_segment_efforts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
