-- CreateTable
CREATE TABLE "social_live_saves" (
    "id" TEXT NOT NULL,
    "live_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_live_saves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "social_live_saves_user_id_created_at_idx" ON "social_live_saves"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "social_live_saves_live_id_user_id_key" ON "social_live_saves"("live_id", "user_id");

-- AddForeignKey
ALTER TABLE "social_live_saves" ADD CONSTRAINT "social_live_saves_live_id_fkey" FOREIGN KEY ("live_id") REFERENCES "social_live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_live_saves" ADD CONSTRAINT "social_live_saves_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
