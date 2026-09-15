-- Исходные лиды, покупки и задания доставки сохраняются.
ALTER TABLE "Lead" ADD COLUMN "contentFingerprint" TEXT;
ALTER TABLE "Lead" ADD COLUMN "duplicateOfId" TEXT;
CREATE UNIQUE INDEX "Lead_contentFingerprint_key" ON "Lead"("contentFingerprint");
CREATE INDEX "Lead_contentFingerprint_duplicateOfId_idx" ON "Lead"("contentFingerprint", "duplicateOfId");
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_duplicateOfId_fkey"
  FOREIGN KEY ("duplicateOfId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
