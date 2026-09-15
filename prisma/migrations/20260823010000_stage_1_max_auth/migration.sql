-- Этап 1: доверенная MAX-авторизация и денежные значения в целых копейках.
-- Миграция сохраняет старые Float-поля для обратной совместимости текущей админки.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "balanceKopecks" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "onboardingBonusGrantedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

UPDATE "User"
SET
  "balanceKopecks" = ROUND("balance"::NUMERIC * 100)::BIGINT,
  "updatedAt" = COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP);

ALTER TABLE "User"
  ALTER COLUMN "updatedAt" SET NOT NULL,
  ALTER COLUMN "name" SET DEFAULT 'Пользователь MAX';

ALTER TABLE "Purchase"
  ADD COLUMN IF NOT EXISTS "priceKopecks" BIGINT NOT NULL DEFAULT 0;

UPDATE "Purchase"
SET "priceKopecks" = ROUND("price"::NUMERIC * 100)::BIGINT;

ALTER TABLE "Transaction"
  ADD COLUMN IF NOT EXISTS "amountKopecks" BIGINT NOT NULL DEFAULT 0;

UPDATE "Transaction"
SET "amountKopecks" = ROUND("amount"::NUMERIC * 100)::BIGINT;
