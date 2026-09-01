-- Plan card marketing fields for funnel and landing
ALTER TABLE "plans" ADD COLUMN "description" TEXT;
ALTER TABLE "plans" ADD COLUMN "card_benefits" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "plans" ADD COLUMN "badge_label" TEXT;
ALTER TABLE "plans" ADD COLUMN "is_featured" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "plans" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "plans" ADD COLUMN "show_on_funnel" BOOLEAN NOT NULL DEFAULT true;
