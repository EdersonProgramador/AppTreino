-- Galeria de momentos salvos (persistem após expiração de 24h).

CREATE TABLE "social_story_gallery" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "story_id" TEXT,
    "media_url" TEXT NOT NULL,
    "media_type" TEXT NOT NULL DEFAULT 'IMAGE',
    "cover_url" TEXT,
    "caption" TEXT,
    "mood" TEXT NOT NULL DEFAULT 'vibe',
    "saved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_story_gallery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "social_story_gallery_user_id_story_id_key" ON "social_story_gallery"("user_id", "story_id");
CREATE INDEX "social_story_gallery_user_id_saved_at_idx" ON "social_story_gallery"("user_id", "saved_at");

ALTER TABLE "social_story_gallery" ADD CONSTRAINT "social_story_gallery_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
