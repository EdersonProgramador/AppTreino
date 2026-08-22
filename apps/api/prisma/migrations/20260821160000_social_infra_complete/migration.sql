-- Infra completa da rede social: reels, live, DM, chat global, pedidos, block, perfil privado

ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "is_private" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "social_reels" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "video_url" TEXT NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "mood" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_reels_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "social_reels_created_at_idx" ON "social_reels"("created_at");
CREATE INDEX IF NOT EXISTS "social_reels_author_id_created_at_idx" ON "social_reels"("author_id", "created_at");

CREATE TABLE IF NOT EXISTS "social_reel_likes" (
    "id" TEXT NOT NULL,
    "reel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_reel_likes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "social_reel_likes_reel_id_user_id_key" ON "social_reel_likes"("reel_id", "user_id");

CREATE TABLE IF NOT EXISTS "social_live_sessions" (
    "id" TEXT NOT NULL,
    "host_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "mood" TEXT,
    "status" TEXT NOT NULL DEFAULT 'live',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "viewer_peak" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_live_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "social_live_sessions_status_started_at_idx" ON "social_live_sessions"("status", "started_at");

CREATE TABLE IF NOT EXISTS "social_live_messages" (
    "id" TEXT NOT NULL,
    "live_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_live_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "social_live_messages_live_id_created_at_idx" ON "social_live_messages"("live_id", "created_at");

CREATE TABLE IF NOT EXISTS "social_conversations" (
    "id" TEXT NOT NULL,
    "user_a_id" TEXT NOT NULL,
    "user_b_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_conversations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "social_conversations_user_a_id_user_b_id_key" ON "social_conversations"("user_a_id", "user_b_id");
CREATE INDEX IF NOT EXISTS "social_conversations_updated_at_idx" ON "social_conversations"("updated_at");

CREATE TABLE IF NOT EXISTS "social_direct_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_direct_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "social_direct_messages_conversation_id_created_at_idx" ON "social_direct_messages"("conversation_id", "created_at");

CREATE TABLE IF NOT EXISTS "social_global_messages" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_global_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "social_global_messages_created_at_idx" ON "social_global_messages"("created_at");

CREATE TABLE IF NOT EXISTS "social_follow_requests" (
    "id" TEXT NOT NULL,
    "from_id" TEXT NOT NULL,
    "to_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_follow_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "social_follow_requests_from_id_to_id_key" ON "social_follow_requests"("from_id", "to_id");
CREATE INDEX IF NOT EXISTS "social_follow_requests_to_id_idx" ON "social_follow_requests"("to_id");

CREATE TABLE IF NOT EXISTS "social_blocks" (
    "id" TEXT NOT NULL,
    "blocker_id" TEXT NOT NULL,
    "blocked_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_blocks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "social_blocks_blocker_id_blocked_id_key" ON "social_blocks"("blocker_id", "blocked_id");

DO $$ BEGIN ALTER TABLE "social_reels" ADD CONSTRAINT "social_reels_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "social_reel_likes" ADD CONSTRAINT "social_reel_likes_reel_id_fkey" FOREIGN KEY ("reel_id") REFERENCES "social_reels"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "social_reel_likes" ADD CONSTRAINT "social_reel_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "social_live_sessions" ADD CONSTRAINT "social_live_sessions_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "social_live_messages" ADD CONSTRAINT "social_live_messages_live_id_fkey" FOREIGN KEY ("live_id") REFERENCES "social_live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "social_live_messages" ADD CONSTRAINT "social_live_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "social_conversations" ADD CONSTRAINT "social_conversations_user_a_id_fkey" FOREIGN KEY ("user_a_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "social_conversations" ADD CONSTRAINT "social_conversations_user_b_id_fkey" FOREIGN KEY ("user_b_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "social_direct_messages" ADD CONSTRAINT "social_direct_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "social_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "social_direct_messages" ADD CONSTRAINT "social_direct_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "social_global_messages" ADD CONSTRAINT "social_global_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "social_follow_requests" ADD CONSTRAINT "social_follow_requests_from_id_fkey" FOREIGN KEY ("from_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "social_follow_requests" ADD CONSTRAINT "social_follow_requests_to_id_fkey" FOREIGN KEY ("to_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "social_blocks" ADD CONSTRAINT "social_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "social_blocks" ADD CONSTRAINT "social_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
