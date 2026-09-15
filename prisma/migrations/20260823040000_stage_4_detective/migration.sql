CREATE TABLE "TargetChat" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT,
    "provider" TEXT NOT NULL,
    "discoveredFrom" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "score" INTEGER NOT NULL DEFAULT 0,
    "parseAll" BOOLEAN NOT NULL DEFAULT false,
    "discoveryCount" INTEGER NOT NULL DEFAULT 1,
    "lastDiscoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TargetChat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscoveryRun" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "queries" INTEGER NOT NULL DEFAULT 0,
    "candidates" INTEGER NOT NULL DEFAULT 0,
    "inserted" INTEGER NOT NULL DEFAULT 0,
    "activated" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "DiscoveryRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TargetChat_url_key" ON "TargetChat"("url");
CREATE INDEX "TargetChat_active_status_idx" ON "TargetChat"("active", "status");
CREATE INDEX "TargetChat_provider_lastDiscoveredAt_idx" ON "TargetChat"("provider", "lastDiscoveredAt");
CREATE INDEX "DiscoveryRun_startedAt_idx" ON "DiscoveryRun"("startedAt");
CREATE INDEX "DiscoveryRun_provider_status_idx" ON "DiscoveryRun"("provider", "status");