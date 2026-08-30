-- Consentimento LGPD no cadastro
ALTER TABLE "profiles" ADD COLUMN "terms_accepted_at" TIMESTAMP(3),
ADD COLUMN "privacy_accepted_at" TIMESTAMP(3);
