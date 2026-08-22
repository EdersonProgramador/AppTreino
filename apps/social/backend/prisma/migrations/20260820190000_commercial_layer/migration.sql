-- Commercial account, notifications, DMs, moderation
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "email_verified" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ALTER COLUMN "email_verified" SET DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboarded" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ALTER COLUMN "onboarded" SET DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "verify_token" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "verify_expires" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "reset_token" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "reset_expires" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "Notification" (
    "id" SERIAL NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_on" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" VARCHAR(255) NOT NULL,
    "actor_id" VARCHAR(255) NOT NULL,
    "post_id" INTEGER,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Conversation" (
    "id" TEXT NOT NULL,
    "user_a_id" VARCHAR(255) NOT NULL,
    "user_b_id" VARCHAR(255) NOT NULL,
    "updated_on" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DirectMessage" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "created_on" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversation_id" TEXT NOT NULL,
    "sender_id" VARCHAR(255) NOT NULL,
    CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Block" (
    "id" SERIAL NOT NULL,
    "blocker_id" VARCHAR(255) NOT NULL,
    "blocked_id" VARCHAR(255) NOT NULL,
    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Report" (
    "id" SERIAL NOT NULL,
    "target_type" VARCHAR(20) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "created_on" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reporter_id" VARCHAR(255) NOT NULL,
    "target_user_id" VARCHAR(255),
    "post_id" INTEGER,
    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_user_a_id_user_b_id_key" ON "Conversation"("user_a_id", "user_b_id");
CREATE UNIQUE INDEX IF NOT EXISTS "Block_blocker_id_blocked_id_key" ON "Block"("blocker_id", "blocked_id");

DO $$ BEGIN
 ALTER TABLE "Notification" ADD CONSTRAINT "Notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
 ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
 ALTER TABLE "Notification" ADD CONSTRAINT "Notification_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
 ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
 ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
 ALTER TABLE "Block" ADD CONSTRAINT "Block_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
 ALTER TABLE "Block" ADD CONSTRAINT "Block_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
 ALTER TABLE "Report" ADD CONSTRAINT "Report_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
 ALTER TABLE "Report" ADD CONSTRAINT "Report_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
