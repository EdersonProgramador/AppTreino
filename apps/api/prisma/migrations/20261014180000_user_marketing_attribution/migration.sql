-- CreateTable
CREATE TABLE "user_marketing_attributions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "utm_content" TEXT,
    "utm_term" TEXT,
    "landing_path" TEXT,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_marketing_attributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_marketing_attributions_user_id_key" ON "user_marketing_attributions"("user_id");

-- AddForeignKey
ALTER TABLE "user_marketing_attributions" ADD CONSTRAINT "user_marketing_attributions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
