-- AlterTable
ALTER TABLE "social_comments" ADD COLUMN "parent_id" TEXT;

-- CreateTable
CREATE TABLE "social_comment_likes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "comment_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_comment_likes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "social_comments_parent_id_idx" ON "social_comments"("parent_id");

-- CreateIndex
CREATE INDEX "social_comment_likes_comment_id_idx" ON "social_comment_likes"("comment_id");

-- CreateIndex
CREATE UNIQUE INDEX "social_comment_likes_user_id_comment_id_key" ON "social_comment_likes"("user_id", "comment_id");

-- AddForeignKey
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "social_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_comment_likes" ADD CONSTRAINT "social_comment_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_comment_likes" ADD CONSTRAINT "social_comment_likes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "social_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
