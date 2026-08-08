ALTER TABLE "programs" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 1;

WITH ordered_programs AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (ORDER BY "created_at" ASC, "id" ASC) AS next_sort_order
  FROM "programs"
)
UPDATE "programs"
SET "sort_order" = ordered_programs.next_sort_order::integer
FROM ordered_programs
WHERE "programs"."id" = ordered_programs."id";
