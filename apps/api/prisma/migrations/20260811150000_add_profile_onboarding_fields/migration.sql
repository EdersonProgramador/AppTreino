-- AlterTable
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "days_per_week" INTEGER;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "equipment_tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
