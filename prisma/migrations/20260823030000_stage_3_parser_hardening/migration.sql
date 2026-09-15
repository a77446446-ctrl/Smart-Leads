-- AlterTable
ALTER TABLE "MaksAccount"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'AUTHORIZING',
ADD COLUMN "lastSuccessAt" TIMESTAMP(3),
ADD COLUMN "lastErrorAt" TIMESTAMP(3),
ADD COLUMN "cooldownUntil" TIMESTAMP(3),
ADD COLUMN "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "totalRuns" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "totalErrors" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastError" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Existing session rows were previously considered usable.
UPDATE "MaksAccount" SET "status" = 'ACTIVE' WHERE "active" = TRUE;
UPDATE "MaksAccount" SET "status" = 'DISABLED' WHERE "active" = FALSE;

-- CreateIndex
CREATE INDEX "MaksAccount_active_status_cooldownUntil_idx"
ON "MaksAccount"("active", "status", "cooldownUntil");

-- CreateTable
CREATE TABLE "ParserLease" (
    "id" TEXT NOT NULL,
    "token" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "lastStartedAt" TIMESTAMP(3),
    "lastFinishedAt" TIMESTAMP(3),
    "lastResult" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParserLease_pkey" PRIMARY KEY ("id")
);

