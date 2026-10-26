-- CreateEnum
CREATE TYPE "student_access_profile" AS ENUM ('PLATFORM_FULL', 'COACH_MANAGED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "student_access_profile" "student_access_profile" NOT NULL DEFAULT 'PLATFORM_FULL';
