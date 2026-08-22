-- Feed completo: carrossel, dislike, denúncia, momentos (24h)

ALTER TABLE "social_posts" ADD COLUMN IF NOT EXISTS "media_items" JSONB;

CREATE TABLE IF NOT EXISTS "social_dislikes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_dislikes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "social_dislikes_user_id_post_id_key" ON "social_dislikes"("user_id", "post_id");
CREATE INDEX IF NOT EXISTS "social_dislikes_post_id_idx" ON "social_dislikes"("post_id");

CREATE TABLE IF NOT EXISTS "social_reports" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "social_reports_post_id_idx" ON "social_reports"("post_id");

CREATE TABLE IF NOT EXISTS "social_stories" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "media_url" TEXT NOT NULL,
    "media_type" TEXT NOT NULL DEFAULT 'IMAGE',
    "caption" TEXT,
    "mood" TEXT NOT NULL DEFAULT 'vibe',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_stories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "social_stories_expires_at_idx" ON "social_stories"("expires_at");
CREATE INDEX IF NOT EXISTS "social_stories_author_id_created_at_idx" ON "social_stories"("author_id", "created_at");

CREATE TABLE IF NOT EXISTS "social_story_views" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_story_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "social_story_views_story_id_user_id_key" ON "social_story_views"("story_id", "user_id");

DO $$ BEGIN
  ALTER TABLE "social_dislikes" ADD CONSTRAINT "social_dislikes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "social_dislikes" ADD CONSTRAINT "social_dislikes_post_id_fkey"
    FOREIGN KEY ("post_id") REFERENCES "social_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "social_reports" ADD CONSTRAINT "social_reports_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "social_reports" ADD CONSTRAINT "social_reports_post_id_fkey"
    FOREIGN KEY ("post_id") REFERENCES "social_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "social_stories" ADD CONSTRAINT "social_stories_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "social_story_views" ADD CONSTRAINT "social_story_views_story_id_fkey"
    FOREIGN KEY ("story_id") REFERENCES "social_stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "social_story_views" ADD CONSTRAINT "social_story_views_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
