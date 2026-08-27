-- CreateEnum
CREATE TYPE "coach_memory_kind" AS ENUM ('LONG_TERM', 'EPISODIC', 'CONTEXTUAL', 'GLOBAL');

-- CreateTable
CREATE TABLE "coach_memories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "kind" "coach_memory_kind" NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_agent_runs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "agent_kind" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "perception" JSONB NOT NULL,
    "traces" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "feedback" JSONB,
    "iterations" INTEGER NOT NULL DEFAULT 1,
    "tool_calls" INTEGER NOT NULL DEFAULT 0,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "block_reason" TEXT,
    "reply_preview" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coach_memories_user_id_kind_created_at_idx" ON "coach_memories"("user_id", "kind", "created_at");

-- CreateIndex
CREATE INDEX "coach_memories_kind_created_at_idx" ON "coach_memories"("kind", "created_at");

-- CreateIndex
CREATE INDEX "coach_agent_runs_user_id_created_at_idx" ON "coach_agent_runs"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "coach_memories" ADD CONSTRAINT "coach_memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_agent_runs" ADD CONSTRAINT "coach_agent_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
