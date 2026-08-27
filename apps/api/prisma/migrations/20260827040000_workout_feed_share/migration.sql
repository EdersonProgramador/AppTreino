-- AlterEnum
ALTER TYPE "SocialPostKind" ADD VALUE 'WORKOUT';

-- AlterTable
ALTER TABLE "social_posts" ADD COLUMN "workout_session_id" TEXT;
ALTER TABLE "social_posts" ADD COLUMN "workout" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "social_posts_workout_session_id_key" ON "social_posts"("workout_session_id");

-- AddForeignKey
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_workout_session_id_fkey" FOREIGN KEY ("workout_session_id") REFERENCES "workout_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
