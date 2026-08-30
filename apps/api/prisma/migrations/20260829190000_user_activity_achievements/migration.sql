-- CreateTable
CREATE TABLE "user_activity_achievements" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "earned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_activity_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_activity_achievements_user_id_slug_key" ON "user_activity_achievements"("user_id", "slug");

-- CreateIndex
CREATE INDEX "user_activity_achievements_user_id_earned_at_idx" ON "user_activity_achievements"("user_id", "earned_at");

-- AddForeignKey
ALTER TABLE "user_activity_achievements" ADD CONSTRAINT "user_activity_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
