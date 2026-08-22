-- AlterEnum
CREATE TYPE "OutdoorModerationStatus" AS ENUM ('NONE', 'OPEN', 'CLEARED', 'REJECTED');

-- AlterTable
ALTER TABLE "outdoor_activities" ADD COLUMN "flagged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "outdoor_activities" ADD COLUMN "moderation_status" "OutdoorModerationStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "outdoor_activities" ADD COLUMN "anti_cheat_flags" JSONB;
ALTER TABLE "outdoor_activities" ADD COLUMN "moderation_note" TEXT;
ALTER TABLE "outdoor_activities" ADD COLUMN "moderated_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "outdoor_activities_flagged_moderation_status_finished_at_idx" ON "outdoor_activities"("flagged", "moderation_status", "finished_at");
