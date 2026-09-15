-- Согласование накопленной истории миграций с текущей Prisma-схемой.
-- Устаревшие денежные столбцы сохраняются, чтобы не терять данные старых установок.

ALTER TABLE "Category"
  ALTER COLUMN "leadPrice" TYPE INTEGER USING ROUND("leadPrice")::INTEGER,
  ALTER COLUMN "leadPrice" SET DEFAULT 0,
  ALTER COLUMN "subscriptionPrice" TYPE INTEGER USING ROUND("subscriptionPrice")::INTEGER,
  ALTER COLUMN "subscriptionPrice" SET DEFAULT 0;

ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "fingerprint" TEXT,
  ALTER COLUMN "price" TYPE INTEGER USING ROUND("price")::INTEGER,
  ALTER COLUMN "price" SET DEFAULT 0;

ALTER TABLE "Purchase"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3),
  ALTER COLUMN "price" TYPE INTEGER USING ROUND("price")::INTEGER,
  ALTER COLUMN "price" SET DEFAULT 0;

ALTER TABLE "Transaction"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3),
  ALTER COLUMN "amount" TYPE INTEGER USING ROUND("amount")::INTEGER,
  ALTER COLUMN "amount" SET DEFAULT 0;

ALTER TABLE "User"
  ALTER COLUMN "balance" TYPE INTEGER USING ROUND("balance")::INTEGER,
  ALTER COLUMN "balance" SET DEFAULT 0;

ALTER TABLE "PaymentOrder"
  ADD COLUMN IF NOT EXISTS "amount" INTEGER;

UPDATE "PaymentOrder"
SET "amount" = COALESCE("amount", "amountKopecks"::INTEGER)
WHERE "amount" IS NULL;

ALTER TABLE "PaymentOrder"
  ALTER COLUMN "amount" SET NOT NULL;

ALTER TABLE "MaksAccount"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE UNIQUE INDEX IF NOT EXISTS "Lead_fingerprint_key" ON "Lead"("fingerprint");
CREATE INDEX IF NOT EXISTS "Lead_categoryId_status_deletedAt_createdAt_idx" ON "Lead"("categoryId", "status", "deletedAt", "createdAt");
CREATE INDEX IF NOT EXISTS "Lead_createdAt_idx" ON "Lead"("createdAt");
CREATE INDEX IF NOT EXISTS "Lead_deletedAt_idx" ON "Lead"("deletedAt");
CREATE INDEX IF NOT EXISTS "Purchase_userId_deletedAt_idx" ON "Purchase"("userId", "deletedAt");
CREATE INDEX IF NOT EXISTS "Purchase_leadId_idx" ON "Purchase"("leadId");
CREATE INDEX IF NOT EXISTS "Transaction_userId_deletedAt_createdAt_idx" ON "Transaction"("userId", "deletedAt", "createdAt");
