CREATE TYPE "gender" AS ENUM ('MALE', 'FEMALE');

CREATE TYPE "program_target_gender" AS ENUM ('ALL', 'MALE', 'FEMALE');

ALTER TABLE "profiles" ADD COLUMN "gender" "gender";

ALTER TABLE "programs" ADD COLUMN "target_gender" "program_target_gender" NOT NULL DEFAULT 'ALL';
