-- AlterTable
ALTER TABLE "social_live_sessions" ADD COLUMN "video_url" TEXT;
ALTER TABLE "social_live_sessions" ADD COLUMN "cover_url" TEXT;

-- AlterTable
ALTER TABLE "social_live_saves" ADD COLUMN "cover_url" TEXT;
