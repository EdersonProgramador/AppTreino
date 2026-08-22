-- CreateEnum
CREATE TYPE "SocialPostKind" AS ENUM ('TEXT', 'PHOTO', 'VIDEO', 'ACTIVITY');

-- CreateEnum
CREATE TYPE "OutdoorSport" AS ENUM ('RUN', 'WALK', 'RIDE');

-- CreateEnum
CREATE TYPE "OutdoorActivityStatus" AS ENUM ('LIVE', 'PAUSED', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ClubChallengePeriod" AS ENUM ('WEEK', 'MONTH', 'OPEN');

-- CreateTable
CREATE TABLE "social_posts" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "kind" "SocialPostKind" NOT NULL DEFAULT 'TEXT',
    "body" TEXT,
    "media_url" TEXT,
    "media_type" TEXT,
    "activity_id" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_likes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_comments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_follows" (
    "id" TEXT NOT NULL,
    "follower_id" TEXT NOT NULL,
    "following_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_follows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outdoor_activities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "sport" "OutdoorSport" NOT NULL,
    "status" "OutdoorActivityStatus" NOT NULL DEFAULT 'LIVE',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paused_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "pause_ms" INTEGER NOT NULL DEFAULT 0,
    "elapsed_seconds" INTEGER NOT NULL DEFAULT 0,
    "moving_seconds" INTEGER NOT NULL DEFAULT 0,
    "distance_meters" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avg_pace_sec_per_km" DOUBLE PRECISION,
    "avg_speed_mps" DOUBLE PRECISION,
    "max_speed_mps" DOUBLE PRECISION,
    "elevation_gain_meters" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "calories" INTEGER NOT NULL DEFAULT 0,
    "map_type" TEXT NOT NULL DEFAULT 'standard',
    "activity_map" TEXT NOT NULL DEFAULT 'personal',
    "layers" JSONB,
    "is_3d" BOOLEAN NOT NULL DEFAULT false,
    "target_distance_meters" DOUBLE PRECISION,
    "polyline" JSONB,
    "summary" JSONB,
    "photo_url" TEXT,
    "video_url" TEXT,
    "caption" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outdoor_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_challenges" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sport" "OutdoorSport" NOT NULL,
    "goal_meters" DOUBLE PRECISION NOT NULL,
    "period" "ClubChallengePeriod" NOT NULL DEFAULT 'WEEK',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "challenge_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "social_posts_activity_id_key" ON "social_posts"("activity_id");

-- CreateIndex
CREATE INDEX "social_posts_created_at_idx" ON "social_posts"("created_at");

-- CreateIndex
CREATE INDEX "social_posts_author_id_created_at_idx" ON "social_posts"("author_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "social_likes_user_id_post_id_key" ON "social_likes"("user_id", "post_id");

-- CreateIndex
CREATE INDEX "social_likes_post_id_idx" ON "social_likes"("post_id");

-- CreateIndex
CREATE INDEX "social_comments_post_id_created_at_idx" ON "social_comments"("post_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "social_follows_follower_id_following_id_key" ON "social_follows"("follower_id", "following_id");

-- CreateIndex
CREATE INDEX "social_follows_following_id_idx" ON "social_follows"("following_id");

-- CreateIndex
CREATE INDEX "outdoor_activities_user_id_status_idx" ON "outdoor_activities"("user_id", "status");

-- CreateIndex
CREATE INDEX "outdoor_activities_user_id_finished_at_idx" ON "outdoor_activities"("user_id", "finished_at");

-- CreateIndex
CREATE INDEX "outdoor_activities_status_finished_at_idx" ON "outdoor_activities"("status", "finished_at");

-- CreateIndex
CREATE UNIQUE INDEX "club_challenges_slug_key" ON "club_challenges"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "club_memberships_user_id_challenge_id_key" ON "club_memberships"("user_id", "challenge_id");

-- CreateIndex
CREATE INDEX "club_memberships_challenge_id_idx" ON "club_memberships"("challenge_id");

-- AddForeignKey
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "outdoor_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_likes" ADD CONSTRAINT "social_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_likes" ADD CONSTRAINT "social_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "social_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "social_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_follows" ADD CONSTRAINT "social_follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_follows" ADD CONSTRAINT "social_follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outdoor_activities" ADD CONSTRAINT "outdoor_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_memberships" ADD CONSTRAINT "club_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_memberships" ADD CONSTRAINT "club_memberships_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "club_challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "club_challenges" ("id", "slug", "title", "description", "sport", "goal_meters", "period", "is_active", "created_at", "updated_at")
VALUES
  ('clb_5k_semana', '5k-semana', 'Desafio 5K da semana', 'Complete 5 km de corrida nesta semana e publique no Feed.', 'RUN', 5000, 'WEEK', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('clb_caminhada_20km', 'caminhada-20km', 'Caminhada 20 km no mês', 'Some 20 km de caminhada no mês e acompanhe o ritmo no mapa.', 'WALK', 20000, 'MONTH', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('clb_pedal_50km', 'pedal-50km', 'Pedal 50 km', 'Pedale 50 km no mês. O percurso 3D entra no Feed ao finalizar.', 'RIDE', 50000, 'MONTH', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
