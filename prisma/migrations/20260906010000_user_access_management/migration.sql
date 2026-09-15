-- Управляемое удаление пользователей и постоянный стоп-лист MAX.
-- Финансовая и юридическая история остаётся связанной с исходной записью User.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_deletedAt_idx" ON "User"("deletedAt");

CREATE TABLE IF NOT EXISTS "BlockedMaxUser" (
  "maxId" BIGINT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlockedMaxUser_pkey" PRIMARY KEY ("maxId")
);

CREATE INDEX IF NOT EXISTS "BlockedMaxUser_createdAt_idx" ON "BlockedMaxUser"("createdAt");
