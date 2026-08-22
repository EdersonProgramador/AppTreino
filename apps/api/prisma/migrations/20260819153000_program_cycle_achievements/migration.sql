-- CreateTable
CREATE TABLE "program_cycle_completions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "modality_id" TEXT,
    "modality_name" TEXT NOT NULL,
    "program_title" TEXT NOT NULL,
    "cycle_number" INTEGER NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "program_cycle_completions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modality_achievements" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "modality_id" TEXT NOT NULL,
    "modality_name" TEXT NOT NULL,
    "completion_count" INTEGER NOT NULL DEFAULT 1,
    "last_completed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modality_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "program_cycle_completions_user_id_program_id_idx" ON "program_cycle_completions"("user_id", "program_id");

-- CreateIndex
CREATE INDEX "program_cycle_completions_user_id_modality_id_idx" ON "program_cycle_completions"("user_id", "modality_id");

-- CreateIndex
CREATE UNIQUE INDEX "modality_achievements_user_id_modality_id_key" ON "modality_achievements"("user_id", "modality_id");

-- CreateIndex
CREATE INDEX "modality_achievements_user_id_last_completed_at_idx" ON "modality_achievements"("user_id", "last_completed_at");

-- AddForeignKey
ALTER TABLE "program_cycle_completions" ADD CONSTRAINT "program_cycle_completions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_cycle_completions" ADD CONSTRAINT "program_cycle_completions_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modality_achievements" ADD CONSTRAINT "modality_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modality_achievements" ADD CONSTRAINT "modality_achievements_modality_id_fkey" FOREIGN KEY ("modality_id") REFERENCES "modalities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
