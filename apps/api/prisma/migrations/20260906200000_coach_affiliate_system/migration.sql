-- Coach affiliate system: referral links, attributions, commissions, wallet, withdrawals.

CREATE TYPE "referral_attribution_status" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "coach_commission_status" AS ENUM ('PENDING', 'AVAILABLE', 'LOCKED', 'PAID', 'REVERSED');
CREATE TYPE "coach_withdrawal_status" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'REJECTED', 'CANCELED');

CREATE TABLE "coach_referral_links" (
    "id" TEXT NOT NULL,
    "coach_user_id" TEXT NOT NULL,
    "organization_id" TEXT,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "click_count" INTEGER NOT NULL DEFAULT 0,
    "signup_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coach_referral_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_referral_attributions" (
    "id" TEXT NOT NULL,
    "athlete_user_id" TEXT NOT NULL,
    "coach_user_id" TEXT NOT NULL,
    "referral_link_id" TEXT,
    "organization_id" TEXT,
    "status" "referral_attribution_status" NOT NULL DEFAULT 'ACTIVE',
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_referral_attributions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "coach_commission_entries" (
    "id" TEXT NOT NULL,
    "coach_user_id" TEXT NOT NULL,
    "athlete_user_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "referral_link_id" TEXT,
    "amount_in_cents" INTEGER NOT NULL,
    "commission_rate" DOUBLE PRECISION NOT NULL,
    "status" "coach_commission_status" NOT NULL DEFAULT 'PENDING',
    "available_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coach_commission_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "coach_wallets" (
    "coach_user_id" TEXT NOT NULL,
    "available_in_cents" INTEGER NOT NULL DEFAULT 0,
    "pending_in_cents" INTEGER NOT NULL DEFAULT 0,
    "locked_in_cents" INTEGER NOT NULL DEFAULT 0,
    "withdrawn_in_cents" INTEGER NOT NULL DEFAULT 0,
    "pix_key" TEXT,
    "pix_key_type" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coach_wallets_pkey" PRIMARY KEY ("coach_user_id")
);

CREATE TABLE "coach_withdrawal_requests" (
    "id" TEXT NOT NULL,
    "coach_user_id" TEXT NOT NULL,
    "amount_in_cents" INTEGER NOT NULL,
    "pix_key" TEXT NOT NULL,
    "pix_key_type" TEXT,
    "status" "coach_withdrawal_status" NOT NULL DEFAULT 'PENDING',
    "admin_note" TEXT,
    "approved_by_id" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coach_withdrawal_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "coach_referral_links_slug_key" ON "coach_referral_links"("slug");
CREATE INDEX "coach_referral_links_coach_user_id_is_active_idx" ON "coach_referral_links"("coach_user_id", "is_active");

CREATE UNIQUE INDEX "user_referral_attributions_athlete_user_id_key" ON "user_referral_attributions"("athlete_user_id");
CREATE INDEX "user_referral_attributions_coach_user_id_status_idx" ON "user_referral_attributions"("coach_user_id", "status");

CREATE UNIQUE INDEX "coach_commission_entries_payment_id_key" ON "coach_commission_entries"("payment_id");
CREATE INDEX "coach_commission_entries_coach_user_id_status_idx" ON "coach_commission_entries"("coach_user_id", "status");
CREATE INDEX "coach_commission_entries_athlete_user_id_idx" ON "coach_commission_entries"("athlete_user_id");

CREATE INDEX "coach_withdrawal_requests_coach_user_id_status_idx" ON "coach_withdrawal_requests"("coach_user_id", "status");

ALTER TABLE "coach_referral_links" ADD CONSTRAINT "coach_referral_links_coach_user_id_fkey" FOREIGN KEY ("coach_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coach_referral_links" ADD CONSTRAINT "coach_referral_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_referral_attributions" ADD CONSTRAINT "user_referral_attributions_athlete_user_id_fkey" FOREIGN KEY ("athlete_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_referral_attributions" ADD CONSTRAINT "user_referral_attributions_coach_user_id_fkey" FOREIGN KEY ("coach_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_referral_attributions" ADD CONSTRAINT "user_referral_attributions_referral_link_id_fkey" FOREIGN KEY ("referral_link_id") REFERENCES "coach_referral_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_referral_attributions" ADD CONSTRAINT "user_referral_attributions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "coach_commission_entries" ADD CONSTRAINT "coach_commission_entries_coach_user_id_fkey" FOREIGN KEY ("coach_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coach_commission_entries" ADD CONSTRAINT "coach_commission_entries_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coach_commission_entries" ADD CONSTRAINT "coach_commission_entries_referral_link_id_fkey" FOREIGN KEY ("referral_link_id") REFERENCES "coach_referral_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "coach_wallets" ADD CONSTRAINT "coach_wallets_coach_user_id_fkey" FOREIGN KEY ("coach_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "coach_withdrawal_requests" ADD CONSTRAINT "coach_withdrawal_requests_coach_user_id_fkey" FOREIGN KEY ("coach_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coach_withdrawal_requests" ADD CONSTRAINT "coach_withdrawal_requests_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
