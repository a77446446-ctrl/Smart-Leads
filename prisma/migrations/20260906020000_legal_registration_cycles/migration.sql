-- Каждый повторный вход после удаления требует нового комплекта юридических согласий.
-- Старые согласия сохраняются как неизменяемый аудит предыдущих регистраций.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "registrationCycle" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "LegalAcceptance"
  ADD COLUMN IF NOT EXISTS "registrationCycle" INTEGER NOT NULL DEFAULT 1;

UPDATE "User"
SET "registrationCycle" = 2
WHERE "deletedAt" IS NOT NULL
  AND "registrationCycle" = 1;

DROP INDEX IF EXISTS "LegalAcceptance_userId_documentType_version_key";

CREATE UNIQUE INDEX IF NOT EXISTS "LegalAcceptance_registration_cycle_key"
  ON "LegalAcceptance"("userId", "documentType", "version", "registrationCycle");
