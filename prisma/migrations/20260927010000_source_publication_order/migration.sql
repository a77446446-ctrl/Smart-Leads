-- Старые карточки сохраняют прежний порядок до повторного сбора.
ALTER TABLE "Lead" ADD COLUMN "publishedAt" TIMESTAMP(3);
UPDATE "Lead" SET "publishedAt" = "createdAt";
ALTER TABLE "Lead" ALTER COLUMN "publishedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Lead" ALTER COLUMN "publishedAt" SET NOT NULL;
CREATE INDEX "Lead_publishedAt_createdAt_idx" ON "Lead"("publishedAt", "createdAt");
