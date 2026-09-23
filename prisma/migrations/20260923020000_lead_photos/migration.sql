-- Миграция может быть запущена повторно после аварийного деплоя.
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "capturePhotos" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
UPDATE "Lead" AS l SET "expiresAt" = l."createdAt" + make_interval(mins => c."ttlMinutes")
FROM "Category" AS c WHERE l."categoryId" = c.id AND l."accessMode" = 'PUBLIC' AND l."expiresAt" IS NULL;
CREATE INDEX IF NOT EXISTS "Lead_expiresAt_idx" ON "Lead"("expiresAt");
CREATE TABLE IF NOT EXISTS "LeadMedia" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "leadId" TEXT,
  "position" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL,
  "bytes" INTEGER NOT NULL CHECK ("bytes" > 0 AND "bytes" <= 5242880),
  "ready" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadMedia_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "LeadMedia_leadId_position_key" ON "LeadMedia"("leadId", "position");
CREATE INDEX IF NOT EXISTS "LeadMedia_leadId_ready_idx" ON "LeadMedia"("leadId", "ready");
CREATE INDEX IF NOT EXISTS "LeadMedia_createdAt_idx" ON "LeadMedia"("createdAt");
